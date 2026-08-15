import {
  defineScene,
  drawEdge,
  fadeIn,
  flow,
  progressTo,
  pulse,
  reveal,
  timeline,
  type GroupNode,
  type MachineTransition,
  type SceneDefinition,
  type SceneNode,
  type SignalExpression,
  type StateMachineDefinition,
} from "@kineglyph/core";
import type { CatalogueEntry } from "../catalogue.js";
import {
  caption,
  card,
  eyebrow,
  flow as flowLayout,
  heading,
  motif,
  row,
  stack,
} from "../recipes.js";

/**
 * Schematic meshing and rendering: a schematic and a resource pack merge in the mesher, the mesh
 * is built as three ordered layers over one shared atlas, and the same mesh either leaves as
 * portable data or is drawn by the native renderer.
 */

const LAYERS = ["opaque", "cutout", "transparent"] as const;
type Layer = (typeof LAYERS)[number];
const TARGETS = ["data", "render"] as const;
type Target = (typeof TARGETS)[number];

const LAYER_COPY: Record<
  Layer,
  {
    readonly title: string;
    readonly technique: string;
    readonly tone: "accent" | "warning" | "info";
    readonly width: number;
    readonly explain: string;
    readonly control: string;
  }
> = {
  opaque: {
    title: "Opaque",
    technique: "1st · depth write",
    tone: "accent",
    width: 96,
    explain:
      "Solid blocks draw first and write depth, so everything behind them is culled cheaply.",
    control: "Opaque layer",
  },
  cutout: {
    title: "Cutout",
    technique: "2nd · alpha discard",
    tone: "warning",
    width: 72,
    explain:
      "Leaves and glass panes discard fully transparent texels: no blending, still depth-tested.",
    control: "Cutout layer",
  },
  transparent: {
    title: "Transparent",
    technique: "3rd · blending, sorted",
    tone: "info",
    width: 48,
    explain: "Water and stained glass blend last, sorted back to front; the order stays explicit.",
    control: "Transparent layer",
  },
};

const TARGET_COPY: Record<
  Target,
  {
    readonly eyebrow: string;
    readonly title: string;
    readonly body: string;
    readonly motif: string;
    readonly tone: "success" | "warning";
    readonly event: string;
    readonly control: string;
    readonly explainTitle: string;
    readonly explain: string;
  }
> = {
  data: {
    eyebrow: "Portable data",
    title: "GLB · USDZ · NUCM",
    body: "web, DCC, cache",
    motif: "export",
    tone: "success",
    event: "TARGET_DATA",
    control: "Portable data",
    explainTitle: "Portable data · GLB, USDZ, NUCM",
    explain:
      "Export the mesh once and let web viewers, DCC tools, and caches load it as plain data.",
  },
  render: {
    eyebrow: "Native renderer",
    title: "PNG · GIF · VIDEO",
    body: "camera, grid, lighting",
    motif: "camera",
    tone: "warning",
    event: "TARGET_RENDER",
    control: "Native renderer",
    explainTitle: "Native renderer · PNG, GIF, video",
    explain:
      "Hand the same mesh to the native renderer with a camera, grid, and lighting for stills or frames.",
  },
};

const DEFAULT_TITLE = "Mesh once, then export or draw";
const DEFAULT_EXPLAIN =
  "Schematic data becomes three ordered mesh layers over one atlas; the same mesh becomes files, stills, interactive views, or frames.";

// ---------------------------------------------------------------------------------------------
// Machine: the state is the chosen output branch, `focus` is the last thing the reader touched
// ---------------------------------------------------------------------------------------------

function transitions(state: "overview" | Target): Record<string, MachineTransition> {
  return {
    TARGET_DATA: { target: "data", actions: [{ type: "set", var: "focus", value: "data" }] },
    TARGET_RENDER: { target: "render", actions: [{ type: "set", var: "focus", value: "render" }] },
    ...Object.fromEntries(
      LAYERS.map((layer) => [
        `LAYER_${layer.toUpperCase()}`,
        { target: state, actions: [{ type: "set", var: "focus", value: layer }] },
      ]),
    ),
    RESET: { target: "overview", actions: [{ type: "set", var: "focus", value: "none" }] },
  };
}

