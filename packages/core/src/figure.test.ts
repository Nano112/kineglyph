import { describe, expect, it } from "vitest";
import { cubicBezier, spring } from "./easing.js";
import { figure, type FigureBuilder } from "./figure.js";
import type { SceneFragment } from "./fragment.js";
import { resolveScene } from "./resolve.js";
import {
  defineScene,
  endpointNode,
  validateScene,
  walkScene,
  type SceneDefinition,
  type SceneNode,
} from "./scene.js";
import { seekTimeline } from "./seek.js";
import { createTheme } from "./theme.js";

const theme = createTheme();
const WIDTHS = [1200, 820, 390] as const;
const LAYOUT_CODES = new Set(["overlap", "overflow", "text-truncated", "label-collision"]);

function nodeIds(scene: SceneDefinition): string[] {
  const ids: string[] = [];
  walkScene(scene.root, (node) => ids.push(node.id));
  return ids;
}

function findNode(scene: SceneDefinition, id: string): SceneNode | undefined {
  let result: SceneNode | undefined;
  walkScene(scene.root, (node) => {
    if (node.id === id) result = node;
  });
  return result;
}

function track(scene: SceneDefinition, id: string) {
  const found = scene.timeline?.tracks.find((entry) => entry.id === id);
  if (found === undefined) throw new Error(`no track ${id}`);
  return found;
}

const chartFragment: SceneFragment = {
  nodes: [
    {
      id: "chart",
      type: "group",
      layout: "stack",
      gap: 4,
      children: [
        { id: "chart:bar", type: "rect", width: 40, height: 24, fill: "chart1" },
        { id: "chart:label", type: "text", text: "Bar" },
      ],
    },
  ],
  edges: [{ id: "chart:link", from: "chart:bar", to: "chart:label", head: "arrow" }],
  tracks: [
    {
      id: "chart:bar:revealY",
      target: "chart:bar",
      property: "revealY",
      keyframes: [
        { time: 0, value: 0 },
        { time: 400, value: 1 },
      ],
    },
  ],
  controls: [{ id: "chart:solo", label: "Solo", event: "SOLO" }],
  summary: "One bar.",
};

