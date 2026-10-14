import { afterAll, beforeAll, expect, it } from "vitest";
import { createServer } from "node:http";
import { createRenderHandler } from "../src/index.js";
import { chartUrl } from "../src/client.js";
const server = createServer(createRenderHandler({ cacheBytes: 1000000 }));
let base: string;
beforeAll(async () => {
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
afterAll(async () => {
  await new Promise<void>((r) => server.close(() => r()));
});
it.each(["svg", "png", "gif"] as const)(
  "serves actual %s bytes with GET/POST parity and conditional requests",
  async (format) => {
    const input = { data: [12, 18, 45], width: 800, scale: format === "gif" ? 1 : 2 };
    const url = chartUrl(base, input, format);
    const get = await fetch(url);
    expect(get.status).toBe(200);
    const bytes = Buffer.from(await get.arrayBuffer());
    if (format === "png") {
      expect(bytes.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
      expect(bytes.readUInt32BE(16)).toBe(1600);
    }
    if (format === "gif") expect(bytes.subarray(0, 6).toString()).toBe("GIF89a");
    const post = await fetch(`${base}/chart.${format}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    expect(post.status).toBe(200);
    expect(Buffer.from(await post.arrayBuffer())).toEqual(bytes);
    const conditional = await fetch(url, {
      headers: { "If-None-Match": get.headers.get("etag")! },
    });
    expect(conditional.status).toBe(304);
  },
  20000,
);
it.each(["data=1&data=2", "data=1&unknown=yes", "data=NaN", "data=1,2;3"])(
  "returns 400 for %s",
  async (query) => {
    expect((await fetch(`${base}/chart.svg?${query}`)).status).toBe(400);
  },
);
it("rejects method, content type, body size, mixed POST query and missing routes", async () => {
  expect((await fetch(`${base}/chart.svg`, { method: "PUT" })).status).toBe(405);
  expect((await fetch(`${base}/chart.svg`, { method: "POST", body: "{}" })).status).toBe(415);
  expect(
    (
      await fetch(`${base}/chart.svg?data=1`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      })
    ).status,
  ).toBe(400);
  expect(
    (
      await fetch(`${base}/chart.svg`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: " ".repeat(131073),
      })
    ).status,
  ).toBe(413);
  expect((await fetch(`${base}/missing`)).status).toBe(404);
});
