import {
  defineScene,
  drawEdge,
  fadeIn,
  flow,
  highlight,
  progressTo,
  reveal,
  timeline,
  type SceneDefinition,
  type StateMachineDefinition,
} from "@kineglyph/core";
import type { CatalogueEntry } from "../catalogue.js";
import { caption, card, code, eyebrow, flow as flowLayout, stack } from "../recipes.js";

const STAGES = ["field", "graph", "brush", "shape", "fill", "schematic"] as const;
type Stage = (typeof STAGES)[number];

const STAGE_LABEL: Record<Stage, string> = {
  field: "Field3",
  graph: "SDF graph",
  brush: "Field brush",
  shape: "Bounded shape",
  fill: "fill",
  schematic: "Schematic",
};

const STAGE_COPY: Record<Stage, { title: string; explanation: string }> = {
  field: {
    title: "One field, many meanings",
    explanation:
      "Field3 is an immutable scalar over (x, y, z). Nothing downstream changes what the number means.",
  },
  graph: {
    title: "Geometry reads the field",
    explanation:
      "The SDF graph offsets and combines primitives with boolean nodes, using the field to displace the surface.",
  },
  brush: {
    title: "Material reads the same field",
    explanation:
      "A field brush maps the very same scalar to block choice, so colour and shape stay in agreement.",
  },
  shape: {
    title: "Boundedness makes it a shape",
    explanation:
      "The zero crossing, sampled at voxel centres, turns the distance function into a finite solid.",
  },
  fill: {
    title: "Shape decides where, brush decides what",
    explanation:
      "fill(shape, brush) visits every cell inside the shape and asks the brush which block to place.",
  },
  schematic: {
    title: "The result is an editable schematic",
    explanation:
      "Blocks land on the Minecraft lattice as a normal schematic: inspect, edit, or export it like any other.",
  },
};

const machine: StateMachineDefinition = {
  id: "sdf-stages",
  initial: "overview",
  variables: { stage: "none" },
  states: {
    overview: { on: stageEvents() },
    field: {
      entry: [
        { type: "set", var: "stage", value: "field" },
        { type: "select", node: "field" },
      ],
      on: stageEvents(),
    },
    graph: {
      entry: [
        { type: "set", var: "stage", value: "graph" },
        { type: "select", node: "graph" },
      ],
      on: stageEvents(),
    },
    brush: {
      entry: [
        { type: "set", var: "stage", value: "brush" },
        { type: "select", node: "brush" },
      ],
      on: stageEvents(),
    },
    shape: {
      entry: [
        { type: "set", var: "stage", value: "shape" },
        { type: "select", node: "shape" },
      ],
      on: stageEvents(),
    },
    fill: {
      entry: [
        { type: "set", var: "stage", value: "fill" },
        { type: "select", node: "fill" },
      ],
      on: stageEvents(),
    },
    schematic: {
      entry: [
        { type: "set", var: "stage", value: "schematic" },
        { type: "select", node: "schematic" },
      ],
      on: stageEvents(),
    },
  },
  signals: {
    focused: { not: { when: { state: "overview" }, then: true, else: false } },
    insightTitle: {
      match: { var: "stage" },
      cases: Object.fromEntries(STAGES.map((stage) => [stage, STAGE_COPY[stage].title])),
      default: "Choose a stage to focus it",
    },
    insightBody: {
      match: { var: "stage" },
      cases: Object.fromEntries(STAGES.map((stage) => [stage, STAGE_COPY[stage].explanation])),
      default:
        "One immutable field drives both surface displacement and material without changing its scalar meaning.",
    },
    ...Object.fromEntries(
      STAGES.map((stage) => [
        `${stage}Focus`,
        { when: { var: "stage", op: "eq", value: stage }, then: 1, else: 0 },
      ]),
    ),
    ...Object.fromEntries(
      STAGES.map((stage) => [
        `${stage}Dim`,
        {
          when: { any: [{ state: "overview" }, { var: "stage", op: "eq", value: stage }] },
          then: 1,
          else: 0.55,
        },
      ]),
    ),
    edgeFieldGraph: {
      when: { var: "stage", op: "in", value: ["field", "graph"] },
      then: 1,
      else: 0,
    },
    edgeFieldBrush: {
      when: { var: "stage", op: "in", value: ["field", "brush"] },
      then: 1,
      else: 0,
    },
    edgeGraphShape: {
      when: { var: "stage", op: "in", value: ["graph", "shape"] },
      then: 1,
      else: 0,
    },
    edgeShapeFill: { when: { var: "stage", op: "in", value: ["shape", "fill"] }, then: 1, else: 0 },
    edgeBrushFill: { when: { var: "stage", op: "in", value: ["brush", "fill"] }, then: 1, else: 0 },
    edgeFillSchematic: {
      when: { var: "stage", op: "in", value: ["fill", "schematic"] },
      then: 1,
      else: 0,
    },
  },
};

