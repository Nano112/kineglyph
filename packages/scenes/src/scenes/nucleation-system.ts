import {
  alphaGradient,
  defineScene,
  drawEdge,
  flow,
  linearGradient,
  material,
  radialGradient,
  reveal,
  timeline,
  type EdgeDefinition,
  type GroupNode,
  type Paint,
  type SceneControl,
  type SceneDefinition,
  type SceneNode,
  type SignalExpression,
  type StateMachineDefinition,
} from "@kineglyph/core";
import type { CatalogueEntry } from "../catalogue.js";
import { caption, code, eyebrow, heading, motif, row, stack, title } from "../recipes.js";

type Tone = "accent" | "info" | "success" | "warning" | "danger";

interface FocusSpec {
  readonly key: string;
  readonly label: string;
  readonly node: string;
  readonly title: string;
  readonly body: string;
}

function eventName(key: string): string {
  return `FOCUS_${key.replaceAll("-", "_").toUpperCase()}`;
}

function focusModel(
  id: string,
  specs: readonly FocusSpec[],
  overview: { readonly title: string; readonly body: string },
): { readonly machine: StateMachineDefinition; readonly controls: readonly SceneControl[] } {
  const transitions = {
    ...Object.fromEntries(specs.map((spec) => [eventName(spec.key), spec.key])),
    RESET: "overview",
  };
  const signals: Record<string, SignalExpression> = {
    detailTitle: {
      match: { var: "focus" },
      cases: Object.fromEntries(specs.map((spec) => [spec.key, spec.title])),
      default: overview.title,
    },
    detailBody: {
      match: { var: "focus" },
      cases: Object.fromEntries(specs.map((spec) => [spec.key, spec.body])),
      default: overview.body,
    },
  };
  for (const spec of specs) {
    signals[`${spec.key}Focus`] = {
      when: { var: "focus", op: "eq", value: spec.key },
      then: 1,
      else: 0,
    };
    signals[`${spec.key}Dim`] = {
      when: { var: "focus", op: "in", value: ["none", spec.key] },
      then: 1,
      else: 0.32,
    };
  }
  return {
    machine: {
      id,
      initial: "overview",
      variables: { focus: "none" },
      states: {
        overview: {
          entry: [
            { type: "set", var: "focus", value: "none" },
            { type: "select", node: null },
          ],
          on: transitions,
        },
        ...Object.fromEntries(
          specs.map((spec) => [
            spec.key,
            {
              entry: [
                { type: "set", var: "focus", value: spec.key },
                { type: "select", node: spec.node },
              ],
              on: transitions,
            },
          ]),
        ),
      },
      signals,
    },
    controls: [
      ...specs.map((spec) => ({
        id: `${id}-${spec.key}`,
        label: spec.label,
        event: eventName(spec.key),
        activeWhen: { var: "focus", op: "eq" as const, value: spec.key },
      })),
      { id: `${id}-reset`, kind: "reset" as const, label: "Show all" },
    ],
  };
}

function interactive(spec: FocusSpec) {
  return {
    interactive: true as const,
    onActivate: eventName(spec.key),
    bind: { highlight: `${spec.key}Focus`, opacity: `${spec.key}Dim` },
    label: spec.title,
    description: spec.body,
  };
}

function detailRail(id: string): GroupNode {
  return row(
    `${id}-detail`,
    [
      motif(`${id}-detail-mark`, "target", { tone: "accent", size: 18 }),
      stack(
        `${id}-detail-copy`,
        [
          heading(`${id}-detail-title`, "", { bind: { text: "detailTitle" }, width: "fill" }),
          caption(`${id}-detail-body`, "", {
            bind: { text: "detailBody" },
            maxLines: { wide: 2, compact: 3, narrow: 5 },
            width: "fill",
          }),
        ],
        { gap: 2, width: "fill" },
      ),
    ],
    {
      gap: 12,
      align: "center",
      padding: [11, 14],
      frame: material("inset", { radius: 6 }),
      width: "fill",
    },
  );
}

function artboard(
  id: string,
  label: string,
  headline: string,
  visual: SceneNode,
  detail = true,
): GroupNode {
  return stack(
    `${id}-root`,
    [
      row(
        `${id}-head`,
        [
          stack(
            `${id}-head-copy`,
            [eyebrow(`${id}-label`, label, { tone: "accent" }), title(`${id}-title`, headline)],
            { gap: 3, width: "fill" },
          ),
          code(`${id}-stamp`, "NUCLEATION / KINEGLYPH", {
            tone: "muted",
            hidden: { wide: false, compact: true },
          }),
        ],
        { align: "end", justify: "between", width: "fill" },
      ),
      visual,
      ...(detail ? [detailRail(id)] : []),
    ],
    {
      gap: { wide: 20, compact: 16, narrow: 14 },
      padding: { wide: 24, compact: 20, narrow: 16 },
      frame: material("flat"),
      width: "fill",
    },
  );
}

function labelBlock(id: string, overline: string, name: string, note: string): GroupNode {
  return stack(
    id,
    [eyebrow(`${id}-eyebrow`, overline), heading(`${id}-name`, name), caption(`${id}-note`, note)],
    { gap: 2, width: "fill" },
  );
}

function token(id: string, text: string, tone: Paint = "accent"): GroupNode {
  return stack(id, [code(`${id}-text`, text, { tone, align: "center", width: "fill" })], {
    padding: [8, 10],
    frame: material("raised", { radius: 4 }),
    align: "center",
    width: "fill",
  });
}

function sceneTimeline(nodes: readonly string[], edges: readonly string[] = []) {
  const nodeTracks = nodes.flatMap((node, index) =>
    reveal(node, 80 + index * 120, 440 + index * 120, { offset: 8, scale: 0.985 }),
  );
  const edgeBase = 360 + nodes.length * 80;
  const edgeTracks = edges.flatMap((edge, index) => [
    ...drawEdge(edge, edgeBase + index * 140, edgeBase + 360 + index * 140),
    flow(edge, edgeBase + 360 + index * 140),
  ]);
  return timeline(
    [...nodeTracks, ...edgeTracks],
    Math.max(1_200, edgeBase + edges.length * 140 + 480),
  );
}

function entry(
  order: number,
  slug: string,
  titleText: string,
  summary: string,
  scene: SceneDefinition,
  interaction: string,
  animation: string,
): CatalogueEntry {
  return {
    slug,
    order,
    title: titleText,
    summary,
    concept: summary,
    interaction,
    animation,
    source: `${slug}.svg`,
    scene,
  };
}

// Fast generation ---------------------------------------------------------------------------

