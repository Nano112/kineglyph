import { figure, type SceneDefinition } from "@kineglyph/core";
import { heatmap, plot } from "@kineglyph/plot";
import type { CatalogueEntry } from "../catalogue.js";

const DECISION_MATRIX = [
  { workload: "Dense volume", primitive: "fill_cuboid", speedup: 38 },
  { workload: "Dense volume", primitive: "set_blocks", speedup: 8 },
  { workload: "Dense volume", primitive: "prepare + place", speedup: 5 },
  { workload: "Dense volume", primitive: "BuildingTool.fill", speedup: 12 },
  { workload: "Sparse, one id", primitive: "fill_cuboid", speedup: 1 },
  { workload: "Sparse, one id", primitive: "set_blocks", speedup: 29 },
  { workload: "Sparse, one id", primitive: "prepare + place", speedup: 7 },
  { workload: "Sparse, one id", primitive: "BuildingTool.fill", speedup: 4 },
  { workload: "Mixed ids", primitive: "fill_cuboid", speedup: 1 },
  { workload: "Mixed ids", primitive: "set_blocks", speedup: 6 },
  { workload: "Mixed ids", primitive: "prepare + place", speedup: 21 },
  { workload: "Mixed ids", primitive: "BuildingTool.fill", speedup: 8 },
  { workload: "Shape + brush", primitive: "fill_cuboid", speedup: 3 },
  { workload: "Shape + brush", primitive: "set_blocks", speedup: 4 },
  { workload: "Shape + brush", primitive: "prepare + place", speedup: 7 },
  { workload: "Shape + brush", primitive: "BuildingTool.fill", speedup: 24 },
] as const;

/** A decision matrix: a heatmap is useful here because the meaningful pattern is two-dimensional. */
export const operationHeatmapScene: SceneDefinition = figure(
  "operation-heatmap",
  {
    title: "Choose a bulk primitive by workload shape",
    description:
      "An illustrative heatmap compares the relative speedup of four bulk-write primitives across four workload shapes.",
    metadata: { data: "illustrative", family: "quantitative" },
  },
  (f) => {
    const heading = f.heading("The diagonal is the design rule");
    const matrix = plot(DECISION_MATRIX, {
      id: "bulk-decision-matrix",
      marks: heatmap({
        row: "workload",
        column: "primitive",
        value: "speedup",
        tone: "chart2",
        domain: [0, 40],
        cellLabels: false,
        format: { digits: 0, suffix: "×" },
      }),
      title: "Illustrative speedup over scalar writes",
      description:
        "Each cell estimates relative speedup over scalar writes. The best fit lies on the diagonal from dense fills to geometry-aware fills.",
      axes: {
        x: { label: "Bulk primitive", labelEvery: { wide: 1, compact: 1, narrow: 2 } },
        y: { label: "Workload shape" },
      },
      height: { wide: 268, compact: 236, narrow: 206 },
      motion: "auto",
      duration: 1050,
    });
    const chart = f.add(matrix);
    const note = f.caption(
      "Illustrative values. Read by row: the darkest cell names the operation shaped for that workload—not a universal winner. Focus a cell for its exact value.",
    );
    f.stack([heading, chart, note], {
      gap: { wide: 18, compact: 16, narrow: 14 },
      width: "fill",
    });
    f.sequence([f.reveal(heading, { offset: 8 }), f.reveal(chart), f.reveal(note, { offset: 6 })]);
  },
);

export const operationHeatmapEntry: CatalogueEntry = {
  slug: "operation-heatmap",
  order: 92,
  title: "Bulk-operation decision matrix",
  summary: "A responsive heatmap reveals which primitive fits each workload shape.",
  concept: "A genuinely two-dimensional analytical view with exact cell inspection.",
  interaction: "Focus any cell to read its workload, primitive, and illustrative speedup.",
  animation: "Cells sweep across the matrix in reading order, revealing the diagonal pattern.",
  source: "Kineglyph quantitative example; all values are illustrative.",
  scene: operationHeatmapScene,
};