function layerSignals(): Record<string, SignalExpression> {
  const signals: Record<string, SignalExpression> = {};
  for (const layer of LAYERS)
    signals[`${layer}Focus`] = { when: { var: "focus", op: "eq", value: layer }, then: 1, else: 0 };
  return signals;
}

const machine: StateMachineDefinition = {
  id: "mesh-and-render",
  initial: "overview",
  variables: { target: "none", focus: "none" },
  states: {
    overview: {
      label: "Both branches",
      entry: [
        { type: "set", var: "target", value: "none" },
        { type: "select", node: null },
      ],
      on: transitions("overview"),
    },
    data: {
      label: "Portable data",
      entry: [
        { type: "set", var: "target", value: "data" },
        { type: "select", node: "output-data" },
      ],
      on: transitions("data"),
    },
    render: {
      label: "Native renderer",
      entry: [
        { type: "set", var: "target", value: "render" },
        { type: "select", node: "output-render" },
      ],
      on: transitions("render"),
    },
  },
  signals: {
    explainTitle: {
      match: { var: "focus" },
      cases: {
        ...Object.fromEntries(
          LAYERS.map((layer) => [
            layer,
            `${LAYER_COPY[layer].title} · ${LAYER_COPY[layer].technique.split(" · ")[1] ?? ""}`,
          ]),
        ),
        ...Object.fromEntries(TARGETS.map((target) => [target, TARGET_COPY[target].explainTitle])),
      },
      default: {
        match: { var: "target" },
        cases: Object.fromEntries(
          TARGETS.map((target) => [target, TARGET_COPY[target].explainTitle]),
        ),
        default: DEFAULT_TITLE,
      },
    },
    explainBody: {
      match: { var: "focus" },
      cases: {
        ...Object.fromEntries(LAYERS.map((layer) => [layer, LAYER_COPY[layer].explain])),
        ...Object.fromEntries(TARGETS.map((target) => [target, TARGET_COPY[target].explain])),
      },
      default: {
        match: { var: "target" },
        cases: Object.fromEntries(TARGETS.map((target) => [target, TARGET_COPY[target].explain])),
        default: DEFAULT_EXPLAIN,
      },
    },
    focusTone: {
      match: { var: "focus" },
      cases: {
        ...Object.fromEntries(LAYERS.map((layer) => [layer, LAYER_COPY[layer].tone])),
        ...Object.fromEntries(TARGETS.map((target) => [target, TARGET_COPY[target].tone])),
      },
      default: {
        match: { var: "target" },
        cases: Object.fromEntries(TARGETS.map((target) => [target, TARGET_COPY[target].tone])),
        default: "muted",
      },
    },
    dataFocus: { when: { var: "target", op: "eq", value: "data" }, then: 1, else: 0 },
    renderFocus: { when: { var: "target", op: "eq", value: "render" }, then: 1, else: 0 },
    dataDim: { when: { var: "target", op: "in", value: ["none", "data"] }, then: 1, else: 0.55 },
    renderDim: {
      when: { var: "target", op: "in", value: ["none", "render"] },
      then: 1,
      else: 0.55,
    },
    edgeDataTone: {
      when: { var: "target", op: "in", value: ["none", "data"] },
      then: "neutral",
      else: "muted",
    },
    edgeRenderTone: {
      when: { var: "target", op: "in", value: ["none", "render"] },
      then: "neutral",
      else: "muted",
    },
    ...layerSignals(),
  },
};

// ---------------------------------------------------------------------------------------------
// Nodes
// ---------------------------------------------------------------------------------------------

