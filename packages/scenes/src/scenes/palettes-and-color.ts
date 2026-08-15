import {
  defineScene,
  drawEdge,
  fadeIn,
  flow,
  pulse,
  reveal,
  timeline,
  type EdgeDefinition,
  type Paint,
  type SceneDefinition,
  type SceneNode,
  type StateMachineDefinition,
  type TimelineTrack,
} from "@kineglyph/core";
import type { CatalogueEntry } from "../catalogue.js";
import { caption, card, code, eyebrow, heading, row, stack, grid } from "../recipes.js";

/**
 * Palettes and colour: a target colour is converted to Oklab, compared with a block palette that
 * was measured in the same space, and resolved by one of four selection modes.
 */

const MODES = ["closest", "gradient", "ramp", "dither"] as const;
type Mode = (typeof MODES)[number];
type ModeTone = "accent" | "info" | "warning" | "success";

interface ModeSpec {
  readonly control: string;
  readonly title: string;
  readonly caption: string;
  readonly call: string;
  readonly tone: ModeTone;
  readonly rule: string;
  readonly insight: { readonly title: string; readonly body: string };
}

const SPEC: Record<Mode, ModeSpec> = {
  closest: {
    control: "Closest",
    title: "Closest block",
    caption: "One nearest block.",
    call: "closest(target)",
    tone: "accent",
    rule: "the single nearest block",
    insight: {
      title: "Nearest neighbour in Oklab",
      body: "The palette entry with the smallest perceptual distance wins; one colour becomes exactly one block.",
    },
  },
  gradient: {
    control: "Gradient",
    title: "Gradient",
    caption: "Repeats allowed.",
    call: "gradient(n = 5)",
    tone: "info",
    rule: "a smooth run, repeats allowed",
    insight: {
      title: "Smooth run, repeats allowed",
      body: "Sample the run of target colours and take the nearest block at each step; neighbouring steps may pick the same block.",
    },
  },
  ramp: {
    control: "Ramp",
    title: "Ramp",
    caption: "Distinct blocks.",
    call: "ramp(n = 4)",
    tone: "warning",
    rule: "distinct blocks in order",
    insight: {
      title: "Distinct blocks in order",
      body: "Like a gradient, but every step must differ from the last, so the ramp always reads as separate steps.",
    },
  },
  dither: {
    control: "Dither",
    title: "Dither",
    caption: "Position-aware mix.",
    call: "dither(x, y, target)",
    tone: "success",
    rule: "a position-aware mix of two blocks",
    insight: {
      title: "Position-aware mix",
      body: "Two nearby blocks are interleaved by cell position, so the average colour lands closer to the target than any single block.",
    },
  },
};

const OVERVIEW = {
  title: "One target, four ways to resolve it",
  body: "Every mode measures distance in Oklab; they differ in how many blocks answer and whether repeats are allowed.",
};

const EVENT: Record<Mode, string> = {
  closest: "MODE_CLOSEST",
  gradient: "MODE_GRADIENT",
  ramp: "MODE_RAMP",
  dither: "MODE_DITHER",
};

function events(): Record<string, string> {
  return { ...Object.fromEntries(MODES.map((mode) => [EVENT[mode], mode])), RESET: "overview" };
}

const machine: StateMachineDefinition = {
  id: "colour-selection-modes",
  initial: "overview",
  variables: { mode: "none" },
  states: {
    overview: { on: events() },
    ...Object.fromEntries(
      MODES.map((mode) => [
        mode,
        {
          entry: [
            { type: "set", var: "mode", value: mode },
            { type: "select", node: `out-${mode}` },
          ],
          on: events(),
        },
      ]),
    ),
  },
  signals: {
    focused: { not: { when: { state: "overview" }, then: true, else: false } },
    insightTitle: {
      match: { var: "mode" },
      cases: Object.fromEntries(MODES.map((mode) => [mode, SPEC[mode].insight.title])),
      default: OVERVIEW.title,
    },
    insightBody: {
      match: { var: "mode" },
      cases: Object.fromEntries(MODES.map((mode) => [mode, SPEC[mode].insight.body])),
      default: OVERVIEW.body,
    },
    selectionCall: {
      match: { var: "mode" },
      cases: Object.fromEntries(MODES.map((mode) => [mode, SPEC[mode].call])),
      default: "closest · gradient · ramp · dither",
    },
    selectionBody: {
      match: { var: "mode" },
      cases: Object.fromEntries(MODES.map((mode) => [mode, `Resolve to ${SPEC[mode].rule}.`])),
      default: "Pick how many blocks answer, and how.",
    },
    ...Object.fromEntries(
      MODES.map((mode) => [
        `${mode}Focus`,
        { when: { var: "mode", op: "eq", value: mode }, then: 1, else: 0 },
      ]),
    ),
    ...Object.fromEntries(
      MODES.map((mode) => [
        `${mode}Dim`,
        {
          when: { any: [{ state: "overview" }, { var: "mode", op: "eq", value: mode }] },
          then: 1,
          else: 0.45,
        },
      ]),
    ),
  },
};

