import {
  defineScene,
  drawEdge,
  fadeIn,
  flow,
  pulse,
  reveal,
  timeline,
  type EdgeDefinition,
  type SceneDefinition,
  type SceneNode,
  type StateMachineDefinition,
} from "@kineglyph/core";
import type { CatalogueEntry } from "../catalogue.js";
import {
  caption,
  card,
  code,
  eyebrow,
  flow as flowLayout,
  heading,
  overlay,
  panel,
  row,
  stack,
} from "../recipes.js";

/**
 * Fast generation: the shape of the input data chooses the bulk operation. Four workload shapes
 * route to four bulk calls, and a call-overhead meter compares what each one pays.
 */

const WORKLOADS = ["dense", "sparse", "mixed", "geometry"] as const;
type Workload = (typeof WORKLOADS)[number];
type WorkloadTone = "accent" | "info" | "warning" | "success";

interface WorkloadSpec {
  readonly control: string;
  readonly title: string;
  readonly body: string;
  readonly shape: string;
  readonly motif: string;
  readonly tone: WorkloadTone;
  readonly api: {
    readonly title: string;
    readonly body: string;
    readonly call: string;
    readonly motif: string;
  };
  readonly cost: { readonly value: string; readonly width: number; readonly figure: string };
  readonly insight: { readonly title: string; readonly body: string };
}

const SPEC: Record<Workload, WorkloadSpec> = {
  dense: {
    control: "Dense box",
    title: "Dense box",
    body: "A solid cuboid of one block. Its bounds are the whole story.",
    shape: "min … max · one id",
    motif: "box",
    tone: "accent",
    api: {
      title: "fill_cuboid",
      body: "One bounds growth, one palette lookup.",
      call: "fill_cuboid(min, max, id)",
      motif: "blocks",
    },
    cost: { value: "1 call", width: 30, figure: "1 bounds growth · 1 palette lookup" },
    insight: {
      title: "Bounds, not blocks",
      body: "fill_cuboid grows the bounds once and resolves the block once; nothing scales with the volume.",
    },
  },
  sparse: {
    control: "Sparse",
    title: "Sparse, one block",
    body: "Scattered positions that all share a single block id.",
    shape: "[(x, y, z), …] · one id",
    motif: "dots",
    tone: "info",
    api: {
      title: "set_blocks",
      body: "One binding call, one parsed descriptor.",
      call: "set_blocks(positions, id)",
      motif: "grid",
    },
    cost: { value: "1 call", width: 46, figure: "1 binding crossing · 1 parsed descriptor" },
    insight: {
      title: "Parse once, place many",
      body: "set_blocks crosses the binding once and parses the descriptor once; the positions ride along as one array.",
    },
  },
  mixed: {
    control: "Mixed",
    title: "Mixed hot loop",
    body: "Many different ids placed one at a time inside a tight loop.",
    shape: "(pos, id) × N",
    motif: "bolt",
    tone: "warning",
    api: {
      title: "prepare + place",
      body: "Resolve each id once, then write palette indices.",
      call: "prepare(ids) · place(pos, i)",
      motif: "chip",
    },
    cost: {
      value: "N ids · once",
      width: 98,
      figure: "N ids resolved once · index writes per block",
    },
    insight: {
      title: "Resolve first, then write",
      body: "prepare turns every distinct id into a palette index once; place then writes indices with no parsing in the loop.",
    },
  },
  geometry: {
    control: "Geometry",
    title: "Geometry + material",
    body: "A shape to fill and a brush that decides the block.",
    shape: "shape · brush",
    motif: "sphere",
    tone: "success",
    api: {
      title: "BuildingTool.fill",
      body: "Shape enumerates cells, brush chooses blocks.",
      call: "tool.fill(shape, brush)",
      motif: "brush",
    },
    cost: { value: "per cell", width: 164, figure: "1 call · shape × brush evaluated per cell" },
    insight: {
      title: "Where and what, per cell",
      body: "The shape enumerates its cells and the brush picks a block for each, so cost follows the filled volume.",
    },
  },
};

const OVERVIEW = {
  title: "Match the call to the input",
  body: "Dense, sparse, mixed, or geometric input each has one bulk call that skips per-block overhead.",
  figure: "4 input shapes · 4 bulk calls",
};

const EVENT: Record<Workload, string> = {
  dense: "FOCUS_DENSE",
  sparse: "FOCUS_SPARSE",
  mixed: "FOCUS_MIXED",
  geometry: "FOCUS_GEOMETRY",
};

function events(): Record<string, string> {
  return { ...Object.fromEntries(WORKLOADS.map((key) => [EVENT[key], key])), RESET: "overview" };
}

