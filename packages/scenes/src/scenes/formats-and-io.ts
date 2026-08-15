import {
  defineScene,
  drawEdge,
  fadeIn,
  flow,
  pulse,
  reveal,
  timeline,
  type EdgeDefinition,
  type EdgeSide,
  type GroupNode,
  type SceneDefinition,
  type SceneNode,
  type SignalExpression,
  type StateMachineDefinition,
  type TransitionSpec,
} from "@kineglyph/core";
import type { CatalogueEntry } from "../catalogue.js";
import { caption, card, eyebrow, heading, motif, panel, pill, row, stack } from "../recipes.js";

/**
 * Formats and I/O: six input families are detected by content and converge on one editable
 * schematic; exporters fan out to explicitly chosen format families.
 */

type Tone = "accent" | "info" | "warning" | "success" | "danger";

interface FamilySpec {
  readonly title: string;
  readonly caption: string;
  readonly motif: string;
  readonly tone: Tone;
  readonly insight: string;
}

const INPUTS = ["lit", "bedrock", "java", "snapshot", "mcedit", "world"] as const;
const OUTPUTS = ["xlit", "xbedrock", "xsnapshot", "xworld"] as const;
type Input = (typeof INPUTS)[number];
type Output = (typeof OUTPUTS)[number];
type Family = Input | Output;
const FAMILIES: readonly Family[] = [...INPUTS, ...OUTPUTS];

const INPUT_SPEC: Record<Input, FamilySpec> = {
  lit: {
    title: "Litematic, Sponge",
    caption: "gzip NBT; root keys differ",
    motif: "layers",
    tone: "accent",
    insight:
      "Litematica and Sponge files are gzipped NBT; the root tag names give the format away.",
  },
  bedrock: {
    title: "Bedrock structure",
    caption: ".mcstructure, little-endian",
    motif: "cube",
    tone: "info",
    insight:
      "Bedrock structures are little-endian NBT with a structure_world_origin; byte order is the tell.",
  },
  java: {
    title: "Java structure",
    caption: "SNBT text or structure block",
    motif: "code",
    tone: "warning",
    insight:
      "Java structure files carry palette and blocks lists; the SNBT text form parses the same way.",
  },
  snapshot: {
    title: "Snapshot",
    caption: "Nucleation's own binary",
    motif: "camera",
    tone: "success",
    insight: "Snapshots start with Nucleation's own magic bytes and load without any translation.",
  },
  mcedit: {
    title: "Legacy MCEdit",
    caption: ".schematic, numeric ids",
    motif: "book",
    tone: "danger",
    insight: "Legacy schematics use numeric block ids that are mapped to modern names on load.",
  },
  world: {
    title: "MCA / zip world",
    caption: "region files or a zip",
    motif: "world",
    tone: "accent",
    insight: "A world folder or zip is walked region by region and cut to the requested bounds.",
  },
};

const OUTPUT_SPEC: Record<Output, FamilySpec> = {
  xlit: {
    title: "Litematic, schem",
    caption: "preserve Java structure",
    motif: "layers",
    tone: "accent",
    insight: "Java-side formats keep the block palette and NBT exactly; nothing is flattened.",
  },
  xbedrock: {
    title: "mcstructure, SNBT",
    caption: "translate or flatten",
    motif: "languages",
    tone: "info",
    insight:
      "Bedrock needs block translation and SNBT flattens to text; both are explicit choices.",
  },
  xsnapshot: {
    title: "Snapshot",
    caption: "fast internal interchange",
    motif: "camera",
    tone: "success",
    insight: "Snapshots serialise the in-memory model directly and round-trip losslessly.",
  },
  xworld: {
    title: "World",
    caption: "directory or zip",
    motif: "world",
    tone: "warning",
    insight: "Writing a world places regions into a directory or a zip, ready to open in the game.",
  },
};

const SPEC: Record<Family, FamilySpec> = { ...INPUT_SPEC, ...OUTPUT_SPEC };

