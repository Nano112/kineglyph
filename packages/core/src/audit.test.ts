/**
 * Regression tests for the quantitative-authoring audit: monotone interpolation, percent heights,
 * inspection fallbacks, line caps, fragment scoping, coordinate overflow, and track validation.
 */
import { describe, expect, it } from "vitest";
import { createTheme } from "./theme.js";
import { monotoneTangents, polylinePath, resolveScene } from "./resolve.js";
import { seekTimeline } from "./seek.js";
import { scopeFragment, type SceneFragment } from "./fragment.js";
import type { GroupNode, SceneDefinition, SceneNode } from "./scene.js";

const theme = createTheme();

type Pt = { x: number; y: number };

/** Evaluate the Hermite cubic that polylinePath emits as a Bézier for one interval. */
function hermite(a: Pt, b: Pt, m0: number, m1: number, t: number): number {
  const h = b.x - a.x;
  const t2 = t * t;
  const t3 = t2 * t;
  return (
    (2 * t3 - 3 * t2 + 1) * a.y +
    (t3 - 2 * t2 + t) * h * m0 +
    (-2 * t3 + 3 * t2) * b.y +
    (t3 - t2) * h * m1
  );
}

function sampleInterpolant(pts: Pt[]): number[] {
  const m = monotoneTangents(pts);
  const samples: number[] = [];
  for (let index = 0; index < pts.length - 1; index += 1) {
    const a = pts[index];
    const b = pts[index + 1];
    if (a === undefined || b === undefined) continue;
    for (let step = 0; step <= 40; step += 1)
      samples.push(hermite(a, b, m[index] ?? 0, m[index + 1] ?? 0, step / 40));
  }
  return samples;
}

function scene(children: SceneNode[]): SceneDefinition {
  const root: GroupNode = { id: "root", type: "group", layout: "stack", children };
  return { schemaVersion: 2, id: "audit", title: "Audit", root };
}

describe("monotone interpolation is slope limited", () => {
  it("never overshoots the data envelope for uneven spacing", () => {
    const pts = [
      { x: 0, y: 0 },
      { x: 0.1, y: 0.9 },
      { x: 1, y: 1 },
    ];
    const samples = sampleInterpolant(pts);
    for (const value of samples) {
      expect(value).toBeGreaterThanOrEqual(-1e-9);
      expect(value).toBeLessThanOrEqual(1 + 1e-9);
    }
    for (let index = 1; index < samples.length; index += 1)
      expect(samples[index] ?? 0).toBeGreaterThanOrEqual((samples[index - 1] ?? 0) - 1e-9);
  });

  it("flattens plateaus and local extrema", () => {
    const m = monotoneTangents([
      { x: 0, y: 0 },
      { x: 1, y: 1 },
      { x: 2, y: 1 },
      { x: 3, y: 2 },
      { x: 4, y: 0 },
    ]);
    expect(m[1]).toBe(0);
    expect(m[2]).toBe(0);
    expect(m[3]).toBe(0);
    const plateau = sampleInterpolant([
      { x: 0, y: 0 },
      { x: 1, y: 1 },
      { x: 2, y: 1 },
      { x: 3, y: 2 },
    ]);
    for (const value of plateau) expect(value).toBeLessThanOrEqual(2 + 1e-9);
    // Samples inside the plateau interval stay exactly flat.
    const inside = plateau.slice(41, 82);
    for (const value of inside) expect(value).toBeCloseTo(1, 9);
  });

  it("handles descending data and stays inside the envelope", () => {
    const pts = [
      { x: 0, y: 3 },
      { x: 1, y: 2 },
      { x: 2, y: 0.5 },
      { x: 3, y: 0 },
    ];
    for (const tangent of monotoneTangents(pts)) expect(tangent).toBeLessThanOrEqual(0);
    const samples = sampleInterpolant(pts);
    for (let index = 1; index < samples.length; index += 1)
      expect(samples[index] ?? 0).toBeLessThanOrEqual((samples[index - 1] ?? 0) + 1e-9);
    expect(Math.min(...samples)).toBeGreaterThanOrEqual(-1e-9);
    expect(Math.max(...samples)).toBeLessThanOrEqual(3 + 1e-9);
  });

  it("falls back to straight segments when x is not strictly increasing", () => {
    const duplicate = polylinePath(
      {
        points: [
          [0, 0],
          [0.5, 1],
          [0.5, 0.2],
          [1, 1],
        ],
        curve: "monotone",
      },
      100,
      100,
    );
    const unsorted = polylinePath(
      {
        points: [
          [1, 1],
          [0, 0],
          [0.5, 0.5],
        ],
        curve: "monotone",
      },
      100,
      100,
    );
    const descending = polylinePath(
      {
        points: [
          [1, 0],
          [0.5, 1],
          [0, 0],
        ],
        curve: "monotone",
      },
      100,
      100,
    );
    for (const d of [duplicate, unsorted, descending]) {
      expect(d).not.toContain("C ");
      expect(d.split(" L ").length).toBeGreaterThan(1);
    }
    const monotone = polylinePath(
      {
        points: [
          [0, 0],
          [0.5, 1],
          [1, 0.2],
        ],
        curve: "monotone",
      },
      100,
      100,
    );
    expect(monotone).toContain("C ");
  });
});

