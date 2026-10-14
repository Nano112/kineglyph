import { fork } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { checkOptions } from "./config.js";
import { createServer, type Server, type IncomingMessage, type ServerResponse } from "node:http";
import { LIMITS, RequestError, parseRequest } from "./schema.js";
import { parseJson, parseQuery } from "./client.js";
import { createAuthorization, type AuthOptions, type Authorization } from "./security.js";
import { createSnapshotStore, type SnapshotOptions } from "./snapshots.js";
import { signUrl } from "./signing.js";
import { createRateLimiter, RateLimitError, type RateLimitOptions } from "./rate-limit.js";
export type { RateLimitOptions } from "./rate-limit.js";
export type { SnapshotOptions } from "./snapshots.js";
import {
  validateSigning,
  verifyUrl,
  hasSignature,
  renderParams,
  type SigningOptions,
} from "./signing.js";
export { signUrl } from "./signing.js";
export type { SigningOptions } from "./signing.js";
export type { AuthOptions, Permission } from "./security.js";
export { LIMITS, RequestError } from "./schema.js";
export type { RenderRequest, ChartSpec } from "./schema.js";
export interface HandlerOptions {
  auth?: AuthOptions;
  signing?: SigningOptions;
  snapshots?: SnapshotOptions;
  rateLimit?: RateLimitOptions | false;
  /** Additional bounded subscribers/body readers; default 16, maximum 128. */
  maxWaiters?: number;
  /** Concurrent requests, including body readers; no waiting queue. Default 2, maximum 8. */
  concurrency?: number;
  /** Hard wall-clock deadline per child process (default 10 seconds). */
  timeoutMs?: number;
  /** Deadline to finish receiving a JSON body; default 5 seconds. */
  bodyTimeoutMs?: number;
  /** Optional private in-memory byte-bounded LRU; disabled by default. Maximum 64 MB. */
  cacheBytes?: number;
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`)
      .join(",")}}`;
  return JSON.stringify(value);
}
async function body(req: IncomingMessage, timeoutMs: number): Promise<unknown> {
  if (req.headers["content-encoding"] && req.headers["content-encoding"] !== "identity")
    throw new RequestError("content encoding not supported", 415);
  if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(req.headers["content-type"] ?? ""))
    throw new RequestError("use application/json", 415);
  if (Number(req.headers["content-length"] ?? 0) > LIMITS.bytes)
    throw new RequestError("body too large", 413);
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    const cleanup = () => {
      clearTimeout(timer);
      req.off("data", data);
      req.off("end", end);
      req.off("error", fail);
      req.off("aborted", abort);
    };
    const fail = (e: Error) => {
      cleanup();
      req.resume();
      reject(e);
    };
    const abort = () => fail(new RequestError("request aborted", 400));
    const data = (chunk: Buffer) => {
      size += chunk.length;
      if (size > LIMITS.bytes) fail(new RequestError("body too large", 413));
      else chunks.push(chunk);
    };
    const end = () => {
      cleanup();
      try {
        resolve(parseJson(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks))));
      } catch (e) {
        reject(e instanceof RequestError ? e : new RequestError("invalid UTF-8"));
      }
    };
    const timer = setTimeout(() => fail(new RequestError("body timed out", 408)), timeoutMs);
    req.on("data", data);
    req.once("end", end);
    req.once("error", fail);
    req.once("aborted", abort);
  });
}
/** Each render gets a killable child process; admission is bounded before body buffering. */
export function createRenderHandler(options: HandlerOptions = {}) {
  checkOptions(options, [
    "auth",
    "signing",
    "snapshots",
    "rateLimit",
    "maxWaiters",
    "concurrency",
    "timeoutMs",
    "bodyTimeoutMs",
    "cacheBytes",
    "host",
    "port",
  ]);
  if (options.snapshots !== undefined)
    checkOptions(options.snapshots, [
      "directory",
      "publicBaseUrl",
      "ttlSeconds",
      "maxBytes",
      "maxCount",
      "retentionSeconds",
    ]);
  const authorize = createAuthorization(options.auth);
  const rateLimit = createRateLimiter(options.rateLimit);
  const maxWaiters = options.maxWaiters ?? 16;
  if (!Number.isInteger(maxWaiters) || maxWaiters < 0 || maxWaiters > 128)
    throw new Error("invalid waiter limit");
  const flights = new Map<string, Promise<Buffer>>();
  const signing = options.signing === undefined ? undefined : validateSigning(options.signing);
  if (options.auth?.mode === "hmac" && !signing) throw new Error("HMAC auth requires signing keys");
  if (
    options.snapshots &&
    (!signing ||
      !["bearer", "custom"].includes(options.auth?.mode ?? "none") ||
      options.snapshots.ttlSeconds > signing.maxTtlSeconds)
  )
    throw new Error("snapshots require publisher auth and signing keys with sufficient TTL");
  const snapshots = options.snapshots ? createSnapshotStore(options.snapshots) : undefined;
  const concurrency = options.concurrency ?? 2,
    timeout = options.timeoutMs ?? 10000,
    capacity = options.cacheBytes ?? 0;
  const bodyTimeout = options.bodyTimeoutMs ?? 5000;
  if (!Number.isInteger(bodyTimeout) || bodyTimeout < 1 || bodyTimeout > 30000)
    throw new Error("invalid body deadline");
  if (
    !Number.isInteger(concurrency) ||
    concurrency < 1 ||
    concurrency > 8 ||
    !Number.isInteger(timeout) ||
    timeout < 1 ||
    timeout > 30000 ||
    !Number.isInteger(capacity) ||
    capacity < 0 ||
    capacity > 64000000
  )
    throw new Error("invalid handler limits");
  let readers = 0;
  let active = 0,
    cacheSize = 0;
  const cache = new Map<string, Buffer>();
  let draining = false;
  const waiters = new Set<() => void>();
  const handler = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    let admitted = false;
    try {
      rateLimit();
      if (Buffer.byteLength(req.url ?? "") > LIMITS.bytes)
        throw new RequestError("URL too large", 413);
      if (/%(?![0-9a-f]{2})/i.test(req.url ?? "")) throw new RequestError("invalid URL encoding");
      const url = new URL(req.url ?? "/", "http://localhost");
      const publish = !!snapshots && url.pathname === "/snapshots.png";
      const snapshot = snapshots && /^\/images\/([a-f0-9]{64}\.png)$/.exec(url.pathname)?.[1];
      const format =
        publish || snapshot ? "png" : /^\/(?:chart|render)\.(svg|png|gif)$/.exec(url.pathname)?.[1];
      if (!format) throw new RequestError("not found", 404);
      const methods = publish ? ["POST"] : snapshot ? ["GET", "HEAD"] : ["GET", "HEAD", "POST"];
      if (!methods.includes(req.method ?? "")) {
        res.setHeader("Allow", methods.join(", "));
        throw new RequestError("method not allowed", 405);
      }
      const signed = hasSignature(url);
      if (
        (signed &&
          (publish ||
            (!snapshot && !signing?.allowRender) ||
            req.rawHeaders.some(
              (header, i) => i % 2 === 0 && header.toLowerCase() === "authorization",
            ))) ||
        (snapshot && !signed)
      )
        throw new RequestError("unauthorized", 401);
      const authorization = signed
        ? verifyUrl(req.url!, req.method!, signing!)
        : authorize(req, publish ? "publish" : "render");
      rateLimit(authorization.principal);
      if (snapshot) {
        if (draining) throw new RequestError("server draining", 503);
        sendImage(req, res, snapshots.read(snapshot), "png", authorization);
        return;
      }
      if (draining || active >= concurrency + maxWaiters)
        throw new RequestError("render capacity reached", 503);
      active++;
      admitted = true;
      if (req.method === "POST" && url.search)
        throw new RequestError("POST does not accept query parameters");
      if (readers >= concurrency) throw new RequestError("body capacity reached", 503);
      const readBody = async () => {
        if (readers + flights.size >= concurrency)
          throw new RequestError("body capacity reached", 503);
        readers++;
        try {
          return parseRequest(await body(req, bodyTimeout));
        } finally {
          readers--;
        }
      };
      const input =
        req.method === "POST"
          ? await readBody()
          : parseQuery(signed ? renderParams(url) : url.searchParams);
      if (req.aborted || res.destroyed) return;
      const key = createHash("sha256")
        .update(canonical({ version: 1, input, format }))
        .digest("hex");
      let bytes = cache.get(key);
      if (bytes) {
        cache.delete(key);
        cache.set(key, bytes);
      } else {
        let flight = flights.get(key);
        if (!flight) {
          if (readers + flights.size >= concurrency)
            throw new RequestError("render capacity reached", 503);
          flight = new Promise<Buffer>((resolve, reject) => {
            const child = fork(fileURLToPath(new URL("../dist/worker.js", import.meta.url)), [], {
              stdio: ["ignore", "ignore", "ignore", "ipc"],
              execArgv: ["--max-old-space-size=128"],
              env: { PATH: process.env.PATH },
            });
            let result: Buffer | undefined;
            let failure: RequestError | undefined;
            const timer = setTimeout(() => {
              failure = new RequestError("render timed out", 504);
              child.kill("SIGKILL");
            }, timeout);

            child.once("message", (m: { bytes?: string; error?: string; status?: number }) => {
              if (typeof m.bytes === "string") {
                if (m.bytes.length <= Math.ceil(LIMITS.outputBytes / 3) * 4)
                  result = Buffer.from(m.bytes, "base64");
                if (!result || result.length > LIMITS.outputBytes) {
                  result = undefined;
                  failure = new RequestError("render output too large", 413);
                  child.kill("SIGKILL");
                }
              } else failure = new RequestError(m.error ?? "render failed", m.status ?? 500);
            });
            child.once("error", () => {
              failure = new RequestError("renderer unavailable", 500);
            });
            child.once("close", () => {
              clearTimeout(timer);

              if (failure) reject(failure);
              else if (result) resolve(result);
              else reject(new RequestError("renderer exited", 500));
            });
            child.send({ input, format }, (error) => {
              if (error) {
                failure = new RequestError("renderer unavailable", 500);
                child.kill("SIGKILL");
              }
            });
          }).finally(() => {
            flights.delete(key);
          });
          flights.set(key, flight);
        }
        bytes = await flight;
        if (bytes.length <= capacity) {
          while (cacheSize + bytes.length > capacity || cache.size >= 1024) {
            const oldest = cache.keys().next().value!;
            cacheSize -= cache.get(oldest)!.length;
            cache.delete(oldest);
          }
          if (!cache.has(key)) {
            cache.set(key, bytes);
            cacheSize += bytes.length;
          }
        }
      }
      if (publish) {
        const url = signUrl(snapshots.publish(bytes), signing!, options.snapshots!.ttlSeconds);
        res.writeHead(201, {
          "Content-Type": "application/json",
          "Cache-Control": "private, no-store",
          "X-Content-Type-Options": "nosniff",
        });
        res.end(JSON.stringify({ url }));
        return;
      }
      sendImage(req, res, bytes, format, authorization);
    } catch (error) {
      if (res.destroyed) return;
      req.resume();
      if (!req.complete) {
        res.setHeader("Connection", "close");
        res.once("finish", () => req.destroy());
      }
      const status = error instanceof RequestError ? error.status : 500;
      if (error instanceof RateLimitError) res.setHeader("Retry-After", String(error.retryAfter));
      if (status === 503) res.setHeader("Retry-After", "1");
      res.writeHead(status, {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      });
      res.end(
        JSON.stringify({ error: error instanceof RequestError ? error.message : "internal error" }),
      );
    } finally {
      if (admitted) active--;
      if (active === 0) {
        for (const resolve of waiters) resolve();
        waiters.clear();
      }
    }
  };
  return Object.assign(handler, {
    /** Reject new work and wait for admitted readers/workers to finish. */
    close(): Promise<void> {
      draining = true;
      cache.clear();
      cacheSize = 0;
      return active === 0 ? Promise.resolve() : new Promise((resolve) => waiters.add(resolve));
    },
  });
}

