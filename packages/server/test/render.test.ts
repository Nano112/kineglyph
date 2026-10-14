import { expect, it } from "vitest";
import { render } from "../src/render.js";
import { parseRequest } from "../src/schema.js";
import { chartUrl, renderUrl, parseQuery } from "../src/client.js";
it("renders real PNG and default animated GIF with bundled fonts", async () => {
  expect(
    Buffer.from(await render({ data: [12, 18, 45] }, "png"))
      .subarray(0, 8)
      .toString("hex"),
  ).toBe("89504e470d0a1a0a");
  expect(
    Buffer.from(await render({ data: [12, 18, 45] }, "gif"))
      .subarray(0, 6)
      .toString(),
  ).toBe("GIF89a");
});
it("schedules chart motion rather than returning a static GIF", async () => {
  const start = await render({ data: [12, 18, 45], time: 0 }, "svg");
  const end = await render({ data: [12, 18, 45], time: 800 }, "svg");
  expect(start).not.toEqual(end);
  const gif = Buffer.from(await render({ data: [12, 18, 45] }, "gif"));
  expect(gif.toString("hex").split("21f904").length).toBeGreaterThan(2);
});
it("rejects oversized raster allocations before export", async () => {
  await expect(render({ data: [1, 2], width: 1600, scale: 3 }, "png")).rejects.toThrow(
    "pixel budget",
  );
});
it("rejects unsupported formats", async () => {
  await expect(render({ data: [1, 2] }, "jpeg")).rejects.toThrow("format");
});
it("canonicalizes structured fallback and preserves null gaps", () => {
  const a = { chart: { series: [{ name: "cpu", data: [1, null, 3], tone: "chart2" as const }] } };
  const b = { chart: { series: [{ tone: "chart2" as const, data: [1, null, 3], name: "cpu" }] } };
  expect(renderUrl("https://example.test", a)).toBe(chartUrl("https://example.test", b));
  expect(parseQuery(new URL(chartUrl("https://example.test", a)).searchParams)).toEqual(
    parseRequest(a),
  );
});
it("preserves numeric-looking string categories via structured fallback", () => {
  const r = { chart: { series: [{ name: "cpu", data: [1, 3] }], x: ["1", "2"] } };
  expect(parseQuery(new URL(chartUrl("https://example.test", r)).searchParams)).toEqual(
    parseRequest(r),
  );
});
it("accepts safe authored metadata, inspection, ports and material refs", async () => {
  const scene = {
    schemaVersion: 2,
    id: "safe",
    title: "Safe",
    metadata: { source: "builder" },
    root: {
      type: "group",
      id: "root",
      children: [
        {
          id: "a",
          type: "rect",
          width: 100,
          height: 100,
          material: { material: "raised", fill: "surface", stroke: "border", radius: 8 },
          metadata: { index: 1 },
          inspect: { role: "Stage", fields: [{ label: "Status", value: "Ready" }] },
          ports: [{ id: "out", side: "right", offset: 0.5 }],
        },
      ],
    },
  };
  expect(new TextDecoder().decode(await render({ scene }, "svg"))).toContain("<svg");
});
it.each([
  { family: 'x" onload="alert(1)' },
  { material: { effects: [{ type: "shader", name: "evil" }] } },
])("rejects unsafe node capabilities", (extra) => {
  const scene = {
    schemaVersion: 2,
    id: "bad",
    title: "Bad",
    root: { type: "group", id: "root", children: [{ id: "a", type: "rect", ...extra }] },
  };
  expect(() => parseRequest({ scene })).toThrow();
});
