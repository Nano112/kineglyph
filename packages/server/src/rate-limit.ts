import { RequestError } from "./schema.js";
export interface RateLimitOptions {
  windowMs: number;
  global: number;
  perPrincipal: number;
  maxPrincipals: number;
}
export class RateLimitError extends RequestError {
  constructor(public readonly retryAfter: number) {
    super("rate limit exceeded", 429);
  }
}
/** Fixed windows; full identity table denies new identities, never evicts active counters. */
export function createRateLimiter(
  options: RateLimitOptions | false = {
    windowMs: 60000,
    global: 1000,
    perPrincipal: 600,
    maxPrincipals: 1000,
  },
) {
  if (options === false) return (): void => {};
  if (
    !options ||
    Object.keys(options).sort().join(",") !== "global,maxPrincipals,perPrincipal,windowMs"
  )
    throw new Error("invalid rate limits");
  for (const [key, max] of [
    ["windowMs", 3600000],
    ["global", 1000000],
    ["perPrincipal", 1000000],
    ["maxPrincipals", 100000],
  ] as const)
    if (!Number.isSafeInteger(options[key]) || options[key] < 1 || options[key] > max)
      throw new Error("invalid rate limits");
  const { windowMs, global, perPrincipal, maxPrincipals } = options;
  let until = 0,
    count = 0;
  const principals = new Map<string, number>();
  return (principal?: string): void => {
    const now = performance.now();
    if (now >= until) {
      until = now + windowMs;
      count = 0;
      principals.clear();
    }
    const deny = () => {
      throw new RateLimitError(Math.max(1, Math.ceil((until - now) / 1000)));
    };
    if (principal === undefined) {
      if (count >= global) deny();
      count++;
    } else {
      const used = principals.get(principal) ?? 0;
      if (used >= perPrincipal || (!principals.has(principal) && principals.size >= maxPrincipals))
        deny();
      principals.set(principal, used + 1);
    }
  };
}