const FAST: readonly (FocusSpec & {
  readonly input: string;
  readonly api: string;
  readonly metric: string;
  readonly tone: Tone;
})[] = [
  {
    key: "dense",
    label: "Dense",
    node: "fast-dense",
    title: "A dense box is a bounds problem",
    body: "fill_cuboid grows the bounds once and resolves one block id for the entire volume.",
    input: "solid bounds",
    api: "fill_cuboid",
    metric: "1 call",
    tone: "accent",
  },
  {
    key: "sparse",
    label: "Sparse",
    node: "fast-sparse",
    title: "Sparse equal blocks travel as one batch",
    body: "set_blocks crosses the binding once with an array of positions and one parsed descriptor.",
    input: "positions[]",
    api: "set_blocks",
    metric: "1 parse",
    tone: "info",
  },
  {
    key: "mixed",
    label: "Mixed",
    node: "fast-mixed",
    title: "Resolve mixed ids before the hot loop",
    body: "prepare turns block states into palette indices once; place writes those indices in the loop.",
    input: "(pos, id) × N",
    api: "prepare + place",
    metric: "N ids once",
    tone: "warning",
  },
  {
    key: "geometry",
    label: "Geometry",
    node: "fast-geometry",
    title: "Geometry pays for shape and material",
    body: "BuildingTool.fill evaluates the shape and brush per selected cell because both affect the result.",
    input: "shape × brush",
    api: "BuildingTool.fill",
    metric: "per cell",
    tone: "success",
  },
];

const fastFocus = focusModel("fast-workload", FAST, {
  title: "Match the operation to the shape of the input",
  body: "Bulk generation is fastest when the API can resolve bounds, descriptors, or palettes outside the per-cell loop.",
});

function workloadLane(spec: (typeof FAST)[number], index: number): GroupNode {
  const cells: SceneNode[] = Array.from({ length: 7 }, (_, cellIndex) => ({
    id: `fast-${spec.key}-cell-${cellIndex}`,
    type: "rect" as const,
    width: cellIndex < 2 + index ? 10 : 6,
    height: 10,
    radius: 2,
    fill: cellIndex < 2 + index ? spec.tone : "surfaceMuted",
    stroke: "none" as const,
  }));
  return {
    ...row(
      `fast-${spec.key}`,
      [
        row(`fast-${spec.key}-sample`, cells, { gap: 4, width: { wide: 112, narrow: "fill" } }),
        labelBlock(`fast-${spec.key}-copy`, "WORKLOAD", spec.input, spec.metric),
        {
          id: `fast-${spec.key}-track`,
          type: "rect",
          width: "fill",
          height: 2,
          fill: spec.tone,
          stroke: "none",
        },
        token(`fast-${spec.key}-api`, spec.api, spec.tone),
      ],
      {
        gap: { wide: 18, compact: 12 },
        align: "center",
        padding: [12, 14],
        frame: material(index === 0 ? "floating" : "raised", { radius: 6 }),
        width: "fill",
      },
    ),
    layout: { wide: "row", compact: "row", narrow: "stack" },
    ...interactive(spec),
  };
}

export const fastGenerationScene: SceneDefinition = defineScene({
  schemaVersion: 2,
  id: "fast-generation",
  title: "Fast schematic generation",
  description: "Four workload shapes aligned with the bulk operation that avoids unnecessary work.",
  breakpoints: { wide: 780, compact: 520 },
  background: "canvas",
  root: artboard(
    "fast",
    "FAST GENERATION",
    "The input already tells you the fast path.",
    stack("fast-lanes", FAST.map(workloadLane), { gap: 10, width: "fill" }),
  ),
  machine: fastFocus.machine,
  controls: fastFocus.controls,
  timeline: sceneTimeline(FAST.map((spec) => `fast-${spec.key}`)),
  metadata: { source: "fast-generation/operation-map.svg", revision: 2 },
});

export const fastGenerationEntry = entry(
  1,
  "fast-generation",
  "Fast generation",
  "Workload fingerprints line up with the bulk call that moves parsing and bounds work out of the loop.",
  fastGenerationScene,
  "Focus a workload to isolate its data shape, cost, and bulk API.",
  "The four lanes settle into place from the cheapest fixed-cost path to per-cell geometry.",
);

// Shapes and brushes ------------------------------------------------------------------------

const SHAPE_SIZE = 7;
const SHAPE_CENTER = 3;

function voxelGrid(id: string, result: boolean): GroupNode {
  const cells: SceneNode[] = [];
  for (let y = 0; y < SHAPE_SIZE; y += 1)
    for (let x = 0; x < SHAPE_SIZE; x += 1) {
      const inside = (x - SHAPE_CENTER) ** 2 + (y - SHAPE_CENTER) ** 2 <= 9;
      const tone: Paint = result ? (y < 2 ? "warning" : y < 5 ? "accent" : "info") : "info";
      cells.push({
        id: `${id}-${y}-${x}`,
        type: "rect",
        width: 15,
        height: 15,
        radius: 2,
        fill: inside ? tone : "none",
        stroke: inside ? tone : "border",
        opacity: inside ? 1 : 0.42,
      });
    }
  return {
    id,
    type: "group",
    layout: "grid",
    columns: SHAPE_SIZE,
    gap: 3,
    width: 123,
    children: cells,
  };
}

const SHAPE_FOCUS: readonly FocusSpec[] = [
  {
    key: "mask",
    label: "Shape",
    node: "shape-mask-stage",
    title: "Shape answers where",
    body: "The sphere is only a boolean mask over voxel centres. It knows nothing about block states.",
  },
  {
    key: "brush",
    label: "Brush",
    node: "shape-brush-stage",
    title: "Brush answers what",
    body: "The brush maps position or field values to block states without deciding which cells exist.",
  },
  {
    key: "result",
    label: "Result",
    node: "shape-result-stage",
    title: "fill composes the two contracts",
    body: "BuildingTool.fill visits the selected cells and asks the brush for one block state at each position.",
  },
];
const shapeFocus = focusModel("shape-composition", SHAPE_FOCUS, {
  title: "Geometry and material remain independent",
  body: "A reusable shape can take any brush, and a reusable brush can paint any bounded shape.",
});

function shapeStage(
  spec: FocusSpec,
  content: SceneNode,
  overline: string,
  line: string,
): GroupNode {
  return {
    ...stack(spec.node, [content, labelBlock(`${spec.node}-copy`, overline, spec.label, line)], {
      gap: 12,
      align: "center",
      padding: [18, 16],
      frame: material(spec.key === "result" ? "floating" : "raised", { radius: 8 }),
      width: "fill",
    }),
    ...interactive(spec),
  };
}

const brushRamp = stack(
  "shape-brush-ramp",
  ["warning", "warning", "accent", "accent", "success", "info", "info"].map((tone, index) => ({
    id: `shape-brush-swatch-${index}`,
    type: "rect" as const,
    width: 123,
    height: 15,
    radius: 2,
    fill: tone as Paint,
    stroke: "none" as const,
  })),
  { gap: 3, width: 123 },
);

