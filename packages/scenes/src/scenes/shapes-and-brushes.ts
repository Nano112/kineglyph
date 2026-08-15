import {
  defineScene,
  drawEdge,
  fadeIn,
  flow,
  pulse,
  reveal,
  timeline,
  type Paint,
  type SceneDefinition,
  type SceneNode,
  type SignalExpression,
  type StateMachineDefinition,
  type TimelineTrack,
} from "@kineglyph/core";
import type { CatalogueEntry } from "../catalogue.js";
import { caption, card, code, grid, row, stack } from "../recipes.js";

/**
 * Shapes and brushes: a shape is a mask that says where, a brush is a rule that says what, and
 * BuildingTool.fill composes them into a filled schematic. Both grids are 6 × 6 voxel slices.
 */

const SIZE = 6;
const CELL = 14;
const CELL_GAP = 2;
const GRID_WIDTH = SIZE * CELL + (SIZE - 1) * CELL_GAP;
const CENTRE = (SIZE - 1) / 2;

const SHAPES = ["sphere", "box"] as const;
const BRUSHES = ["solid", "stripes", "gradient"] as const;
type Shape = (typeof SHAPES)[number];
type Brush = (typeof BRUSHES)[number];

/** Squared distance from the slice centre, in cells. */
function radius2(r: number, c: number): number {
  return (r - CENTRE) ** 2 + (c - CENTRE) ** 2;
}
const inSphere = (r: number, c: number): boolean => radius2(r, c) <= 6.5;
const inBox = (r: number, c: number): boolean =>
  Math.abs(r - CENTRE) <= 1.5 && Math.abs(c - CENTRE) <= 1.5;

type Membership = "both" | "sphere" | "none";
function membership(r: number, c: number): Membership {
  if (inBox(r, c)) return "both";
  return inSphere(r, c) ? "sphere" : "none";
}

const SHAPE_COPY: Record<Shape, { title: string; call: string; cells: string; noun: string }> = {
  sphere: { title: "Shape.sphere", call: "sphere(c, r = 2.5)", cells: "24 cells", noun: "sphere" },
  box: { title: "Shape.box", call: "box(min, max)", cells: "16 cells", noun: "box" },
};

const BRUSH_COPY: Record<
  Brush,
  { title: string; call: string; body: string; adjective: string; swatches: readonly Paint[] }
> = {
  solid: {
    title: "Solid brush",
    call: "Brush::solid(id)",
    body: "One block wherever the shape says yes.",
    adjective: "solid",
    swatches: ["warning", "warning", "warning", "warning", "warning"],
  },
  stripes: {
    title: "Stripes brush",
    call: "Brush::stripes(a, b)",
    body: "Two blocks alternate row by row.",
    adjective: "striped",
    swatches: ["warning", "info", "warning", "info", "warning"],
  },
  gradient: {
    title: "Gradient brush",
    call: "Brush::gradient(curve)",
    body: "A curve maps height to a run of blocks.",
    adjective: "graded",
    swatches: ["warning", "warning", "success", "success", "info"],
  },
};

/** The material a brush assigns to a row of the slice. */
function brushTone(brush: Brush, r: number): Paint {
  switch (brush) {
    case "solid":
      return "warning";
    case "stripes":
      return r % 2 === 0 ? "warning" : "info";
    case "gradient":
      return r < 2 ? "warning" : r < 4 ? "success" : "info";
  }
}

const matchBrush = (cases: Record<Brush, SignalExpression>): SignalExpression => ({
  match: { var: "brush" },
  cases,
});
const matchShape = (cases: Record<Shape, SignalExpression>): SignalExpression => ({
  match: { var: "shape" },
  cases,
});

const rowSignals: Record<string, SignalExpression> = {};
for (let r = 0; r < SIZE; r += 1) {
  rowSignals[`fillBoth${r}`] = matchBrush({
    solid: brushTone("solid", r),
    stripes: brushTone("stripes", r),
    gradient: brushTone("gradient", r),
  });
}
for (let r = 0; r < SIZE; r += 1) {
  rowSignals[`fillSphere${r}`] = {
    when: { var: "shape", op: "eq", value: "sphere" },
    then: { signal: `fillBoth${r}` },
    else: "none",
  };
}

