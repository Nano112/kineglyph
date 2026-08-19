import { figure, resolveScene, type SceneNode } from "@kineglyph/core";
import { describe, expect, it } from "vitest";
import {
  boxPlot,
  confidenceBand,
  distributionPlot,
  donutChart,
  gaugeChart,
  ganttChart,
  histogram,
  pieChart,
  radialChart,
  rangeChart,
  sankey,
  topology,
  treemap,
  type FamilyPlotResult,
} from "../src/index.js";

function visit(node: SceneNode, ids: string[]): void {
  ids.push(node.id);
  if (node.type === "group") node.children.forEach((child) => visit(child, ids));
}

function ids(result: FamilyPlotResult): string[] {
  const out: string[] = [];
  result.fragment.nodes.forEach((node) => visit(node, out));
  return out;
}

describe("specialized plot families", () => {
  const categories = [
    { name: "Parse", value: 18 },
    { name: "Compile", value: 32 },
    { name: "Render", value: 24 },
  ];

  it("compiles pie, donut, and radial geometry into inspectable ordinary paths", () => {
    const results = [
      pieChart(categories, { id: "pie", category: "name", value: "value" }),
      donutChart(categories, { id: "donut", category: "name", value: "value" }),
      radialChart(categories, { id: "radial", category: "name", value: "value" }),
    ];
    for (const result of results) {
      expect(result.handles.marks).toHaveLength(3);
      expect(result.fragment.tracks).toHaveLength(6);
      expect(JSON.stringify(result.fragment)).not.toContain("NaN");
      const scene = figure(`figure-${result.handles.root}`, { title: result.description }, (f) => {
        f.add(result);
      });
      const resolved = resolveScene(scene, { width: 520 });
      expect(resolved.nodes.filter((node) => node.kind === "path")).toHaveLength(3);
      expect(resolved.diagnostics?.filter((entry) => entry.severity === "error") ?? []).toEqual([]);
    }
  });

  it("compiles histogram, distribution, range, box, confidence, and Gantt families", () => {
    const samples = Array.from({ length: 48 }, (_, index) => ({
      cohort: index < 24 ? "Cold" : "Warm",
      value: 20 + Math.sin(index * 0.7) * 8 + (index % 5),
    }));
    const results = [
      histogram(samples, { id: "hist", value: "value", bins: 8 }),
      distributionPlot(samples, { id: "dist", value: "value", bins: 8 }),
      rangeChart(
        [
          { name: "Parse", low: 8, typical: 14, high: 22 },
          { name: "Render", low: 17, typical: 25, high: 38 },
        ],
        { id: "ranges", category: "name", low: "low", high: "high", value: "typical" },
      ),
      boxPlot(samples, { id: "boxes", category: "cohort", value: "value" }),
      confidenceBand(
        Array.from({ length: 8 }, (_, x) => ({
          x,
          low: x * 2 + 4,
          mean: x * 2 + 7,
          high: x * 2 + 11,
        })),
        { id: "band", x: "x", low: "low", high: "high", value: "mean" },
      ),
      ganttChart(
        [
          { task: "Fetch", start: 0, end: 3 },
          { task: "Compile", start: 2, end: 7 },
          { task: "Ship", start: 7, end: 9 },
        ],
        { id: "gantt", label: "task", start: "start", end: "end" },
      ),
    ];
    for (const result of results) {
      expect(result.handles.marks.length).toBeGreaterThan(0);
      expect(new Set(ids(result)).size).toBe(ids(result).length);
      expect(JSON.stringify(result.fragment)).not.toMatch(/NaN|Infinity/);
    }
  });

  it("compiles an operational gauge with sorted threshold bands and an inspectable value", () => {
    const gauge = gaugeChart({
      id: "cpu",
      title: "CPU saturation",
      label: "CPU",
      value: 86.4,
      max: 100,
      unit: "%",
      precision: 1,
      thresholds: [
        { value: 100, tone: "danger", label: "Critical" },
        { value: 70, tone: "success", label: "Healthy" },
        { value: 85, tone: "warning", label: "Elevated" },
      ],
      motion: "none",
    });

    expect(gauge.handles.marks).toEqual(["cpu:value", "cpu:band:0", "cpu:band:1", "cpu:band:2"]);
    expect(JSON.stringify(gauge.fragment)).not.toMatch(/NaN|Infinity/);
    const scene = figure("gauge-figure", { title: gauge.description }, (f) => f.add(gauge));
    const resolved = resolveScene(scene, { width: 420 });
    expect(resolved.nodes.filter((node) => node.kind === "path").length).toBeGreaterThanOrEqual(6);
    expect(resolved.diagnostics?.filter((entry) => entry.severity === "error") ?? []).toEqual([]);
  });

  it("compiles treemaps, Sankey flows, and topology with stable handles and edges", () => {
    const tree = treemap(categories, { id: "tree", label: "name", value: "value" });
    const flow = sankey({
      id: "flow",
      nodes: [
        { id: "source", label: "Source" },
        { id: "parse", label: "Parse" },
        { id: "cache", label: "Cache" },
      ],
      links: [
        { source: "source", target: "parse", value: 8 },
        { source: "parse", target: "cache", value: 5 },
      ],
    });
    const graph = topology({
      id: "network",
      nodes: [
        { id: "a", label: "API" },
        { id: "b", label: "Queue" },
        { id: "c", label: "Worker" },
      ],
      links: [
        { source: "a", target: "b", directed: true },
        { source: "b", target: "c", directed: true },
      ],
    });

    expect(tree.handles.marks).toHaveLength(3);
    expect(flow.fragment.edges).toHaveLength(2);
    expect(flow.fragment.edges?.[0]?.width).toBeGreaterThan(2);
    expect(graph.fragment.edges?.every((edge) => edge.head === "arrow")).toBe(true);
  });
});