export const shapesAndBrushesScene: SceneDefinition = defineScene({
  schemaVersion: 2,
  id: "shapes-and-brushes",
  title: "Shapes and brushes",
  description: "A voxel mask and a material ramp compose into a filled, coloured schematic slice.",
  breakpoints: { wide: 760, compact: 520 },
  background: "canvas",
  root: artboard("shape", "SHAPES + BRUSHES", "Where and what are separate decisions.", {
    id: "shape-compositor",
    type: "group",
    layout: { wide: "row", compact: "stack" },
    gap: { wide: 18, compact: 12 },
    align: "stretch",
    width: "fill",
    children: [
      shapeStage(SHAPE_FOCUS[0]!, voxelGrid("shape-mask-grid", false), "MASK", "sphere(c, 3)"),
      stack(
        "shape-plus",
        [title("shape-plus-symbol", "+", { tone: "accent", align: "center", width: "fill" })],
        { justify: "center", width: { wide: 38, compact: "fill" } },
      ),
      shapeStage(SHAPE_FOCUS[1]!, brushRamp, "MATERIAL RULE", "field → palette"),
      stack(
        "shape-equals",
        [title("shape-equals-symbol", "=", { tone: "accent", align: "center", width: "fill" })],
        { justify: "center", width: { wide: 38, compact: "fill" } },
      ),
      shapeStage(
        SHAPE_FOCUS[2]!,
        voxelGrid("shape-result-grid", true),
        "SCHEMATIC",
        "24 selected cells",
      ),
    ],
  }),
  machine: shapeFocus.machine,
  controls: shapeFocus.controls,
  timeline: sceneTimeline([
    "shape-mask-stage",
    "shape-plus",
    "shape-brush-stage",
    "shape-equals",
    "shape-result-stage",
  ]),
  metadata: { source: "shapes-brushes/shape-brush-map.svg", revision: 2 },
});

export const shapesAndBrushesEntry = entry(
  2,
  "shapes-and-brushes",
  "Shapes and brushes",
  "A mask and a material rule remain independent until fill composes them into block states.",
  shapesAndBrushesScene,
  "Inspect the mask, material ramp, or resulting voxel slice.",
  "The composition reads left to right and the finished slice arrives last.",
);

// SDF and fields -----------------------------------------------------------------------------

const SDF_FOCUS: readonly FocusSpec[] = [
  {
    key: "field",
    label: "Field",
    node: "sdf-field",
    title: "One immutable scalar field",
    body: "Field3 returns one number for each position. Geometry and material read that same value.",
  },
  {
    key: "geometry",
    label: "Geometry",
    node: "sdf-geometry",
    title: "The zero crossing becomes occupancy",
    body: "SDF composition and displacement turn the sampled scalar into a bounded solid.",
  },
  {
    key: "material",
    label: "Material",
    node: "sdf-material",
    title: "The field also drives block choice",
    body: "A field brush maps the same scalar to a palette, keeping colour aligned with the surface.",
  },
  {
    key: "schematic",
    label: "Schematic",
    node: "sdf-schematic",
    title: "Both branches meet at fill",
    body: "The result is ordinary editable schematic data, not a separate render-only approximation.",
  },
];
const sdfFocus = focusModel("sdf-flow", SDF_FOCUS, {
  title: "A scalar can shape geometry and material at once",
  body: "Keeping both branches on the same field avoids the drift caused by unrelated noise functions.",
});

function sdfControlTransitions(state: string) {
  return {
    SHAPE_BLOOM: {
      target: state,
      actions: [{ type: "set" as const, var: "shape", value: "bloom" }],
    },
    SHAPE_RINGS: {
      target: state,
      actions: [{ type: "set" as const, var: "shape", value: "rings" }],
    },
    SHAPE_FRAME: {
      target: state,
      actions: [{ type: "set" as const, var: "shape", value: "frame" }],
    },
    MATERIAL_FIELD: {
      target: state,
      actions: [{ type: "set" as const, var: "material", value: "field" }],
    },
    MATERIAL_CALCITE: {
      target: state,
      actions: [{ type: "set" as const, var: "material", value: "calcite" }],
    },
    MATERIAL_COPPER: {
      target: state,
      actions: [{ type: "set" as const, var: "material", value: "copper" }],
    },
  };
}

const sdfMachine: StateMachineDefinition = {
  ...sdfFocus.machine,
  variables: { ...sdfFocus.machine.variables, shape: "bloom", material: "field" },
  states: Object.fromEntries(
    Object.entries(sdfFocus.machine.states).map(([stateId, state]) => [
      stateId,
      {
        ...state,
        on: { ...state.on, ...sdfControlTransitions(stateId) },
      },
    ]),
  ),
};

const sdfControls: readonly SceneControl[] = [
  {
    id: "sdf-shape-bloom",
    label: "Bloom",
    event: "SHAPE_BLOOM",
    group: "Shape",
    activeWhen: { var: "shape", op: "eq", value: "bloom" },
  },
  {
    id: "sdf-shape-rings",
    label: "Rings",
    event: "SHAPE_RINGS",
    group: "Shape",
    activeWhen: { var: "shape", op: "eq", value: "rings" },
  },
  {
    id: "sdf-shape-frame",
    label: "Frame",
    event: "SHAPE_FRAME",
    group: "Shape",
    activeWhen: { var: "shape", op: "eq", value: "frame" },
  },
  {
    id: "sdf-material-field",
    label: "Field ramp",
    event: "MATERIAL_FIELD",
    group: "Material",
    activeWhen: { var: "material", op: "eq", value: "field" },
  },
  {
    id: "sdf-material-calcite",
    label: "Calcite",
    event: "MATERIAL_CALCITE",
    group: "Material",
    activeWhen: { var: "material", op: "eq", value: "calcite" },
  },
  {
    id: "sdf-material-copper",
    label: "Copper",
    event: "MATERIAL_COPPER",
    group: "Material",
    activeWhen: { var: "material", op: "eq", value: "copper" },
  },
];

function contourField(): GroupNode {
  return {
    ...stack(
      "sdf-field",
      [
        {
          id: "sdf-contours",
          type: "group",
          layout: "overlay",
          width: 170,
          height: 150,
          align: "center",
          justify: "center",
          children: [68, 52, 36, 20].map((radius, index) => ({
            id: `sdf-contour-${index}`,
            type: "circle" as const,
            radius,
            fill:
              index === 3
                ? radialGradient([
                    { at: 0, color: "accent", opacity: 0.8 },
                    { at: 1, color: "accent", opacity: 0.08 },
                  ])
                : "none",
            stroke: index % 2 === 0 ? "accent" : "info",
            strokeWidth: 1.5,
            dash: index === 1 ? ("dashed" as const) : ("solid" as const),
          })),
        },
        labelBlock("sdf-field-copy", "FIELD3", "f(x, y, z)", "immutable scalar"),
      ],
      {
        gap: 12,
        align: "center",
        padding: 18,
        frame: material("glass", { radius: 10 }),
        width: "fill",
      },
    ),
    ...interactive(SDF_FOCUS[0]!),
  };
}

