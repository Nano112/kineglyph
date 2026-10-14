import { figure } from "@kineglyph/core";
import { expect, it } from "vitest";
import { parseRequest } from "../src/schema.js";
import { render } from "../src/render.js";
it("renders actual card/flow/connect/reveal builder output", async () => {
  const built = figure("monitor-flow", { title: "Metrics to pixels" }, (f) => {
    const a = f.card({ title: "Mac mini", body: "Collect metrics", motif: "blocks", tone: "info" });
    const b = f.card({
      title: "Kineglyph",
      body: "Render the snapshot",
      motif: "brush",
      tone: "success",
    });
    const edge = f.connect(a, b, { label: "data", route: "orthogonal" });
    f.flow([a, b]);
    f.sequence([f.reveal(a), f.draw(edge), f.reveal(b)]);
  });
  expect(
    new TextDecoder().decode(await render({ scene: built, theme: "blueprint" }, "svg")),
  ).toContain("Mac mini");
});
const scene = {
  schemaVersion: 2,
  id: "example",
  title: "Scene escape hatch",
  root: {
    type: "group",
    id: "root",
    layout: "stack",
    children: [{ id: "label", type: "text", text: "Hello scene", textStyle: "title" }],
  },
};
it("validates and renders a full SceneDefinition without chart normalization", async () => {
  const input = { scene, width: 600 };
  expect(parseRequest(input).scene).toEqual(scene);
  expect(new TextDecoder().decode(await render(input, "svg"))).toContain("Hello scene");
});
it.each([
  { scene: null },
  { scene: {} },
  { scene: { ...scene, id: 7 } },
  { scene: { ...scene, root: { ...scene.root, children: [null] } } },
  {
    scene: {
      ...scene,
      root: {
        ...scene.root,
        children: [{ id: "image", type: "image", src: "file:///etc/passwd", alt: "bad" }],
      },
    },
  },
  {
    scene: {
      ...scene,
      root: {
        ...scene.root,
        children: [{ id: "image", type: "image", src: "https://example.com/x.png", alt: "bad" }],
      },
    },
  },
  { scene: { ...scene, machine: {} } },
  { scene: { ...scene, root: { ...scene.root, frame: { fill: "url(file:///tmp/a)" } } } },
  { scene: { ...scene, timeline: { duration: 100000, tracks: [] } } },
  { scene, chart: { series: [{ name: "x", data: [1] }] } },
  {
    scene: {
      ...scene,
      root: { ...scene.root, children: [{ id: "x", type: "path", d: "M0 0", viewBox: null }] },
    },
  },
])("rejects malformed or unsafe full scenes: %j", (value) => {
  expect(() => parseRequest(value)).toThrow();
});
it("bounds depth, scene nodes, numbers, and prototype keys before typed validation", () => {
  let root: unknown = { type: "group", id: "leaf", children: [] };
  for (let i = 0; i < 30; i++) root = { type: "group", id: `g${i}`, children: [root] };
  expect(() => parseRequest({ scene: { ...scene, root } })).toThrow();
  expect(() =>
    parseRequest({
      scene: {
        ...scene,
        root: {
          ...scene.root,
          children: Array.from({ length: 501 }, (_, i) => ({ id: `n${i}`, type: "rect" })),
        },
      },
    }),
  ).toThrow();
  expect(() => parseRequest(JSON.parse('{"data":[1],"__proto__":{}}'))).toThrow();
  expect(() => parseRequest({ data: [Infinity] })).toThrow();
});