const MODE_COPY = {
  overview: {
    title: "Read by sniffing, write by choosing",
    body: "Readers detect the format from the bytes; writers take an explicit target format.",
    badge: "one editable model",
  },
  read: {
    title: "Detect by content",
    body: "One load call inspects magic bytes and structure, so six families open without a format flag.",
    badge: "detected by content",
  },
  write: {
    title: "Choose explicitly",
    body: "Export names the target: preserve, translate, snapshot, or write a world.",
    badge: "explicit target",
  },
};

const isInput = (family: Family): family is Input => (INPUTS as readonly string[]).includes(family);
const focusEvent = (family: Family): string => `FOCUS_${family.toUpperCase()}`;

/** Read/Write set the direction and clear the focus; focusing a family implies its direction. */
function focusTransitions(): Record<string, TransitionSpec> {
  const map: Record<string, TransitionSpec> = {
    MODE_READ: { target: "read", actions: [{ type: "set", var: "family", value: "none" }] },
    MODE_WRITE: { target: "write", actions: [{ type: "set", var: "family", value: "none" }] },
    RESET: "overview",
  };
  for (const family of FAMILIES)
    map[focusEvent(family)] = {
      target: isInput(family) ? "read" : "write",
      actions: [{ type: "set", var: "family", value: family }],
    };
  return map;
}

const machine: StateMachineDefinition = {
  id: "format-io-modes",
  initial: "overview",
  variables: { family: "none" },
  states: {
    overview: { entry: [{ type: "set", var: "family", value: "none" }], on: focusTransitions() },
    read: { on: focusTransitions() },
    write: { on: focusTransitions() },
  },
  signals: {
    inputsDim: { when: { state: "write" }, then: 0.45, else: 1 },
    outputsDim: { when: { state: "read" }, then: 0.45, else: 1 },
    modelBadge: {
      match: { state: true },
      cases: {
        overview: MODE_COPY.overview.badge,
        read: MODE_COPY.read.badge,
        write: MODE_COPY.write.badge,
      },
    },
    insightTitle: {
      match: { var: "family" },
      cases: Object.fromEntries(FAMILIES.map((family) => [family, SPEC[family].title])),
      default: {
        match: { state: true },
        cases: {
          overview: MODE_COPY.overview.title,
          read: MODE_COPY.read.title,
          write: MODE_COPY.write.title,
        },
      },
    },
    insightBody: {
      match: { var: "family" },
      cases: Object.fromEntries(FAMILIES.map((family) => [family, SPEC[family].insight])),
      default: {
        match: { state: true },
        cases: {
          overview: MODE_COPY.overview.body,
          read: MODE_COPY.read.body,
          write: MODE_COPY.write.body,
        },
      },
    },
    ...Object.fromEntries(
      FAMILIES.map((family) => [
        `${family}Focus`,
        { when: { var: "family", op: "eq", value: family }, then: 1, else: 0 },
      ]),
    ),
    ...Object.fromEntries(
      FAMILIES.map((family) => [
        `${family}Dim`,
        {
          when: {
            any: [
              { var: "family", op: "eq", value: "none" },
              { var: "family", op: "eq", value: family },
            ],
          },
          then: 1,
          else: 0.5,
        },
      ]),
    ),
    ...Object.fromEntries(
      FAMILIES.map((family) => [
        `${family}Edge`,
        {
          when: {
            any: [
              { var: "family", op: "eq", value: family },
              {
                all: [
                  { var: "family", op: "eq", value: "none" },
                  { state: isInput(family) ? "read" : "write" },
                ],
              },
            ],
          },
          then: 1,
          else: 0,
        } satisfies SignalExpression,
      ]),
    ),
  },
};

function slot(id: string, child: SceneNode, options: { grow?: number } = {}): SceneNode {
  return stack(`${id}-slot`, [child], {
    width: "fill",
    align: "stretch",
    ...(options.grow === undefined ? {} : { grow: options.grow }),
  });
}

