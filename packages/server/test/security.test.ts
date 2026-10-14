import { afterEach, expect, it } from "vitest";
import {
  startRenderServer,
  createRenderHandler,
  signUrl,
  type RenderServer,
  type HandlerOptions,
} from "../src/index.js";
import { request } from "node:http";

it("rejects unknown and contradictory security configuration", () => {
  const cases = [
    null,
    [],
    { authentication: { mode: "bearer" } },
    { auth: { mode: "none", keys: { publisher: "publisher-token-at-least-16" } } },
    { auth: { mode: "hmac", authorize: () => "publisher" } },
    { auth: { mode: "bearer", keys: { publisher: "publisher-token-at-least-16" }, extra: true } },
    { auth: { mode: "custom", authorize: () => "publisher", keys: {} } },
    { auth: {} },
    { auth: { mode: "typo" } },
    {
      signing: {
        keys: { v1: "s".repeat(32) },
        keyId: "v1",
        maxTtlSeconds: 60,
        allowRenderer: true,
      },
    },
    { snapshots: false },
    {
      auth: { mode: "bearer", keys: { publisher: "publisher-token-at-least-16" } },
      signing: { keys: { v1: "s".repeat(32) }, keyId: "v1", maxTtlSeconds: 60 },
      snapshots: {
        directory: "/unused",
        publicBaseUrl: "https://example.com",
        ttlSeconds: 60,
        retentionSeconds: 60,
        maxBytes: 100,
        maxCount: 1,
        extra: true,
      },
    },
  ];
  for (const options of cases)
    expect(() => createRenderHandler(options as unknown as HandlerOptions)).toThrow();
});

it("rejects signed requests carrying even empty Authorization headers", async () => {
  const base = await serve({ auth: { mode: "hmac" }, signing });
  const url = signUrl(`${base}/chart.svg?data=1`, signing, 60);
  for (const headers of [
    { Authorization: "" },
    ["Host", "localhost", "Authorization", "", "Authorization", ""],
  ]) {
    const status = await new Promise<number | undefined>((resolve, reject) => {
      const req = request(url, { headers }, (res) => {
        res.resume();
        res.on("end", () => resolve(res.statusCode));
      });
      req.on("error", reject);
      req.end();
    });
    expect(status).toBe(401);
  }
});
const servers: RenderServer[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((s) => s.shutdown()));
});
const token = "publisher-token-at-least-16";
const auth = { mode: "bearer" as const, keys: { publisher: token } };
async function serve(options: Parameters<typeof startRenderServer>[0] = {}) {
  const server = await startRenderServer({ port: 0, ...options });
  servers.push(server);
  return `http://127.0.0.1:${(server.address() as { port: number }).port}`;
}
it("authenticates before cache, conditional requests and body validation", async () => {
  const base = await serve({ auth, cacheBytes: 1000000 });
  const url = `${base}/chart.svg?data=1,2`;
  expect((await fetch(url)).status).toBe(401);
  expect((await fetch(`${base}/chart.png`, { method: "POST", body: "bad" })).status).toBe(401);
  const good = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  expect(good.status).toBe(200);
  expect(good.headers.get("cache-control")).toBe("private, no-store");
  const etag = good.headers.get("etag")!;
  expect((await fetch(url, { headers: { "If-None-Match": etag } })).status).toBe(401);
  expect(
    (await fetch(url, { headers: { Authorization: `Bearer ${token}`, "If-None-Match": etag } }))
      .status,
  ).toBe(304);
});
const signing = {
  keys: { current: "s".repeat(32), old: "o".repeat(32) },
  keyId: "current",
  maxTtlSeconds: 120,
  allowRender: true,
};
it("binds signed read URLs to method, exact path and every query parameter", async () => {
  const base = await serve({ auth: { mode: "hmac" }, signing, cacheBytes: 1000000 });
  const url = signUrl(`${base}/chart.svg?data=1,2`, signing, 60);
  const get = await fetch(url);
  expect(get.status).toBe(200);
  expect((await fetch(url, { method: "HEAD" })).status).toBe(200);
  expect((await fetch(url, { method: "POST" })).status).toBe(401);
  for (const tampered of [
    url.replace("data=1", "data=9"),
    url.replace("chart.svg", "render.svg"),
    url + "&data=3",
    url + "&exp=123",
    url + "&%65xp=123",
    url.replace("kid=current", "kid=old"),
  ]) {
    expect(
      (await fetch(tampered, { headers: { "If-None-Match": get.headers.get("etag")! } })).status,
    ).toBe(401);
  }
  const expired = signUrl(
    `${base}/chart.svg?data=1`,
    signing,
    1,
    Math.floor(Date.now() / 1000) - 5,
  );
  expect((await fetch(expired)).status).toBe(401);
  expect(() => signUrl(`${base}/chart.svg?data=1`, signing, 121)).toThrow();
  expect(
    (await fetch(signUrl(`${base}/chart.svg?data=1`, { ...signing, keyId: "old" }, 60))).status,
  ).toBe(200);
  const protectedBase = await serve({ auth, signing: { ...signing, allowRender: false } });
  expect((await fetch(signUrl(`${protectedBase}/chart.svg?data=1`, signing, 60))).status).toBe(401);
});
it("limits unauthorized traffic globally and authenticated principals without trusting forwarding headers", async () => {
  const base = await serve({
    auth,
    rateLimit: { windowMs: 60000, global: 3, perPrincipal: 1, maxPrincipals: 2 },
  });
  const url = `${base}/chart.svg?data=1`;
  expect((await fetch(url, { headers: { Authorization: `Bearer ${token}` } })).status).toBe(200);
  const limited = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, "X-Forwarded-For": "8.8.8.8" },
  });
  expect(limited.status).toBe(429);
  expect(Number(limited.headers.get("retry-after"))).toBeGreaterThan(0);
  expect((await fetch(url)).status).toBe(401);
  expect((await fetch(url, { headers: { "X-Forwarded-For": "1.1.1.1" } })).status).toBe(429);
});
it("coalesces concurrent misses with bounded waiters at concurrency one", async () => {
  const base = await serve({ auth, concurrency: 1, maxWaiters: 1, cacheBytes: 1000000 });
  const responses = await Promise.all(
    Array.from({ length: 3 }, () =>
      fetch(`${base}/chart.svg?data=1,2`, { headers: { Authorization: `Bearer ${token}` } }),
    ),
  );
  expect(responses.map((r) => r.status).sort()).toEqual([200, 200, 503]);
  const good = responses.filter((r) => r.status === 200);
  expect(await good[0]!.text()).toBe(await good[1]!.text());
});