function sdfBranch(spec: FocusSpec, kind: "geometry" | "material"): GroupNode {
  const graphic: SceneNode =
    kind === "geometry"
      ? {
          id: "sdf-geometry-shape",
          type: "path",
          d: "M 12 66 C 22 16 52 8 76 30 C 96 48 112 24 128 46 C 146 70 120 110 82 116 C 40 124 4 102 12 66 Z",
          viewBox: { width: 150, height: 130 },
          width: 150,
          height: 120,
          fill: alphaGradient("info", { from: 0.5, to: 0.08, angle: 90 }),
          stroke: "info",
          strokeWidth: 2,
        }
      : stack(
          "sdf-material-ramp",
          ["warning", "success", "accent", "info"].map((tone, index) => ({
            id: `sdf-material-${index}`,
            type: "rect" as const,
            width: 150,
            height: 24,
            fill: tone as Paint,
            stroke: "none" as const,
          })),
          { gap: 4, width: 150 },
        );
  return {
    ...stack(
      spec.node,
      [
        graphic,
        labelBlock(
          `${spec.node}-copy`,
          kind.toUpperCase(),
          spec.label,
          kind === "geometry" ? "d ≤ 0" : "field → block",
        ),
      ],
      {
        gap: 10,
        align: "center",
        padding: 16,
        frame: material("raised", { radius: 8 }),
        width: "fill",
      },
    ),
    ...interactive(spec),
  };
}

const sdfResult = {
  ...stack(
    "sdf-schematic",
    [
      {
        id: "sdf-live-build",
        type: "image" as const,
        src: `data:image/svg+xml,${encodeURIComponent(
          '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 176"><g fill="none" stroke="#8994a3" stroke-width="2"><path d="M120 19 205 62v67l-85 42-85-42V62Z" opacity=".34"/><path d="m35 62 85 43 85-43M120 105v66" opacity=".28"/></g><g fill="#8994a3"><rect x="74" y="65" width="24" height="24" rx="3" opacity=".45"/><rect x="100" y="51" width="24" height="24" rx="3" opacity=".7"/><rect x="126" y="66" width="24" height="24" rx="3" opacity=".52"/><rect x="100" y="79" width="24" height="24" rx="3" opacity=".86"/><rect x="126" y="94" width="24" height="24" rx="3" opacity=".7"/><rect x="74" y="94" width="24" height="24" rx="3" opacity=".6"/></g><circle cx="120" cy="105" r="54" fill="none" stroke="#62d4c3" stroke-width="2" stroke-dasharray="4 7" opacity=".8"/></svg>',
        )}`,
        alt: "Interactive Minecraft schematic generated from the selected SDF",
        fit: "contain" as const,
        live: true,
        width: { wide: 220, compact: 180, narrow: "fill" },
        height: { wide: 176, compact: 150, narrow: 210 },
        radius: 8,
      },
      labelBlock("sdf-result-copy", "LIVE · WASM", "Schematic", "drag to inspect"),
    ],
    {
      gap: 10,
      align: "center",
      padding: { wide: 14, compact: 12, narrow: 14 },
      frame: material("raised", { radius: 10 }),
      width: "fill",
    },
  ),
  ...interactive(SDF_FOCUS[3]!),
};

const sdfEdges: readonly EdgeDefinition[] = [
  {
    id: "sdf-field-geometry",
    from: { node: "sdf-field", side: { wide: "right", compact: "bottom" }, offset: 0.35 },
    to: { node: "sdf-geometry", side: { wide: "left", compact: "top" } },
    route: "arc",
    head: "diamond",
    stroke: "flow",
    packets: { count: 1, period: 1800, tone: "info" },
  },
  {
    id: "sdf-field-material",
    from: { node: "sdf-field", side: { wide: "right", compact: "bottom" }, offset: 0.7 },
    to: { node: "sdf-material", side: { wide: "left", compact: "top" } },
    route: "orthogonal",
    head: "dot",
    stroke: "flow",
    packets: { count: 1, period: 1800, tone: "accent" },
  },
  {
    id: "sdf-geometry-result",
    from: { node: "sdf-geometry", side: { wide: "right", compact: "bottom" } },
    to: { node: "sdf-schematic", side: { wide: "left", compact: "top" }, offset: 0.35 },
    route: "straight",
    head: "triangle",
  },
  {
    id: "sdf-material-result",
    from: { node: "sdf-material", side: { wide: "right", compact: "bottom" } },
    to: { node: "sdf-schematic", side: { wide: "left", compact: "top" }, offset: 0.7 },
    route: "curve",
    head: "triangle",
  },
];

export const sdfAndFieldsScene: SceneDefinition = defineScene({
  schemaVersion: 2,
  id: "sdf-and-fields",
  title: "SDFs and scalar fields",
  description:
    "One scalar field splits into a geometry branch and a material branch before fill recombines them.",
  breakpoints: { wide: 900, compact: 520 },
  background: "canvas",
  root: artboard("sdf", "SDF + FIELDS", "One number. Two readings. One build.", {
    id: "sdf-map",
    type: "group",
    layout: { wide: "row", compact: "row", narrow: "stack" },
    gap: { wide: 64, compact: 30, narrow: 34 },
    align: "stretch",
    width: "fill",
    children: [
      contourField(),
      stack(
        "sdf-branches",
        [sdfBranch(SDF_FOCUS[1]!, "geometry"), sdfBranch(SDF_FOCUS[2]!, "material")],
        {
          gap: 12,
          width: "fill",
        },
      ),
      sdfResult,
    ],
  }),
  edges: sdfEdges,
  machine: sdfMachine,
  controls: sdfControls,
  timeline: sceneTimeline(
    ["sdf-field", "sdf-geometry", "sdf-material", "sdf-schematic"],
    sdfEdges.map((edge) => edge.id),
  ),
  metadata: { source: "sdf-and-fields/sdf-field-pipeline.svg", revision: 2 },
});

export const sdfAndFieldsEntry = entry(
  3,
  "sdf-and-fields",
  "SDF and fields",
  "One scalar field bifurcates into occupancy and material, then recombines as editable blocks.",
  sdfAndFieldsScene,
  "Choose a volume and material, then drag the generated schematic to inspect the result.",
  "Contours arrive first, the two interpretations split apart, and fill closes the loop.",
);

// Palettes and colour ------------------------------------------------------------------------