/** Compact family card: motif + title, one-line hint. The motif steps aside on narrow layouts. */
function familyCard(family: Family): GroupNode {
  const spec = SPEC[family];
  return stack(
    family,
    [
      row(
        `${family}-header`,
        [
          {
            ...motif(`${family}-motif`, spec.motif, { tone: spec.tone, size: 20 }),
            hidden: { wide: false, narrow: true },
          },
          heading(`${family}-title`, spec.title),
        ],
        { gap: 10, align: "center" },
      ),
      caption(`${family}-caption`, spec.caption, { maxLines: { wide: 2, narrow: 3 } }),
    ],
    {
      gap: 3,
      padding: [10, 12],
      frame: { fill: "surface", stroke: "border" },
      width: "fill",
      interactive: true,
      onActivate: focusEvent(family),
      label: spec.title,
      description: spec.insight,
      bind: { highlight: `${family}Focus`, opacity: `${family}Dim` },
      metadata: { family, direction: isInput(family) ? "read" : "write" },
    },
  );
}

const readPanel = panel(
  "read",
  INPUTS.map((family) => slot(family, familyCard(family))),
  {
    eyebrow: "Read · detect by content",
    layout: { wide: "stack", narrow: "grid" },
    columns: { narrow: 2 },
    gap: { wide: 10, narrow: 30 },
    padding: { wide: 16, compact: 12 },
    frame: { fill: "none", stroke: "border", dash: "dashed" },
    width: "fill",
    bind: { opacity: "inputsDim" },
    label: "Read: detect by content",
  },
);

const writePanel = panel(
  "write",
  OUTPUTS.map((family) => slot(family, familyCard(family))),
  {
    eyebrow: "Write · choose explicitly",
    layout: { wide: "stack", narrow: "grid" },
    columns: { narrow: 2 },
    gap: { wide: 10, narrow: 30 },
    padding: { wide: 16, compact: 12 },
    frame: { fill: "none", stroke: "border", dash: "dashed" },
    width: "fill",
    bind: { opacity: "outputsDim" },
    label: "Write: choose explicitly",
  },
);

const model = card("model", {
  eyebrow: "One editable model",
  title: "Schematic",
  body: "blocks · regions · NBT",
  motif: "cube",
  tone: "accent",
  compact: true,
  label: "Editable schematic",
  description: "Every reader lands here and every writer starts here.",
  extras: [
    {
      ...pill("model-mode", MODE_COPY.overview.badge, {
        tone: "accent",
        bind: { text: "modelBadge" },
      }),
      minWidth: 176,
    },
  ],
});

const insight = stack(
  "insight",
  [
    eyebrow("insight-eyebrow", "Detection"),
    heading("insight-title", MODE_COPY.overview.title, { bind: { text: "insightTitle" } }),
    caption("insight-body", MODE_COPY.overview.body, {
      bind: { text: "insightBody" },
      maxLines: 4,
    }),
  ],
  {
    gap: 4,
    padding: [12, 16],
    frame: { fill: "surfaceMuted", stroke: "border", dash: "dashed" },
    width: "fill",
  },
);

// Edges ---------------------------------------------------------------------------------------

/** On narrow layouts the grid's inner sides face a central gutter that carries the trunk. */
const innerSide = (index: number): EdgeSide => (index % 2 === 0 ? "right" : "left");

const inEdges: EdgeDefinition[] = INPUTS.map((family, index) => ({
  id: `in-${family}`,
  from: { node: family, side: { wide: "right", narrow: innerSide(index) } },
  to: {
    node: "model",
    side: { wide: "left", narrow: "top" },
    offset: { wide: (index + 1) / (INPUTS.length + 1), narrow: 0.5 },
  },
  route: { wide: "curve", narrow: "orthogonal" },
  curvature: 0.35,
  head: "arrow",
  packets: { count: 1, period: 1800 },
  description: `${SPEC[family].title} is detected by content and loaded into the schematic`,
  bind: { highlight: `${family}Edge`, opacity: "inputsDim" },
}));

const outEdges: EdgeDefinition[] = OUTPUTS.map((family, index) => ({
  id: `out-${family}`,
  from: {
    node: "model",
    side: { wide: "right", narrow: "bottom" },
    offset: { wide: (index + 1) / (OUTPUTS.length + 1), narrow: 0.5 },
  },
  to: { node: family, side: { wide: "left", narrow: innerSide(index) } },
  route: { wide: "curve", narrow: "orthogonal" },
  curvature: 0.35,
  head: "arrow",
  packets: { count: 1, period: 1800 },
  description:
    family === "xsnapshot"
      ? "Snapshots round-trip: written from the schematic and read back without loss"
      : `The schematic is exported as ${SPEC[family].title}`,
  bind: { highlight: `${family}Edge`, opacity: "outputsDim" },
  ...(family === "xsnapshot" ? { tail: "arrow" as const, stroke: "dashed" as const } : {}),
}));

