import { afterEach, expect, it } from "vitest";
import { createServer, type Server } from "node:http";
import { createRenderHandler } from "../src/index.js";
const servers: Server[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((s) => new Promise<void>((r) => s.close(() => r()))));
});
async function listen(options = {}) {
  const server = createServer(createRenderHandler(options));
  servers.push(server);
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  return `http://127.0.0.1:${(server.address() as { port: number }).port}`;
}
it("supports render aliases, HEAD metadata and conditional HEAD", async () => {
  const base = await listen({ cacheBytes: 1000000 });
  const get = await fetch(`${base}/render.svg?data=1,2`);
  expect(get.status).toBe(200);
  const bytes = await get.arrayBuffer();
  const head = await fetch(`${base}/render.svg?data=1,2`, { method: "HEAD" });
  expect(head.status).toBe(200);
  expect(head.headers.get("content-length")).toBe(String(bytes.byteLength));
  expect((await head.arrayBuffer()).byteLength).toBe(0);
  expect(head.headers.get("content-security-policy")).toContain("default-src 'none'");
  expect(
    (
      await fetch(`${base}/render.svg?data=1,2`, {
        method: "HEAD",
        headers: { "If-None-Match": `W/${get.headers.get("etag")}` },
      })
    ).status,
  ).toBe(304);
});
