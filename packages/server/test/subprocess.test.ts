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
  expect((await fetch(url)).status).toBe(503);
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
