import { describe, expect, it } from "vitest";
import { assignPorts, packetPositions, resolveEdge, type EdgeNodeBox } from "./edges.js";
import { PathGeometry, polylineToSegments } from "./geometry.js";
import { measureText, wrapText } from "./text.js";
import { createTheme } from "./theme.js";
import type { EdgeDefinition } from "./scene.js";

const theme = createTheme();
const boxes = new Map<string, EdgeNodeBox>([
  ["a", { id: "a", kind: "rect", x: 0, y: 0, width: 100, height: 60 }],
  ["b", { id: "b", kind: "rect", x: 300, y: 0, width: 100, height: 60 }],
  ["c", { id: "c", kind: "rect", x: 300, y: 200, width: 100, height: 60 }],
  ["d", { id: "d", kind: "circle", x: 0, y: 200, width: 60, height: 60 }],
]);
const font = { family: "Inter, sans-serif", size: 12, weight: 400, lineHeight: 16 };

function resolve(edge: EdgeDefinition, edges: readonly EdgeDefinition[] = [edge]) {
  const ports = assignPorts(edges, "wide", boxes);
  const port = ports.get(edge.id);
  if (port === undefined) throw new Error("missing port");
  const resolved = resolveEdge(edge, port, {
    layout: "wide",
    theme,
    boxes,
    obstacles: [...boxes.values()],
    labelFont: font,
    labelColor: "#333333",
    precision: 3,
  });
  if (resolved === undefined) throw new Error("unresolved");
  return resolved;
}