const COLOR_FOCUS: readonly FocusSpec[] = [
  {
    key: "target",
    label: "Target",
    node: "color-target",
    title: "Start with a measured target",
    body: "The input is a concrete colour in sRGB; comparison happens after conversion to Oklab.",
  },
  {
    key: "lab",
    label: "Oklab",
    node: "color-lab",
    title: "Distance is perceptual",
    body: "Oklab makes similar numerical distances read more like similar visible differences.",
  },
  {
    key: "palette",
    label: "Palette",
    node: "color-palette",
    title: "The palette is a constraint",
    body: "Filters remove unavailable, unsafe, or unwanted blocks before nearest-colour search.",
  },
  {
    key: "methods",
    label: "Methods",
    node: "color-methods",
    title: "Selection method changes the texture",
    body: "Nearest, ramps, gradients, and dithering trade exact local colour for continuity or pattern.",
  },
];
const colorFocus = focusModel("color-laboratory", COLOR_FOCUS, {
  title: "Colour selection is measurement under constraints",
  body: "Convert the target, filter the available blocks, then choose a selection strategy for the surface.",
});

const targetSwatch = {
  ...stack(
    "color-target",
    [
      {
        id: "color-target-swatch",
        type: "rect",
        width: "fill",
        height: 132,
        radius: 8,
        fill: linearGradient(
          [
            { at: 0, color: "warning" },
            { at: 0.52, color: "danger" },
            { at: 1, color: "accent" },
          ],
          { angle: 135 },
        ),
        stroke: "none",
      },
      labelBlock("color-target-copy", "INPUT", "#D78368", "sRGB target"),
    ],
    { gap: 12, padding: 14, frame: material("floating", { radius: 8 }), width: "fill" },
  ),
  ...interactive(COLOR_FOCUS[0]!),
};

const labDisc = {
  ...stack(
    "color-lab",
    [
      {
        id: "color-lab-disc",
        type: "group",
        layout: "overlay",
        width: 138,
        height: 138,
        align: "center",
        justify: "center",
        children: [
          {
            id: "color-lab-outer",
            type: "circle",
            radius: 64,
            fill: radialGradient([
              { at: 0, color: "surface", opacity: 0.1 },
              { at: 0.7, color: "info", opacity: 0.16 },
              { at: 1, color: "accent", opacity: 0.55 },
            ]),
            stroke: "accent",
          },
          {
            id: "color-lab-x",
            type: "rect",
            width: 112,
            height: 1,
            fill: "border",
            stroke: "none",
          },
          {
            id: "color-lab-y",
            type: "rect",
            width: 1,
            height: 112,
            fill: "border",
            stroke: "none",
          },
          {
            id: "color-lab-point",
            type: "circle",
            radius: 7,
            fill: "warning",
            stroke: "surface",
            strokeWidth: 2,
          },
        ],
      },
      labelBlock("color-lab-copy", "SPACE", "Oklab", "ΔE comparison"),
    ],
    {
      gap: 10,
      align: "center",
      padding: 14,
      frame: material("raised", { radius: 8 }),
      width: "fill",
    },
  ),
  ...interactive(COLOR_FOCUS[1]!),
};

const paletteStrip = {
  ...stack(
    "color-palette",
    [
      row(
        "color-blocks",
        ["warning", "danger", "accent", "success", "info", "chart2"].map((tone, index) => ({
          id: `color-block-${index}`,
          type: "rect" as const,
          width: "fill" as const,
          height: 64 + (index % 3) * 12,
          radius: 3,
          fill: tone as Paint,
          stroke: "none" as const,
          opacity: index === 1 ? 0.35 : 1,
        })),
        { gap: 5, align: "end", width: "fill" },
      ),
      labelBlock("color-palette-copy", "FILTER", "Block palette", "available candidates"),
    ],
    { gap: 12, padding: 14, frame: material("inset", { radius: 8 }), width: "fill" },
  ),
  ...interactive(COLOR_FOCUS[2]!),
};

const colorMethods = {
  ...stack(
    "color-methods",
    [
      ["nearest", "one block"],
      ["ramp", "ordered set"],
      ["gradient", "continuous"],
      ["dither", "spatial mix"],
    ].map(([name, note], index) =>
      row(
        `color-method-${name}`,
        [
          {
            id: `color-method-${name}-mark`,
            type: "circle",
            radius: 5 + index,
            fill: COLOR_FOCUS[index % COLOR_FOCUS.length]?.key === "lab" ? "info" : "accent",
            stroke: "none",
          },
          heading(`color-method-${name}-name`, name ?? ""),
          caption(`color-method-${name}-note`, note ?? "", { align: "end", width: "fill" }),
        ],
        { gap: 9, align: "center", width: "fill" },
      ),
    ),
    { gap: 10, padding: 16, frame: material("raised", { radius: 8 }), width: "fill" },
  ),
  ...interactive(COLOR_FOCUS[3]!),
};

export const palettesAndColorScene: SceneDefinition = defineScene({
  schemaVersion: 2,
  id: "palettes-and-color",
  title: "Palettes and colour",
  description:
    "A target colour passes through perceptual measurement and a constrained block palette before four selection methods.",
  breakpoints: { wide: 820, compact: 540 },
  background: "canvas",
  root: artboard(
    "color",
    "PALETTES + COLOUR",
    "Measure first. Constrain second. Choose texture last.",
    {
      id: "color-lab-bench",
      type: "group",
      layout: { wide: "row", compact: "grid", narrow: "stack" },
      columns: { compact: 2, narrow: 1 },
      gap: 12,
      align: "stretch",
      width: "fill",
      children: [targetSwatch, labDisc, paletteStrip, colorMethods],
    },
  ),
  machine: colorFocus.machine,
  controls: colorFocus.controls,
  timeline: sceneTimeline(["color-target", "color-lab", "color-palette", "color-methods"]),
  metadata: { source: "palettes-and-color/color-pipeline.svg", revision: 2 },
});

export const palettesAndColorEntry = entry(
  4,
  "palettes-and-color",
  "Palettes and colour",
  "A colour laboratory separates perceptual measurement, palette constraints, and surface strategy.",
  palettesAndColorScene,
  "Inspect each bench instrument to see the contract it owns.",
  "The target, Oklab disc, block palette, and methods appear in the order data reaches them.",
);

// Smart simulation ---------------------------------------------------------------------------

