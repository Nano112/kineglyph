import {
  alphaGradient,
  cubicBezier,
  figure,
  resolveScene,
  type GroupNode,
  type SceneNode,
} from "@kineglyph/core";
import { exportSvg } from "@kineglyph/export";
import { describe, expect, it } from "vitest";
import {
  area,
  bar,
  calloutAt,
  dot,
  editorialBarChart,
  heatmap,
  line,
  plot,
  pointLabel,
  range,
  rule,
  stackedBar,
} from "../src/index.js";

function visit(nodes: readonly SceneNode[], callback: (node: SceneNode) => void): void {
  for (const node of nodes) {
    callback(node);
    if (node.type === "group") visit(node.children, callback);
  }
}

function findNode(nodes: readonly SceneNode[], id: string): SceneNode {
  let found: SceneNode | undefined;
  visit(nodes, (node) => {
    if (node.id === id) found = node;
  });
  if (found === undefined) throw new Error(`missing test node ${id}`);
  return found;
}

function allNodes(root: SceneNode): SceneNode[] {
  const nodes: SceneNode[] = [];
  visit([root], (node) => nodes.push(node));
  return nodes;
}

describe("plot compiler", () => {
  it("builds a polished responsive editorial bar chart with one concise recipe", () => {
    const result = editorialBarChart(
      [
        { eclipses: "0", years: 0 },
        { eclipses: "1", years: 0 },
        { eclipses: "2", years: 3610 },
        { eclipses: "3", years: 894 },
      ],
      {
        id: "eclipses",
        x: "eclipses",
        y: "years",
        title: "Solar eclipses in a year",
        subtitle: "2000 BCE – 3000 CE",
        axisLabel: "number of solar eclipses in the year",
      },
    );

    expect(findNode(result.fragment.nodes, "eclipses:title")).toMatchObject({
      type: "text",
      textStyle: "display",
      align: "center",
      width: "fill",
    });
    expect(findNode(result.fragment.nodes, "eclipses:subtitle")).toMatchObject({
      textStyle: "title",
      color: "textMuted",
    });
    expect(findNode(result.fragment.nodes, "eclipses:bar:years:2")).toMatchObject({
      type: "rect",
      radius: 8,
      revealAnchor: "bottom",
      material: { material: "flat" },
    });
    expect(findNode(result.fragment.nodes, "eclipses:label:years:0:text")).toMatchObject({
      type: "text",
      text: "never",
      textStyle: "bodyStrong",
    });
    expect(result.handles.axes.y).toBeUndefined();
    expect(result.fragment.tracks?.some((entry) => entry.property === "revealY")).toBe(true);

    const scene = figure("editorial", { title: "Editorial" }, (f) => f.add(result));
    const wide = resolveScene(scene, { width: 1200 });
    const narrow = resolveScene(scene, { width: 390 });
    const wideArea = wide.nodes.find((node) => node.id === "eclipses:area");
    const narrowArea = narrow.nodes.find((node) => node.id === "eclipses:area");
    expect(wideArea?.height).toBeGreaterThan(narrowArea?.height ?? Number.POSITIVE_INFINITY);
    expect([...(wide.diagnostics ?? []), ...(narrow.diagnostics ?? [])]).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ severity: "error" })]),
    );
  });

  it("applies a serializable easing to every generated plot track", () => {
    const easing = cubicBezier(0.16, 1, 0.3, 1);
    const result = plot(
      [
        { x: 0, y: 2 },
        { x: 1, y: 7 },
      ],
      { id: "eased", x: "x", y: "y", marks: line(), easing },
    );
    expect(result.fragment.tracks?.length).toBeGreaterThan(0);
    for (const authoredTrack of result.fragment.tracks ?? [])
      expect(authoredTrack.keyframes.at(-1)?.easing).toEqual(easing);
  });

  it("passes authored gradient and opacity through area layers", () => {
    const fill = alphaGradient("chart1", { from: 0.55, angle: 90 });
    const result = plot(
      [
        { x: 0, y: 2 },
        { x: 1, y: 7 },
        { x: 2, y: 5 },
      ],
      {
        id: "gradient-area",
        x: "x",
        y: "y",
        marks: area({ fill, fillOpacity: 0.9, curve: "monotone" }),
      },
    );
    const mark = findNode(result.fragment.nodes, "gradient-area:area:y");
    expect(mark.type).toBe("polyline");
    if (mark.type !== "polyline") throw new Error("expected area polyline");
    expect(mark.fill).toEqual(fill);
    expect(mark.opacity).toBe(0.9);

    const scene = figure("gradient-area-figure", { title: "Gradient area" }, (f) => {
      f.add(result);
    });
    expect(
      resolveScene(scene, { width: 640 }).nodes.find((node) => node.id === "gradient-area:area:y")
        ?.appearance.fill,
    ).toMatchObject({ type: "linear-gradient", angle: 90 });
  });

  it("compiles typed wide rows to stable handles, scales, ticks, and deterministic fragments", () => {
    const rows = [
      { call: "fill", dense: 4, sparse: 9 },
      { call: "set", dense: 12, sparse: 5 },
    ];
    const options = {
      id: "bench",
      x: "call" as const,
      y: ["dense", "sparse"] as const,
      marks: bar(),
      motion: "none" as const,
    };
    const first = plot(rows, options);
    const second = plot(rows, options);

    expect(first.domains.x).toEqual(["fill", "set"]);
    expect(first.domains.y).toEqual([0, 12]);
    expect(first.ticks.y).toEqual([0, 2, 4, 6, 8, 10, 12]);
    expect(first.handles.series.dense.bars).toEqual(["bench:bar:dense:0", "bench:bar:dense:1"]);
    expect(first.handles.series.sparse.group).toBe("bench:series:sparse");
    expect(first.fragment).toEqual(second.fragment);
    expect([...first.markIds]).toEqual([...second.markIds]);
    expect(first.description).toContain("2 series over 2 categories");

    const scene = figure("bench-figure", { title: "Benchmark" }, (f) => {
      f.add(first);
    });
    const resolved = resolveScene(scene, { width: 640 });
    const area = resolved.nodes.find((node) => node.id === "bench:area");
    const bars = resolved.nodes.filter((node) => node.id.startsWith("bench:bar:"));
    expect(area?.width).toBeGreaterThan(400);
    expect(bars).toHaveLength(4);
    expect(bars.every((node) => node.width > 0)).toBe(true);
    expect(new Set(bars.map((node) => node.x)).size).toBeGreaterThan(1);
    const zeroTick = resolved.nodes.find((node) => node.id === "bench:tick:y:0");
    const maxTick = resolved.nodes.find((node) => node.id === "bench:tick:y:6");
    expect(zeroTick?.y).toBeGreaterThan(maxTick?.y ?? Number.POSITIVE_INFINITY);
  });

  it("defaults x to deterministic row order and keeps missing numeric data as gaps", () => {
    const result = plot([{ value: 2 }, { value: null }, { value: 4 }, { value: 5 }], {
      id: "ordered",
      y: "value",
      marks: line(),
      motion: "none",
    });

    expect(result.domains.x).toEqual([0, 3]);
    expect(result.handles.series.value.dots).toEqual([
      "ordered:point:value:0",
      "ordered:point:value:2",
      "ordered:point:value:3",
    ]);
    expect(result.handles.series.value.lines).toEqual(["ordered:line:value:1"]);
    expect(result.diagnostics).toEqual([]);
  });

  it("handles empty and single-value inputs without non-finite geometry", () => {
    const emptyRows: { category: string; value: number | null }[] = [];
    const empty = plot(emptyRows, {
      id: "empty",
      x: "category",
      y: "value",
      marks: bar(),
      motion: "none",
    });
    expect(empty.domains).toEqual({ x: [], y: [0, 1] });
    expect(empty.diagnostics.map((entry) => entry.code)).toContain("empty-data");

    const single = plot([{ category: "only", value: 5 }], {
      id: "single",
      x: "category",
      y: "value",
      marks: dot(),
      motion: "none",
    });
    expect(single.handles.series.value.marks).toEqual(["single:point:value:0"]);
    expect(single.domains.x).toEqual(["only"]);
    expect(single.domains.y.every(Number.isFinite)).toBe(true);
  });

  it("freezes tidy series order and disambiguates colliding id slugs", () => {
    const result = plot(
      [
        { category: "A", value: 1, cohort: "Fast path" },
        { category: "A", value: 2, cohort: "Fast/path" },
        { category: "B", value: 3, cohort: "Fast path" },
      ],
      {
        id: "tidy",
        x: "category",
        y: "value",
        series: "cohort",
        marks: line(),
        motion: "none",
      },
    );

    expect(Object.keys(result.handles.series)).toEqual(["Fast path", "Fast/path"]);
    expect(result.handles.series["Fast path"]?.id).toBe("Fast-path");
    expect(result.handles.series["Fast/path"]?.id).toBe("Fast-path-2");
    expect(result.domains.x).toEqual(["A", "B"]);
  });

  it("builds layered area-line-dot marks into one typed series handle", () => {
    const result = plot(
      [
        { time: 0, value: 1 },
        { time: 1, value: 3 },
        { time: 2, value: 2 },
      ],
      { id: "trend", x: "time", y: "value", marks: [area(), line(), dot()], motion: "none" },
    );
    const handle = result.handles.series.value;

    expect(handle.area).toBe("trend:area:value");
    expect(handle.line).toBe("trend:line:value");
    expect(handle.dots).toEqual([
      "trend:point:value:0",
      "trend:point:value:1",
      "trend:point:value:2",
    ]);
    const root = result.fragment.nodes[0];
    if (root === undefined) throw new Error("plot fragment must have a root");
    const nodes = allNodes(root);
    expect(new Set(nodes.map((node) => node.id)).size).toBe(nodes.length);

    const withoutExplicitDots = plot(
      [
        { time: 0, value: 1 },
        { time: 1, value: 2 },
      ],
      { id: "filled", x: "time", y: "value", marks: [area(), line()], motion: "none" },
    );
    const filledRoot = withoutExplicitDots.fragment.nodes[0];
    if (filledRoot === undefined) throw new Error("plot fragment must have a root");
    const filledNodes = allNodes(filledRoot);
    expect(new Set(filledNodes.map((node) => node.id)).size).toBe(filledNodes.length);
    expect(withoutExplicitDots.handles.series.value.dots).toHaveLength(2);
  });

  it("uses exact diverging stack geometry and negative reveal anchors", () => {
    const result = plot(
      [
        { category: "A", one: 3, two: 4 },
        { category: "B", one: -2, two: -5 },
      ],
      {
        id: "stack",
        x: "category",
        y: ["one", "two"],
        marks: stackedBar(),
        axes: { y: { nice: false } },
        motion: "none",
      },
    );

    expect(result.domains.y).toEqual([-7, 7]);
    expect(findNode(result.fragment.nodes, "stack:bar:one:0")).toMatchObject({
      type: "rect",
      position: { y: 0.285714 },
      height: "21.4286%",
      revealAnchor: "bottom",
    });
    expect(findNode(result.fragment.nodes, "stack:bar:two:0")).toMatchObject({
      type: "rect",
      position: { y: 0 },
      height: "28.5714%",
    });
    expect(findNode(result.fragment.nodes, "stack:bar:two:1")).toMatchObject({
      type: "rect",
      position: { y: 0.642857 },
      height: "35.7143%",
      revealAnchor: "top",
    });
  });

  it("emits accessible inspection groups and caps dense roving marks", () => {
    const result = plot(
      Array.from({ length: 61 }, (_, index) => ({ category: `C${index}`, value: index })),
      { id: "accessible", x: "category", y: "value", marks: dot(), motion: "none" },
    );
    const group = findNode(result.fragment.nodes, result.handles.series.value.group);
    const first = findNode(result.fragment.nodes, "accessible:point:value:0");

    expect(group).toMatchObject({
      type: "group",
      focusGroup: true,
      interactive: true,
      inspect: { role: "Series", title: "value" },
    });
    expect(first).toMatchObject({
      type: "circle",
      inspect: {
        role: "Point",
        fields: [
          { label: "Series", value: "value" },
          { label: "Category", value: "C0" },
          { label: "Value", value: "0" },
        ],
      },
    });
    expect(first).not.toHaveProperty("interactive");
    expect(result.diagnostics.map((entry) => entry.code)).toContain("interactive-cap");
  });

  it("keeps explicitly decorative series out of the focus order", () => {
    const result = plot(
      [
        { x: 0, y: 1 },
        { x: 1, y: 2 },
      ],
      { id: "decorative", x: "x", y: "y", marks: line({ interactive: "none" }), motion: "none" },
    );
    const group = findNode(result.fragment.nodes, "decorative:series:y");
    expect(group).not.toHaveProperty("focusGroup");
    expect(group).not.toHaveProperty("interactive");

    const scene = figure("decorative-scene", { title: "Decorative chart" }, (f) => {
      const chart = f.add(result);
      if (chart.type !== "group") throw new Error("plot fragment root must be a group");
      f.root(chart);
    });
    const svg = exportSvg(resolveScene(scene, { width: 480 }), { idPrefix: "decorative-test" });
    const tag = svg.match(/<g[^>]*data-kineglyph-node="decorative:series:y"[^>]*>/)?.[0];
    expect(tag).toBeDefined();
    expect(tag).not.toContain("tabindex");
    expect(tag).not.toContain("data-focus-group");
  });

  it("emits declarative series bindings at the effective visual level", () => {
    const result = plot(
      [
        { category: "A", dense: 2, sparse: 3 },
        { category: "B", dense: 4, sparse: 1 },
      ],
      {
        id: "bound",
        x: "category",
        y: ["dense", "sparse"],
        marks: bar(),
        seriesBindings: {
          dense: {
            hidden: "hideDense",
            opacity: "denseOpacity",
            highlight: "denseHighlight",
          },
        },
        motion: "none",
      },
    );

    expect(findNode(result.fragment.nodes, "bound:series:dense")).toMatchObject({
      bind: {
        hidden: "hideDense",
        opacity: "denseOpacity",
      },
    });
    for (const id of result.handles.series.dense.bars)
      expect(findNode(result.fragment.nodes, id)).toMatchObject({
        bind: { highlight: "denseHighlight" },
      });
    expect(findNode(result.fragment.nodes, "bound:series:sparse")).not.toHaveProperty("bind");
  });

  it("reports only handles for emitted axes and annotations", () => {
    const minimal = plot(
      [
        { x: 0, y: 1 },
        { x: 1, y: 2 },
      ],
      {
        id: "minimal",
        x: "x",
        y: "y",
        marks: line(),
        minimal: true,
        annotations: [pointLabel({ index: 99, text: "missing" })],
        motion: "none",
      },
    );
    expect(minimal.handles.axes).toEqual({});
    expect(minimal.handles.annotations).toEqual([]);
    expect(minimal.handles.annotations).not.toContain("");
    expect(minimal.diagnostics.map((entry) => entry.code)).toContain("annotation-skipped");

    const xOnly = plot([{ x: 0, y: 1 }], {
      id: "x-only",
      x: "x",
      y: "y",
      marks: dot(),
      axes: { y: false },
      motion: "none",
    });
    expect(xOnly.handles.axes).toEqual({ x: "x-only:axis:x" });
  });

  it("thins categorical labels responsively on narrow layouts", () => {
    const result = plot(
      Array.from({ length: 20 }, (_, index) => ({ category: `Category ${index}`, value: index })),
      { id: "thin", x: "category", y: "value", marks: bar(), motion: "none" },
    );
    const ticks = allNodes(result.fragment.nodes[0] as GroupNode).filter((node) =>
      node.id.startsWith("thin:tick:x:"),
    );
    const narrowHidden = ticks.filter(
      (node) =>
        node.hidden === true || (typeof node.hidden === "object" && node.hidden.narrow === true),
    );
    expect(ticks).toHaveLength(20);
    expect(narrowHidden.length).toBeGreaterThanOrEqual(12);
  });

  it("compiles diverging heatmaps with required channels, missing cells, labels, and diagnostics", () => {
    const result = plot(
      [
        { row: "A", column: "X", value: -2 },
        { row: "A", column: "X", value: -3 },
        { row: "A", column: "Y", value: null },
        { row: "B", column: "X", value: 4 },
      ],
      {
        id: "matrix",
        marks: heatmap({
          row: "row",
          column: "column",
          value: "value",
          negativeTone: "danger",
          cellLabels: true,
        }),
        motion: "none",
      },
    );

    expect(result.domains).toEqual({ x: ["X", "Y"], y: ["A", "B"] });
    expect(result.handles.cells).toEqual([
      ["matrix:cell:0:0", "matrix:cell:0:1"],
      ["matrix:cell:1:0", "matrix:cell:1:1"],
    ]);
    expect(result.handles.series.heatmap.labels).toEqual([
      "matrix:cell:0:0:label",
      "matrix:cell:1:0:label",
    ]);
    expect(findNode(result.fragment.nodes, "matrix:cell:0:0")).toMatchObject({
      type: "rect",
      fill: "danger",
      interactive: true,
      inspect: { role: "Cell" },
    });
    expect(result.diagnostics.map((entry) => entry.code)).toContain("duplicate-cell");
  });

  it("supports semantic annotations and reports invalid advanced data without throwing", () => {
    const result = plot(
      [
        { category: "A", value: 1 },
        { category: "B", value: 3 },
      ],
      {
        id: "annotated",
        x: "category",
        y: "value",
        marks: dot(),
        annotations: [
          range({ y: [1, 2], label: "normal" }),
          rule({ y: 2, label: "target" }),
          pointLabel({ index: 1, text: "peak" }),
          calloutAt({ x: "B", y: 3, text: "explain" }),
        ],
        motion: "none",
      },
    );
    expect(result.handles.annotations).toEqual([
      "annotated:annotation:0",
      "annotated:annotation:1",
      "annotated:annotation:2",
      "annotated:annotation:3",
    ]);

    const advanced = plot(
      {
        series: [
          {
            id: "raw",
            label: "Raw",
            mark: "bar",
            data: { rows: [{ category: "A", value: "bad" }], x: "category", y: "value" },
          },
        ],
      },
      { motion: "none" },
    );
    expect(advanced.diagnostics.map((entry) => entry.code)).toEqual([
      "non-numeric-value",
      "empty-data",
    ]);
  });

  it("produces export-ready fragments with static accessible SVG copy", () => {
    const result = plot(
      [
        { category: "A", value: 2 },
        { category: "B", value: 5 },
      ],
      { id: "export-chart", title: "Throughput", x: "category", y: "value", marks: bar() },
    );
    const scene = figure("export-scene", { title: "Export scene" }, (f) => {
      const chart = f.add(result, { id: "export-chart" });
      if (chart.type !== "group") throw new Error("plot fragment root must be a group");
      f.root(chart);
    });
    const resolved = resolveScene(scene, { width: 640 });
    const first = exportSvg(resolved, { idPrefix: "export-test" });
    const second = exportSvg(resolveScene(scene, { width: 640 }), { idPrefix: "export-test" });

    expect(first).toBe(second);
    expect(first).toContain("Throughput");
    expect(first).toContain("Bar chart of 1 series over 2 categories");
    expect(first).toContain('data-kineglyph-node="export-chart:bar:value:0"');
  });

  it("stays practical around one thousand visible marks", () => {
    const rows = Array.from({ length: 1_000 }, (_, index) => ({ x: index, y: index % 101 }));
    const started = performance.now();
    const result = plot(rows, { id: "large", x: "x", y: "y", marks: dot() });
    const elapsed = performance.now() - started;

    expect(result.handles.series.y.marks).toHaveLength(1_000);
    expect(result.fragment.tracks).toHaveLength(1);
    expect(elapsed).toBeLessThan(1_500);
  });

  it("emits mark-specific relative motion tracks", () => {
    const bars = plot(
      [
        { category: "A", value: 2 },
        { category: "B", value: -1 },
      ],
      { id: "moving-bars", x: "category", y: "value", marks: bar(), motion: "auto" },
    );
    expect(bars.fragment.tracks?.map((track) => [track.target, track.property])).toEqual([
      ["moving-bars:bar:value:0", "revealY"],
      ["moving-bars:bar:value:1", "revealY"],
    ]);

    const lines = plot(
      [
        { x: 0, y: 1 },
        { x: 1, y: 2 },
      ],
      { id: "moving-line", x: "x", y: "y", marks: line(), motion: "auto" },
    );
    expect(lines.fragment.tracks?.[0]).toMatchObject({
      target: "moving-line:line:y",
      property: "progress",
    });
  });
});