describe("figure(): ids", () => {
  it("infers stable ids from the helper kind and primary text, de-duplicated in creation order", () => {
    const scene = figure("ids", { title: "Ids" }, (f) => {
      f.heading("Where the time goes");
      f.heading("Where the time goes");
      f.heading("Where the time goes", { id: "custom" });
      f.card({ title: "Plan", body: "Bound the region." });
      f.pill("Beta");
      f.callout("Résumé — naïve façade!");
      f.stack([f.rect({ width: 10, height: 10 }), f.rect({ width: 10, height: 10 })]);
      f.stack([f.circle()], { label: "Dots" });
      f.keyValue("Cells", "512");
      f.icon("cube");
      f.text("A very long heading that certainly exceeds the thirty-two character slug limit");
    });
    const ids = nodeIds(scene);
    expect(ids).toContain("heading-where-the-time-goes");
    expect(ids).toContain("heading-where-the-time-goes-2");
    expect(ids).toContain("custom");
    expect(ids).toContain("card-plan");
    expect(ids).toContain("card-plan-title");
    expect(ids).toContain("card-plan-body");
    expect(ids).toContain("pill-beta");
    expect(ids).toContain("callout-resume-naive-facade");
    expect(ids).toContain("rect");
    expect(ids).toContain("rect-2");
    expect(ids).toContain("stack");
    expect(ids).toContain("stack-dots");
    expect(ids).toContain("key-value-cells");
    expect(ids).toContain("key-value-cells-key");
    expect(ids).toContain("icon-cube");
    expect(ids).toContain("text-a-very-long-heading-that-certain");
    expect(scene.root.id).toBe("root");
    expect(validateScene(scene).ok).toBe(true);
  });

  it("is deterministic across builds", () => {
    const build = () =>
      figure("twice", { title: "Twice" }, (f) => {
        const a = f.card({ title: "A" });
        const b = f.card({ title: "B" });
        const edge = f.connect(a, b);
        f.flow([a, b]);
        f.sequence([f.reveal(a), f.draw(edge), f.reveal(b)]);
      });
    expect(JSON.stringify(build())).toBe(JSON.stringify(build()));
  });

  it("rejects duplicate explicit ids with the origin of both", () => {
    expect(() =>
      figure("dup", { title: "Dup" }, (f) => {
        f.callout("Dense boxes need one bounds growth.", { id: "note" });
        f.text("Again", { id: "note" });
      }),
    ).toThrow(/figure "dup": duplicate id "note" \(first created by f\.callout\("Dense boxes/);
  });

  it("rejects invalid ids early", () => {
    expect(() =>
      figure("bad", { title: "Bad" }, (f) => {
        f.heading("A", { id: "has space" });
      }),
    ).toThrow(/figure "bad": id "has space"/);
    expect(() => figure("no good", { title: "Bad" }, () => undefined)).toThrow(/figure id/);
  });

  it("refuses to place the same node object twice", () => {
    expect(() =>
      figure("twice", { title: "Twice" }, (f) => {
        const a = f.heading("A");
        f.stack([a]);
        f.row([a]);
      }),
    ).toThrow(/"heading-a" is already inside another group/);
  });
});

describe("figure(): positioned text", () => {
  it("places an existing builder node without cloning its identity", () => {
    const scene = figure("placed-node", { title: "Placed node" }, (f) => {
      const gate = f.gate("xor", { id: "gate" });
      f.root(
        f.coordinates(
          [
            f.place(gate, {
              wide: { x: 0.25, y: 0.5, anchor: "center" },
              narrow: { x: 0.5, y: 0.25, anchor: "center" },
            }),
          ],
          { height: 200 },
        ),
      );
    });
    expect(scene.root.children[0]).toBeDefined();
    expect(scene.root.children[0]?.position).toEqual({
      wide: { x: 0.25, y: 0.5, anchor: "center" },
      narrow: { x: 0.5, y: 0.25, anchor: "center" },
    });
  });

  it("keeps responsive placement and base-node controls on text helpers", () => {
    const scene = figure("positioned-text", { title: "Positioned text" }, (f) => {
      const value = f.labelAt(
        "3,610",
        {
          wide: { x: 0.42, y: 0.2, anchor: "bottom" },
          compact: { x: 0.5, y: 0.28, anchor: "bottom" },
          narrow: { x: 0.5, y: 0.34, anchor: "bottom" },
        },
        {
          id: "value",
          width: { wide: "18%", compact: "28%", narrow: "42%" },
          tone: "accent",
          opacity: 0.9,
          z: 2,
        },
      );
      const note = f.textAt("never", { x: 0.1, y: 0.8, anchor: "bottom" }, { textStyle: "code" });
      f.root(f.coordinates([value, note], { height: 240 }));
    });

    const value = scene.root.children.find((node) => node.id === "value");
    expect(value).toMatchObject({
      type: "text",
      textStyle: "bodyStrong",
      color: "accent",
      opacity: 0.9,
      z: 2,
      width: { wide: "18%", compact: "28%", narrow: "42%" },
    });
    expect(value?.position).toMatchObject({
      wide: { x: 0.42, y: 0.2 },
      compact: { x: 0.5, y: 0.28 },
      narrow: { x: 0.5, y: 0.34 },
    });

    const wide = resolveScene(scene, { width: 1200 });
    const narrow = resolveScene(scene, { width: 390 });
    expect(wide.nodes.find((node) => node.id === "value")?.x).not.toBe(
      narrow.nodes.find((node) => node.id === "value")?.x,
    );
  });

  it("derives a smooth spline from placed node positions", () => {
    const scene = figure("spline", { title: "Spline" }, (f) => {
      const source = f.place(f.circle({ id: "source" }), {
        x: 0.1,
        y: 0.7,
        anchor: "center",
      });
      const middle = f.place(f.rect({ id: "middle" }), {
        x: 0.5,
        y: 0.3,
        anchor: "center",
      });
      const output = f.place(f.circle({ id: "output" }), {
        x: 0.9,
        y: 0.6,
        anchor: "center",
      });
      const spline = f.spline([source, middle, output], { id: "signal" });
      f.root(f.coordinates([spline, source, middle, output]));
    });

    expect(scene.root.children.find((node) => node.id === "signal")).toMatchObject({
      type: "polyline",
      curve: "monotone",
      points: [
        [0.1, 0.7],
        [0.5, 0.3],
        [0.9, 0.6],
      ],
    });
  });

  it("explains when a spline anchor has not been placed", () => {
    expect(() =>
      figure("unplaced-spline", { title: "Unplaced spline" }, (f) => {
        f.spline([f.circle({ id: "loose" })]);
      }),
    ).toThrow(/anchor "loose" needs a direct position/);
  });
});

describe("figure(): root inference", () => {
  it("defaults to a stack of top-level nodes in creation order", () => {
    const scene = figure("root", { title: "Root" }, (f) => {
      f.title("First");
      const a = f.card({ title: "A" });
      const b = f.card({ title: "B" });
      f.flow([a, b]);
      f.caption("Last");
    });
    expect(scene.root.layout).toBe("stack");
    expect(scene.root.children.map((node) => node.id)).toEqual([
      "title-first",
      "flow",
      "caption-last",
    ]);
  });

  it("uses an explicit root and reports nodes left outside it", () => {
    const scene = figure("root", { title: "Root" }, (f) => {
      const a = f.heading("A");
      f.root(f.stack([a], { id: "explicit" }));
    });
    expect(scene.root.id).toBe("explicit");
    expect(() =>
      figure("orphan", { title: "Orphan" }, (f) => {
        const a = f.heading("A");
        f.heading("B");
        f.root(f.stack([a]));
      }),
    ).toThrow(/"heading-b" \(f\.heading\("B"\)\) is not inside the root/);
  });

  it("requires at least one node", () => {
    expect(() => figure("empty", { title: "Empty" }, () => undefined)).toThrow(/no nodes/);
  });
});

describe("figure(): terminal and file-tree authoring", () => {
  it("authors highlighted code blocks with stable inferred ids", () => {
    const scene = figure("code", { title: "Code" }, (f) => {
      f.codeBlock("export const ready = true;", {
        language: "typescript",
        title: "state.ts",
        highlightLines: [1],
      });
    });
    expect(nodeIds(scene)).toEqual(
      expect.arrayContaining([
        "code-block-state-ts",
        "code-block-state-ts-line-1-token-1",
        "code-block-state-ts-line-1-number",
      ]),
    );
    expect(validateScene(scene).ok).toBe(true);
  });

  it("authors a split terminal window through the compact builder", () => {
    const scene = figure("workspace", { title: "Workspace" }, (f) => {
      f.terminalWindow(
        [
          { title: "server", lines: [{ kind: "command", text: "bun dev" }] },
          { title: "tests", lines: [{ kind: "success", text: "ready" }] },
        ],
        { title: "local", statusBar: { left: "0:server*", right: "main" } },
      );
    });
    expect(nodeIds(scene)).toContain("terminal-window-local");
    expect(nodeIds(scene)).toEqual(
      expect.arrayContaining([
        "terminal-window-local-pane-1",
        "terminal-window-local-pane-2",
        "terminal-window-local-status-bar",
      ]),
    );
  });

  it("types every marked terminal line with one seekable motion step", () => {
    const scene = figure("terminal", { title: "Terminal" }, (f) => {
      const terminal = f.terminal([
        { kind: "command", text: "npm run build" },
        { kind: "output", text: "bundling" },
        { kind: "command", text: "npm test", prompt: ">" },
      ]);
      f.fileTree([{ name: "src", children: [{ name: "index.ts" }] }], { root: "demo" });
      f.sequence([f.typewrite(terminal, { duration: 400, stagger: 100 })]);
    });
    const firstPrompt = track(scene, "terminal-line-1-prompt:progress");
    const firstCommand = track(scene, "terminal-line-1-text:progress");
    const secondPrompt = track(scene, "terminal-line-3-prompt:progress");
    const secondCommand = track(scene, "terminal-line-3-text:progress");
    expect(firstPrompt.keyframes.at(-1)?.time).toBeLessThan(
      firstCommand.keyframes.at(-2)?.time ?? 0,
    );
    expect(firstCommand.keyframes.at(-1)?.time).toBeLessThan(
      secondPrompt.keyframes.at(-2)?.time ?? 0,
    );
    expect(secondPrompt.keyframes.at(-1)?.time).toBeLessThan(
      secondCommand.keyframes.at(-2)?.time ?? 0,
    );
    expect(nodeIds(scene)).toEqual(
      expect.arrayContaining(["terminal", "file-tree-demo", "file-tree-demo-entry-1-guide"]),
    );
  });

  it("can retain staggered overlapping typewrite tracks explicitly", () => {
    const scene = figure("terminal-overlap", { title: "Terminal overlap" }, (f) => {
      const terminal = f.terminal([
        { kind: "command", text: "npm run build" },
        { kind: "command", text: "npm test" },
      ]);
      f.sequence([f.typewrite(terminal, { duration: 400, stagger: 100, mode: "overlap" })]);
    });
    expect(track(scene, "terminal-line-1-prompt:progress").keyframes.at(-1)?.time).toBe(400);
    expect(track(scene, "terminal-line-1-text:progress").keyframes.at(-1)?.time).toBe(500);
  });

  it("writes syntax-highlighted token nodes in source order instead of colour batches", () => {
    const scene = figure("typed-code", { title: "Typed code" }, (f) => {
      const source = f.codeBlock("const answer = 42;", {
        language: "typescript",
        typing: true,
      });
      f.sequence([f.typewrite(source, { duration: 300, lineDelay: 0 })]);
    });
    const keyword = track(scene, "code-block-typescript-line-1-token-1:progress");
    const whitespace = track(scene, "code-block-typescript-line-1-token-2:progress");
    const identifier = track(scene, "code-block-typescript-line-1-token-3:progress");
    expect(keyword.keyframes.at(-1)?.time).toBeLessThanOrEqual(
      whitespace.keyframes.at(-2)?.time ?? 0,
    );
    expect(whitespace.keyframes.at(-1)?.time).toBeLessThanOrEqual(
      identifier.keyframes.at(-2)?.time ?? 0,
    );
  });

  it("rejects typewriting a node without character-reveal text", () => {
    expect(() =>
      figure("not-typed", { title: "Not typed" }, (f) => {
        f.typewrite(f.caption("Static"));
      }),
    ).toThrow(/no character-reveal text/);
  });
});

describe("figure(): raw()", () => {
  it("registers hand-written nodes and nests embedded helper nodes", () => {
    const scene = figure("raw", { title: "Raw" }, (f) => {
      const inner = f.badge("Inner");
      f.raw({
        id: "custom",
        type: "group",
        layout: "overlay",
        children: [{ id: "custom-rect", type: "rect", width: 20, height: 20 }, inner],
      });
    });
    expect(scene.root.children.map((node) => node.id)).toEqual(["custom"]);
    expect(nodeIds(scene)).toContain("badge-inner");
    expect(() =>
      figure("raw", { title: "Raw" }, (f) => {
        f.heading("A", { id: "x" });
        f.raw({ id: "x", type: "rect" });
      }),
    ).toThrow(/duplicate id "x"/);
  });
});

describe("figure(): connect()", () => {
  it("creates edges between nodes or ids with inferred, de-duplicated ids", () => {
    const scene = figure("edges", { title: "Edges" }, (f) => {
      const a = f.card({ title: "A" });
      const b = f.card({ title: "B" });
      const first = f.connect(a, b, { head: "arrow", label: "first" });
      const second = f.connect("card-a", { node: b, side: "top", gap: 4 }, { route: "arc" });
      const third = f.connect(b, a, { id: "back", tail: "dot" });
      f.row([a, b]);
      expect(first.id).toBe("card-a-card-b");
      expect(second.id).toBe("card-a-card-b-2");
      expect(second.to).toEqual({ node: "card-b", side: "top", gap: 4 });
      expect(third.id).toBe("back");
    });
    expect(scene.edges?.map((edge) => edge.id)).toEqual([
      "card-a-card-b",
      "card-a-card-b-2",
      "back",
    ]);
    expect(validateScene(scene).ok).toBe(true);
  });

  it("rejects unknown endpoints and foreign node objects", () => {
    expect(() =>
      figure("edges", { title: "Edges" }, (f) => {
        const a = f.card({ title: "A" });
        f.connect(a, "chart:bar:v1:9");
      }),
    ).toThrow(/f\.connect: unknown target "chart:bar:v1:9"/);
    expect(() =>
      figure("edges", { title: "Edges" }, (f) => {
        const a = f.card({ title: "A" });
        f.connect(a, { id: "ghost", type: "rect" });
      }),
    ).toThrow(/node "ghost" was not created by this figure/);
  });
});

describe("figure(): graph() and wire()", () => {
  it("authors proper gates and junctions with inferred stable ids", () => {
    const scene = figure("logic", { title: "Logic" }, (f) => {
      const xor = f.gate("xor", { tone: "info" });
      const branch = f.junction({ label: "A fan-out", tone: "success" });
      f.root(f.row([branch, xor], { gap: 24 }));
      f.wire(branch, { node: xor, side: "left", offset: 0.35 });
    });
    expect(scene.root.children).toMatchObject([
      { id: "junction-a-fan-out", type: "group" },
      { id: "gate-xor", type: "group", metadata: { gateKind: "xor" } },
    ]);
    expect(scene.edges?.[0]?.to).toEqual({ node: "gate-xor", side: "left", offset: 0.35 });
    expect(validateScene(scene).ok).toBe(true);
  });

  it("builds ranked circuit layouts with semantic orthogonal wire presets", () => {
    const scene = figure("circuit", { title: "Circuit" }, (f) => {
      const a = f.card({ title: "A", compact: true });
      const b = f.card({ title: "B", compact: true });
      const xor = f.card({ title: "XOR", compact: true });
      const output = f.card({ title: "SUM", compact: true });
      f.root(f.graph([[a, b], xor, output], { style: "circuit" }));
      f.wire(a, xor);
      f.wire(b, xor, { kind: "control" });
      f.wire(xor, output, { kind: "bus" });
    });

    expect(scene.root).toMatchObject({
      layout: "stack",
      gap: 56,
      metadata: { graphStyle: "circuit" },
    });
    expect(scene.root.children[0]).toMatchObject({
      layout: "row",
      justify: "center",
      metadata: { graphRole: "rank", graphStyle: "circuit" },
    });
    expect(scene.edges).toMatchObject([
      { route: "orthogonal", head: "arrow", tone: "accent", cornerRadius: 6 },
      {
        route: "orthogonal",
        head: "arrow",
        stroke: "dashed",
        tone: "muted",
      },
      { route: "orthogonal", head: "none", width: 4, tone: "info", cornerRadius: 4 },
    ]);

    for (const width of WIDTHS) {
      const resolved = resolveScene(scene, { width, theme });
      expect(resolved.diagnostics?.filter((entry) => entry.severity === "error") ?? []).toEqual([]);
      expect(resolved.edges.every((edge) => edge.route === "orthogonal")).toBe(true);
    }
  });

  it("infers circuit ranks from nets and keeps peer orientation responsive", () => {
    const scene = figure("auto-circuit", { title: "Auto circuit" }, (f) => {
      const a = f.tile({ icon: "circle", title: "A", variant: "compact" });
      const b = f.tile({ icon: "circle", title: "B", variant: "compact" });
      const xor = f.gate("xor", { text: "XOR" });
      const sum = f.tile({ icon: "arrow-right", title: "SUM", variant: "compact" });
      const carry = f.tile({ icon: "arrow-right", title: "CARRY", variant: "compact" });
      const circuit = f.circuit(
        [a, b, xor, sum, carry],
        [
          { from: a, to: xor, kind: "flow", head: "none" },
          { from: b, to: xor, kind: "flow", head: "none" },
          { from: xor, to: sum, kind: "data" },
          { from: a, to: carry, kind: "data" },
        ],
        { padding: 12 },
      );
      expect(circuit.ranks.map((rank) => rank.map((node) => node.id))).toEqual([
        ["tile-a", "tile-b"],
        ["gate-xor"],
        ["tile-sum", "tile-carry"],
      ]);
      const entranceTracks = circuit.entrance.tracks(0);
      const enteringGate = circuit.edges.find((edge) =>
        typeof edge.to === "string" ? edge.to === xor.id : edge.to.node === xor.id,
      );
      const gateReveal = entranceTracks.find(
        (track) => track.target === xor.id && track.property === "opacity",
      );
      const wireDraw = entranceTracks.find(
        (track) => track.target === enteringGate?.id && track.property === "edgeReveal",
      );
      expect(gateReveal?.keyframes[1]?.time).toBe(wireDraw?.keyframes[1]?.time);
      expect(circuit.entrance.duration).toBeGreaterThan(0);
      f.root(circuit.root);
    });

    expect(scene.root.layout).toEqual({ wide: "row", compact: "row", narrow: "stack" });
    expect(scene.root.children[0]).toMatchObject({
      layout: { wide: "stack", compact: "stack", narrow: "row" },
      justify: "center",
    });
    expect(findNode(scene, "gate-xor")).toMatchObject({
      width: { wide: 108, compact: 96, narrow: 60 },
      height: { wide: 72, compact: 64, narrow: 90 },
      metadata: { gateOrientation: "responsive", gateAutoOrient: true },
    });
    expect(findNode(scene, "gate-xor-graphic")).toMatchObject({
      width: { wide: 108, compact: 96, narrow: 90 },
      height: { wide: 72, compact: 64, narrow: 60 },
      rotation: { wide: 0, compact: 0, narrow: 90 },
    });
    expect(scene.edges).toMatchObject([
      {
        to: { node: "gate-xor", port: "in-0" },
        stroke: "solid",
        packets: { count: 1, speed: 96 },
        head: "none",
        avoid: "nodes",
        casing: { tone: "canvas", width: 4.75, opacity: 0.94 },
      },
      {
        to: { node: "gate-xor", port: "in-1" },
        stroke: "solid",
        packets: { count: 1, speed: 96 },
        head: "none",
        avoid: "nodes",
        casing: { tone: "canvas", width: 4.75, opacity: 0.94 },
      },
      {
        from: { node: "gate-xor", port: "out" },
        route: "orthogonal",
        width: 2.5,
        head: "none",
        avoid: "nodes",
        casing: { tone: "canvas", width: 4.75, opacity: 0.94 },
      },
      {
        route: "orthogonal",
        width: 2.5,
        head: "none",
        avoid: "nodes",
        casing: { tone: "canvas", width: 4.75, opacity: 0.94 },
      },
    ]);
    expect(validateScene(scene).ok).toBe(true);

    // Responsive layout may rotate and resize a gate, but incoming ink must overlap its visible
    // pin to the body while the output begins at the outer endpoint.
    const resolved = resolveScene(scene, { width: 390, theme });
    const authoredEdges = scene.edges ?? [];
    const gate = resolved.nodes.find((node) => node.id === "gate-xor");
    const firstInput = resolved.edges.find((edge) => edge.id === authoredEdges[0]?.id);
    const secondInput = resolved.edges.find((edge) => edge.id === authoredEdges[1]?.id);
    const output = resolved.edges.find((edge) => edge.id === authoredEdges[2]?.id);
    expect(gate).toBeDefined();
    expect(firstInput).toBeDefined();
    expect(secondInput).toBeDefined();
    expect(output).toBeDefined();
    if (
      gate !== undefined &&
      firstInput !== undefined &&
      secondInput !== undefined &&
      output !== undefined
    ) {
      expect(firstInput.end.y).toBeCloseTo(gate.y + 12, 2);
      expect(firstInput.end.x).toBeCloseTo(gate.x + gate.width * (53 / 80), 2);
      expect(secondInput.end.y).toBeCloseTo(gate.y + 12, 2);
      expect(secondInput.end.x).toBeCloseTo(gate.x + gate.width * (27 / 80), 2);
      expect(output.start.x).toBeCloseTo(gate.x + gate.width / 2, 2);
      expect(output.start.y).toBeCloseTo(gate.y + gate.height, 2);
    }
  });

  it("offers distinct semantic wire grammars without hiding overrides", () => {
    const scene = figure("wire-kinds", { title: "Wire kinds" }, (f) => {
      const a = f.tile({ icon: "circle", label: "A" });
      const b = f.tile({ icon: "circle", label: "B" });
      f.root(f.row([a, b], { gap: 80 }));
      f.wire(a, b, { kind: "clock" });
      f.wire(a, b, { kind: "feedback" });
      f.wire(a, b, { kind: "optional" });
      f.wire(a, b, { kind: "flow", tone: "success" });
      f.wire(a, b, { kind: "spline" });
    });
    expect(scene.edges).toMatchObject([
      { route: "orthogonal", stroke: "dotted", tone: "warning" },
      {
        route: "spline",
        spline: "fluid",
        stroke: "dashed",
        tone: "warning",
      },
      { route: "orthogonal", stroke: "dotted", head: "none", tone: "muted" },
      {
        route: "orthogonal",
        stroke: "solid",
        tone: "success",
        packets: { count: 1, speed: 96, trail: true },
      },
      {
        route: "spline",
        spline: "fluid",
        stroke: "solid",
        packets: { count: 1, speed: 96, trail: true },
      },
    ]);
  });

  it("auto-fits circuit rank columns from allocated width", () => {
    const scene = figure("auto-grid", { title: "Auto grid" }, (f) => {
      const sources = ["A", "B", "C"].map((title) =>
        f.tile({ title, variant: "compact", icon: "circle" }),
      );
      const sink = f.gate("and");
      const circuit = f.circuit(
        [...sources, sink],
        sources.map((source) => ({ from: source, to: sink })),
        { direction: "vertical", width: "fill" },
      );
      f.root(circuit.root);
    });
    expect(scene.root.children[0]).toMatchObject({ layout: "grid", columns: "auto" });
    const wideEnough = resolveScene(scene, { width: 520, theme });
    const compact = resolveScene(scene, { width: 300, theme });
    const positions = (resolved: typeof wideEnough) =>
      ["tile-a", "tile-b", "tile-c"].map((id) => {
        const node = resolved.nodes.find((candidate) => candidate.id === id);
        return node === undefined ? undefined : [node.x, node.y];
      });
    expect(new Set(positions(wideEnough).map((position) => position?.[1])).size).toBe(1);
    expect(new Set(positions(compact).map((position) => position?.[1])).size).toBeGreaterThan(1);
  });

  it("shares a source port for multi-target nets without inventing a layout node", () => {
    const scene = figure("direct-fanout", { title: "Direct fan-out" }, (f) => {
      const source = f.tile({ icon: "circle", title: "A", variant: "compact" });
      const xor = f.gate("xor", { text: "XOR" });
      const and = f.gate("and", { text: "AND" });
      const circuit = f.circuit(
        [source, xor, and],
        [{ from: source, to: [xor, and], kind: "flow", head: "none" }],
      );
      expect(circuit.ranks.flat().map((node) => node.id)).toEqual([
        "tile-a",
        "gate-xor",
        "gate-and",
      ]);
      expect(circuit.edges).toHaveLength(2);
      f.root(circuit.root);
    });
    expect(scene.edges?.map((edge) => endpointNode(edge.from))).toEqual(["tile-a", "tile-a"]);
    expect(validateScene(scene).ok).toBe(true);
  });

  it("adds a laid-out fan-out point only when a junction is explicit", () => {
    const scene = figure("fanout", { title: "Fan-out" }, (f) => {
      const source = f.tile({ icon: "circle", title: "A", variant: "compact" });
      const xor = f.gate("xor", { text: "XOR" });
      const and = f.gate("and", { text: "AND" });
      const circuit = f.circuit(
        [source, xor, and],
        [
          {
            from: source,
            to: [xor, and],
            kind: "flow",
            head: "none",
            junction: { id: "a-fanout", tone: "info" },
          },
        ],
      );
      expect(circuit.ranks.flat().map((node) => node.id)).toEqual([
        "tile-a",
        "a-fanout",
        "gate-xor",
        "gate-and",
      ]);
      expect(circuit.edges).toHaveLength(3);
      f.root(circuit.root);
    });
    expect(scene.edges?.map((edge) => [edge.from, edge.to])).toEqual([
      [
        { node: "tile-a", side: { wide: "right", compact: "right", narrow: "bottom" } },
        { node: "a-fanout", side: "center" },
      ],
      [
        { node: "a-fanout", side: "center" },
        { node: "gate-xor", port: "in-0" },
      ],
      [
        { node: "a-fanout", side: "center" },
        { node: "gate-and", port: "in-0" },
      ],
    ]);
    expect(validateScene(scene).ok).toBe(true);
  });

  it("compiles declarative Boolean logic into a responsive circuit and machine", () => {
    const scene = figure("logic-full-adder", { title: "Logic full adder" }, (f) => {
      const adder = f.logicCircuit({
        inputs: {
          a: { label: "A", tone: "info" },
          b: { label: "B", tone: "accent" },
          cin: { label: "CIN", tone: "success" },
        },
        gates: {
          carry: { kind: "or", inputs: ["and1", "and2"], tone: "success" },
          xor1: { kind: "xor", inputs: ["a", "b"], tone: "info" },
          and1: { kind: "and", inputs: ["a", "b"], tone: "accent" },
          xor2: { kind: "xor", inputs: ["xor1", "cin"], tone: "warning" },
          and2: { kind: "and", inputs: ["xor1", "cin"], tone: "success" },
        },
        outputs: {
          sum: { from: "xor2", label: "SUM", tone: "warning" },
          cout: { from: "carry", label: "COUT", tone: "success" },
        },
      });
      f.root(adder.root);
      f.sequence([adder.entrance]);
      f.machine(adder.machine);
    });

    expect(scene.root.children.map((node) => node.id)).not.toContain("junction");
    expect(scene.edges).toHaveLength(12);
    expect(scene.machine?.variables).toEqual({ a: false, b: false, cin: false });
    expect(scene.machine?.signals).toHaveProperty("xor1");
    expect(scene.machine?.signals).toHaveProperty("sumValue");
    expect(findNode(scene, "input-a")).toMatchObject({
      interactive: true,
      onActivate: "TOGGLE_A",
      bind: { highlight: "a" },
    });
    expect(findNode(scene, "gate-xor1-signal")).toMatchObject({ bind: { opacity: "xor1" } });
    expect(findNode(scene, "output-sum")).toMatchObject({
      bind: { highlight: "xor2" },
    });
    expect(validateScene(scene).ok).toBe(true);
  });

  it("supports prose flow and centred tree styles without adding a new IR node kind", () => {
    const flowScene = figure("flow-graph", { title: "Flow graph" }, (f) => {
      const a = f.card({ title: "A" });
      const b = f.card({ title: "B" });
      f.root(f.graph([a, b], { style: "flow" }));
    });
    expect(flowScene.root.layout).toEqual({ wide: "row", compact: "stack" });

    const treeScene = figure("tree-graph", { title: "Tree graph" }, (f) => {
      const root = f.card({ title: "Root" });
      const left = f.card({ title: "Left" });
      const right = f.card({ title: "Right" });
      f.root(f.graph([root, [left, right]], { style: "tree" }));
    });
    expect(treeScene.root.layout).toBe("stack");
    expect(treeScene.root.children[1]).toMatchObject({ layout: "row", justify: "center" });
    expect(validateScene(treeScene).ok).toBe(true);
  });

  it("lets a preset be reshaped with responsive direction and per-rank layout", () => {
    const scene = figure("custom-graph", { title: "Custom graph" }, (f) => {
      const source = f.card({ title: "Source" });
      const left = f.card({ title: "Left" });
      const right = f.card({ title: "Right" });
      const sink = f.card({ title: "Sink" });
      f.root(
        f.graph(
          [
            source,
            {
              id: "branches",
              nodes: [left, right],
              layout: { wide: "row", compact: "grid" },
              width: "hug",
              columns: { compact: 2, narrow: 1 },
              gap: 8,
            },
            sink,
          ],
          {
            style: "circuit",
            direction: { wide: "horizontal", compact: "vertical" },
            layerGap: { wide: 64, compact: 44 },
          },
        ),
      );
    });

    expect(scene.root.layout).toEqual({ wide: "row", compact: "stack" });
    expect(scene.root.gap).toEqual({ wide: 64, compact: 44 });
    expect(scene.root.children[1]).toMatchObject({
      id: "branches",
      layout: { wide: "row", compact: "grid" },
      columns: { compact: 2, narrow: 1 },
      gap: 8,
      width: "hug",
    });
  });
});

describe("figure(): motion", () => {
  it("authors centre-origin rotation without dropping out of the figure DSL", () => {
    const scene = figure("rotation", { title: "Rotation" }, (f) => {
      const needle = f.rect({ id: "needle", width: 80, height: 4 });
      f.root(f.coordinates([needle], { height: 80 }));
      f.at(100, f.rotate(needle, { from: -20, to: 160, duration: 400, easing: "linear" }));
    });

    expect(track(scene, "needle:rotation:100").keyframes).toEqual([
      { time: 0, value: -20 },
      { time: 100, value: -20 },
      { time: 500, value: 160, easing: "linear" },
    ]);
  });

  it("sequences steps with the documented timing math", () => {
    const scene = figure("seq", { title: "Seq", hold: 400 }, (f) => {
      const a = f.rect({ width: 40, height: 20 });
      const b = f.rect({ width: 40, height: 20 });
      const c = f.rect({ width: 40, height: 20 });
      const edge = f.connect(a, b, { head: "arrow" });
      f.row([a, b, c], { gap: 20 });
      f.sequence([f.reveal(a), [f.draw(edge), f.reveal(b, { duration: 300 })], f.pulse(c)], {
        gap: 100,
      });
      f.at(2000, f.reveal(a));
    });
    expect(track(scene, "rect:opacity").keyframes).toEqual([
      { time: 0, value: 0 },
      { time: 500, value: 1, easing: "easeOut" },
    ]);
    // Second step starts at 500 + 100.
    expect(track(scene, "rect-rect-2:edgeReveal").keyframes.map((frame) => frame.time)).toEqual([
      0, 600, 1050,
    ]);
    expect(track(scene, "rect-2:opacity").keyframes.map((frame) => frame.time)).toEqual([
      0, 600, 900,
    ]);
    // Third step waits for the longest parallel member (draw, 450ms) plus the gap.
    expect(track(scene, "rect-3:highlight:1150").keyframes.map((frame) => frame.time)).toEqual([
      0, 1150, 1400, 1650,
    ]);
    // Absolute scheduling of a duplicate track gets a deterministic suffix.
    expect(track(scene, "rect:opacity#2").keyframes.map((frame) => frame.time)).toEqual([
      0, 2000, 2500,
    ]);
    expect(scene.timeline?.duration).toBe(2500 + 400);
    const resolved = resolveScene(scene, { width: 800, theme });
    expect(
      seekTimeline(resolved, 2500).nodes.find((node) => node.id === "rect")?.state.opacity,
    ).toBe(1);
  });

  it("honours sequence start, arrays with stagger, and edge-capable presets", () => {
    const scene = figure("motion", { title: "Motion" }, (f) => {
      const cards = [f.card({ title: "A" }), f.card({ title: "B" }), f.card({ title: "C" })];
      const edge = f.connect(cards[0] ?? "card-a", cards[1] ?? "card-b");
      const bar = f.rect({ width: 30, height: 60, revealAnchor: "bottom" });
      const line = f.polyline(
        [
          [0, 1],
          [1, 0],
        ],
        { height: 40 },
      );
      f.flow([...cards, bar, line]);
      f.sequence(
        [
          f.reveal(cards, { stagger: 80, duration: 200 }),
          f.rise(bar),
          f.wipe(line, { duration: 250 }),
          [f.flow(edge, { duration: 1000 }), f.highlight(edge), f.progress(bar, { to: 0.5 })],
          f.pulse(edge),
        ],
        { start: 100, gap: 0 },
      );
    });
    expect(track(scene, "card-a:opacity").keyframes.map((frame) => frame.time)).toEqual([
      0, 100, 300,
    ]);
    expect(track(scene, "card-b:opacity").keyframes.map((frame) => frame.time)).toEqual([
      0, 180, 380,
    ]);
    expect(track(scene, "card-c:opacity").keyframes.map((frame) => frame.time)).toEqual([
      0, 260, 460,
    ]);
    // Staggered arrays span duration + stagger × (n − 1) = 200 + 160 → the next step starts at 460.
    const rise = track(scene, "rect:revealY");
    expect(rise.property).toBe("revealY");
    expect(rise.keyframes.map((frame) => frame.time)).toEqual([0, 460, 960]);
    expect(track(scene, "polyline:revealX").keyframes.map((frame) => frame.time)).toEqual([
      0, 960, 1210,
    ]);
    const flow = track(scene, "card-a-card-b:flow");
    expect(flow.keyframes.map((frame) => frame.time)).toEqual([0, 1210, 1211, 2210, 2410]);
    expect(track(scene, "card-a-card-b:highlight").keyframes.map((frame) => frame.time)).toEqual([
      0, 1210, 1460, 1710,
    ]);
    expect(track(scene, "rect:progress").keyframes.at(-1)).toEqual({
      time: 1810,
      value: 0.5,
      easing: "easeInOut",
    });
    // The parallel group lasts as long as its longest member (flow: 1000 + 200 fade).
    expect(track(scene, "card-a-card-b:highlight:2410").keyframes[1]?.time).toBe(2410);
    expect(scene.timeline?.duration).toBe(2910);
    for (const width of WIDTHS)
      expect(() => seekTimeline(resolveScene(scene, { width, theme }), 1500)).not.toThrow();
  });

  it("applies custom easing to motion presets as serializable data", () => {
    const entrance = cubicBezier(0.16, 1, 0.3, 1);
    const settle = spring({ frequency: 9.5, damping: 7.5 });
    const scene = figure("curves", { title: "Curves" }, (f) => {
      const card = f.card({ title: "Sample" });
      f.root(card);
      f.sequence([
        f.reveal(card, { offset: 8, easing: entrance }),
        f.reveal(card, { scale: 0.96, easing: settle }),
      ]);
    });
    expect(track(scene, "card-sample:opacity").keyframes.at(-1)?.easing).toEqual(entrance);
    expect(track(scene, "card-sample:scale").keyframes.at(-1)?.easing).toEqual(settle);
  });

  it("keeps keyframes strictly increasing when steps start at zero", () => {
    const scene = figure("zero", { title: "Zero" }, (f) => {
      const a = f.rect({ width: 20, height: 20 });
      const b = f.rect({ width: 20, height: 20 });
      const edge = f.connect(a, b);
      f.row([a, b]);
      f.at(0, f.draw(edge), f.flow(edge), f.pulse(a), f.highlight(b));
    });
    for (const entry of scene.timeline?.tracks ?? []) {
      let previous = -1;
      for (const frame of entry.keyframes) {
        expect(frame.time).toBeGreaterThan(previous);
        previous = frame.time;
      }
    }
    expect(track(scene, "rect-rect-2:opacity").keyframes).toEqual([{ time: 0, value: 1 }]);
    expect(() => seekTimeline(resolveScene(scene, { width: 600, theme }), 0)).not.toThrow();
  });

  it("rejects unknown or mismatched targets with the helper name", () => {
    const build = (body: (f: FigureBuilder) => void) => () =>
      figure("targets", { title: "Targets" }, body);
    expect(build((f) => void f.reveal("nope"))).toThrow(/f\.reveal: unknown target "nope"/);
    expect(
      build((f) => {
        const a = f.rect();
        const b = f.rect();
        const edge = f.connect(a, b);
        f.row([a, b]);
        f.rise(edge.id);
      }),
    ).toThrow(/f\.rise: "rect-rect-2" is an edge, not a node/);
    expect(
      build((f) => {
        const a = f.rect();
        const b = f.rect();
        const edge = f.connect(a, b);
        f.row([a, b]);
        f.reveal(edge.id, { offset: 8 });
      }),
    ).toThrow(/f\.reveal: "rect-rect-2" is an edge, not a node/);
    expect(
      build((f) => {
        const a = f.rect();
        f.draw(a.id);
      }),
    ).toThrow(/f\.draw: "rect" is a node, not an edge/);
    expect(build((f) => f.at(-1, f.reveal(f.rect())))).toThrow(/f\.at: time must be/);
  });

  it("switches between the flow layout and the flow motion by argument", () => {
    const scene = figure("flow", { title: "Flow" }, (f) => {
      const a = f.rect({ width: 20, height: 20 });
      const b = f.rect({ width: 20, height: 20 });
      const edge = f.connect(a, b, { packets: { count: 2 } });
      const group = f.flow([a, b], { gap: 12 });
      expect(group.layout).toEqual({ wide: "row", compact: "stack" });
      const motion = f.flow(edge);
      expect(motion.kind).toBe("motion");
      f.at(300, motion);
    });
    expect(track(scene, "rect-rect-2:flow").keyframes.map((frame) => frame.time)).toEqual([
      0, 300, 301,
    ]);
  });
});

describe("figure(): add()", () => {
  it("keeps already-namespaced fragments, appends edges and controls, and plays their motion", () => {
    const scene = figure("frag", { title: "Fragments" }, (f) => {
      const chart = f.add(chartFragment);
      expect(chart.id).toBe("chart");
      const note = f.callout("A note");
      f.flow([chart, note]);
      f.sequence([f.reveal(chart), f.reveal(note)], { gap: 50 });
      f.machine({ initial: "all", states: { all: { on: { SOLO: "all" } } } });
    });
    expect(nodeIds(scene)).toEqual(expect.arrayContaining(["chart", "chart:bar", "chart:label"]));
    expect(scene.edges?.map((edge) => edge.id)).toEqual(["chart:link"]);
    expect(scene.controls?.map((control) => control.id)).toEqual(["chart:solo"]);
    expect(track(scene, "chart:bar:revealY").keyframes.map((frame) => frame.time)).toEqual([
      0, 400,
    ]);
    // The note starts after the fragment's own 400ms preset plus the gap.
    expect(track(scene, "callout-a-note:opacity").keyframes.map((frame) => frame.time)).toEqual([
      0, 450, 950,
    ]);
    expect(validateScene(scene).ok).toBe(true);
  });

  it("scopes ids under an explicit or de-duplicated inferred namespace and accepts { fragment }", () => {
    const scene = figure("frag", { title: "Fragments" }, (f) => {
      const first = f.add(chartFragment);
      const second = f.add({ fragment: chartFragment });
      const third = f.add(chartFragment, { id: "right", at: 1000 });
      expect(first.id).toBe("chart");
      expect(second.id).toBe("chart-2:chart");
      expect(third.id).toBe("right:chart");
      f.row([first, second, third]);
      f.machine({ initial: "all", states: { all: {} } });
    });
    const ids = nodeIds(scene);
    expect(ids).toEqual(expect.arrayContaining(["chart-2:chart:bar", "right:chart:label"]));
    expect(scene.edges?.map((edge) => edge.id)).toEqual([
      "chart:link",
      "chart-2:chart:link",
      "right:chart:link",
    ]);
    expect(scene.edges?.[2]?.from).toBe("right:chart:bar");
    expect(scene.controls?.map((control) => control.id)).toEqual([
      "chart:solo",
      "chart-2:chart:solo",
      "right:chart:solo",
    ]);
    expect(track(scene, "right:chart:bar:revealY").keyframes.map((frame) => frame.time)).toEqual([
      1000, 1400,
    ]);
    expect(scene.timeline?.duration).toBe(1400);
  });

  it("never silently invalidates stable compiler handles by re-scoping their ids", () => {
    const compiled = {
      fragment: chartFragment,
      handles: { bars: ["chart:bar"] as const },
    };
    expect(() =>
      figure("frag", { title: "Fragments" }, (f) => {
        const first = f.add(compiled);
        f.add(compiled);
        f.row([first]);
      }),
    ).toThrow(/exposes stable handles.*cannot be re-scoped.*set the id when compiling/s);
    expect(() =>
      figure("frag", { title: "Fragments" }, (f) => {
        f.add(compiled, { id: "renamed" });
      }),
    ).toThrow(/exposes stable handles.*cannot be re-scoped/s);
  });

  it("wraps multi-root fragments in a stack and rejects fragments with errors", () => {
    const scene = figure("multi", { title: "Multi" }, (f) => {
      const pair = f.add(
        {
          nodes: [
            { id: "a", type: "rect", width: 10, height: 10 },
            { id: "b", type: "rect", width: 10, height: 10 },
          ],
        },
        { id: "pair" },
      );
      expect(pair.type).toBe("group");
      expect(pair.id).toBe("pair");
      if (pair.type === "group")
        expect(pair.children.map((node) => node.id)).toEqual(["pair:a", "pair:b"]);
    });
    expect(scene.root.children.map((node) => node.id)).toEqual(["pair"]);
    expect(() =>
      figure("broken", { title: "Broken" }, (f) => {
        f.add({
          nodes: [{ id: "a", type: "rect" }],
          diagnostics: [{ severity: "error", code: "empty", message: "no data" }],
        });
      }),
    ).toThrow(/f\.add: the fragment reports errors:\n- no data/);
  });
});

describe("figure(): machine and controls", () => {
  it("defaults the machine id and slugs control ids", () => {
    const scene = figure("build-times", { title: "Build" }, (f) => {
      f.heading("A");
      f.machine({
        initial: "all",
        states: { all: { on: { SOLO: "solo" } }, solo: { on: { ALL: "all" } } },
      });
      f.controls([
        { label: "Solo fill_cuboid", event: "SOLO" },
        { label: "Show all", event: "ALL" },
        { label: "Show all", event: "ALL" },
        { label: "Reset", kind: "reset", id: "reset-me" },
      ]);
    });
    expect(scene.machine?.id).toBe("build-times-machine");
    expect(scene.controls?.map((control) => control.id)).toEqual([
      "solo-fill-cuboid",
      "show-all",
      "show-all-2",
      "reset-me",
    ]);
    expect(validateScene(scene).ok).toBe(true);
    expect(() =>
      figure("controls", { title: "Controls" }, (f) => {
        f.heading("A");
        f.controls([{ label: "Go", event: "GO" }]);
      }),
    ).toThrow(/controls need a state machine/);
    expect(() =>
      figure("controls", { title: "Controls" }, (f) => {
        f.heading("A");
        f.machine({ initial: "a", states: { a: {} } });
        f.controls([
          { id: "x", label: "Go", event: "GO" },
          { id: "x", label: "Go", event: "GO" },
        ]);
      }),
    ).toThrow(/duplicate control id "x"/);
  });

  it("keeps typed value-control options and validates their bindings", () => {
    const scene = figure("control-values", { title: "Control values" }, (f) => {
      f.heading("Values");
      f.machine({
        initial: "ready",
        variables: { speed: 1, enabled: false, mode: "a" },
        states: { ready: {} },
      });
      f.controls([
        { label: "Enabled", kind: "toggle", event: "SET_ENABLED", bind: "enabled" },
        {
          label: "Speed",
          kind: "range",
          event: "SET_SPEED",
          bind: "speed",
          min: 0,
          max: 4,
          step: 0.25,
        },
        {
          label: "Mode",
          kind: "select",
          event: "SET_MODE",
          bind: "mode",
          options: [
            { label: "A", value: "a" },
            { label: "B", value: "b" },
          ],
        },
      ]);
    });

    expect(scene.controls).toMatchObject([
      { id: "enabled", kind: "toggle", bind: "enabled" },
      { id: "speed", kind: "range", min: 0, max: 4, step: 0.25 },
      {
        id: "mode",
        kind: "select",
        options: [
          { label: "A", value: "a" },
          { label: "B", value: "b" },
        ],
      },
    ]);
    expect(() =>
      figure("bad-control-bind", { title: "Bad" }, (f) => {
        f.heading("Bad");
        f.machine({ initial: "ready", states: { ready: {} } });
        f.controls([{ label: "Speed", kind: "range", event: "SET_SPEED", bind: "missing" }]);
      }),
    ).toThrow(/binds value to unknown signal "missing"/);
  });

  it("validates the machine and every binding at build time", () => {
    expect(() =>
      figure("m", { title: "M" }, (f) => {
        f.heading("A");
        f.machine({ initial: "missing", states: { a: {} } });
      }),
    ).toThrow(/figure "m": invalid machine:\n- machine m-machine initial state "missing"/);
    expect(() =>
      figure("m", { title: "M" }, (f) => {
        f.heading("A", { bind: { text: "headline" } });
      }),
    ).toThrow(/"heading-a" binds text to signal "headline" but the figure declares no signals/);
    expect(() =>
      figure("m", { title: "M" }, (f) => {
        f.heading("A", { bind: { text: "headline" } });
        f.machine({ initial: "a", states: { a: {} }, signals: { other: "x" } });
      }),
    ).toThrow(/"heading-a" binds text to unknown signal "headline"/);
    const ok = figure("m", { title: "M" }, (f) => {
      const a = f.heading("A", { bind: { text: "headline", hidden: "$state" } });
      const b = f.heading("B");
      f.connect(a, b, {
        bind: { highlight: "lit" },
        labels: [{ text: "x", bind: { hidden: "lit" } }],
      });
      f.machine({
        initial: "a",
        variables: { lit: 0 },
        states: { a: {} },
        signals: { headline: "Hello" },
      });
    });
    expect(validateScene(ok).ok).toBe(true);
    const live = figure(
      "live",
      { title: "Live", signals: { value: "waiting", trend: "M0 1L1 0" } },
      (f) => {
        f.heading("waiting", { bind: { text: "value" } });
        f.path("M0 1L1 0", { width: 1, height: 1 }, { bind: { path: "trend" } });
      },
    );
    expect(live.signals).toEqual({ value: "waiting", trend: "M0 1L1 0" });
    const resolvedHeading = resolveScene(live, {
      width: 400,
      signals: { value: "42", trend: "M0 0L1 1" },
    }).nodes.find((node) => node.id === "heading-waiting");
    expect(resolvedHeading?.text?.lines[0]?.text).toBe("42");
    const resolvedPath = resolveScene(live, {
      width: 400,
      signals: { value: "42", trend: "M0 0L1 1" },
    }).nodes.find((node) => node.kind === "path");
    expect(resolvedPath?.path?.d).toBe("M0 0L1 1");
    expect(() =>
      figure("m", { title: "M" }, (f) => {
        f.heading("A");
        f.machine({ initial: "a", states: { a: {} } });
        f.machine({ initial: "a", states: { a: {} } });
      }),
    ).toThrow(/f\.machine was called twice/);
  });
});

describe("figure(): glyph style recipes", () => {
  it("composes tiles, ports, grids, and an exportable card fan", () => {
    const scene = figure("style-recipes", { title: "Style recipes" }, (f) => {
      const left = f.card({ title: "Left", body: "Input" });
      const centre = f.card({ title: "Centre", body: "Selected" });
      const right = f.card({ title: "Right", body: "Output" });
      const fan = f.cardFan([left, centre, right], { angle: 10 });
      const tile = f.tile({ icon: "check", title: "Approved", active: true });
      const port = f.port({ label: "Output port", active: true });
      const grid = f.gridPlane({ columns: 4, rows: 3, height: 160 });
      f.root(f.stack([f.overlay([grid, tile], { minHeight: 160 }), fan, port], { gap: 16 }));
    });

    expect(validateScene(scene).ok).toBe(true);
    const resolved = resolveScene(scene, { width: 960, theme });
    expect(resolved.nodes.find((node) => node.id === "card-left")?.state.rotation).toBe(-10);
    expect(resolved.nodes.find((node) => node.id === "tile-approved")?.metadata).toMatchObject({
      diagramRole: "tile-node",
      active: true,
    });
    expect(resolved.nodes.find((node) => node.id === "port-output-port")?.metadata).toMatchObject({
      diagramRole: "port",
      active: true,
    });
  });
});

describe("figure(): a complete figure resolves cleanly", () => {
  const scene = figure(
    "complete",
    { title: "Complete", description: "Every helper at once.", metadata: { source: "test" } },
    (f) => {
      f.title("Everything in one place");
      f.caption("Cards, a chart-like coordinates group, a legend, and connectors.");
      const plan = f.card({
        eyebrow: "Stage 1",
        title: "Plan",
        body: "Bound the region and pick a brush.",
        motif: "graph",
        badge: "pure",
        extras: [f.keyValue("Cells", "512"), f.keyValue("Brush", "gradient")],
      });
      const place = f.card({
        title: "Place",
        body: "Visit every cell.",
        motif: "blocks",
        tone: "success",
      });
      const edge = f.connect(plan, place, {
        head: "arrow",
        route: { wide: "curve", compact: "orthogonal" },
      });
      const bars = [0.4, 0.8, 0.6].map((height, index) =>
        f.rect({
          position: { x: 0.1 + index * 0.3, y: 1, anchor: "bottom-left" },
          width: "20%",
          height: `${height * 100}%`,
          fill: "chart1",
          revealAnchor: "bottom",
          inspect: {
            role: "Bar",
            title: `Bar ${index + 1}`,
            fields: [{ label: "Value", value: `${height}` }],
          },
          interactive: true,
          label: `Bar ${index + 1}`,
        }),
      );
      const line = f.polyline(
        [
          [0, 0.8],
          [0.5, 0.2],
          [1, 0.5],
        ],
        {
          position: { x: 0, y: 0 },
          width: "100%",
          height: "100%",
          stroke: "chart3",
          curve: "monotone",
        },
      );
      const area = f.coordinates([...bars, line], {
        height: { wide: 160, compact: 120 },
        focusGroup: true,
      });
      const legend = f.legend(
        [
          { id: "bars", label: "Bars", swatch: "chart1" },
          { id: "line", label: "Trend", swatch: "chart3", shape: "line" },
        ],
        { direction: "row" },
      );
      const chart = f.panel([area, legend], { eyebrow: "Chart", title: "Coordinates" });
      f.flow([f.stack([plan, place], { gap: 16 }), chart], { gap: 24 });
      f.rule();
      f.row(
        [f.badge("v2"), f.icon("cube", { tone: "info" }), f.pill("ready", { tone: "success" })],
        {
          gap: 8,
          align: "center",
        },
      );
      f.callout("Bars rise from their anchor; the line wipes in.", { pointer: "up" });
      f.sequence([
        f.reveal(plan, { scale: 0.96 }),
        [f.draw(edge), f.reveal(place)],
        f.rise(bars, { stagger: 60 }),
        f.wipe(line),
        [f.highlight(plan, { rest: 0 }), f.progress(place)],
      ]);
    },
  );

  it("passes defineScene and validateScene", () => {
    expect(() => defineScene(scene)).not.toThrow();
    expect(validateScene(scene).ok).toBe(true);
    expect(scene.metadata).toEqual({ source: "test" });
  });

  for (const width of WIDTHS) {
    it(`resolves at ${width}px without layout diagnostics`, () => {
      const resolved = resolveScene(scene, { width, theme });
      const problems = (resolved.diagnostics ?? []).filter((entry) => LAYOUT_CODES.has(entry.code));
      expect(problems).toEqual([]);
      expect(resolved.nodes.length).toBeGreaterThan(20);
      expect(resolved.edges).toHaveLength(1);
      const duration = scene.timeline?.duration ?? 0;
      expect(duration).toBeGreaterThan(1000);
      const final = seekTimeline(resolved, duration);
      for (const node of final.nodes) if (node.hidden !== true) expect(node.state.opacity).toBe(1);
      const bar = final.nodes.find((node) => node.id === "rect-bar-1");
      expect(bar?.state.revealY).toBe(1);
    });
  }

  it("authors semantic surfaces and concise reusable topologies", () => {
    const authored = figure("topology-recipes", { title: "Topology recipes" }, (f) => {
      const source = f.card({ title: "Source" });
      const host = f.card({ title: "Host" });
      const web = f.card({ title: "Web" });
      const cli = f.card({ title: "CLI" });
      const map = f.hubMap({ host, upstream: [source], clients: [web, cli] });
      expect(map.ranks.map((rank) => rank.length)).toEqual([1, 1, 2]);
      expect(map.edges).toHaveLength(3);
      f.root(f.surface(map.root, { appearance: "card", exportCrop: "surface" }));
    });
    expect(authored.root.metadata).toMatchObject({
      figureSurface: true,
      surfaceAppearance: "card",
      exportCrop: "surface",
    });
    expect(authored.root.padding).toEqual({ wide: 24, compact: 20, narrow: 14 });
    expect(authored.root.frame).toMatchObject({ material: "raised" });
    for (const width of WIDTHS) {
      const resolved = resolveScene(authored, { width, theme });
      expect(resolved.edges).toHaveLength(3);
      expect(resolved.diagnostics?.filter((entry) => entry.severity === "error") ?? []).toEqual([]);
    }
  });

  it("builds pipelines, fan-outs, feedback loops, and layered architectures", () => {
    const authored = figure("all-topologies", { title: "All topologies" }, (f) => {
      const tile = (title: string) => f.tile({ icon: "circle", title });
      const pipeline = f.pipeline([tile("P1"), tile("P2"), tile("P3")]);
      expect(pipeline.edges).toHaveLength(2);
      const fanSource = tile("Fan source");
      const fan = f.fanOut(fanSource, [tile("Fan one"), tile("Fan two")]);
      expect(fan.edges).toHaveLength(2);
      const loop = f.feedbackLoop([tile("Loop one"), tile("Loop two"), tile("Loop three")]);
      expect(loop.edges.at(-1)).toMatchObject({ route: "spline", stroke: "dashed" });
      const architecture = f.layeredArchitecture({
        layers: [[tile("Layer input")], [tile("Layer A"), tile("Layer B")], [tile("Layer output")]],
      });
      expect(architecture.edges).toHaveLength(4);
      f.root(f.stack([pipeline.root, fan.root, loop.root, architecture.root]));
    });
    expect(authored.edges).toHaveLength(11);
  });
});
