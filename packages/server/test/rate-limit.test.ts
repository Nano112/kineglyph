import { expect, it, vi } from "vitest";
import { createRateLimiter } from "../src/rate-limit.js";

it("bounds principal state without evicting live counters and resets windows", () => {
  const clock = vi.spyOn(performance, "now").mockReturnValue(0);
  try {
    const limit = createRateLimiter({
      windowMs: 1000,
      global: 10,
      perPrincipal: 1,
      maxPrincipals: 2,
    });
    limit("a");
    limit("b");
    expect(() => limit("c")).toThrow("rate limit exceeded");
    expect(() => limit("a")).toThrow("rate limit exceeded");
    clock.mockReturnValue(1000);
    expect(() => limit("c")).not.toThrow();
    expect(() => limit("a")).not.toThrow();
  } finally {
    clock.mockRestore();
  }
});