function stageEvents(): Record<string, string> {
  return {
    FOCUS_FIELD: "field",
    FOCUS_GRAPH: "graph",
    FOCUS_BRUSH: "brush",
    FOCUS_SHAPE: "shape",
    FOCUS_FILL: "fill",
    FOCUS_SCHEMATIC: "schematic",
    RESET: "overview",
  };
}

function stageCard(
  id: Stage,
  options: {
    eyebrow: string;
    title: string;
    body: string;
    motif: string;
    tone: "accent" | "info" | "warning" | "success";
    expression: string;
    event: string;
  },
) {
  return card(id, {
    eyebrow: options.eyebrow,
    title: options.title,
    body: options.body,
    motif: options.motif,
    tone: options.tone,
    interactive: true,
    onActivate: options.event,
    bind: { highlight: `${id}Focus`, opacity: `${id}Dim` },
    extras: [code(`${id}-expression`, options.expression, { tone: options.tone })],
    metadata: { stage: STAGES.indexOf(id) + 1 },
    compact: true,
  });
}

const field = stageCard("field", {
  eyebrow: "Scalar field",
  title: "Field3",
  body: "One immutable scalar sampled over (x, y, z).",
  motif: "field",
  tone: "accent",
  expression: "f(p) → ℝ",
  event: "FOCUS_FIELD",
});
const graph = stageCard("graph", {
  eyebrow: "Geometry",
  title: "SDF graph",
  body: "Offset and boolean nodes displace the surface.",
  motif: "graph",
  tone: "info",
  expression: "min(a, b) − k",
  event: "FOCUS_GRAPH",
});
const brush = stageCard("brush", {
  eyebrow: "Material",
  title: "Field brush",
  body: "The same field chooses the block.",
  motif: "brush",
  tone: "warning",
  expression: "f(p) → block",
  event: "FOCUS_BRUSH",
});
const shape = stageCard("shape", {
  eyebrow: "Shape",
  title: "Bounded shape",
  body: "Zero crossing sampled at voxel centres.",
  motif: "boundary",
  tone: "info",
  expression: "d(p) ≤ 0",
  event: "FOCUS_SHAPE",
});
const fill = stageCard("fill", {
  eyebrow: "Compose",
  title: "fill",
  body: "Shape decides where, brush decides what.",
  motif: "blocks",
  tone: "success",
  expression: "fill(shape, brush)",
  event: "FOCUS_FILL",
});
const schematic = stageCard("schematic", {
  eyebrow: "Output",
  title: "Schematic",
  body: "Blocks on the lattice, ready to edit or export.",
  motif: "cube",
  tone: "success",
  expression: "p → block",
  event: "FOCUS_SCHEMATIC",
});

const insight = stack(
  "insight",
  [
    eyebrow("insight-eyebrow", "Insight"),
    caption("insight-title", "Choose a stage to focus it", {
      bind: { text: "insightTitle" },
      tone: "text",
    }),
    caption("insight-body", STAGE_COPY.field.explanation, {
      bind: { text: "insightBody" },
      maxLines: 3,
    }),
  ],
  {
    gap: 4,
    padding: [12, 16],
    frame: { fill: "surfaceMuted", stroke: "border", dash: "dashed" },
    width: "fill",
  },
);

