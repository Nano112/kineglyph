import { expect, it } from "vitest";
import { createServer, request, type Server } from "node:http";
import * as api from "../src/index.js";
async function listen(server: Server) {
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  return `http://127.0.0.1:${(server.address() as { port: number }).port}`;
}
it("bounds incomplete body readers, expires them, and reopens admission", async () => {
  const server = createServer(api.createRenderHandler({ concurrency: 1, bodyTimeoutMs: 40 }));
  const base = await listen(server);
  try {
    const pending = new Promise<number>((resolve) => {
      const req = request(
        `${base}/chart.svg`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "Transfer-Encoding": "chunked" },
        },
        (res) => {
          res.resume();
          res.on("end", () => {
            req.destroy();
            resolve(res.statusCode!);
          });
        },
      );
      req.on("error", () => {});
      req.write("{");
    });
    await new Promise((r) => setTimeout(r, 10));
    expect((await fetch(`${base}/chart.svg?data=1`)).status).toBe(503);
    expect(await pending).toBe(408);
    expect((await fetch(`${base}/chart.svg?data=1`)).status).toBe(200);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((r) => server.close(() => r()));
  }
});
it("kills timed-out workers and releases admission after termination", async () => {
  const server = createServer(api.createRenderHandler({ concurrency: 1, timeoutMs: 1 }));
  const base = await listen(server);
  try {
    for (let i = 0; i < 2; i++) expect((await fetch(`${base}/render.png?data=1`)).status).toBe(504);
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
  }
});
it("starts an ephemeral loopback server and drains shutdown idempotently", async () => {
  expect(api.startRenderServer).toBeTypeOf("function");
  const server = await api.startRenderServer({ port: 0 });
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  expect((await fetch(`${base}/chart.svg?data=1`)).status).toBe(200);
  await Promise.all([server.shutdown(), server.shutdown()]);
  expect(server.listening).toBe(false);
});
it("bounds shutdown even for sockets that never finish their headers", async () => {
  const { connect } = await import("node:net");
  const server = await api.startRenderServer({ port: 0, timeoutMs: 10, bodyTimeoutMs: 10 });
  const socket = connect((server.address() as { port: number }).port, "127.0.0.1");
  await new Promise<void>((r) => socket.once("connect", r));
  socket.write("GET /chart.svg HTTP/1.1\r\nHost:");
  await new Promise((r) => setTimeout(r, 10));
  let timer: ReturnType<typeof setTimeout>;
  try {
    expect(
      await Promise.race([
        server.shutdown().then(() => true),
        new Promise<boolean>((r) => {
          timer = setTimeout(() => r(false), 1600);
        }),
      ]),
    ).toBe(true);
  } finally {
    clearTimeout(timer!);
    socket.destroy();
    server.closeAllConnections();
    await server.shutdown();
  }
});