function slot(id: string, child: SceneNode): SceneNode {
  return stack(`${id}-slot`, [child], { width: "fill", align: "stretch", height: "fill" });
}

function swatch(id: string, tone: Paint, width = 22, height = 16): SceneNode {
  return { id, type: "rect", width, height, radius: 3, fill: tone, stroke: "none" };
}

// Stage cards ---------------------------------------------------------------------------------

const target = card("target", {
  eyebrow: "Input",
  title: "Target RGB",
  body: "A pixel, a field sample, or a value.",
  motif: "target",
  tone: "accent",
  compact: true,
  height: "fill",
  extras: [
    row(
      "target-detail",
      [
        swatch("target-swatch", "accent", 18, 18),
        code("target-call", "(r, g, b)", { tone: "accent" }),
      ],
      {
        gap: 8,
        align: "center",
      },
    ),
  ],
});

const oklab = card("oklab", {
  eyebrow: "Space",
  title: "Oklab",
  body: "Perceptual distance, so near means near.",
  motif: "compare",
  tone: "info",
  compact: true,
  height: "fill",
  extras: [code("oklab-call", "ΔE = ‖a − b‖", { tone: "info" })],
});

const PALETTE_TONES: readonly Paint[] = ["danger", "warning", "success", "info", "accent", "muted"];
const palette = card("palette", {
  eyebrow: "Candidates",
  title: "Palette",
  body: "Presets or builder filters; texture colours measured in Oklab too.",
  motif: "palette",
  tone: "warning",
  compact: true,
  height: "fill",
  extras: [
    row(
      "palette-strip",
      PALETTE_TONES.map((tone, index) => swatch(`palette-swatch-${index}`, tone, 14, 14)),
      { gap: 3 },
    ),
  ],
});

const selection = card("selection", {
  eyebrow: "Choose",
  title: "Selection",
  body: "Pick how many blocks answer, and how.",
  bodyBind: { text: "selectionBody" },
  motif: "filter",
  tone: "success",
  compact: true,
  height: "fill",
  extras: [
    code("selection-call", "closest · gradient · ramp · dither", {
      tone: "success",
      bind: { text: "selectionCall" },
    }),
  ],
});

// Output cards --------------------------------------------------------------------------------

const GRADIENT_RUN: readonly Paint[] = ["info", "info", "accent", "success", "success"];
const RAMP_RUN: readonly Paint[] = ["info", "accent", "success", "warning"];

function outputCard(mode: Mode, strip: SceneNode): SceneNode {
  const spec = SPEC[mode];
  return card(`out-${mode}`, {
    eyebrow: "Mode",
    title: spec.title,
    tone: spec.tone,
    compact: true,
    height: "fill",
    interactive: true,
    onActivate: EVENT[mode],
    description: spec.insight.body,
    bind: { highlight: `${mode}Focus`, opacity: `${mode}Dim` },
    extras: [strip, caption(`out-${mode}-caption`, spec.caption, { maxLines: 2 })],
    metadata: { mode },
  });
}

const closestStrip = row("closest-strip", [swatch("closest-swatch", "info", 34, 16)], { gap: 3 });
const gradientStrip = row(
  "gradient-strip",
  GRADIENT_RUN.map((tone, index) => swatch(`gradient-swatch-${index}`, tone)),
  { gap: 3 },
);
const rampStrip = row(
  "ramp-strip",
  RAMP_RUN.map((tone, index) => swatch(`ramp-swatch-${index}`, tone)),
  { gap: 3 },
);
const DITHER_COLUMNS = 6;
const ditherCells: SceneNode[] = [];
for (let r = 0; r < 2; r += 1)
  for (let c = 0; c < DITHER_COLUMNS; c += 1)
    ditherCells.push(
      swatch(`dither-cell-${r}-${c}`, (r + c) % 2 === 0 ? "info" : "accent", 12, 12),
    );
