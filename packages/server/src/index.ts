import { fork } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { createServer, type Server, type IncomingMessage, type ServerResponse } from "node:http";
import { LIMITS, RequestError, parseRequest } from "./schema.js";
import { parseJson, parseQuery } from "./client.js";
export { LIMITS, RequestError } from "./schema.js";
export type { RenderRequest, ChartSpec } from "./schema.js";
export interface HandlerOptions {
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
  let active = 0,
    cacheSize = 0;
  const cache = new Map<string, Buffer>();
  let draining = false;
  const waiters = new Set<() => void>();
  const handler = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    let admitted = false;
    try {
      if (Buffer.byteLength(req.url ?? "") > LIMITS.bytes)
        throw new RequestError("URL too large", 413);
      if (/%(?![0-9a-f]{2})/i.test(req.url ?? "")) throw new RequestError("invalid URL encoding");
      const url = new URL(req.url ?? "/", "http://localhost");
      const format = /^\/(?:chart|render)\.(svg|png|gif)$/.exec(url.pathname)?.[1];
      if (!format) throw new RequestError("not found", 404);
      if (req.method !== "GET" && req.method !== "HEAD" && req.method !== "POST") {
        res.setHeader("Allow", "GET, HEAD, POST");
        throw new RequestError("method not allowed", 405);
      }
      if (draining || active >= concurrency) throw new RequestError("render capacity reached", 503);
      active++;
      admitted = true;
      if (req.method === "POST" && url.search)
        throw new RequestError("POST does not accept query parameters");
      const input =
        req.method === "POST"
          ? parseRequest(await body(req, bodyTimeout))
          : parseQuery(url.searchParams);
      if (req.aborted || res.destroyed) return;
      const key = createHash("sha256")
        .update(canonical({ version: 1, input, format }))
        .digest("hex");
      let bytes = cache.get(key);
      if (bytes) {
        cache.delete(key);
        cache.set(key, bytes);
      } else {
        bytes = await new Promise<Buffer>((resolve, reject) => {
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
          const disconnect = () => {
            if (!res.writableEnded) {
              failure = new RequestError("client disconnected", 499);
              child.kill("SIGKILL");
            }
          };
          res.once("close", disconnect);
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
            res.off("close", disconnect);
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
        });
        if (bytes.length <= capacity) {
          while (cacheSize + bytes.length > capacity) {
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
      const etag = `"${createHash("sha256").update(bytes).digest("hex")}"`;
      res.setHeader("ETag", etag);
      res.setHeader("Cache-Control", "public, max-age=0, must-revalidate");
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
    } catch (error) {
      if (res.destroyed) return;
      req.resume();
      if (!req.complete) {
        res.setHeader("Connection", "close");
        res.once("finish", () => req.destroy());
      }
      const status = error instanceof RequestError ? error.status : 500;
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