const machine: StateMachineDefinition = {
  id: "shape-brush-composer",
  initial: "compose",
  variables: { shape: "sphere", brush: "stripes" },
  states: {
    compose: {
      on: {
        SHAPE_SPHERE: {
          target: "compose",
          actions: [{ type: "set", var: "shape", value: "sphere" }],
        },
        SHAPE_BOX: { target: "compose", actions: [{ type: "set", var: "shape", value: "box" }] },
        BRUSH_SOLID: {
          target: "compose",
          actions: [{ type: "set", var: "brush", value: "solid" }],
        },
        BRUSH_STRIPES: {
          target: "compose",
          actions: [{ type: "set", var: "brush", value: "stripes" }],
        },
        BRUSH_GRADIENT: {
          target: "compose",
          actions: [{ type: "set", var: "brush", value: "gradient" }],
        },
      },
    },
  },
  signals: {
    shapeTitle: matchShape({ sphere: SHAPE_COPY.sphere.title, box: SHAPE_COPY.box.title }),
    shapeCall: matchShape({ sphere: SHAPE_COPY.sphere.call, box: SHAPE_COPY.box.call }),
    shapeCells: matchShape({ sphere: SHAPE_COPY.sphere.cells, box: SHAPE_COPY.box.cells }),
    maskSphereOnly: {
      when: { var: "shape", op: "eq", value: "sphere" },
      then: "info",
      else: "none",
    },
    brushTitle: matchBrush({
      solid: BRUSH_COPY.solid.title,
      stripes: BRUSH_COPY.stripes.title,
      gradient: BRUSH_COPY.gradient.title,
    }),
    brushCall: matchBrush({
      solid: BRUSH_COPY.solid.call,
      stripes: BRUSH_COPY.stripes.call,
      gradient: BRUSH_COPY.gradient.call,
    }),
    brushBody: matchBrush({
      solid: BRUSH_COPY.solid.body,
      stripes: BRUSH_COPY.stripes.body,
      gradient: BRUSH_COPY.gradient.body,
    }),
    ...Object.fromEntries(
      [0, 1, 2, 3, 4].map((index) => [
        `swatch${index}`,
        matchBrush({
          solid: BRUSH_COPY.solid.swatches[index] ?? "warning",
          stripes: BRUSH_COPY.stripes.swatches[index] ?? "warning",
          gradient: BRUSH_COPY.gradient.swatches[index] ?? "warning",
        }),
      ]),
    ),
    ...rowSignals,
    resultCaption: {
      concat: [
        "A ",
        matchBrush({
          solid: BRUSH_COPY.solid.adjective,
          stripes: BRUSH_COPY.stripes.adjective,
          gradient: BRUSH_COPY.gradient.adjective,
        }),
        " voxel ",
        matchShape({ sphere: SHAPE_COPY.sphere.noun, box: SHAPE_COPY.box.noun }),
        ", one block per selected cell.",
      ],
    },
  },
};

/** One voxel cell. Empty cells stay outlined; selected cells take a tone or a bound tone signal. */
function cell(id: string, tone: Paint | undefined, signal: string | undefined): SceneNode {
  return {
    id,
    type: "rect",
    width: CELL,
    height: CELL,
    radius: 2,
    fill: tone ?? "none",
    stroke: "border",
    ...(signal === undefined ? {} : { bind: { tone: signal } }),
  };
}

function maskGrid(): SceneNode {
  const cells: SceneNode[] = [];
  for (let r = 0; r < SIZE; r += 1)
    for (let c = 0; c < SIZE; c += 1) {
      const kind = membership(r, c);
      cells.push(
        cell(
          `mask-${r}-${c}`,
          kind === "both" ? "info" : undefined,
          kind === "sphere" ? "maskSphereOnly" : undefined,
        ),
      );
    }
  return grid("mask", cells, { columns: SIZE, gap: CELL_GAP, width: GRID_WIDTH });
}

function resultGrid(): SceneNode {
  const cells: SceneNode[] = [];
  for (let r = 0; r < SIZE; r += 1)
    for (let c = 0; c < SIZE; c += 1) {
      const kind = membership(r, c);
      cells.push(
        cell(
          `voxel-${r}-${c}`,
          undefined,
          kind === "both" ? `fillBoth${r}` : kind === "sphere" ? `fillSphere${r}` : undefined,
        ),
      );
    }
  return grid("voxels", cells, { columns: SIZE, gap: CELL_GAP, width: GRID_WIDTH });
}

function slot(id: string, child: SceneNode): SceneNode {
  return stack(`${id}-slot`, [child], { width: "fill", align: "stretch" });
}

