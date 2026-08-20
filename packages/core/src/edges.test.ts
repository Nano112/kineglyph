import { describe, expect, it } from "vitest";
import {
  assignPorts,
  packetPositions,
  resolveEdge,
  routeOrthogonalAvoidingObstacles,
  type EdgeNodeBox,
} from "./edges.js";
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
  it("finds the shortest stable orthogonal route around node obstacles", () => {
    const obstacle = { x: 180, y: 20, width: 40, height: 60 };
    const route = routeOrthogonalAvoidingObstacles(
      { x: 100, y: 50 },
      "right",
      { x: 300, y: 50 },
      "left",
      [obstacle],
      { x: 0, y: 0, width: 400, height: 160 },
    );
    expect(route).toBeDefined();
    expect(route?.[0]).toEqual({ x: 100, y: 50 });
    expect(route?.at(-1)).toEqual({ x: 300, y: 50 });
    expect(route?.some((point) => point.y === 12 || point.y === 88)).toBe(true);
    expect(
      routeOrthogonalAvoidingObstacles(
        { x: 100, y: 50 },
        "right",
        { x: 300, y: 50 },
        "left",
        [obstacle],
        { x: 0, y: 0, width: 400, height: 160 },
      ),
    ).toEqual(route);
  });

  it("collapses redundant visibility vertices into clean orthogonal runs", () => {
    const route = routeOrthogonalAvoidingObstacles(
      { x: 20, y: 40 },
      "right",
      { x: 360, y: 220 },
      "left",
      [
        { x: 80, y: 10, width: 50, height: 90 },
        { x: 160, y: 120, width: 60, height: 80 },
        { x: 260, y: 60, width: 50, height: 100 },
      ],
      { x: 0, y: 0, width: 400, height: 260 },
    );
    expect(route).toBeDefined();
    for (let index = 1; index < (route?.length ?? 0) - 1; index += 1) {
      const before = route?.[index - 1];
      const current = route?.[index];
      const after = route?.[index + 1];
      if (before === undefined || current === undefined || after === undefined) continue;
      const vertical = before.x === current.x && current.x === after.x;
      const horizontal = before.y === current.y && current.y === after.y;
      expect(vertical || horizontal).toBe(false);
    }
  });

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
    expect(ports.get("a-b")?.from).toEqual({ side: "right", offset: 1 / 3, pinned: true });
    expect(ports.get("a-c")?.from).toEqual({ side: "right", offset: 2 / 3, pinned: true });
    const again = assignPorts([...edges].reverse(), "wide", boxes);
    expect(again.get("a-b")?.from.offset).toBeCloseTo(1 / 3);
    // A place in a fan is a statement, so it is pinned; the far end of each edge is the only
    // thing on its own side and stays free to move to meet its partner.
    expect(ports.get("a-b")?.to.pinned).toBe(false);
  });

  it("puts a connector between facing sides on the axis the two boxes share", () => {
    // `tall` and `short` face each other and overlap on y; each one's own middle would give a
    // 20px lean over a 200px run, which reads as a rendering mistake rather than as a slope.
    const sized = new Map<string, EdgeNodeBox>([
      ["tall", { id: "tall", kind: "rect", x: 0, y: 0, width: 100, height: 120 }],
      ["short", { id: "short", kind: "rect", x: 300, y: 0, width: 100, height: 80 }],
    ]);
    const edge: EdgeDefinition = { id: "t-s", from: "tall", to: "short" };
    const ports = assignPorts([edge], "wide", sized);
    const port = ports.get("t-s");
    if (port === undefined) throw new Error("missing port");
    const resolved = resolveEdge(edge, port, {
      layout: "wide",
      theme,
      boxes: sized,
      obstacles: [...sized.values()],
      labelFont: font,
      labelColor: "#333333",
      precision: 3,
    });
    if (resolved === undefined) throw new Error("unresolved");
    // The shared span is y 0-80; its middle is 40, inside both boxes.
    expect(resolved.edge.path).toBe("M 100 40 L 300 40");
    expect(resolved.edge.start.y).toBe(resolved.edge.end.y);
  });

  it("routes facing boxes that share none of the cross axis instead of leaning across it", () => {
    const apart = new Map<string, EdgeNodeBox>([
      ["low", { id: "low", kind: "rect", x: 0, y: 0, width: 100, height: 40 }],
      ["high", { id: "high", kind: "rect", x: 300, y: 200, width: 100, height: 40 }],
    ]);
    const edge: EdgeDefinition = {
      id: "l-h",
      from: { node: "low", side: "right" },
      to: { node: "high", side: "left" },
    };
    const ports = assignPorts([edge], "wide", apart);
    const port = ports.get("l-h");
    if (port === undefined) throw new Error("missing port");
    const resolved = resolveEdge(edge, port, {
      layout: "wide",
      theme,
      boxes: apart,
      obstacles: [...apart.values()],
      labelFont: font,
      labelColor: "#333333",
      precision: 3,
    });
    if (resolved === undefined) throw new Error("unresolved");
    // Authored as "straight", but nothing is straight between sides that do not face: it turns.
    expect(resolved.edge.route).toBe("orthogonal");
    expect(resolved.edge.path).not.toMatch(/^M 100 20 L 300 220$/);
    expect(resolved.edge.start).toEqual({ x: 100, y: 20 });
    expect(resolved.edge.end).toEqual({ x: 300, y: 220 });
  });

  it("moves automatic ports when the nearest exit lane is blocked", () => {
    const blocked = new Map<string, EdgeNodeBox>([
      ["source", { id: "source", kind: "rect", x: 40, y: 20, width: 100, height: 70 }],
      ["blocker", { id: "blocker", kind: "rect", x: 40, y: 102, width: 100, height: 90 }],
      ["target", { id: "target", kind: "circle", x: 85, y: 220, width: 10, height: 10 }],
    ]);
    const edge: EdgeDefinition = { id: "auto", from: "source", to: "target", route: "orthogonal" };
    const ports = assignPorts([edge], "narrow", blocked);
    const port = ports.get(edge.id);
    if (port === undefined) throw new Error("missing port");
    expect(port.from.side).toBe("bottom");
    const resolved = resolveEdge(edge, port, {
      layout: "narrow",
      theme,
      boxes: blocked,
      obstacles: [...blocked.values()],
      bounds: { x: 0, y: 0, width: 220, height: 260 },
      labelFont: font,
      labelColor: "#333333",
      precision: 3,
    });
    if (resolved === undefined) throw new Error("unresolved");
    expect(resolved.collidingObstacles).toBe(false);
    expect(resolved.edge.start.x === 40 || resolved.edge.start.x === 140).toBe(true);
    expect(resolved.edge.start.y).not.toBe(90);
  });

  it("leaves an authored port exactly where the author put it", () => {
    const sized = new Map<string, EdgeNodeBox>([
      ["tall", { id: "tall", kind: "rect", x: 0, y: 0, width: 100, height: 120 }],
      ["short", { id: "short", kind: "rect", x: 300, y: 0, width: 100, height: 80 }],
    ]);
    const edge: EdgeDefinition = {
      id: "pinned",
      from: { node: "tall", side: "right", offset: 0.75 },
      to: "short",
    };
    const ports = assignPorts([edge], "wide", sized);
    const port = ports.get("pinned");
    if (port === undefined) throw new Error("missing port");
    expect(port.from.pinned).toBe(true);
    const resolved = resolveEdge(edge, port, {
      layout: "wide",
      theme,
      boxes: sized,
      obstacles: [...sized.values()],
      labelFont: font,
      labelColor: "#333333",
      precision: 3,
    });
    if (resolved === undefined) throw new Error("unresolved");
    expect(resolved.edge.start).toEqual({ x: 100, y: 90 });
    expect(resolved.edge.end).toEqual({ x: 300, y: 40 });
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
