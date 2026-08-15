import { describe, expect, it } from "vitest";
import { createTheme } from "./theme.js";
import { defineScene, validateScene, type SceneDefinition } from "./scene.js";
import { chooseLayout, resolveFigure, resolveScene } from "./resolve.js";
import { seekTimeline } from "./seek.js";
import { definePipeline } from "./pipeline.js";

const theme = createTheme();

const card = (id: string, title: string, body: string): SceneDefinition["root"] => ({
  id,
  type: "group",
  layout: "stack",
  gap: 6,
  padding: 14,
  width: "fill",
  frame: { fill: "surface", stroke: "border" },
  interactive: true,
  label: title,
  description: body,
  children: [
    { id: `${id}-title`, type: "text", text: title, textStyle: "bodyStrong" },
    { id: `${id}-body`, type: "text", text: body, textStyle: "caption", maxLines: 3 },
  ],
});

const scene: SceneDefinition = {
  schemaVersion: 2,
  id: "layout-scene",
  title: "Layout scene",
  description: "Three cards in a row that stack when narrow.",
  breakpoints: { wide: 800, compact: 480 },
  root: {
    id: "root",
    type: "group",
    layout: { wide: "row", compact: "stack" },
    gap: { wide: 20, compact: 12 },
    children: [
      card(
        "a",
        "Alpha",
        "First card with a reasonably long body that wraps onto several lines when the container is narrow.",
      ),
      card("b", "Beta", "Second card."),
      card("c", "Gamma", "Third card body text."),
    ],
  },
  edges: [
    { id: "a-b", from: "a", to: "b", route: { wide: "straight", compact: "orthogonal" } },
    { id: "b-c", from: "b", to: "c", route: "curve", head: "triangle", tail: "dot", label: "then" },
  ],
  timeline: {
    duration: 1000,
    tracks: [
      {
        id: "a-in",
        target: "a",
        property: "opacity",
        keyframes: [
          { time: 0, value: 0 },
          { time: 500, value: 1 },
        ],
      },
      {
        id: "a-b-reveal",
        target: "a-b",
        property: "edgeReveal",
        keyframes: [
          { time: 400, value: 0 },
          { time: 900, value: 1 },
        ],
      },
    ],
  },
};