const SIM: readonly (FocusSpec & {
  readonly question: string;
  readonly answer: string;
  readonly tone: Tone;
})[] = [
  {
    key: "signal",
    label: "Signal",
    node: "sim-signal",
    title: "Known comparator strength needs no world",
    body: "signal(0..15) writes the shorthand state directly when only the encoded level matters.",
    question: "Need a level?",
    answer: "signal",
    tone: "accent",
  },
  {
    key: "placement",
    label: "Placement",
    node: "sim-placement",
    title: "Neighbour-derived state needs placement context",
    body: "Simulated placement resolves stairs, fences, rails, and other states that depend on nearby blocks.",
    question: "Need derived state?",
    answer: "simulate placement",
    tone: "info",
  },
  {
    key: "circuit",
    label: "Circuit",
    node: "sim-circuit",
    title: "Circuit truth belongs to MCHPRS",
    body: "Use the circuit engine when the question is redstone output rather than general world evolution.",
    question: "Need circuit output?",
    answer: "MCHPRS",
    tone: "warning",
  },
  {
    key: "world",
    label: "World",
    node: "sim-world",
    title: "World evolution needs ticks",
    body: "TickSimulation handles scheduled updates, fluids, entities, pistons, and temporal causality.",
    question: "Need time?",
    answer: "TickSimulation",
    tone: "success",
  },
];
const simFocus = focusModel("simulation-choice", SIM, {
  title: "Choose the smallest engine that answers the question",
  body: "Direct shorthand, placement context, circuit execution, and world ticks solve different classes of state.",
});

function simRow(spec: (typeof SIM)[number], index: number): GroupNode {
  return {
    ...row(
      spec.node,
      [
        stack(
          `${spec.node}-index`,
          [
            code(`${spec.node}-index-text`, String(index + 1).padStart(2, "0"), {
              tone: spec.tone,
              align: "center",
              width: "fill",
            }),
          ],
          { width: 42, padding: 9, frame: material("inset", { radius: 21 }), align: "center" },
        ),
        labelBlock(
          `${spec.node}-question`,
          "QUESTION",
          spec.question,
          spec.key === "world" ? "temporal" : "state",
        ),
        {
          id: `${spec.node}-line`,
          type: "rect",
          width: "fill",
          height: 1,
          fill: spec.tone,
          stroke: "none",
        },
        token(`${spec.node}-answer`, spec.answer, spec.tone),
      ],
      { gap: 14, align: "center", padding: [10, 12], width: "fill" },
    ),
    layout: { wide: "row", compact: "row", narrow: "stack" },
    ...interactive(spec),
  };
}

export const smartSimulationScene: SceneDefinition = defineScene({
  schemaVersion: 2,
  id: "smart-simulation",
  title: "Choosing a simulation surface",
  description:
    "Four questions lead from direct signal state through placement and circuit execution to full tick simulation.",
  breakpoints: { wide: 780, compact: 520 },
  background: "canvas",
  root: artboard(
    "sim",
    "PLACEMENT + SIMULATION",
    "Ask what must be true, then pay only for that model.",
    stack("sim-instrument", SIM.map(simRow), {
      gap: 4,
      padding: [10, 12],
      frame: material("raised", { radius: 10 }),
      width: "fill",
    }),
  ),
  machine: simFocus.machine,
  controls: simFocus.controls,
  timeline: sceneTimeline(SIM.map((spec) => spec.node)),
  metadata: { source: "smart-simulation/choose-engine.svg", revision: 2 },
});

export const smartSimulationEntry = entry(
  5,
  "smart-simulation",
  "Placement and simulation",
  "A four-question instrument selects the smallest state model that can answer the job.",
  smartSimulationScene,
  "Focus a question to see why its engine is sufficient.",
  "The instrument advances from direct state to full temporal simulation.",
);

// Formats and I/O ----------------------------------------------------------------------------

const FORMAT_FOCUS: readonly FocusSpec[] = [
  {
    key: "detect",
    label: "Detect",
    node: "format-inputs",
    title: "Content detection precedes parsing",
    body: "Bytes and container structure select the parser; a filename extension is only a hint.",
  },
  {
    key: "model",
    label: "Model",
    node: "format-model",
    title: "Every parser converges on one editable model",
    body: "Blocks, entities, metadata, regions, and bounds use the same in-memory schematic contract.",
  },
  {
    key: "export",
    label: "Export",
    node: "format-outputs",
    title: "Export is an explicit destination choice",
    body: "Structure, snapshot, and world formats keep their own capabilities and loss boundaries visible.",
  },
];
const formatFocus = focusModel("format-hub", FORMAT_FOCUS, {
  title: "Many containers, one model, explicit destinations",
  body: "Nucleation isolates format quirks at the edge so edits and analysis operate on one schematic representation.",
});

function formatChip(id: string, text: string, tone: Paint): GroupNode {
  return stack(id, [code(`${id}-text`, text, { tone, align: "center", width: "fill" })], {
    padding: [10, 8],
    frame: material("raised", { radius: 4 }),
    width: "fill",
  });
}

const formatInputs = {
  ...stack(
    "format-inputs",
    [
      eyebrow("format-inputs-label", "DETECT + PARSE"),
      {
        id: "format-input-grid",
        type: "group",
        layout: "grid",
        columns: { wide: 3, narrow: 2 },
        gap: 7,
        width: "fill",
        children: [".schem", ".litematic", ".mcstructure", ".nusn", ".snbt", "world/"].map(
          (name, index) =>
            formatChip(`format-in-${index}`, name, index % 2 === 0 ? "info" : "accent"),
        ),
      },
    ],
    { gap: 10, padding: 16, frame: material("raised", { radius: 8 }), width: "fill" },
  ),
  ...interactive(FORMAT_FOCUS[0]!),
};

const formatModel = {
  ...stack(
    "format-model",
    [
      motif("format-model-cube", "cube", { tone: "accent", size: 84 }),
      title("format-model-title", "Schematic", { align: "center", width: "fill" }),
      caption("format-model-note", "blocks · entities · metadata · regions", {
        align: "center",
        width: "fill",
        maxLines: 2,
      }),
    ],
    {
      gap: 8,
      align: "center",
      padding: [24, 18],
      frame: material("glass", { radius: 12 }),
      width: "fill",
    },
  ),
  ...interactive(FORMAT_FOCUS[1]!),
};

const formatOutputs = {
  ...stack(
    "format-outputs",
    [
      eyebrow("format-outputs-label", "EXPORT"),
      ...[
        ["STRUCTURE", ".schem · .litematic"],
        ["SNAPSHOT", ".nusn · .snbt"],
        ["WORLD", "region · chunk"],
      ].map(([name, note], index) =>
        row(
          `format-out-${index}`,
          [
            heading(`format-out-${index}-name`, name ?? ""),
            code(`format-out-${index}-note`, note ?? "", {
              tone: index === 2 ? "success" : "accent",
              align: "end",
              width: "fill",
            }),
          ],
          { gap: 12, align: "center", width: "fill" },
        ),
      ),
    ],
    { gap: 12, padding: 16, frame: material("raised", { radius: 8 }), width: "fill" },
  ),
  ...interactive(FORMAT_FOCUS[2]!),
};