/**
 * `card()` lets its motif header hug the title, so the heading is allocated `sum - gap - motif`,
 * which can land an ulp short of the measured title width and wrap it mid-phrase in some themes.
 * Stretching the header to the card width keeps every title on one line.
 */
function fillHeader(node: GroupNode): GroupNode {
  return {
    ...node,
    children: node.children.map((child) =>
      child.type === "group" && child.id === `${node.id}-header`
        ? { ...child, width: "fill" }
        : child,
    ),
  };
}

/** A group whose layout direction changes per named layout. */
function responsive(
  id: string,
  layout: GroupNode["layout"],
  children: readonly SceneNode[],
  options: Parameters<typeof stack>[2],
): GroupNode {
  return { ...stack(id, children, options), ...(layout === undefined ? {} : { layout }) };
}

const schematic = fillHeader(
  card("input-schematic", {
    eyebrow: "Input",
    title: "Schematic",
    body: "blocks · states · bounds",
    motif: "cube",
    tone: "info",
    compact: true,
  }),
);

const pack = fillHeader(
  card("input-pack", {
    eyebrow: "Input",
    title: "Resource pack",
    body: "models · textures · tint",
    motif: "palette",
    tone: "info",
    compact: true,
  }),
);

const inputs = responsive(
  "inputs",
  { wide: "stack", compact: "grid", narrow: "stack" },
  [schematic, pack],
  {
    gap: { wide: 28, compact: 16 },
    columns: { compact: 2, narrow: 1 },
    justify: "center",
    width: "fill",
    height: "fill",
    grow: 5,
  },
);

const mesher = stack(
  "col-mesher",
  [
    fillHeader(
      card("mesher", {
        eyebrow: "One pass",
        title: "Mesher",
        body: "Blocks, states, and bounds become geometry.",
        motif: "mesh",
        tone: "accent",
        compact: true,
        maxWidth: { wide: 320, compact: 360 },
      }),
    ),
  ],
  { width: "fill", height: "fill", justify: "center", align: "center", grow: 5 },
);

function layerRow(layer: Layer): SceneNode {
  const copy = LAYER_COPY[layer];
  return row(
    `layer-${layer}`,
    [
      {
        id: `layer-${layer}-bar`,
        type: "rect",
        width: copy.width,
        height: 14,
        radius: 3,
        fill: copy.tone,
        stroke: "none",
      },
      stack(
        `layer-${layer}-copy`,
        [
          heading(`layer-${layer}-title`, copy.title),
          caption(`layer-${layer}-technique`, copy.technique, { maxLines: 2 }),
        ],
        { gap: 0, width: "fill" },
      ),
    ],
    {
      gap: 12,
      align: "center",
      padding: [8, 12],
      frame: { fill: "surfaceRaised", stroke: "border" },
      width: "fill",
      interactive: true,
      onActivate: `LAYER_${layer.toUpperCase()}`,
      label: `${copy.title} layer`,
      description: copy.explain,
      bind: { highlight: `${layer}Focus` },
      metadata: { layer, order: LAYERS.indexOf(layer) + 1 },
    },
  );
}

const atlas = row(
  "atlas",
  [
    motif("atlas-motif", "texture", { tone: "success", size: 22 }),
    stack(
      "atlas-copy",
      [
        heading("atlas-title", "Shared texture atlas"),
        caption("atlas-caption", "one image, every layer", { maxLines: 2 }),
      ],
      { gap: 0, width: "fill" },
    ),
  ],
  {
    gap: 12,
    align: "center",
    padding: [4, 2],
    width: "fill",
    label: "Shared texture atlas",
    description: "Every layer samples one packed atlas, so the mesh binds a single texture.",
  },
);

const mesh = stack(
  "mesh",
  [
    eyebrow("mesh-eyebrow", "Mesh layers · draw order"),
    ...LAYERS.map(layerRow),
    { id: "mesh-rule", type: "rect", width: "fill", height: 1, fill: "border", stroke: "none" },
    atlas,
  ],
  {
    gap: 8,
    padding: [14, 16],
    frame: { fill: "surface", stroke: "border" },
    width: "fill",
    grow: 7,
    label: "Mesh",
    description: "Three ordered layers over one shared atlas.",
  },
);

