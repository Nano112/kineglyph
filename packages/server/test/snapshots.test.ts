import { afterEach, expect, it } from "vitest";
import {
  mkdtempSync,
  realpathSync,
  rmSync,
  readdirSync,
  statSync,
  utimesSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startRenderServer, type RenderServer } from "../src/index.js";
const dirs: string[] = [],
  servers: RenderServer[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((s) => s.shutdown()));
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});
const token = "publisher-token-at-least-16";
const auth = { mode: "bearer" as const, keys: { publisher: token } };
const signing = { keys: { v1: "s".repeat(32) }, keyId: "v1", maxTtlSeconds: 120 };
const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
function directory() {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "kineglyph-")));
  dirs.push(dir);
  return dir;
}
async function serve(dir: string, extra = {}) {
  const server = await startRenderServer({
    port: 0,
    auth,
    signing,
    snapshots: {
      directory: dir,
      publicBaseUrl: "https://kineglyph.example",
      ttlSeconds: 60,
      maxBytes: 1000000,
      maxCount: 2,
      retentionSeconds: 120,
      ...extra,
    },
  });
  servers.push(server);
  return { server, base: `http://127.0.0.1:${(server.address() as { port: number }).port}` };
}
async function publish(base: string, data = [1, 2]) {
  return fetch(`${base}/snapshots.png`, {
    method: "POST",
    headers,
    body: JSON.stringify({ data, width: 320 }),
  });
}
function local(base: string, url: string) {
  const parsed = new URL(url);
  return base + parsed.pathname + parsed.search;
}
it("publishes immutable PNG capabilities independently of Host and persists across restart", async () => {
  const dir = directory();
  const first = await serve(dir);
  const server = first.server;
  let base = first.base;
  expect((await fetch(`${base}/snapshots.png`, { method: "POST", body: "bad" })).status).toBe(401);
  const published = await publish(base);
  expect(published.status).toBe(201);
  const result = (await published.json()) as { url: string };
  expect(result.url).toMatch(
    /^https:\/\/kineglyph.example\/images\/[a-f0-9]{64}\.png\?kid=v1&exp=\d+&sig=[a-f0-9]{64}$/,
  );
  const url = local(base, result.url);
  const image = await fetch(url);
  expect(image.status).toBe(200);
  const bytes = Buffer.from(await image.arrayBuffer());
  expect(bytes.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
  expect((await fetch(url, { method: "HEAD" })).status).toBe(200);
  expect((await fetch(url, { method: "POST", headers })).status).toBe(405);
  expect((await fetch(url.split("?")[0]!, { headers })).status).toBe(401);
  expect((await fetch(url + "&width=1200")).status).toBe(401);
  expect(
    (await fetch(url, { headers: { "If-None-Match": image.headers.get("etag")! } })).status,
  ).toBe(304);
  await server.shutdown();
  ({ base } = await serve(dir));
  expect(Buffer.from(await (await fetch(local(base, result.url))).arrayBuffer())).toEqual(bytes);
});
it("renews retention on deduplicated publication", async () => {
  const dir = directory();
  const first = await serve(dir);
  const url = ((await (await publish(first.base)).json()) as { url: string }).url;
  await first.server.shutdown();
  const path = join(dir, new URL(url).pathname.split("/").pop()!);
  const old = new Date(Date.now() - 110000);
  utimesSync(path, old, old);
  const restarted = await serve(dir);
  expect((await publish(restarted.base)).status).toBe(201);
  expect(statSync(path).mtimeMs).toBeGreaterThan(Date.now() - 5000);
});
it("enforces persistent byte/count/retention bounds and refuses symlinks", async () => {
  const dir = directory();
  const { base, server } = await serve(dir, { maxCount: 1 });
  const old = ((await (await publish(base, [1, 2])).json()) as { url: string }).url;
  expect((await publish(base, [2, 3])).status).toBe(201);
  expect(readdirSync(dir)).toHaveLength(1);
  expect((await fetch(local(base, old))).status).toBe(404);
  await server.shutdown();
  const file = join(dir, readdirSync(dir)[0]!);
  const expired = new Date(Date.now() - 130000);
  utimesSync(file, expired, expired);
  const restarted = await serve(dir);
  expect(readdirSync(dir)).toHaveLength(0);
  await restarted.server.shutdown();
  const tiny = await serve(directory(), { maxBytes: 1 });
  expect((await publish(tiny.base)).status).toBe(507);
  const unsafe = directory(),
    outside = join(directory(), "external");
  writeFileSync(outside, "secret");
  symlinkSync(outside, join(unsafe, "a".repeat(64) + ".png"));
  await expect(serve(unsafe)).rejects.toThrow(/unsafe/);
});