const formatEdges: readonly EdgeDefinition[] = [
  {
    id: "format-read",
    from: { node: "format-inputs", side: { wide: "right", compact: "bottom" } },
    to: { node: "format-model", side: { wide: "left", compact: "top" } },
    route: "straight",
    head: "arrow",
    tail: "dot",
    stroke: "flow",
    label: "detect",
    packets: { count: 2, period: 1700 },
  },
  {
    id: "format-write",
    from: { node: "format-model", side: { wide: "right", compact: "bottom" } },
    to: { node: "format-outputs", side: { wide: "left", compact: "top" } },
    route: "orthogonal",
    head: "bar",
    stroke: "dashed",
    packets: { count: 2, period: 1700 },
  },
];

export const formatsAndIoScene: SceneDefinition = defineScene({
  schemaVersion: 2,
  id: "formats-and-io",
  title: "Formats and I/O",
  description:
    "Container detection and parsers converge on one editable schematic model before explicit export branches out again.",
  breakpoints: { wide: 900, compact: 520 },
  background: "canvas",
  root: artboard("format", "FORMATS + I/O", "Format quirks stay at the boundary.", {
    id: "format-map",
    type: "group",
    layout: { wide: "row", compact: "stack" },
    gap: { wide: 36, compact: 34 },
    align: "stretch",
    width: "fill",
    children: [formatInputs, formatModel, formatOutputs],
  }),
  edges: formatEdges,
  machine: formatFocus.machine,
  controls: formatFocus.controls,
  timeline: sceneTimeline(
    ["format-inputs", "format-model", "format-outputs"],
    formatEdges.map((edge) => edge.id),
  ),
  metadata: { source: "formats-and-io/format-pipeline.svg", revision: 2 },
});

export const formatsAndIoEntry = entry(
  6,
  "formats-and-io",
  "Formats and I/O",
  "A compact format hub separates container detection, the editable model, and explicit export.",
  formatsAndIoScene,
  "Focus ingress, the model, or egress to inspect the boundary.",
  "Formats converge on the model, then flow back out through deliberate export paths.",
);

// Bindings -----------------------------------------------------------------------------------

const BINDINGS: readonly (FocusSpec & { readonly runtime: string; readonly tone: Tone })[] = [
  {
    key: "javascript",
    label: "JS / TS",
    node: "binding-javascript",
    title: "JavaScript / TypeScript · WASM",
    body: "The browser and Node surfaces share generated names plus byte and JSON contracts.",
    runtime: "WASM",
    tone: "accent",
  },
  {
    key: "python",
    label: "Python",
    node: "binding-python",
    title: "Python · nanobind",
    body: "Python objects wrap the native core through a generated, typed extension surface.",
    runtime: "nanobind",
    tone: "info",
  },
  {
    key: "kotlin",
    label: "Kotlin",
    node: "binding-kotlin",
    title: "Kotlin · JNA",
    body: "JVM callers load the shared library and use generated symbol and payload definitions.",
    runtime: "JNA",
    tone: "warning",
  },
  {
    key: "php",
    label: "PHP",
    node: "binding-php",
    title: "PHP · FFI",
    body: "PHP binds the stable C ABI at runtime without a hand-maintained parallel API.",
    runtime: "FFI",
    tone: "success",
  },
  {
    key: "c",
    label: "C",
    node: "binding-c",
    title: "C · stable headers",
    body: "The C ABI is the lowest common contract used by foreign-language packages.",
    runtime: "ABI",
    tone: "danger",
  },
  {
    key: "cpp",
    label: "C++",
    node: "binding-cpp",
    title: "C++ · typed wrappers",
    body: "RAII and native types wrap the generated C symbols without duplicating the core.",
    runtime: "RAII",
    tone: "accent",
  },
  {
    key: "rust",
    label: "Rust",
    node: "binding-rust",
    title: "Rust · direct crate",
    body: "Rust callers bypass the bridge and call the implementation directly.",
    runtime: "native",
    tone: "warning",
  },
];
const bindingFocus = focusModel("binding-surfaces-v2", BINDINGS, {
  title: "One implementation, generated foreign surfaces",
  body: "The annotated bridge owns naming and transport contracts; native Rust remains a direct call path.",
});

function bindingTab(spec: (typeof BINDINGS)[number]): GroupNode {
  return {
    ...stack(
      spec.node,
      [
        heading(`${spec.node}-name`, spec.label),
        code(`${spec.node}-runtime`, spec.runtime, { tone: spec.tone }),
      ],
      { gap: 3, padding: [10, 12], frame: material("raised", { radius: 4 }), width: "fill" },
    ),
    ...interactive(spec),
  };
}

export const bindingsAndLanguagesScene: SceneDefinition = defineScene({
  schemaVersion: 2,
  id: "bindings-and-languages",
  title: "Bindings and languages",
  description:
    "The Rust implementation feeds an annotated bridge and six generated foreign-language packages while native Rust remains direct.",
  breakpoints: { wide: 780, compact: 520 },
  background: "canvas",
  root: artboard(
    "binding",
    "BINDINGS",
    "One core. One bridge contract. Seven surfaces.",
    stack(
      "binding-foundation",
      [
        {
          ...row(
            "binding-core-row",
            [
              stack(
                "binding-core",
                [
                  eyebrow("binding-core-label", "IMPLEMENTATION"),
                  title("binding-core-title", "Rust core"),
                ],
                {
                  gap: 3,
                  padding: [18, 20],
                  frame: material("floating", { radius: 8 }),
                  width: "fill",
                },
              ),
              bindingTab(BINDINGS[6]!),
            ],
            { gap: 12, align: "stretch", width: "fill" },
          ),
        },
        stack(
          "binding-bridge",
          [
            row(
              "binding-bridge-title",
              [
                motif("binding-bridge-icon", "layers", { tone: "accent", size: 22 }),
                heading("binding-bridge-name", "src/bridge · annotated contract"),
              ],
              { gap: 10, align: "center", width: "fill" },
            ),
            caption("binding-bridge-note", "names · bytes · JSON · errors", { width: "fill" }),
          ],
          { gap: 4, padding: [14, 18], frame: material("glass", { radius: 6 }), width: "fill" },
        ),
        {
          id: "binding-tabs",
          type: "group",
          layout: "grid",
          columns: { wide: 6, compact: 3, narrow: 2 },
          gap: 8,
          width: "fill",
          children: BINDINGS.slice(0, 6).map(bindingTab),
        },
      ],
      { gap: 12, width: "fill" },
    ),
  ),
  machine: bindingFocus.machine,
  controls: bindingFocus.controls,
  timeline: sceneTimeline(["binding-core-row", "binding-bridge", "binding-tabs"]),
  metadata: { source: "bindings-and-languages/binding-pipeline.svg", revision: 2 },
});