function outputCard(target: Target): GroupNode {
  const copy = TARGET_COPY[target];
  return fillHeader(
    card(`output-${target}`, {
      eyebrow: copy.eyebrow,
      title: copy.title,
      body: copy.body,
      motif: copy.motif,
      tone: copy.tone,
      interactive: true,
      onActivate: copy.event,
      description: copy.explain,
      bind: { highlight: `${target}Focus`, opacity: `${target}Dim` },
      metadata: { target },
      compact: true,
    }),
  );
}

const outputs = responsive(
  "outputs",
  { wide: "stack", compact: "grid", narrow: "stack" },
  TARGETS.map(outputCard),
  {
    gap: { wide: 28, compact: 16 },
    columns: { compact: 2, narrow: 1 },
    justify: "center",
    width: "fill",
    height: "fill",
    grow: 6,
  },
);

const footer = stack(
  "footer",
  [
    eyebrow("footer-principles", "Mesh once · Export or draw · Keep transparency order explicit"),
    row(
      "footer-title-row",
      [
        {
          id: "footer-dot",
          type: "circle",
          radius: 4.5,
          fill: "muted",
          stroke: "none",
          bind: { tone: "focusTone" },
        },
        heading("footer-title", DEFAULT_TITLE, { bind: { text: "explainTitle" }, width: "fill" }),
      ],
      { gap: 8, align: "center", width: "fill" },
    ),
    caption("footer-body", DEFAULT_EXPLAIN, {
      bind: { text: "explainBody" },
      maxLines: 3,
      width: "fill",
    }),
  ],
  {
    gap: 6,
    padding: [12, 16],
    frame: { fill: "surfaceMuted", stroke: "border", dash: "dashed" },
    width: "fill",
  },
);