const ditherStrip = grid("dither-strip", ditherCells, {
  columns: DITHER_COLUMNS,
  gap: 2,
  width: DITHER_COLUMNS * 12 + (DITHER_COLUMNS - 1) * 2,
});

const outputs: Record<Mode, SceneNode> = {
  closest: outputCard("closest", closestStrip),
  gradient: outputCard("gradient", gradientStrip),
  ramp: outputCard("ramp", rampStrip),
  dither: outputCard("dither", ditherStrip),
};

const insight = stack(
  "insight",
  [
    eyebrow("insight-eyebrow", "Selection"),
    heading("insight-title", OVERVIEW.title, { bind: { text: "insightTitle" } }),
    caption("insight-body", OVERVIEW.body, { bind: { text: "insightBody" }, maxLines: 4 }),
  ],
  {
    gap: 4,
    padding: [12, 16],
    frame: { fill: "surfaceMuted", stroke: "border", dash: "dashed" },
    width: "fill",
  },
);

// Edges ---------------------------------------------------------------------------------------

const BRANCH_OFFSET: Record<Mode, number> = { closest: 0.2, gradient: 0.4, ramp: 0.6, dither: 0.8 };
const NARROW_TARGET_SIDE: Record<Mode, "top" | "left" | "right"> = {
  closest: "top",
  gradient: "top",
  ramp: "right",
  dither: "left",
};

const branches: EdgeDefinition[] = MODES.map((mode) => ({
  id: `branch-${mode}`,
  from: {
    node: "selection",
    side: "bottom",
    offset: { wide: BRANCH_OFFSET[mode], narrow: 0.5 },
  },
  to: { node: `out-${mode}`, side: { wide: "top", narrow: NARROW_TARGET_SIDE[mode] } },
  route: { wide: "curve", narrow: "orthogonal" },
  curvature: 0.15,
  head: "arrow",
  tail: "dot",
  tone: SPEC[mode].tone,
  packets: { count: 1, period: 1800 },
  description: `Selection resolves to ${SPEC[mode].rule}`,
  bind: { highlight: `${mode}Focus`, opacity: `${mode}Dim` },
}));

const stageEdges: EdgeDefinition[] = [
  {
    id: "target-oklab",
    from: { node: "target", side: { wide: "right", narrow: "bottom" } },
    to: { node: "oklab", side: { wide: "left", narrow: "top" } },
    route: "straight",
    head: "arrow",
    tone: "accent",
    packets: { count: 2, period: 1600 },
    description: "The target colour is converted to Oklab",
  },
  {
    id: "oklab-palette",
    from: { node: "oklab", side: { wide: "right", narrow: "bottom" } },
    to: { node: "palette", side: { wide: "left", narrow: "top" } },
    route: "straight",
    head: "arrow",
    tone: "info",
    packets: { count: 2, period: 1600 },
    description: "The Oklab colour is compared with every palette entry",
  },
  {
    id: "palette-oklab",
    from: { node: "palette", side: "top", offset: 0.5 },
    to: { node: "oklab", side: "top", offset: 0.5 },
    route: "arc",
    bend: -24,
    head: "arrow",
    tail: "dot",
    stroke: "dotted",
    tone: "info",
    hidden: { wide: false, narrow: true },
    description: "Palette entries were measured into Oklab ahead of time",
  },
  {
    id: "palette-selection",
    from: { node: "palette", side: "bottom" },
    to: { node: "selection", side: "top" },
    route: { wide: "curve", narrow: "straight" },
    curvature: 0.15,
    head: "arrow",
    tone: "warning",
    packets: { count: 2, period: 1600 },
    labels: [{ text: "ranked", placement: "middle", hidden: { wide: false, compact: true } }],
    description: "Ranked candidates reach the selection step",
  },
];

// Timeline ------------------------------------------------------------------------------------

function swatchTracks(): TimelineTrack[] {
  const tracks: TimelineTrack[] = [];
  tracks.push(...reveal("closest-swatch", 3400, 3700, { offset: 6 }));
  GRADIENT_RUN.forEach((_, index) =>
    tracks.push(
      ...reveal(`gradient-swatch-${index}`, 3400 + index * 80, 3680 + index * 80, { offset: 6 }),
    ),
  );
  RAMP_RUN.forEach((_, index) =>
    tracks.push(
      ...reveal(`ramp-swatch-${index}`, 3400 + index * 100, 3680 + index * 100, { offset: 6 }),
    ),
  );
  ditherCells.forEach((cellNode, index) =>
    tracks.push(fadeIn(cellNode.id, 3400 + index * 40, 3600 + index * 40)),
  );
  return tracks;
}