describe("percent heights resolve against the parent's content box", () => {
  it("applies to stack, row, grid, and overlay children", () => {
    const definition = scene([
      {
        id: "stack",
        type: "group",
        layout: "stack",
        height: 200,
        children: [{ id: "half", type: "rect", height: "50%", fill: "chart1" }],
      },
      {
        id: "row",
        type: "group",
        layout: "row",
        height: 120,
        children: [{ id: "quarter", type: "rect", width: 40, height: "25%", fill: "chart1" }],
      },
      {
        id: "grid",
        type: "group",
        layout: "grid",
        columns: 2,
        height: 100,
        children: [
          { id: "g1", type: "rect", height: "40%", fill: "chart1" },
          { id: "g2", type: "rect", height: 10, fill: "chart2" },
        ],
      },
      {
        id: "overlay",
        type: "group",
        layout: "overlay",
        height: 80,
        children: [{ id: "o1", type: "rect", height: "75%", fill: "chart1" }],
      },
    ]);
    const resolved = resolveScene(definition, { width: 800, theme });
    const height = (id: string): number | undefined =>
      resolved.nodes.find((node) => node.id === id)?.height;
    expect(height("half")).toBeCloseTo(100, 3);
    expect(height("quarter")).toBeCloseTo(30, 3);
    expect(height("g1")).toBeCloseTo(40, 3);
    expect(height("o1")).toBeCloseTo(60, 3);
  });

  it("falls back to the natural height when the parent hugs its content", () => {
    const definition = scene([
      {
        id: "hug",
        type: "group",
        layout: "stack",
        children: [{ id: "pct", type: "rect", height: "50%", fill: "chart1" }],
      },
    ]);
    const resolved = resolveScene(definition, { width: 800, theme });
    const pct = resolved.nodes.find((node) => node.id === "pct");
    expect(pct?.height).toBeGreaterThan(0);
    expect(Number.isFinite(pct?.height)).toBe(true);
  });
});

describe("inspection metadata feeds accessible names", () => {
  it("uses inspect.title/summary as the label/description fallback", () => {
    const definition = scene([
      {
        id: "cell",
        type: "rect",
        interactive: true,
        fill: "chart1",
        inspect: {
          role: "Cell",
          title: "Row 2 · Col 3",
          summary: "Value 42",
          fields: [{ label: "Value", value: "42" }],
        },
      },
      {
        id: "plain",
        type: "rect",
        interactive: true,
        label: "Explicit label",
        fill: "chart2",
        inspect: { role: "Bar", title: "Ignored" },
      },
    ]);
    const resolved = resolveScene(definition, { width: 800, theme });
    const cell = resolved.nodes.find((node) => node.id === "cell");
    const plain = resolved.nodes.find((node) => node.id === "plain");
    expect(cell?.label).toBe("Row 2 · Col 3");
    expect(cell?.description).toBe("Value 42");
    expect(plain?.label).toBe("Explicit label");
  });
});

