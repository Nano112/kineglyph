import { figure, type SceneDefinition } from "@kineglyph/core";
import { groupedBar, plot, stackedBar } from "@kineglyph/plot";
import type { CatalogueEntry } from "../catalogue.js";

/**
 * Two views of the same illustrative benchmark: the left compares throughput while the right
 * explains where time goes. The values are deliberately labelled as illustrative, not measured.
 */
export const benchmarkBreakdownScene: SceneDefinition = figure(
  "benchmark-breakdown",
  {
    title: "Benchmark results need a comparison and an explanation",
    description:
      "Illustrative grouped throughput and stacked runtime breakdowns compare scalar and bulk schematic writes.",
    metadata: { data: "illustrative", family: "quantitative" },
  },
  (f) => {
    const heading = f.heading("One benchmark, two useful questions");
    const grouped = plot(
      [
        { workload: "Dense box", scalar: 0.7, bulk: 18.4 },
        { workload: "Sparse points", scalar: 0.6, bulk: 9.8 },
        { workload: "Mixed ids", scalar: 0.5, bulk: 6.2 },
      ],
      {
        id: "benchmark-grouped",
        x: "workload",
        y: ["scalar", "bulk"],
        marks: groupedBar(),
        title: "Illustrative throughput",
        description:
          "Millions of cells per second for scalar and bulk schematic writes; illustrative values only.",
        axes: {
          x: { label: "Workload" },
          y: { label: "Throughput (M cells/s)", format: { digits: 1 } },
        },
        grid: "y",
        legend: { position: "top" },
        valueLabels: false,
        height: { wide: 218, compact: 190, narrow: 170 },
        motion: "auto",
        duration: 900,
      },
    );
    const breakdown = plot(
      [
        { method: "Scalar loop", binding: 38, parsing: 34, writing: 28 },
        { method: "set_blocks", binding: 8, parsing: 12, writing: 25 },
        { method: "fill_cuboid", binding: 4, parsing: 3, writing: 14 },
      ],
      {
        id: "benchmark-stacked",
        x: "method",
        y: ["binding", "parsing", "writing"],
        marks: stackedBar(),
        title: "Illustrative time per batch",
        description:
          "Stacked milliseconds split into binding, parsing, and writing costs for three methods; illustrative values only.",
        axes: {
          x: { label: "Method" },
          y: { label: "Time (ms)", format: { digits: 0 } },
        },
        grid: "y",
        legend: { position: "top" },
        valueLabels: false,
        height: { wide: 218, compact: 190, narrow: 170 },
        motion: "auto",
        duration: 900,
      },
    );
    const groupedChart = f.add(grouped);
    const stackedChart = f.add(breakdown);
    const charts = f.flow([groupedChart, stackedChart], {
      gap: { wide: 24, compact: 20, narrow: 18 },
      align: "stretch",
      width: "fill",
    });
    const note = f.caption(
      "Illustrative data—not a published Nucleation benchmark. The paired views show why a headline number needs a cost breakdown.",
    );
    f.stack([heading, charts, note], {
      gap: { wide: 18, compact: 16, narrow: 14 },
      width: "fill",
    });
    f.sequence([
      f.reveal(heading, { offset: 8 }),
      [f.reveal(groupedChart), f.reveal(stackedChart)],
      f.reveal(note, { offset: 6 }),
    ]);
  },
);

export const benchmarkBreakdownEntry: CatalogueEntry = {
  slug: "benchmark-breakdown",
  order: 90,
  title: "Benchmark comparison",
  summary: "Grouped throughput and stacked cost views explain the same illustrative benchmark.",
  concept: "Quantitative comparison with provenance and cost decomposition.",
  interaction: "Inspect bars and series to read exact values and their role in the comparison.",
  animation: "Both views rise together, aligning the headline result with its runtime breakdown.",
  source: "Kineglyph quantitative example; all values are illustrative.",
  scene: benchmarkBreakdownScene,
};