function sendImage(
  req: IncomingMessage,
  res: ServerResponse,
  bytes: Buffer,
  format: string,
  authorization: Authorization,
): void {
  const etag = `"${createHash("sha256").update(bytes).digest("hex")}"`;
  res.setHeader("ETag", etag);
  const freshness =
    authorization.expiresAt === undefined
      ? 0
      : Math.max(0, authorization.expiresAt - Math.ceil(Date.now() / 1000));
  res.setHeader(
    "Cache-Control",
    authorization.private ? "private, no-store" : `public, max-age=${freshness}, must-revalidate`,
  );
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'none'; style-src 'unsafe-inline'; sandbox",
  );
  if (
    (req.method === "GET" || req.method === "HEAD") &&
    (req.headers["if-none-match"] ?? "")
      .split(",")
      .some((s) => s.trim().replace(/^W\//, "") === etag || s.trim() === "*")
  ) {
    res.writeHead(304);
    res.end();
    return;
  }
  res.writeHead(200, {
    "Content-Type": format === "svg" ? "image/svg+xml; charset=utf-8" : `image/${format}`,
    "Content-Length": bytes.length,
  });
  res.end(req.method === "HEAD" ? undefined : bytes);
}

export interface ServerOptions extends HandlerOptions {
  host?: string;
  port?: number;
}
export type RenderServer = Server & { shutdown(): Promise<void> };
/** Start a loopback HTTP server (port 3000 by default). shutdown() drains admitted work. */
export async function startRenderServer(options: ServerOptions = {}): Promise<RenderServer> {
  const port = options.port ?? 3000,
    host = options.host ?? "127.0.0.1";
  if (!Number.isInteger(port) || port < 0 || port > 65535 || !host)
    throw new Error("invalid listen address");
  const handler = createRenderHandler(options);
  const server = createServer({ maxHeaderSize: LIMITS.bytes + 8192 }, handler);
  server.headersTimeout = 10000;
  server.requestTimeout = 35000;
  server.keepAliveTimeout = 5000;
  let closing: Promise<void> | undefined;
  const result = Object.assign(server, {
    shutdown(): Promise<void> {
      if (!closing) {
        const drained = handler.close();
        // A peer may hold an incomplete HTTP header without entering the handler.
        // Allow admitted bodies plus renders their full deadlines, then close peers.
        const timer = setTimeout(
          () => server.closeAllConnections(),
          (options.bodyTimeoutMs ?? 5000) + (options.timeoutMs ?? 10000) + 1000,
        );
        timer.unref();
        closing = Promise.all([
          drained,
          new Promise<void>((resolve, reject) => {
            server.close((error) => (error ? reject(error) : resolve()));
            server.closeIdleConnections();
          }),
        ])
          .then(() => undefined)
          .finally(() => clearTimeout(timer));
      }
      return closing;
    },
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      server.off("error", reject);
      resolve();
    });
  });
  return result;
}
