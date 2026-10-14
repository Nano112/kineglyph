import { createHmac } from "node:crypto";
import { checkOptions } from "./config.js";
import { constantEqual, type Authorization } from "./security.js";
import { RequestError } from "./schema.js";
export interface SigningOptions {
  keys: Record<string, string>;
  keyId: string;
  maxTtlSeconds: number;
  /** Explicitly allow signed GET/HEAD on render routes; off by default. */
  allowRender?: boolean;
}
const reserved = new Set(["exp", "kid", "sig"]);
export function validateSigning(options: SigningOptions): SigningOptions {
  checkOptions(options, ["keys", "keyId", "maxTtlSeconds", "allowRender"]);
  checkOptions(options.keys);
  if (
    !options ||
    !Number.isSafeInteger(options.maxTtlSeconds) ||
    options.maxTtlSeconds < 1 ||
    options.maxTtlSeconds > 2592000 ||
    (options.allowRender !== undefined && typeof options.allowRender !== "boolean")
  )
    throw new Error("invalid signing limits");
  const keys = Object.entries(options.keys ?? {});
  if (
    !keys.length ||
    keys.length > 16 ||
    keys.some(
      ([id, key]) =>
        !/^[A-Za-z0-9_-]{1,64}$/.test(id) ||
        typeof key !== "string" ||
        Buffer.byteLength(key) < 32 ||
        Buffer.byteLength(key) > 1024,
    ) ||
    !Object.hasOwn(options.keys, options.keyId)
  )
    throw new Error("invalid signing keys");
  return { ...options, keys: { ...options.keys } };
}
function checkedQuery(url: URL): void {
  const seen = new Set<string>();
  for (const [key] of url.searchParams) {
    if (seen.has(key) || (reserved.has(key.toLowerCase()) && !reserved.has(key)))
      throw new RequestError("ambiguous signed URL", 401);
    seen.add(key);
  }
  for (const pair of url.search.slice(1).split("&")) {
    const raw = pair.split("=")[0]!;
    if (reserved.has(decodeURIComponent(raw).toLowerCase()) && !reserved.has(raw))
      throw new RequestError("ambiguous signed URL", 401);
  }
}
function signature(target: string, secret: string): string {
  return createHmac("sha256", secret).update(`kineglyph-v1\nGET\n${target}`).digest("hex");
}
/** Node-only. GET and HEAD share a read capability; raw path/query bytes are bound. */
export function signUrl(
  input: string,
  options: SigningOptions,
  ttlSeconds: number,
  now = Math.floor(Date.now() / 1000),
): string {
  const config = validateSigning(options);
  if (
    !Number.isSafeInteger(ttlSeconds) ||
    ttlSeconds < 1 ||
    ttlSeconds > config.maxTtlSeconds ||
    !Number.isSafeInteger(now) ||
    now < 0
  )
    throw new Error("invalid signing lifetime");
  const url = new URL(input);
  if (!/^https?:$/.test(url.protocol) || url.username || url.password || url.hash)
    throw new Error("invalid signing URL");
  checkedQuery(url);
  for (const key of reserved)
    if (url.searchParams.has(key)) throw new Error("URL already has authentication parameters");
  url.searchParams.append("kid", config.keyId);
  url.searchParams.append("exp", String(now + ttlSeconds));
  const sig = signature(url.pathname + url.search, config.keys[config.keyId]!);
  return `${url.href}&sig=${sig}`;
}
export function verifyUrl(raw: string, method: string, options: SigningOptions): Authorization {
  try {
    if (method !== "GET" && method !== "HEAD") throw new Error();
    const url = new URL(raw, "http://localhost");
    if (raw !== url.pathname + url.search || url.hash) throw new Error();
    checkedQuery(url);
    const exp = url.searchParams.get("exp") ?? "";
    const kid = url.searchParams.get("kid") ?? "";
    const sig = url.searchParams.get("sig") ?? "";
    if (
      !/^[1-9]\d{0,12}$/.test(exp) ||
      !/^[a-f0-9]{64}$/.test(sig) ||
      !Object.hasOwn(options.keys, kid)
    )
      throw new Error();
    const expiresAt = Number(exp),
      now = Math.floor(Date.now() / 1000);
    if (expiresAt <= now || expiresAt - now > options.maxTtlSeconds || !raw.endsWith(`&sig=${sig}`))
      throw new Error();
    const target = raw.slice(0, -69);
    if (!constantEqual(sig, signature(target, options.keys[kid]!))) throw new Error();
    return { principal: `signed:${kid}`, private: false, expiresAt };
  } catch {
    throw new RequestError("unauthorized", 401);
  }
}
export function hasSignature(url: URL): boolean {
  return [...url.searchParams.keys()].some((key) => reserved.has(key.toLowerCase()));
}
export function renderParams(url: URL): URLSearchParams {
  const params = new URLSearchParams(url.search);
  for (const key of reserved) params.delete(key);
  return params;
}