const machine: StateMachineDefinition = {
  id: "fast-generation-workloads",
  initial: "overview",
  variables: { workload: "none" },
  states: {
    overview: { on: events() },
    ...Object.fromEntries(
      WORKLOADS.map((key) => [
        key,
        {
          entry: [
            { type: "set", var: "workload", value: key },
            { type: "select", node: key },
          ],
          on: events(),
        },
      ]),
    ),
  },
  signals: {
    focused: { not: { when: { state: "overview" }, then: true, else: false } },
    insightTitle: {
      match: { var: "workload" },
      cases: Object.fromEntries(WORKLOADS.map((key) => [key, SPEC[key].insight.title])),
      default: OVERVIEW.title,
    },
    insightBody: {
      match: { var: "workload" },
      cases: Object.fromEntries(WORKLOADS.map((key) => [key, SPEC[key].insight.body])),
      default: OVERVIEW.body,
    },
    insightFigure: {
      match: { var: "workload" },
      cases: Object.fromEntries(WORKLOADS.map((key) => [key, SPEC[key].cost.figure])),
      default: OVERVIEW.figure,
    },
    ...Object.fromEntries(
      WORKLOADS.map((key) => [
        `${key}Focus`,
        { when: { var: "workload", op: "eq", value: key }, then: 1, else: 0 },
      ]),
    ),
    ...Object.fromEntries(
      WORKLOADS.map((key) => [
        `${key}Dim`,
        {
          when: { any: [{ state: "overview" }, { var: "workload", op: "eq", value: key }] },
          then: 1,
          else: 0.5,
        },
      ]),
    ),
  },
};

/** Timeline entrances live on a plain slot so machine-bound opacity on the card composes with them. */
function slot(id: string, child: SceneNode, fillHeight = false): SceneNode {
  return stack(`${id}-slot`, [child], {
    width: "fill",
    align: "stretch",
    ...(fillHeight ? { height: "fill" as const } : {}),
  });
}

function workloadCard(key: Workload): SceneNode {
  const spec = SPEC[key];
  return card(key, {
    eyebrow: "Input shape",
    title: spec.title,
    body: spec.body,
    motif: spec.motif,
    tone: spec.tone,
    interactive: true,
    onActivate: EVENT[key],
    bind: { highlight: `${key}Focus`, opacity: `${key}Dim` },
    extras: [code(`${key}-shape`, spec.shape, { tone: spec.tone })],
    metadata: { workload: key, role: "input" },
    compact: true,
    height: "fill",
  });
}

function apiCard(key: Workload): SceneNode {
  const spec = SPEC[key];
  return card(`api-${key}`, {
    eyebrow: "Bulk call",
    title: spec.api.title,
    body: spec.api.body,
    motif: spec.api.motif,
    tone: spec.tone,
    interactive: true,
    onActivate: EVENT[key],
    bind: { highlight: `${key}Focus`, opacity: `${key}Dim` },
    extras: [code(`api-${key}-call`, spec.api.call, { tone: spec.tone })],
    metadata: { workload: key, role: "api" },
    compact: true,
    height: "fill",
  });
}

function pair(key: Workload): SceneNode {
  return {
    id: `pair-${key}`,
    type: "group",
    layout: { wide: "row", narrow: "stack" },
    gap: { wide: 60, compact: 44, narrow: 30 },
    align: "stretch",
    width: "fill",
    children: [slot(key, workloadCard(key), true), slot(`api-${key}`, apiCard(key), true)],
  };
}

function costRow(key: Workload): SceneNode {
  const spec = SPEC[key];
  const meter = overlay(
    `cost-${key}-meter`,
    [
      {
        id: `cost-${key}-track`,
        type: "rect",
        width: "fill",
        height: 8,
        fill: "surface",
        stroke: "border",
        radius: 4,
      },
      {
        id: `cost-${key}-bar`,
        type: "rect",
        width: { wide: spec.cost.width, narrow: Math.round(spec.cost.width * 1.35) },
        height: 8,
        fill: spec.tone,
        stroke: "none",
        radius: 4,
        bind: { highlight: `${key}Focus` },
      },
    ],
    { justify: "start", width: "fill" },
  );
  return slot(
    `cost-${key}`,
    stack(
      `cost-${key}`,
      [
        row(
          `cost-${key}-head`,
          [
            caption(`cost-${key}-name`, spec.api.title, { tone: "text" }),
            code(`cost-${key}-value`, spec.cost.value, { tone: spec.tone }),
          ],
          { justify: "between", align: "center", gap: 8, width: "fill" },
        ),
        meter,
      ],
      {
        gap: 6,
        width: "fill",
        bind: { opacity: `${key}Dim` },
        label: `${spec.api.title} overhead`,
        description: spec.cost.figure,
        interactive: true,
        onActivate: EVENT[key],
        metadata: { workload: key, role: "overhead" },
      },
    ),
  );
}

