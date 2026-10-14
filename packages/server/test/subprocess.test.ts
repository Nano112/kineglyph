import { afterEach, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";
import { createServer, request, type Server } from "node:http";
vi.mock("node:child_process", () => ({ fork: vi.fn() }));
import { fork } from "node:child_process";
import { createRenderHandler } from "../src/index.js";
import { LIMITS } from "../src/schema.js";
const servers: Server[] = [];
afterEach(async () => {
  vi.clearAllMocks();
  await Promise.all(
    servers.splice(0).map((s) => {
      s.closeAllConnections();
      return new Promise<void>((r) => s.close(() => r()));
    }),
  );
});
function fake() {
  const child = Object.assign(new EventEmitter(), { kill: vi.fn(), send: vi.fn() });
  vi.mocked(fork).mockReturnValue(child as unknown as ReturnType<typeof fork>);
  return child;
}
async function setup(timeoutMs = 1000) {
  const handler = createRenderHandler({ concurrency: 1, timeoutMs });
  const server = createServer(handler);
  servers.push(server);
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  return {
    handler,
    url: `http://127.0.0.1:${(server.address() as { port: number }).port}/chart.svg?data=1`,
  };
}
it("holds admission until killed subprocess closes, including disconnected clients", async () => {
  const child = fake();
  const { url, handler } = await setup();
  const req = request(url);
  req.on("error", () => {});
  req.end();
  await vi.waitFor(() => expect(child.send).toHaveBeenCalled());
  req.destroy();
  await vi.waitFor(() => expect(child.kill).toHaveBeenCalledWith("SIGKILL"));
  expect((await fetch(url + ",2")).status).toBe(503);
  let drained = false;
  const closing = handler.close().then(() => {
    drained = true;
  });
  await new Promise((r) => setTimeout(r, 10));
  expect(drained).toBe(false);
  child.emit("close", null, "SIGKILL");
  await closing;
  expect(drained).toBe(true);
  const options = vi.mocked(fork).mock.calls[0]![2]!;
  expect(Object.keys(options.env!)).toEqual(["PATH"]);
  expect(options.execArgv).toEqual(["--max-old-space-size=128"]);
});
it("isolates a disconnected subscriber from the remaining singleflight waiter", async () => {
  const child = fake();
  const { url, handler } = await setup(3000);
  const first = request(url);
  first.on("error", () => {});
  first.end();
  await vi.waitFor(() => expect(child.send).toHaveBeenCalledOnce());
  const second = fetch(url);
  await new Promise((resolve) => setTimeout(resolve, 50));
  first.destroy();
  await new Promise((resolve) => setTimeout(resolve, 50));
  expect(child.kill).not.toHaveBeenCalled();
  child.emit("message", { bytes: Buffer.from("<svg/>").toString("base64") });
  child.emit("close", 0);
  const response = await second;
  expect(response.status).toBe(200);
  expect(await response.text()).toBe("<svg/>");
  expect(fork).toHaveBeenCalledOnce();
  await handler.close();
});

it("counts slow body readers against worker admission", async () => {
  const child = fake();
  const handler = createRenderHandler({ concurrency: 2, bodyTimeoutMs: 3000 });
  const server = createServer(handler);
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const slow = request(`${base}/chart.svg`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });
  slow.on("error", () => {});
  slow.write('{"data":[');
  await new Promise((resolve) => setTimeout(resolve, 50));
  const first = fetch(`${base}/chart.svg?data=1`);
  await vi.waitFor(() => expect(child.send).toHaveBeenCalledOnce());
  const second = fetch(`${base}/chart.svg?data=2`);
  await new Promise((resolve) => setTimeout(resolve, 50));
  const forks = vi.mocked(fork).mock.calls.length;
  child.emit("message", { bytes: Buffer.from("<svg/>").toString("base64") });
  child.emit("close", 0);
  slow.destroy();
  await first;
  const response = await second;
  await handler.close();
  expect(forks).toBe(1);
  expect(response.status).toBe(503);
});

it("enforces decoded output byte cap rather than only base64 length", async () => {
  const child = fake();
  const { url } = await setup();
  const pending = fetch(url);
  await vi.waitFor(() => expect(child.send).toHaveBeenCalled());
  child.emit("message", { bytes: Buffer.alloc(LIMITS.outputBytes + 1).toString("base64") });
  child.emit("close", 0);
  const response = await pending;
  expect(response.status).toBe(413);
  expect(await response.text()).not.toContain("/Users/");
});