export const palettesAndColorScene: SceneDefinition = defineScene({
  schemaVersion: 2,
  id: "palettes-and-color",
  title: "Palettes and colour: from a target colour to blocks",
  description:
    "A target colour is converted to Oklab and compared with a block palette measured in the same perceptual space. The selection step then resolves it as the closest block, a gradient with repeats, a ramp of distinct blocks, or a position-aware dither.",
  breakpoints: { wide: 900, compact: 600 },
  padding: { wide: [46, 24, 24, 24], narrow: 16 },
  root: stack(
    "root",
    [
      {
        id: "pipeline",
        type: "group",
        layout: { wide: "row", narrow: "stack" },
        gap: { wide: 48, compact: 24, narrow: 30 },
        align: "stretch",
        width: "fill",
        children: [slot("target", target), slot("oklab", oklab), slot("palette", palette)],
      },
      stack(
        "branching",
        [
          stack("selection-slot", [selection], {
            width: { wide: 400, compact: 360, narrow: "fill" },
            align: "stretch",
            alignSelf: "center",
          }),
          {
            id: "outputs",
            type: "group",
            layout: { wide: "row", narrow: "grid" },
            columns: { narrow: 2 },
            gap: { wide: 24, compact: 16, narrow: 40 },
            align: "stretch",
            width: "fill",
            children: MODES.map((mode) => slot(`out-${mode}`, outputs[mode])),
          },
        ],
        { gap: { wide: 92, compact: 76, narrow: 40 }, width: "fill" },
      ),
      insight,
    ],
    { gap: { wide: 60, compact: 52, narrow: 30 }, width: "fill" },
  ),
  edges: [...stageEdges, ...branches],
  timeline: timeline([
    reveal("target-slot", 100, 500, { scale: 0.97 }),
    drawEdge("target-oklab", 500, 850),
    flow("target-oklab", 850),
    reveal("oklab-slot", 700, 1100, { scale: 0.97 }),
    drawEdge("oklab-palette", 1100, 1450),
    flow("oklab-palette", 1450),
    reveal("palette-slot", 1300, 1700, { scale: 0.97 }),
    ...PALETTE_TONES.map((_, index) =>
      fadeIn(`palette-swatch-${index}`, 1650 + index * 60, 1850 + index * 60),
    ),
    drawEdge("palette-oklab", 1900, 2350),
    drawEdge("palette-selection", 2000, 2350),
    flow("palette-selection", 2350),
    reveal("selection-slot", 2200, 2600, { scale: 0.97 }),
    pulse("selection-motif", 2600, 600),
    ...MODES.flatMap((mode, index) => [
      ...drawEdge(`branch-${mode}`, 2700 + index * 70, 3200 + index * 70),
      flow(`branch-${mode}`, 3200 + index * 70),
      ...reveal(`out-${mode}-slot`, 2950 + index * 90, 3350 + index * 90, { scale: 0.97 }),
    ]),
    ...swatchTracks(),
    fadeIn("insight", 4150, 4650),
  ]),
  machine,
  controls: [
    ...MODES.map((mode) => ({
      id: `mode-${mode}`,
      label: SPEC[mode].control,
      event: EVENT[mode],
      group: "Selection mode",
      description: SPEC[mode].insight.title,
      activeWhen: { var: "mode", op: "eq" as const, value: mode },
    })),
    { id: "reset", kind: "reset" as const, label: "Show all" },
  ],
  metadata: { source: "palettes-and-color/color-pipeline.svg" },
});

export const palettesAndColorEntry: CatalogueEntry = {
  slug: "palettes-and-color",
  order: 4,
  title: "Palettes and colour",
  summary:
    "A target colour is measured in Oklab against a block palette and resolved as a nearest block, gradient, ramp, or dither.",
  concept:
    "Palettes and colour: source colour passes through Oklab matching into closest, gradient, ramp, or dither outputs.",
  interaction:
    "Choose a selection mode (button or card) to light its branch, dim the others, and read what that mode allows.",
  animation:
    "Colour packets travel target → Oklab → palette → selection, the four branches fan out, and each output's swatches fill in.",
  source: "palettes-and-color/color-pipeline.svg",
  scene: palettesAndColorScene,
};
