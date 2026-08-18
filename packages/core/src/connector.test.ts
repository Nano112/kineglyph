import { describe, expect, it } from "vitest";
import {
  CONNECTOR_HEAD_LENGTH,
  CONNECTOR_SHAFT_RATIO,
  connectorHeadLength,
  minimumConnectorRun,
} from "./connector.js";
import { resolveScene } from "./resolve.js";
import { sceneFromSpec, type SimpleSceneSpec } from "./spec.js";
import { defaultTheme } from "./theme.js";

describe("connector metrics", () => {
  it("derives the shortest run from the arrowhead rather than picking a number", () => {
    for (const width of [1, 1.5, 2, 3]) {
      const run = minimumConnectorRun(width);
      const head = connectorHeadLength(width);
      expect(run).toBeGreaterThanOrEqual(head * (1 + CONNECTOR_SHAFT_RATIO));
      // The head never occupies more than its share of the run it sits on.
      expect(head / run).toBeLessThanOrEqual(1 / (1 + CONNECTOR_SHAFT_RATIO));
    }
  });

  it("keeps the head length proportional to the stroke", () => {
    expect(connectorHeadLength(2)).toBeCloseTo(CONNECTOR_HEAD_LENGTH * 2, 6);
    expect(connectorHeadLength(4)).toBeCloseTo(connectorHeadLength(2) * 2, 6);
  });

  it("lands on the spacing rhythm", () => {
    expect(minimumConnectorRun(2)).toBe(40);
    expect(minimumConnectorRun(1.5)).toBe(32);
    expect(minimumConnectorRun(2) % 4).toBe(0);
  });
});

const box = (id: string, title: string): SimpleSceneSpec["nodes"][number] => ({
  id,
  kind: "box",
  title,
});

function specWith(layout: "row" | "stack", edges: SimpleSceneSpec["edges"]): SimpleSceneSpec {
  return {
    version: 1,
    id: "gap",
    title: "Gap",
    layout,
    padding: 0,
    timeline: "none",
    nodes: [box("a", "A"), box("b", "B")],
    ...(edges === undefined ? {} : { edges }),
  };
}

function runLength(spec: SimpleSceneSpec, width = 720): number {
  const resolved = resolveScene(sceneFromSpec(spec), { width, theme: defaultTheme });
  const edge = resolved.edges?.[0];
  if (edge === undefined) throw new Error("expected an edge");
  return edge.length ?? 0;
}

describe("a layout gap satisfies its connectors", () => {
  it("gives every connected pair at least the minimum run", () => {
    expect(runLength(specWith("row", [{ from: "a", to: "b" }]))).toBeGreaterThanOrEqual(
      minimumConnectorRun(defaultTheme.strokes.regular),
    );
    expect(runLength(specWith("stack", [{ from: "a", to: "b" }]))).toBeGreaterThanOrEqual(
      minimumConnectorRun(defaultTheme.strokes.regular),
    );
  });

  it("widens a row far enough that a labelled connector's label clears both nodes", () => {
    const short = runLength(specWith("row", [{ from: "a", to: "b", label: "go" }]));
    const long = runLength(
      specWith("row", [{ from: "a", to: "b", label: "a considerably longer label" }]),
    );
    expect(long).toBeGreaterThan(short);
  });

  it("spends nothing on gaps a connector does not need", () => {
    const withoutEdges = resolveScene(sceneFromSpec(specWith("row", undefined)), {
      width: 720,
      theme: defaultTheme,
    });
    const withEdges = resolveScene(sceneFromSpec(specWith("row", [{ from: "a", to: "b" }])), {
      width: 720,
      theme: defaultTheme,
    });
    const firstOf = (scene: typeof withoutEdges): number => {
      const nodes = scene.nodes.filter((node) => node.id === "n:a" || node.id === "n:b");
      const [a, b] = nodes;
      if (a === undefined || b === undefined) throw new Error("expected both nodes");
      return Math.abs(b.x - (a.x + a.width));
    };
    expect(firstOf(withoutEdges)).toBeLessThan(firstOf(withEdges));
  });

  it("treats an explicit gap as a minimum when a connector needs more room", () => {
    const connected = { ...specWith("row", [{ from: "a", to: "b" }]), gap: 8 };
    expect(runLength(connected)).toBeGreaterThanOrEqual(
      minimumConnectorRun(defaultTheme.strokes.regular),
    );

    const unconnected = resolveScene(sceneFromSpec({ ...specWith("row", undefined), gap: 8 }), {
      width: 720,
      theme: defaultTheme,
    });
    const [a, b] = unconnected.nodes.filter((node) => node.id === "n:a" || node.id === "n:b");
    expect(a).toBeDefined();
    expect(b).toBeDefined();
    expect((b?.x ?? 0) - ((a?.x ?? 0) + (a?.width ?? 0))).toBeCloseTo(8, 3);
  });
});

describe("edge labels and packets", () => {
  it("places a label clear of every node, and asks for no plate when it is clear", () => {
    const resolved = resolveScene(
      sceneFromSpec(specWith("row", [{ from: "a", to: "b", label: "read" }])),
      { width: 720, theme: defaultTheme },
    );
    const label = resolved.edges?.[0]?.labels?.[0];
    expect(label).toBeDefined();
    expect(label?.halo).toBeUndefined();
    for (const node of resolved.nodes.filter((n) => n.id === "n:a" || n.id === "n:b")) {
      const overlaps =
        label !== undefined &&
        Math.abs(label.x - (node.x + node.width / 2)) < (label.width + node.width) / 2 &&
        Math.abs(label.y - (node.y + node.height / 2)) < (label.height + node.height) / 2;
      expect(overlaps).toBe(false);
    }
  });

  it("carries packets in the line's own colour, not the border's", () => {
    const spec = specWith("row", [{ from: "a", to: "b", style: "flow" }]);
    const resolved = resolveScene(sceneFromSpec(spec), { width: 720, theme: defaultTheme });
    const edge = resolved.edges?.[0];
    expect(edge?.packetColor).toBe(defaultTheme.colors.connector);
    expect(edge?.packetColor).not.toBe(defaultTheme.colors.border);
  });
});