describe("resolveScene", () => {
  it("chooses named layouts from breakpoints and never scales", () => {
    expect(chooseLayout(1200, scene.breakpoints)).toBe("wide");
    expect(chooseLayout(700, scene.breakpoints)).toBe("compact");
    expect(chooseLayout(390, scene.breakpoints)).toBe("narrow");
    const wide = resolveScene(scene, { width: 1000, theme });
    const compact = resolveScene(scene, { width: 700, theme });
    expect(wide.layoutName).toBe("wide");
    expect(compact.layoutName).toBe("compact");
    const wideCards = wide.nodes.filter((node) => ["a", "b", "c"].includes(node.id));
    const compactCards = compact.nodes.filter((node) => ["a", "b", "c"].includes(node.id));
    // Row: same y, distinct x. Stack: same x, distinct y.
    expect(new Set(wideCards.map((node) => node.y)).size).toBe(1);
    expect(new Set(wideCards.map((node) => node.x)).size).toBe(3);
    expect(new Set(compactCards.map((node) => node.x)).size).toBe(1);
    expect(new Set(compactCards.map((node) => node.y)).size).toBe(3);
    // Fill widths share the row equally.
    expect(
      wideCards.every((node) => Math.abs(node.width - (wideCards[0]?.width ?? 0)) < 0.01),
    ).toBe(true);
  });

  it("is deterministic and produces finite geometry with no layout diagnostics", () => {
    for (const width of [1200, 820, 390]) {
      const first = resolveScene(scene, { width, theme });
      const second = resolveScene(scene, { width, theme });
      expect(JSON.stringify(first)).toBe(JSON.stringify(second));
      for (const node of first.nodes)
        expect([node.x, node.y, node.width, node.height].every(Number.isFinite)).toBe(true);
      expect(first.diagnostics?.filter((entry) => entry.code !== "text-truncated")).toEqual([]);
      expect(first.height).toBeGreaterThan(0);
    }
  });

  it("keeps wrapped text inside its box and inherits parent ids", () => {
    const resolved = resolveScene(scene, { width: 390, theme });
    const body = resolved.nodes.find((node) => node.id === "a-body");
    expect(body?.parent).toBe("a");
    expect(body?.text?.lines.length).toBeGreaterThan(1);
    for (const line of body?.text?.lines ?? [])
      expect(line.width).toBeLessThanOrEqual(body?.width ?? 0);
    const card = resolved.nodes.find((node) => node.id === "a");
    expect(card?.kind).toBe("group");
    expect(card?.interactive).toBe(true);
    expect((body?.x ?? 0) + (body?.width ?? 0)).toBeLessThanOrEqual(
      (card?.x ?? 0) + (card?.width ?? 0) + 0.001,
    );
  });

  it("routes edges per layout with typed markers and labels", () => {
    const wide = resolveScene(scene, { width: 1000, theme });
    const compact = resolveScene(scene, { width: 700, theme });
    const straight = wide.edges.find((edge) => edge.id === "a-b");
    const elbow = compact.edges.find((edge) => edge.id === "a-b");
    const curve = wide.edges.find((edge) => edge.id === "b-c");
    expect(straight?.route).toBe("straight");
    expect(straight?.path).toMatch(/^M [\d.]+ [\d.]+ L [\d.]+ [\d.]+$/);
    expect(elbow?.route).toBe("orthogonal");
    expect(curve?.route).toBe("curve");
    expect(curve?.path).toContain("C ");
    expect(curve?.head).toBe("triangle");
    expect(curve?.tail).toBe("dot");
    expect(curve?.labels?.[0]?.text).toBe("then");
    expect(curve?.samples?.length).toBe(33);
    // The straight edge leaves the right side of a and enters the left side of b in the wide layout.
    const a = wide.nodes.find((node) => node.id === "a");
    const b = wide.nodes.find((node) => node.id === "b");
    expect(straight?.start.x).toBeCloseTo((a?.x ?? 0) + (a?.width ?? 0), 3);
    expect(straight?.end.x).toBeCloseTo(b?.x ?? 0, 3);
  });

  it("seeks scene timelines including edge reveal on the general schema", () => {
    const resolved = resolveScene(scene, { width: 1000, theme });
    const mid = seekTimeline(resolved, 650);
    expect(mid.nodes.find((node) => node.id === "a")?.state.opacity).toBe(1);
    const reveal = mid.edges.find((edge) => edge.id === "a-b")?.state.progress ?? 0;
    expect(reveal).toBeGreaterThan(0);
    expect(reveal).toBeLessThan(1);
    expect(
      seekTimeline(resolved, 5000).edges.find((edge) => edge.id === "a-b")?.state.progress,
    ).toBe(1);
  });

  it("rejects invalid definitions with useful diagnostics", () => {
    const broken: SceneDefinition = {
      ...scene,
      edges: [{ id: "bad", from: "a", to: "missing" }],
    };
    const result = validateScene(broken);
    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((entry) => entry.code)).toContain("missing-node");
    expect(() => defineScene(broken)).toThrow(/missing target node missing/);
    expect(() =>
      resolveScene(
        {
          ...scene,
          root: { ...scene.root, children: [...scene.root.children, card("a", "Dup", "x")] },
        },
        { width: 800 },
      ),
    ).toThrow(/duplicate node id: a/);
  });

  it("resolves legacy pipelines through the unified figure entry point", () => {
    const pipeline = definePipeline({
      id: "legacy",
      title: "Legacy",
      nodes: [
        { id: "one", label: "One" },
        { id: "two", label: "Two" },
      ],
      edges: [{ id: "one-two", from: "one", to: "two" }],
    });
    const wide = resolveFigure(pipeline, { width: 960, theme });
    const narrow = resolveFigure(pipeline, { width: 390, theme });
    expect(wide.layout).toBe("wide");
    expect(wide.layoutName).toBe("wide");
    expect(narrow.layout).toBe("stacked");
    expect(narrow.layoutName).toBe("narrow");
    expect(resolveFigure(scene, { width: 700, theme }).layoutName).toBe("compact");
  });
});