const shape = card("shape", {
  eyebrow: "Shape · where",
  title: SHAPE_COPY.sphere.title,
  titleBind: { text: "shapeTitle" },
  motif: "sphere",
  tone: "info",
  compact: true,
  label: "Shape",
  description: "A mask that selects cells and says nothing about material.",
  extras: [
    row(
      "shape-detail",
      [
        maskGrid(),
        stack(
          "shape-notes",
          [
            caption("shape-body", "Selects cells; says nothing about material.", { maxLines: 3 }),
            code("shape-call", SHAPE_COPY.sphere.call, {
              tone: "info",
              bind: { text: "shapeCall" },
            }),
            caption("shape-cells", SHAPE_COPY.sphere.cells, { bind: { text: "shapeCells" } }),
          ],
          { gap: 4, width: "fill" },
        ),
      ],
      { gap: 14, align: "center", width: "fill" },
    ),
  ],
});

const swatches = row(
  "brush-swatches",
  [0, 1, 2, 3, 4].map((index) => ({
    id: `swatch-${index}`,
    type: "rect" as const,
    width: 26,
    height: 14,
    radius: 3,
    fill: BRUSH_COPY.stripes.swatches[index] ?? "warning",
    stroke: "none" as const,
    bind: { tone: `swatch${index}` },
  })),
  { gap: 3 },
);

const brush = card("brush", {
  eyebrow: "Brush · what",
  title: BRUSH_COPY.stripes.title,
  titleBind: { text: "brushTitle" },
  body: BRUSH_COPY.stripes.body,
  bodyBind: { text: "brushBody" },
  motif: "brush",
  tone: "warning",
  compact: true,
  label: "Brush",
  extras: [
    swatches,
    code("brush-call", BRUSH_COPY.stripes.call, { tone: "warning", bind: { text: "brushCall" } }),
  ],
});

const fill = card("fill", {
  eyebrow: "Compose",
  title: "BuildingTool.fill",
  body: "Shape decides where, brush decides what.",
  motif: "blocks",
  tone: "success",
  compact: true,
  extras: [code("fill-call", "tool.fill(shape, brush)", { tone: "success" })],
});

const schematic = card("schematic", {
  eyebrow: "Result",
  title: "Filled schematic",
  motif: "cube",
  tone: "success",
  compact: true,
  label: "Filled schematic",
  description: "The composed build: one block per selected cell.",
  extras: [
    row(
      "schematic-detail",
      [
        resultGrid(),
        caption("schematic-caption", "A striped voxel sphere, one block per selected cell.", {
          bind: { text: "resultCaption" },
          maxLines: 4,
          width: "fill",
        }),
      ],
      { gap: 14, align: "center", width: "fill" },
    ),
  ],
});

/** Mask cells light up ring by ring from the centre; result rows build from the bottom up. */
function cellTracks(): TimelineTrack[] {
  const tracks: TimelineTrack[] = [];
  const RING_START: Record<number, number> = { 0.5: 560, 2.5: 700, 4.5: 840, 6.5: 980 };
  for (let r = 0; r < SIZE; r += 1)
    for (let c = 0; c < SIZE; c += 1) {
      if (inSphere(r, c)) {
        const start = RING_START[radius2(r, c)] ?? 980;
        tracks.push(fadeIn(`mask-${r}-${c}`, start, start + 240));
      }
      const rowStart = 3350 + (SIZE - 1 - r) * 130;
      tracks.push(fadeIn(`voxel-${r}-${c}`, rowStart, rowStart + 260));
    }
  return tracks;
}