describe("polyline appearance", () => {
  it("passes lineCap through and reports the path length", () => {
    const definition = scene([
      {
        id: "line",
        type: "polyline",
        width: 100,
        height: 50,
        points: [
          [0, 1],
          [1, 0],
        ],
        space: "fraction",
        lineCap: "butt",
        stroke: "chart1",
      },
    ]);
    const resolved = resolveScene(definition, { width: 800, theme });
    const line = resolved.nodes.find((node) => node.id === "line");
    expect(line?.appearance.lineCap).toBe("butt");
    expect(line?.path?.length).toBeCloseTo(Math.hypot(100, 50), 1);
  });
});

describe("fragment scoping is exhaustive", () => {
  it("scopes edge label ids, legend item ids, and diagnostic paths", () => {
    const fragment: SceneFragment = {
      nodes: [
        { id: "a", type: "rect", fill: "chart1" },
        { id: "b", type: "rect", fill: "chart2" },
        {
          id: "legend",
          type: "legend",
          items: [
            { id: "s1", label: "Dense", swatch: "chart1" },
            { id: "s2", label: "Sparse", swatch: "chart2" },
          ],
        },
      ],
      edges: [
        {
          id: "a-b",
          from: "a",
          to: "b",
          labels: [{ id: "lbl", text: "flows" }, { text: "unnamed" }],
        },
      ],
      diagnostics: [{ severity: "warning", code: "test", message: "hi", path: "a" }],
    };
    const scoped = scopeFragment(fragment, "p");
    const legend = scoped.nodes.find((node) => node.id === "p:legend");
    expect(legend?.type === "legend" ? legend.items.map((item) => item.id) : []).toEqual([
      "p:s1",
      "p:s2",
    ]);
    expect(scoped.edges?.[0]?.labels?.map((label) => label.id)).toEqual(["p:lbl", undefined]);
    expect(scoped.diagnostics?.[0]?.path).toBe("p:a");
  });
});

describe("coordinates groups keep overflow diagnostics", () => {
  const overflowing = (allowOverflow: boolean): SceneDefinition =>
    scene([
      {
        id: "area",
        type: "group",
        layout: "coordinates",
        height: 100,
        allowOverflow,
        children: [
          {
            id: "spill",
            type: "rect",
            position: { x: 0.9, y: 0 },
            width: "30%",
            height: "50%",
            fill: "chart1",
          },
          {
            id: "inside",
            type: "rect",
            position: { x: 0.9, y: 0.2 },
            width: "10%",
            height: "50%",
            fill: "chart2",
          },
        ],
      },
    ]);

  it("reports children that leave the box, but never intentional overlap", () => {
    const resolved = resolveScene(overflowing(false), { width: 800, theme });
    const codes = (resolved.diagnostics ?? []).map((entry) => entry.code);
    expect(codes).toContain("overflow");
    expect(codes).not.toContain("overlap");
  });

  it("allowOverflow is the escape hatch", () => {
    const resolved = resolveScene(overflowing(true), { width: 800, theme });
    expect((resolved.diagnostics ?? []).map((entry) => entry.code)).not.toContain("overflow");
  });
});

describe("timeline validation", () => {
  it("rejects node-only properties on edges and edge-only properties on nodes", () => {
    const definition: SceneDefinition = {
      ...scene([
        { id: "a", type: "rect", fill: "chart1" },
        { id: "b", type: "rect", fill: "chart2" },
      ]),
      edges: [{ id: "a-b", from: "a", to: "b" }],
      timeline: {
        duration: 500,
        tracks: [
          {
            id: "bad",
            target: "a-b",
            property: "revealX",
            keyframes: [
              { time: 0, value: 0 },
              { time: 500, value: 1 },
            ],
          },
        ],
      },
    };
    const resolved = resolveScene(definition, { width: 800, theme });
    expect(() => seekTimeline(resolved, 0)).toThrow(/revealX/);
    const nodeFlow: SceneDefinition = {
      ...definition,
      timeline: {
        duration: 500,
        tracks: [
          {
            id: "bad2",
            target: "a",
            property: "edgeReveal",
            keyframes: [
              { time: 0, value: 0 },
              { time: 500, value: 1 },
            ],
          },
        ],
      },
    };
    expect(() => seekTimeline(resolveScene(nodeFlow, { width: 800, theme }), 0)).toThrow(
      /edgeReveal/,
    );
  });
});