export const meshingAndRenderingScene: SceneDefinition = defineScene({
  schemaVersion: 2,
  id: "meshing-and-rendering",
  title: "Schematic meshing and rendering pipeline",
  description:
    "A schematic and a resource pack merge in the mesher. The mesh is built as three ordered layers, opaque then cutout then transparent, over one shared texture atlas, and the same mesh either exports as GLB, USDZ, or NUCM data or is drawn by the native renderer as PNG, GIF, or video.",
  breakpoints: { wide: 900, compact: 600 },
  root: stack(
    "root",
    [
      flowLayout("pipeline", [inputs, mesher, mesh, outputs], {
        gap: { wide: 44, compact: 30 },
        align: "stretch",
        width: "fill",
        padding: { wide: 0, compact: [0, 22] },
      }),
      footer,
    ],
    { gap: 22, width: "fill" },
  ),
  edges: [
    {
      id: "schematic-mesher",
      from: { node: "input-schematic", side: { wide: "right", compact: "bottom", narrow: "left" } },
      to: { node: "mesher", side: { wide: "left", compact: "top", narrow: "left" } },
      route: { wide: "curve", compact: "orthogonal" },
      head: "arrow",
      packets: { count: 1, period: 1800 },
      description: "Blocks, states, and bounds enter the mesher",
    },
    {
      id: "pack-mesher",
      from: { node: "input-pack", side: { wide: "right", compact: "bottom" } },
      to: { node: "mesher", side: { wide: "left", compact: "top" } },
      route: { wide: "curve", compact: "orthogonal" },
      head: "arrow",
      packets: { count: 1, period: 1800 },
      description: "Models, textures, and tint enter the mesher",
    },
    {
      id: "mesher-mesh",
      from: { node: "mesher", side: { wide: "right", compact: "bottom" } },
      to: { node: "mesh", side: { wide: "left", compact: "top" } },
      route: "straight",
      head: "triangle",
      stroke: "flow",
      description: "The mesher builds the layered mesh once",
    },
    {
      id: "mesh-data",
      from: { node: "mesh", side: { wide: "right", compact: "bottom" } },
      to: { node: "output-data", side: { wide: "left", compact: "top" } },
      route: { wide: "curve", compact: "orthogonal" },
      head: "arrow",
      packets: { count: 1, period: 2000 },
      description: "The mesh is exported as portable data",
      bind: { highlight: "dataFocus", tone: "edgeDataTone" },
    },
    {
      id: "mesh-render",
      from: { node: "mesh", side: { wide: "right", compact: "bottom", narrow: "right" } },
      to: { node: "output-render", side: { wide: "left", compact: "top", narrow: "right" } },
      route: { wide: "curve", compact: "orthogonal" },
      head: "arrow",
      packets: { count: 1, period: 2000 },
      description: "The mesh is drawn by the native renderer",
      bind: { highlight: "renderFocus", tone: "edgeRenderTone" },
    },
  ],
  timeline: timeline([
    reveal("input-schematic", 0, 450, { offset: -8 }),
    reveal("input-pack", 200, 650, { offset: -8 }),
    drawEdge("schematic-mesher", 600, 1050),
    drawEdge("pack-mesher", 700, 1150),
    flow("schematic-mesher", 1050),
    flow("pack-mesher", 1150),
    reveal("col-mesher", 850, 1250, { scale: 0.96 }),
    pulse("mesher-motif", 1300, 700),
    drawEdge("mesher-mesh", 1450, 1900),
    fadeIn("mesh", 1700, 2100),
    reveal("layer-opaque", 2100, 2500, { offset: 10 }),
    reveal("layer-cutout", 2500, 2900, { offset: 10 }),
    reveal("layer-transparent", 2900, 3300, { offset: 10 }),
    fadeIn("mesh-rule", 3200, 3500),
    reveal("atlas", 3300, 3700, { offset: 6 }),
    drawEdge("mesh-data", 3700, 4150),
    drawEdge("mesh-render", 3850, 4300),
    flow("mesh-data", 4150),
    flow("mesh-render", 4300),
    reveal("outputs", 3950, 4400, { offset: 8 }),
    fadeIn("footer", 4400, 4900),
    progressTo("footer-body", 4650, 5300),
  ]),
  machine,
  controls: [
    ...TARGETS.map((target) => ({
      id: `target-${target}`,
      label: TARGET_COPY[target].control,
      event: TARGET_COPY[target].event,
      group: "Output",
      description: TARGET_COPY[target].explain,
      activeWhen: { var: "target", op: "eq" as const, value: target },
    })),
    ...LAYERS.map((layer) => ({
      id: `layer-${layer}-control`,
      label: LAYER_COPY[layer].control,
      event: `LAYER_${layer.toUpperCase()}`,
      group: "Inspect layer",
      description: LAYER_COPY[layer].explain,
      activeWhen: { var: "focus", op: "eq" as const, value: layer },
    })),
    { id: "reset", kind: "reset" as const, label: "Show all" },
  ],
  metadata: { source: "meshing-and-rendering/render-pipeline.svg" },
});

export const meshingAndRenderingEntry: CatalogueEntry = {
  slug: "meshing-and-rendering",
  order: 8,
  title: "Meshing and rendering",
  summary:
    "A schematic and resource pack mesh once into ordered layers over one atlas, then export as data or draw natively.",
  concept:
    "Meshing and rendering: schematic data becomes meshes, camera and lighting, stills, interactive views, or frames.",
  interaction:
    "Choose the output branch (click a card, keyboard, or the buttons) to highlight it and swap the explanation; hover, focus, or activate a layer to read why depth write, alpha discard, and blending are ordered.",
  animation:
    "Inputs merge into the mesher, the layers stack up in draw order, the atlas appears, and the mesh branches into portable data and the native renderer.",
  source: "meshing-and-rendering/render-pipeline.svg",
  scene: meshingAndRenderingScene,
};