describe("edge grammar", () => {
  it("routes straight, orthogonal, curve, and arc paths from typed data", () => {
    const straight = resolve({ id: "s", from: "a", to: "b" });
    expect(straight.edge.path).toBe("M 100 30 L 300 30");
    expect(straight.edge.head).toBe("arrow");
    expect(straight.edge.tail).toBe("none");
    const elbow = resolve({ id: "o", from: "a", to: "c", route: "orthogonal", cornerRadius: 6 });
    expect(elbow.edge.route).toBe("orthogonal");
    expect(elbow.edge.path).toContain("Q ");
    expect(elbow.edge.start).toEqual({ x: 100, y: 30 });
    expect(elbow.edge.end).toEqual({ x: 300, y: 230 });
    const curve = resolve({ id: "c", from: "a", to: "c", route: "curve", curvature: 0.8 });
    expect(curve.edge.path).toMatch(/^M 100 30 C /);
    const arc = resolve({ id: "r", from: "a", to: "b", route: "arc", bend: 40 });
    expect(arc.edge.path).toMatch(/A [\d.]+ [\d.]+ 0 0 0 300 30$/);
    const arcUp = resolve({ id: "r2", from: "a", to: "b", route: "arc", bend: -40 });
    expect(arcUp.edge.path).toMatch(/A [\d.]+ [\d.]+ 0 0 1 300 30$/);
    expect(arc.geometry.length).toBeGreaterThan(200);
    expect(arc.geometry.pointAt(0.5).y).toBeGreaterThan(30);
    expect(arcUp.geometry.pointAt(0.5).y).toBeLessThan(30);
  });

  it("supports every marker, stroke style, and explicit ports", () => {
    const edge = resolve({
      id: "m",
      from: { node: "a", side: "bottom", offset: 0.25, gap: 4 },
      to: { node: "d", side: "top", offset: 0.5 },
      head: "diamond",
      tail: "bar",
      stroke: "dashed",
      width: 3,
      tone: "danger",
      opacity: 0.8,
      description: "a to d",
    });
    expect(edge.edge.start).toEqual({ x: 25, y: 64 });
    expect(edge.edge.end).toEqual({ x: 30, y: 200 });
    expect(edge.edge.head).toBe("diamond");
    expect(edge.edge.tail).toBe("bar");
    expect(edge.edge.dash).toBe("dashed");
    expect(edge.edge.appearance).toEqual({
      stroke: theme.colors.danger,
      strokeWidth: 3,
      opacity: 0.8,
    });
    expect(edge.edge.description).toBe("a to d");
    expect(edge.edge.directed).toBe(true);
    const undirected = resolve({ id: "u", from: "a", to: "b", head: "none", stroke: "flow" });
    expect(undirected.edge.directed).toBe(false);
    expect(undirected.edge.dash).toBe("flow");
  });

  it("distributes shared ports deterministically for branching and merging", () => {
    const edges: EdgeDefinition[] = [
      { id: "a-b", from: "a", to: "b" },
      { id: "a-c", from: "a", to: "c" },
    ];
    const ports = assignPorts(edges, "wide", boxes);
    expect(ports.get("a-b")?.from).toEqual({ side: "right", offset: 1 / 3 });
    expect(ports.get("a-c")?.from).toEqual({ side: "right", offset: 2 / 3 });
    const again = assignPorts([...edges].reverse(), "wide", boxes);
    expect(again.get("a-b")?.from.offset).toBeCloseTo(1 / 3);
  });

  it("places labels with collision-safe offsets and positions packets by time", () => {
    const edge = resolve({
      id: "l",
      from: "a",
      to: "b",
      labels: [
        { text: "start", placement: "start" },
        { text: "middle", placement: "middle" },
        { text: "end", placement: "end" },
      ],
      packets: { count: 2, period: 1000 },
    });
    const labels = edge.edge.labels ?? [];
    expect(labels.map((label) => label.text)).toEqual(["start", "middle", "end"]);
    expect(labels[0]?.x ?? 0).toBeLessThan(labels[1]?.x ?? 0);
    expect(labels[1]?.x ?? 0).toBeLessThan(labels[2]?.x ?? 0);
    // Default placement sits above a left-to-right edge.
    expect(labels[1]?.y ?? 0).toBeLessThan(30);
    expect(labels[1]?.width).toBeCloseTo(measureText("middle", font) + 10, 3);
    const samples = edge.edge.samples ?? [];
    expect(packetPositions(samples, 2, 1000, 0)).toEqual([
      { x: 100, y: 30 },
      { x: 200, y: 30 },
    ]);
    expect(packetPositions(samples, 2, 1000, 250)[0]).toEqual({ x: 150, y: 30 });
    expect(packetPositions(samples, 2, 1000, 1250)[0]).toEqual({ x: 150, y: 30 });
  });

  it("wraps text deterministically with ellipsis and long-word splitting", () => {
    const lines = wrapText("Sample the solid onto the Minecraft lattice", 90, font, {
      maxLines: 2,
    });
    expect(lines.length).toBe(2);
    expect(lines[1]?.text.endsWith("…")).toBe(true);
    for (const line of lines) expect(line.width).toBeLessThanOrEqual(90);
    const split = wrapText("Supercalifragilistic", 40, font);
    expect(split.length).toBeGreaterThan(1);
    expect(measureText("Hello", { ...font, family: "Geist Mono, monospace" })).toBeCloseTo(
      5 * 0.61 * 12,
      3,
    );
  });

  it("rounds polyline corners and reports arc-length points", () => {
    const geometry = new PathGeometry(
      polylineToSegments(
        [
          { x: 0, y: 0 },
          { x: 100, y: 0 },
          { x: 100, y: 100 },
        ],
        10,
      ),
    );
    expect(geometry.segments.map((segment) => segment.kind)).toEqual(["line", "quad", "line"]);
    expect(geometry.length).toBeGreaterThan(190);
    expect(geometry.length).toBeLessThan(200);
    expect(geometry.pointAt(0).x).toBe(0);
    expect(geometry.pointAt(1)).toMatchObject({ x: 100, y: 100 });
    expect(geometry.toSvg()).toBe("M 0 0 L 90 0 Q 100 0 100 10 L 100 100");
  });
});