export const bindingsAndLanguagesEntry = entry(
  7,
  "bindings-and-languages",
  "Bindings and languages",
  "A physical stack distinguishes the native core, the generated bridge contract, and each package surface.",
  bindingsAndLanguagesScene,
  "Choose a language tab to inspect its transport without losing the shared architecture.",
  "The core lands first, the bridge settles above it, and the generated surfaces fan out last.",
);

// Meshing and rendering ----------------------------------------------------------------------

const MESH_FOCUS: readonly FocusSpec[] = [
  {
    key: "opaque",
    label: "Opaque",
    node: "mesh-opaque",
    title: "Opaque geometry writes depth first",
    body: "Solid faces draw first and establish the depth buffer for cheaper rejection behind them.",
  },
  {
    key: "cutout",
    label: "Cutout",
    node: "mesh-cutout",
    title: "Cutout geometry discards empty texels",
    body: "Leaves and panes keep hard alpha edges without blending while still using depth testing.",
  },
  {
    key: "transparent",
    label: "Transparent",
    node: "mesh-transparent",
    title: "Transparent geometry blends last",
    body: "Water and stained glass are sorted back to front after the depth-writing layers.",
  },
  {
    key: "portable",
    label: "3D data",
    node: "mesh-portable",
    title: "Portable output keeps the mesh as data",
    body: "GLB, glTF, USDZ, and NUCM feed viewers, DCC tools, and caches.",
  },
  {
    key: "pixels",
    label: "Pixels",
    node: "mesh-pixels",
    title: "The native renderer turns the same mesh into pixels",
    body: "Camera, grid, materials, and lighting produce stills or deterministic animation frames.",
  },
];
const meshFocus = focusModel("mesh-layers-v2", MESH_FOCUS, {
  title: "Mesh once, then keep the geometry or draw it",
  body: "The mesher builds three ordered layers over one atlas; export and native rendering share that result.",
});

function meshLayer(spec: FocusSpec, tone: Tone, width: `${number}%`, order: string): GroupNode {
  return {
    ...stack(
      spec.node,
      [
        row(
          `${spec.node}-copy`,
          [code(`${spec.node}-order`, order, { tone }), heading(`${spec.node}-name`, spec.label)],
          { gap: 12, align: "center", width: "fill" },
        ),
        {
          id: `${spec.node}-slab`,
          type: "rect",
          width,
          height: 18,
          radius: 3,
          fill: tone,
          stroke: tone,
        },
      ],
      {
        gap: 8,
        align: "start",
        padding: [10, 12],
        frame: material("raised", { radius: 5 }),
        width: "fill",
      },
    ),
    ...interactive(spec),
  };
}

function meshOutput(spec: FocusSpec, icon: string, formats: string, tone: Tone): GroupNode {
  return {
    ...stack(
      spec.node,
      [
        motif(`${spec.node}-icon`, icon, { tone, size: 36 }),
        heading(`${spec.node}-name`, spec.label),
        code(`${spec.node}-formats`, formats, { tone }),
      ],
      {
        gap: 7,
        align: "center",
        padding: [18, 16],
        frame: material("floating", { radius: 8 }),
        width: "fill",
      },
    ),
    ...interactive(spec),
  };
}

const meshEdges: readonly EdgeDefinition[] = [
  {
    id: "mesh-to-portable",
    from: { node: "mesh-stack", side: { wide: "right", compact: "bottom" }, offset: 0.35 },
    to: { node: "mesh-portable", side: { wide: "left", compact: "top" } },
    route: "arc",
    head: "arrow",
    stroke: "flow",
    packets: { count: 1, period: 1800 },
  },
  {
    id: "mesh-to-pixels",
    from: { node: "mesh-stack", side: { wide: "right", compact: "bottom" }, offset: 0.7 },
    to: { node: "mesh-pixels", side: { wide: "left", compact: "top" } },
    route: "curve",
    head: "arrow",
    stroke: "flow",
    packets: { count: 1, period: 1800 },
  },
];

export const meshingAndRenderingScene: SceneDefinition = defineScene({
  schemaVersion: 2,
  id: "meshing-and-rendering",
  title: "Meshing and rendering",
  description:
    "Three explicit mesh layers over one texture atlas branch to portable geometry data or native rendered pixels.",
  breakpoints: { wide: 900, compact: 520 },
  background: "canvas",
  root: artboard("mesh", "MESHING + RENDERING", "Transparency order is part of the data path.", {
    id: "mesh-map",
    type: "group",
    layout: { wide: "row", compact: "stack" },
    gap: { wide: 44, compact: 34 },
    align: "stretch",
    width: "fill",
    children: [
      stack(
        "mesh-stack",
        [
          row(
            "mesh-input",
            [
              motif("mesh-input-cube", "cube", { tone: "info", size: 24 }),
              heading("mesh-input-title", "Schematic + resource pack"),
            ],
            { gap: 10, align: "center", width: "fill" },
          ),
          meshLayer(MESH_FOCUS[0]!, "accent", "100%", "01"),
          meshLayer(MESH_FOCUS[1]!, "warning", "76%", "02"),
          meshLayer(MESH_FOCUS[2]!, "info", "52%", "03"),
          row(
            "mesh-atlas",
            [
              motif("mesh-atlas-icon", "texture", { tone: "success", size: 20 }),
              code("mesh-atlas-copy", "shared texture atlas", { tone: "success" }),
            ],
            {
              gap: 9,
              align: "center",
              padding: [8, 10],
              frame: material("inset", { radius: 4 }),
              width: "fill",
            },
          ),
        ],
        { gap: 9, padding: 16, frame: material("raised", { radius: 10 }), width: "fill" },
      ),
      stack(
        "mesh-outputs",
        [
          meshOutput(MESH_FOCUS[3]!, "export", "GLB · GLTF · USDZ · NUCM", "success"),
          meshOutput(MESH_FOCUS[4]!, "camera", "PNG · GIF · VIDEO", "warning"),
        ],
        { gap: 12, justify: "center", width: "fill" },
      ),
    ],
  }),
  edges: meshEdges,
  machine: meshFocus.machine,
  controls: meshFocus.controls,
  timeline: sceneTimeline(
    ["mesh-stack", "mesh-portable", "mesh-pixels"],
    meshEdges.map((edge) => edge.id),
  ),
  metadata: { source: "meshing-and-rendering/render-pipeline.svg", revision: 2 },
});

export const meshingAndRenderingEntry = entry(
  8,
  "meshing-and-rendering",
  "Meshing and rendering",
  "Exploded mesh slabs make draw order tangible before the shared geometry branches to data or pixels.",
  meshingAndRenderingScene,
  "Focus any layer or output to inspect its rendering contract.",
  "The mesh assembles in draw order, then both output surfaces receive the completed geometry.",
);
