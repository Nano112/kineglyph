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

  it("composes timeline opacity and highlight with binding-driven base values", () => {
    const bound: SceneDefinition = {
      ...scene,
      id: "bound-opacity",
      root: {
        ...scene.root,
        children: [{ ...card("a", "Alpha", "Body"), bind: { opacity: "dim", highlight: "focus" } }],
      },
      edges: [],
      timeline: {
        duration: 1000,
        tracks: [
          {
            id: "a-in",
            target: "a",
            property: "opacity",
            keyframes: [
              { time: 0, value: 0 },
              { time: 1000, value: 1 },
            ],
          },
          {
            id: "a-pulse",
            target: "a",
            property: "highlight",
            keyframes: [
              { time: 0, value: 0 },
              { time: 500, value: 1 },
              { time: 1000, value: 0 },
            ],
          },
        ],
      },
    };
    const resolved = resolveScene(bound, { width: 800, theme, signals: { dim: 0.5, focus: 0.3 } });
    const find = (time: number) =>
      seekTimeline(resolved, time).nodes.find((node) => node.id === "a");
    expect(find(1000)?.state.opacity).toBeCloseTo(0.5, 5);
    expect(find(500)?.state.opacity).toBeCloseTo(0.25, 5);
    expect(find(500)?.state.highlight).toBe(1);
    expect(find(1000)?.state.highlight).toBeCloseTo(0.3, 5);
  });

  it("seeks rotation in degrees without normalizing complete turns", () => {
    const spinning: SceneDefinition = {
      ...scene,
      id: "rotating-node",
      timeline: {
        duration: 1_000,
        tracks: [
          {
            id: "a-turn",
            target: "a",
            property: "rotation",
            keyframes: [
              { time: 0, value: -45 },
              { time: 1_000, value: 405 },
            ],
          },
        ],
      },
    };
    const resolved = resolveScene(spinning, { width: 800, theme });
    expect(seekTimeline(resolved, 0).nodes.find((node) => node.id === "a")?.state.rotation).toBe(
      -45,
    );
    expect(seekTimeline(resolved, 500).nodes.find((node) => node.id === "a")?.state.rotation).toBe(
      180,
    );
    expect(
      seekTimeline(resolved, 1_000).nodes.find((node) => node.id === "a")?.state.rotation,
    ).toBe(405);
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

  it("validates named node ports before routing", () => {
    const result = validateScene({
      ...scene,
      root: {
        ...scene.root,
        children: [
          {
            ...scene.root.children[0]!,
            ports: [
              { id: "data", side: "right", offset: 0.5 },
              { id: "data", side: "left", offset: 1.2 },
            ],
          },
          ...scene.root.children.slice(1),
        ],
      },
      edges: [{ id: "bad-port", from: { node: "a", port: "clock" }, to: "b" }],
    });
    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((entry) => entry.code)).toEqual(
      expect.arrayContaining(["duplicate-port", "port-offset", "missing-port"]),
    );
  });

  it("validates edge casing dimensions", () => {
    const result = validateScene({
      ...scene,
      edges: [
        { id: "bad-casing-width", from: "a", to: "b", casing: { width: 0 } },
        {
          id: "bad-casing-opacity",
          from: "b",
          to: "c",
          casing: { width: 5, opacity: 1.2 },
        },
      ],
    });
    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((entry) => entry.code)).toEqual(
      expect.arrayContaining(["edge-casing-width", "edge-casing-opacity"]),
    );
  });

  it("validates packet trail dimensions", () => {
    const result = validateScene({
      ...scene,
      edges: [
        {
          id: "bad-trail-length",
          from: "a",
          to: "b",
          packets: { count: 1, trail: true, trailLength: 1 },
        },
        {
          id: "bad-trail-width",
          from: "b",
          to: "c",
          packets: { count: 1, trail: true, trailWidth: 0 },
        },
        {
          id: "bad-trail-opacity",
          from: "c",
          to: "a",
          packets: { count: 1, trail: true, trailOpacity: -0.1 },
        },
        {
          id: "bad-speed",
          from: "a",
          to: "c",
          packets: { count: 1, speed: 0 },
        },
      ],
    });
    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((entry) => entry.code)).toEqual(
      expect.arrayContaining([
        "edge-packet-trail-length",
        "edge-packet-trail-width",
        "edge-packet-trail-opacity",
        "edge-packet-speed",
      ]),
    );
  });

  it("validates typed value-control contracts", () => {
    const result = validateScene({
      ...scene,
      machine: {
        id: "controls-machine",
        initial: "ready",
        variables: { speed: 1, mode: "a" },
        states: { ready: {} },
      },
      controls: [
        {
          id: "bad-range",
          kind: "range",
          label: "Speed",
          event: "SET_SPEED",
          bind: "unknown",
          min: 10,
          max: 0,
        },
        {
          id: "bad-select",
          kind: "select",
          label: "Mode",
          event: "SET_MODE",
          bind: "mode",
          options: [
            { label: "A", value: "a" },
            { label: "Again", value: "a" },
          ],
        },
      ],
    });

    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((entry) => entry.code)).toEqual(
      expect.arrayContaining(["control-bind", "control-range", "control-options"]),
    );
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

  it("makes a row a band and a column a column, and lets an author say otherwise", () => {
    const hug = (id: string, text: string): SceneDefinition["root"] => ({
      id,
      type: "group",
      layout: "stack",
      padding: 12,
      width: "fill",
      frame: { fill: "surface", stroke: "border" },
      children: [{ id: `${id}-t`, type: "text", text, textStyle: "caption", maxLines: 3 }],
    });
    const build = (
      layout: "row" | "stack",
      align?: "start" | "center" | "end" | "stretch",
    ): SceneDefinition => ({
      schemaVersion: 2,
      id: `band-${layout}-${align ?? "default"}`,
      title: "Band",
      root: {
        id: "root",
        type: "group",
        layout,
        gap: 40,
        ...(align === undefined ? {} : { align }),
        children: [
          hug("one", "One line."),
          hug(
            "two",
            "A body long enough to wrap onto two or three lines inside a narrow card, and then some more words.",
          ),
        ],
      },
      edges: [{ id: "one-two", from: "one", to: "two" }],
    });

    const boxOf = (figure: ReturnType<typeof resolveFigure>, id: string) =>
      (figure.nodes ?? []).find((node) => node.id === id);

    // A row: same height, same top, and the connector between them is exactly level.
    const row = resolveFigure(build("row"), { width: 520, theme });
    expect(boxOf(row, "one")?.height).toBe(boxOf(row, "two")?.height);
    expect(row.edges?.[0]?.start.y).toBe(row.edges?.[0]?.end.y);

    // A column has the same problem mirrored onto x — cards sized to their own text have different
    // widths, so their middles disagree — and the same answer: the column's width is the band.
    const column = resolveFigure(build("stack"), { width: 520, theme });
    expect(boxOf(column, "one")?.width).toBe(boxOf(column, "two")?.width);
    expect(column.edges?.[0]?.start.x).toBe(column.edges?.[0]?.end.x);

    // Ragged is still one word away, and it is the author's word.
    const ragged = resolveFigure(build("row", "start"), { width: 520, theme });
    expect(boxOf(ragged, "one")?.height).not.toBe(boxOf(ragged, "two")?.height);
    // …and even then the connector does not lean: the ports meet on the axis the boxes share.
    expect(ragged.edges?.[0]?.start.y).toBe(ragged.edges?.[0]?.end.y);
    const centred = resolveFigure(build("row", "center"), { width: 520, theme });
    expect(boxOf(centred, "one")?.y).toBeGreaterThan(boxOf(centred, "two")?.y ?? 0);
    expect(centred.edges?.[0]?.start.y).toBe(centred.edges?.[0]?.end.y);
  });
});
