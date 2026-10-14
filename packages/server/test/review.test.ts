import { afterAll, beforeAll, expect, it } from "vitest";
import { createServer } from "node:http";
import { createRenderHandler } from "../src/index.js";
import { parseRequest, RequestError } from "../src/schema.js";
import { parseQuery } from "../src/client.js";
import { render } from "../src/render.js";

const scene = {
  schemaVersion: 2,
  id: "review",
  title: "Review",
  root: { type: "group", id: "root", children: [{ type: "text", id: "text", text: "Hello" }] },
};
it("rejects nested frame material references with RequestError 400", () => {
  expect(() =>
    parseRequest({
      scene: {
        ...scene,
        root: {
          ...scene.root,
          frame: { material: { material: "raised", fill: "danger" } },
        },
      },
    }),
  ).toThrow(expect.objectContaining({ status: 400 }));
});
it("renders frame material tokens while preserving full node material references", async () => {
  const input = {
    scene: {
      ...scene,
      root: {
        ...scene.root,
        frame: { material: "raised", fill: "surface" },
        material: { material: "inset", fill: "surface" },
      },
    },
  };
  expect(parseRequest(input).scene).toEqual(input.scene);
  expect(new TextDecoder().decode(await render(input, "svg"))).toContain("Hello");
});

it.each(["root", "child"])("rejects unsupported maxHeight on %s", (target) => {
  const root =
    target === "root"
      ? { ...scene.root, maxHeight: 10 }
      : { ...scene.root, children: [{ ...scene.root.children[0], maxHeight: 10 }] };
  const parse = () => parseRequest({ scene: { ...scene, root } });
  expect(parse).toThrow(expect.objectContaining({ status: 400 }));
  expect(parse).toThrow("maxHeight");
});

const longAnimation = { scene: { ...scene, timeline: { duration: 2000, tracks: [] } }, fps: 24 };
it("reports excessive GIF frame counts as actionable RequestError 413", async () => {
  await expect(render(longAnimation, "gif")).rejects.toBeInstanceOf(RequestError);
  await expect(render(longAnimation, "gif")).rejects.toMatchObject({ status: 413 });
  await expect(render(longAnimation, "gif")).rejects.toThrow(/49.*25.*lower fps/i);
});
it("returns HTTP 413 with GIF frame-budget guidance", async () => {
  const response = await fetch(`${base}/chart.gif`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(longAnimation),
  });
  expect(response.status).toBe(413);
  expect(await response.text()).toMatch(/49.*25.*lower fps/i);
});

it.each(["bar", "line"] as const)(
  "uses the effective single-series %s mark for automatic labels",
  async (mark) => {
    const series = { name: "Value", data: [12, 18, 45] };
    const chartDefault = await render({ chart: { mark, series: [series] } }, "svg");
    const seriesOverride = await render(
      {
        chart: {
          mark: mark === "bar" ? "line" : "bar",
          series: [{ ...series, mark }],
        },
      },
      "svg",
    );
    expect(new TextDecoder().decode(seriesOverride)).toBe(new TextDecoder().decode(chartDefault));
  },
);

const server = createServer(createRenderHandler());
let base: string;
beforeAll(async () => {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

it.each([{ series: [] }, { series: [null] }, { series: [{}] }])(
  "rejects invalid chart series %j with RequestError 400",
  ({ series }) => {
    const input = { chart: { series } };
    for (const parse of [
      () => parseRequest(input),
      () => parseQuery(new URLSearchParams({ spec: JSON.stringify(input) })),
    ]) {
      expect(parse).toThrow(RequestError);
      expect(parse).toThrow(expect.objectContaining({ status: 400 }));
    }
  },
);
it.each(["GET", "POST"])("returns HTTP 400 for empty series via %s", async (method) => {
  const input = { chart: { series: [] } };
  const query = new URLSearchParams({ spec: JSON.stringify(input) });
  const response = await fetch(`${base}/chart.svg${method === "GET" ? `?${query}` : ""}`, {
    method,
    ...(method === "POST"
      ? {
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        }
      : {}),
  });
  expect(response.status).toBe(400);
  expect(await response.text()).toContain("chart.series");
});