const overhead = panel(
  "overhead",
  [
    ...WORKLOADS.map(costRow),
    caption("overhead-note", "Longer bar: more work per block placed.", { maxLines: 2 }),
  ],
  {
    eyebrow: "Call overhead",
    title: "What one operation pays",
    gap: 14,
    width: "fill",
  },
);

const insight = stack(
  "insight",
  [
    eyebrow("insight-eyebrow", "Why it is fast"),
    heading("insight-title", OVERVIEW.title, { bind: { text: "insightTitle" } }),
    caption("insight-body", OVERVIEW.body, { bind: { text: "insightBody" }, maxLines: 4 }),
    code("insight-figure", OVERVIEW.figure, { bind: { text: "insightFigure" }, tone: "text" }),
  ],
  {
    gap: 4,
    padding: [12, 16],
    frame: { fill: "surfaceMuted", stroke: "border", dash: "dashed" },
    width: "fill",
  },
);

const routes: EdgeDefinition[] = WORKLOADS.map((key) => ({
  id: `route-${key}`,
  from: { node: key, side: { wide: "right", narrow: "bottom" } },
  to: { node: `api-${key}`, side: { wide: "left", narrow: "top" } },
  route: "orthogonal",
  head: "arrow",
  tone: SPEC[key].tone,
  packets: { count: 2, period: 1600 },
  description: `${SPEC[key].title} routes to ${SPEC[key].api.title}`,
  bind: { highlight: `${key}Focus` },
}));

const ROUTE_START: Record<Workload, number> = {
  dense: 950,
  sparse: 1550,
  mixed: 2150,
  geometry: 2750,
};

export const fastGenerationScene: SceneDefinition = defineScene({
  schemaVersion: 2,
  id: "fast-generation",
  title: "Fast generation: the input shape chooses the bulk call",
  description:
    "Four workload shapes route to four bulk operations. Dense boxes fill by bounds, sparse sets pass one descriptor, mixed loops resolve ids once, and geometry composes a shape with a brush; a meter compares the overhead each call pays.",
  breakpoints: { wide: 900, compact: 600 },
  root: flowLayout(
    "map",
    [
      stack("pairs", WORKLOADS.map(pair), {
        gap: { wide: 16, compact: 16, narrow: 34 },
        width: "fill",
        grow: 2,
        align: "stretch",
      }),
      {
        id: "aside",
        type: "group",
        layout: { wide: "stack", compact: "row", narrow: "stack" },
        gap: { wide: 20, compact: 28, narrow: 20 },
        align: "start",
        width: "fill",
        grow: 1,
        children: [overhead, insight],
      },
    ],
    { gap: { wide: 44, compact: 28 }, align: "start", width: "fill" },
  ),
  edges: routes,
  timeline: timeline([
    ...WORKLOADS.flatMap((key, index) =>
      reveal(`${key}-slot`, 100 + index * 130, 520 + index * 130, { scale: 0.97 }),
    ),
    fadeIn("overhead", 1150, 1550),
    ...WORKLOADS.flatMap((key) => {
      const start = ROUTE_START[key];
      return [
        ...drawEdge(`route-${key}`, start, start + 360),
        flow(`route-${key}`, start + 360),
        ...reveal(`api-${key}-slot`, start + 160, start + 560, { scale: 0.97 }),
        pulse(`api-${key}-motif`, start + 520, 480),
        ...reveal(`cost-${key}-slot`, start + 480, start + 840, { offset: 8 }),
      ];
    }),
    fadeIn("overhead-note", 3600, 3900),
    fadeIn("insight", 3750, 4250),
  ]),
  machine,
  controls: [
    ...WORKLOADS.map((key) => ({
      id: `focus-${key}`,
      label: SPEC[key].control,
      event: EVENT[key],
      group: "Workload",
      description: SPEC[key].insight.title,
      activeWhen: { var: "workload", op: "eq" as const, value: key },
    })),
    { id: "reset", kind: "reset" as const, label: "Show all" },
  ],
  metadata: { source: "fast-generation/operation-map.svg" },
});

export const fastGenerationEntry: CatalogueEntry = {
  slug: "fast-generation",
  order: 1,
  title: "Fast generation",
  summary:
    "The shape of the input data chooses the bulk operation, and each bulk call skips per-block overhead.",
  concept:
    "Fast generation: workload shapes route to the correct bulk API, with a call-overhead comparison.",
  interaction:
    "Pick a workload (button or card) to light its route and API, and read what that call pays.",
  animation:
    "The four input shapes appear, each route draws and flows into its bulk call in turn, and the overhead meter fills in for comparison.",
  source: "fast-generation/operation-map.svg",
  scene: fastGenerationScene,
};