// Timeline ------------------------------------------------------------------------------------

const INPUT_STEP = 230;
const OUTPUT_STEP = 110;

export const formatsAndIoScene: SceneDefinition = defineScene({
  schemaVersion: 2,
  id: "formats-and-io",
  title: "Formats and I/O: detect on read, choose on write",
  description:
    "Six input families are recognised by their content and converge on one editable schematic of blocks, regions, and NBT. Exporters then fan out to explicitly chosen targets: Java-side formats that preserve structure, Bedrock and SNBT that translate, snapshots for interchange, and whole worlds.",
  breakpoints: { wide: 900, compact: 600 },
  root: stack(
    "root",
    [
      {
        id: "io",
        type: "group",
        layout: { wide: "row", narrow: "stack" },
        gap: { wide: 72, compact: 30, narrow: 34 },
        align: "stretch",
        width: "fill",
        children: [
          slot("read", readPanel, { grow: 250 }),
          stack("col-model", [slot("model", model)], {
            justify: "center",
            height: "fill",
            width: "fill",
            grow: 212,
          }),
          slot("write", writePanel, { grow: 250 }),
        ],
      },
      insight,
    ],
    { gap: 24, width: "fill" },
  ),
  edges: [...inEdges, ...outEdges],
  timeline: timeline([
    fadeIn("read-slot", 0, 400),
    reveal("model-slot", 300, 800, { scale: 0.96 }),
    ...INPUTS.flatMap((family, index) => [
      ...reveal(`${family}-slot`, 300 + index * INPUT_STEP, 700 + index * INPUT_STEP, {
        offset: -8,
      }),
      ...drawEdge(`in-${family}`, 560 + index * INPUT_STEP, 980 + index * INPUT_STEP),
      flow(`in-${family}`, 980 + index * INPUT_STEP),
    ]),
    pulse("model-motif", 2200, 700),
    fadeIn("write-slot", 2600, 3000),
    ...OUTPUTS.flatMap((family, index) => [
      ...drawEdge(`out-${family}`, 2800 + index * OUTPUT_STEP, 3250 + index * OUTPUT_STEP),
      flow(`out-${family}`, 3250 + index * OUTPUT_STEP),
      ...reveal(`${family}-slot`, 3050 + index * OUTPUT_STEP, 3450 + index * OUTPUT_STEP, {
        offset: 8,
      }),
    ]),
    fadeIn("insight", 4000, 4500),
  ]),
  machine,
  controls: [
    {
      id: "mode-read",
      label: "Read",
      event: "MODE_READ",
      group: "Direction",
      description: MODE_COPY.read.title,
      activeWhen: { state: "read" },
    },
    {
      id: "mode-write",
      label: "Write",
      event: "MODE_WRITE",
      group: "Direction",
      description: MODE_COPY.write.title,
      activeWhen: { state: "write" },
    },
    { id: "reset", kind: "reset" as const, label: "Show all" },
  ],
  metadata: { source: "formats-and-io/format-pipeline.svg" },
});

export const formatsAndIoEntry: CatalogueEntry = {
  slug: "formats-and-io",
  order: 6,
  title: "Formats and I/O",
  summary:
    "Six input families are detected by content and converge on one editable schematic; exporters fan out to explicitly chosen formats.",
  concept:
    "Formats and I/O: detectors converge on one editable model, then exports fan out to format families.",
  interaction:
    "Toggle Read or Write to light one direction, or focus any family card to see how it is detected or written.",
  animation:
    "Inputs arrive one after another and flow into the schematic, the model pulses, and the exporters fan out in turn.",
  source: "formats-and-io/format-pipeline.svg",
  scene: formatsAndIoScene,
};