export const shapesAndBrushesScene: SceneDefinition = defineScene({
  schemaVersion: 2,
  id: "shapes-and-brushes",
  title: "Shapes and brushes: where meets what in BuildingTool.fill",
  description:
    "A shape is a mask that selects cells and a brush is a rule that assigns material. BuildingTool.fill visits every selected cell, asks the brush for a block, and writes a filled schematic; swap the shape or brush to see the result change.",
  breakpoints: { wide: 900, compact: 600 },
  root: {
    id: "pipeline",
    type: "group",
    layout: { wide: "row", narrow: "stack" },
    gap: { wide: 60, compact: 44, narrow: 30 },
    align: "stretch",
    width: "fill",
    padding: { wide: 0, narrow: [0, 22] },
    children: [
      stack("col-inputs", [slot("shape", shape), slot("brush", brush)], {
        gap: { wide: 44, compact: 36, narrow: 30 },
        width: "fill",
        grow: 1,
        align: "stretch",
      }),
      {
        id: "col-process",
        type: "group",
        layout: { wide: "row", compact: "stack" },
        gap: { wide: 60, compact: 44, narrow: 30 },
        align: { wide: "center", compact: "stretch" },
        justify: { wide: "start", compact: "between", narrow: "start" },
        width: "fill",
        height: "fill",
        grow: { wide: 2, compact: 1 },
        children: [slot("fill", fill), slot("schematic", schematic)],
      },
    ],
  },
  edges: [
    {
      id: "shape-fill",
      from: { node: "shape", side: { wide: "right", narrow: "left" } },
      to: { node: "fill", side: "left" },
      route: { wide: "curve", compact: "orthogonal" },
      head: "arrow",
      tone: "info",
      packets: { count: 2, period: 2000 },
      labels: [{ text: "where", placement: "middle", hidden: { wide: false, compact: true } }],
      description: "The shape tells fill where to place blocks",
    },
    {
      id: "brush-fill",
      from: { node: "brush", side: { wide: "right", narrow: "bottom" } },
      to: { node: "fill", side: { wide: "left", narrow: "top" } },
      route: { wide: "curve", compact: "orthogonal" },
      head: "arrow",
      tone: "warning",
      packets: { count: 2, period: 2000 },
      labels: [{ text: "what", placement: "middle", hidden: { wide: false, compact: true } }],
      description: "The brush tells fill what block each cell gets",
    },
    {
      id: "fill-schematic",
      from: { node: "fill", side: { wide: "right", compact: "bottom" } },
      to: { node: "schematic", side: { wide: "left", compact: "top" } },
      route: "straight",
      head: "triangle",
      stroke: "flow",
      tone: "success",
      labels: [{ text: "build", placement: "middle", hidden: { wide: false, compact: true } }],
      description: "fill writes the composed blocks into a schematic",
    },
  ],
  timeline: timeline([
    reveal("shape-slot", 100, 500, { scale: 0.97 }),
    reveal("brush-slot", 1150, 1550, { scale: 0.97 }),
    ...[0, 1, 2, 3, 4].flatMap((index) =>
      reveal(`swatch-${index}`, 1500 + index * 90, 1760 + index * 90, { offset: 6 }),
    ),
    drawEdge("shape-fill", 1950, 2400),
    drawEdge("brush-fill", 1950, 2400),
    flow("shape-fill", 2400),
    flow("brush-fill", 2400),
    reveal("fill-slot", 2150, 2550, { scale: 0.97 }),
    pulse("fill-motif", 2500, 600),
    drawEdge("fill-schematic", 2750, 3150),
    reveal("schematic-slot", 2900, 3300, { scale: 0.97 }),
    ...cellTracks(),
  ]),
  machine,
  controls: [
    ...SHAPES.map((key) => ({
      id: `shape-${key}`,
      label: SHAPE_COPY[key].title,
      event: `SHAPE_${key.toUpperCase()}`,
      group: "Shape",
      description: `Select cells with ${SHAPE_COPY[key].call}`,
      activeWhen: { var: "shape", op: "eq" as const, value: key },
    })),
    ...BRUSHES.map((key) => ({
      id: `brush-${key}`,
      label: BRUSH_COPY[key].title,
      event: `BRUSH_${key.toUpperCase()}`,
      group: "Brush",
      description: BRUSH_COPY[key].body,
      activeWhen: { var: "brush", op: "eq" as const, value: key },
    })),
    { id: "reset", kind: "reset" as const, label: "Reset" },
  ],
  metadata: { source: "shapes-brushes/shape-brush-map.svg" },
});

export const shapesAndBrushesEntry: CatalogueEntry = {
  slug: "shapes-and-brushes",
  order: 2,
  title: "Shapes and brushes",
  summary:
    "A shape selects cells, a brush assigns material, and BuildingTool.fill composes them into a build.",
  concept:
    "Shapes and brushes: shape says where, brush says what, and their composition produces a schematic.",
  interaction:
    "Switch the shape (sphere or box) and the brush (solid, stripes, gradient) to recompose the filled voxel slice.",
  animation:
    "The mask lights up ring by ring, the brush swatches read left to right, both feed fill, and the result builds row by row from the bottom.",
  source: "shapes-brushes/shape-brush-map.svg",
  scene: shapesAndBrushesScene,
};
