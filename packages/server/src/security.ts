import { createHash, timingSafeEqual } from "node:crypto";
import type { IncomingMessage } from "node:http";
import { RequestError } from "./schema.js";
import { checkOptions } from "./config.js";

export type Permission = "render" | "publish" | "snapshot";
export type AuthOptions =
  | { mode: "none" }
  | { mode: "bearer"; keys: Record<string, string> }
  | { mode: "hmac" }
  | {
      mode: "custom";
      authorize: (request: IncomingMessage, permission: Permission) => string | false;
    };
export interface Authorization {
  principal: string;
  private: boolean;
  expiresAt?: number;
}
export function constantEqual(a: string, b: string): boolean {
  return timingSafeEqual(
    createHash("sha256").update(a).digest(),
    createHash("sha256").update(b).digest(),
  );
}
export function createAuthorization(auth: AuthOptions = { mode: "none" }) {
  if (!auth || !["none", "bearer", "hmac", "custom"].includes(auth.mode))
    throw new Error("invalid auth mode");
  checkOptions(
    auth,
    auth.mode === "bearer"
      ? ["mode", "keys"]
      : auth.mode === "custom"
        ? ["mode", "authorize"]
        : ["mode"],
  );
  if (auth.mode === "bearer") checkOptions(auth.keys);
  const keys = auth.mode === "bearer" ? Object.entries(auth.keys) : [];
  if (
    auth.mode === "bearer" &&
    (!keys.length ||
      keys.length > 100 ||
      keys.some(
        ([id, secret]) =>
          !/^[A-Za-z0-9_-]{1,64}$/.test(id) ||
          typeof secret !== "string" ||
          !/^[\x21-\x7e]{16,1024}$/.test(secret),
      ))
  )
    throw new Error("invalid bearer keys");
  if (auth.mode === "custom" && typeof auth.authorize !== "function")
    throw new Error("invalid auth hook");
  return (req: IncomingMessage, permission: Permission): Authorization => {
    if (
      req.rawHeaders.filter(
        (_, i) => i % 2 === 0 && req.rawHeaders[i]!.toLowerCase() === "authorization",
      ).length > 1
    )
      throw new RequestError("ambiguous authorization", 401);
    if (auth.mode === "none")
      return { principal: req.socket.remoteAddress ?? "unknown", private: false };
    if (auth.mode === "bearer") {
      const value = /^Bearer ([\x21-\x7e]+)$/.exec(req.headers.authorization ?? "")?.[1] ?? "";
      let principal: string | undefined;
      for (const [id, key] of keys) if (constantEqual(value, key)) principal = id;
      if (principal) return { principal, private: true };
    }
    if (auth.mode === "custom") {
      let principal: unknown;
      try {
        principal = auth.authorize(req, permission);
      } catch {
        /* deny */
      }
      if (typeof principal === "string" && principal.length > 0 && principal.length <= 128)
        return { principal, private: true };
    }
    throw new RequestError("unauthorized", 401);
  };
}