export const sdfAndFieldsScene: SceneDefinition = defineScene({
  schemaVersion: 2,
  id: "sdf-and-fields",
  title: "SDF and scalar field construction",
  description:
    "A reusable scalar field branches into geometry displacement and material colour. The displaced SDF becomes a bounded shape and joins the field brush in a schematic fill.",
  breakpoints: { wide: 900, compact: 600 },
  root: stack(
    "root",
    [
      flowLayout(
        "pipeline",
        [
          stack("col-field", [field], { width: "fill", justify: "center", align: "stretch" }),
          stack("col-branch", [graph, brush], {
            width: "fill",
            gap: { wide: 44, compact: 28 },
            align: "stretch",
          }),
          stack("col-shape", [shape], { width: "fill", align: "stretch" }),
          stack("col-fill", [fill], { width: "fill", justify: "center", align: "stretch" }),
          stack("col-out", [schematic], { width: "fill", justify: "center", align: "stretch" }),
        ],
        {
          gap: { wide: 64, compact: 28 },
          align: "stretch",
          width: "fill",
          padding: { wide: 0, compact: [0, 22] },
        },
      ),
      insight,
    ],
    { gap: 20, width: "fill" },
  ),
  edges: [
    {
      id: "field-graph",
      from: { node: "field", side: { wide: "right", compact: "bottom" } },
      to: { node: "graph", side: { wide: "left", compact: "top" } },
      route: { wide: "curve", compact: "orthogonal" },
      head: "arrow",
      packets: { count: 2, period: 2200 },
      description: "The field feeds the SDF graph",
      bind: { highlight: "edgeFieldGraph" },
    },
    {
      id: "field-brush",
      from: { node: "field", side: { wide: "right", compact: "left" } },
      to: { node: "brush", side: { wide: "left", compact: "left" } },
      route: { wide: "curve", compact: "orthogonal" },
      head: "arrow",
      packets: { count: 2, period: 2200 },
      description: "The same field feeds the brush",
      bind: { highlight: "edgeFieldBrush" },
    },
    {
      id: "graph-shape",
      from: { node: "graph", side: { wide: "right", compact: "right" } },
      to: { node: "shape", side: { wide: "left", compact: "right" } },
      route: { wide: "straight", compact: "orthogonal" },
      head: "arrow",
      labels: [{ text: "bounded", placement: "middle", hidden: { wide: false, compact: true } }],
      description: "Bounding the graph yields a shape",
      bind: { highlight: "edgeGraphShape" },
    },
    {
      id: "shape-fill",
      from: { node: "shape", side: { wide: "right", compact: "bottom" } },
      to: { node: "fill", side: { wide: "left", compact: "top" } },
      route: { wide: "curve", compact: "orthogonal" },
      head: "arrow",
      description: "The shape enters fill",
      bind: { highlight: "edgeShapeFill" },
    },
    {
      id: "brush-fill",
      from: { node: "brush", side: { wide: "right", compact: "left" } },
      to: { node: "fill", side: { wide: "left", compact: "left" } },
      route: { wide: "curve", compact: "orthogonal" },
      head: "arrow",
      description: "The brush enters fill",
      bind: { highlight: "edgeBrushFill" },
    },
    {
      id: "fill-schematic",
      from: { node: "fill", side: { wide: "right", compact: "bottom" } },
      to: { node: "schematic", side: { wide: "left", compact: "top" } },
      route: { wide: "straight", compact: "orthogonal" },
      head: "triangle",
      stroke: "flow",
      description: "fill writes the schematic",
      bind: { highlight: "edgeFillSchematic" },
    },
  ],
  timeline: timeline([
    reveal("field", 100, 600, { scale: 0.96 }),
    drawEdge("field-graph", 650, 1150),
    drawEdge("field-brush", 650, 1150),
    flow("field-graph", 1150),
    flow("field-brush", 1150),
    reveal("graph", 900, 1400, { scale: 0.96 }),
    reveal("brush", 900, 1400, { scale: 0.96 }),
    drawEdge("graph-shape", 1500, 1950),
    reveal("shape", 1750, 2250, { scale: 0.96 }),
    drawEdge("shape-fill", 2350, 2800),
    drawEdge("brush-fill", 2350, 2800),
    reveal("fill", 2600, 3100, { scale: 0.96 }),
    highlight("fill", 3100, 3600, 1, 0),
    drawEdge("fill-schematic", 3300, 3750),
    reveal("schematic", 3550, 4050, { scale: 0.96 }),
    progressTo("schematic-body", 3900, 4600),
    fadeIn("insight", 4300, 4900),
  ]),
  machine,
  controls: [
    ...STAGES.map((stage) => ({
      id: `focus-${stage}`,
      label: STAGE_LABEL[stage],
      event: `FOCUS_${stage.toUpperCase()}`,
      group: "Focus stage",
      description: STAGE_COPY[stage].title,
      activeWhen: { var: "stage", op: "eq" as const, value: stage },
    })),
    { id: "reset", kind: "reset" as const, label: "Show all" },
  ],
  metadata: { source: "sdf-and-fields/sdf-field-pipeline.svg" },
});

export const sdfAndFieldsEntry: CatalogueEntry = {
  slug: "sdf-and-fields",
  order: 3,
  title: "SDF and fields",
  summary: "One scalar field drives both surface displacement and material colour.",
  concept: "SDF and fields: preserve and improve the existing first scene.",
  interaction:
    "Focus any stage (click, keyboard, or the step buttons) to read why it exists and light up its connectors.",
  animation:
    "The field branches into geometry and material, the graph becomes a bounded shape, and both branches merge in fill.",
  source: "sdf-and-fields/sdf-field-pipeline.svg",
  scene: sdfAndFieldsScene,
};
