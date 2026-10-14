import { expect, it } from "vitest";
import { parseRequest } from "../src/schema.js";
import { createServer } from "node:http";
import { createRenderHandler } from "../src/index.js";

it("renders minimal SVG over real HTTP", async () => {
  const handler = createRenderHandler();
  const server = createServer(handler);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address() as { port: number };
    const response = await fetch(`http://127.0.0.1:${address.port}/chart.svg?data=12,18,45`);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("image/svg+xml");
    expect(await response.text()).toContain("<svg");
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

it("normalizes minimal chart input with attractive defaults", () => {
  const request = parseRequest({ data: [12, 18, 45] });
  expect(request.width).toBe(960);
  expect(request.scale).toBe(1);
  expect(request.chart?.series[0]?.data).toEqual([12, 18, 45]);
  expect(request.chart?.mark).toBe("line");
});
