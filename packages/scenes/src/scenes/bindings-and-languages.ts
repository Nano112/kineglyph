import {
  defineScene,
  drawEdge,
  fadeIn,
  flow,
  progressTo,
  pulse,
  reveal,
  timeline,
  type EdgeDefinition,
  type GroupNode,
  type SceneDefinition,
  type SceneNode,
  type SignalExpression,
  type StateMachineDefinition,
} from "@kineglyph/core";
import type { CatalogueEntry } from "../catalogue.js";
import { caption, card, code, eyebrow, flow as flowLayout, stack } from "../recipes.js";

/**
 * One annotated Rust bridge generating six foreign language bindings: the core is annotated in
 * src/bridge, Diplomat generates naming, byte and JSON contracts, and six surfaces share them.
 * Native Rust bypasses the bridge and calls the core directly.
 */

const LANGS = ["js", "python", "kotlin", "php", "c", "cpp"] as const;
type Lang = (typeof LANGS)[number];
const SURFACES = [...LANGS, "rust"] as const;
type Surface = (typeof SURFACES)[number];

const SURFACE_COPY: Record<
  Surface,
  {
    readonly title: string;
    readonly runtime: string;
    readonly control: string;
    readonly motif: string;
    readonly snippet: string;
    readonly detail: string;
  }
> = {
  js: {
    title: "JavaScript / TypeScript",
    runtime: "WASM",
    control: "JS / TS",
    motif: "world",
    snippet: 'import { Schematic } from "nucleation"',
    detail:
      "WASM keeps the same byte and JSON contracts in browsers and Node; nothing native to build or ship.",
  },
  python: {
    title: "Python",
    runtime: "nanobind native module",
    control: "Python",
    motif: "terminal",
    snippet: "import nucleation as nc",
    detail:
      "A nanobind native module: Python objects wrap the same byte contract with no copies in between.",
  },
  kotlin: {
    title: "Kotlin / JVM",
    runtime: "JNA",
    control: "Kotlin / JVM",
    motif: "cube",
    snippet: "import dev.nucleation.Schematic",
    detail:
      "JNA loads the shared library on the JVM and calls the generated symbol names directly.",
  },
  php: {
    title: "PHP",
    runtime: "FFI",
    control: "PHP",
    motif: "plug",
    snippet: "use Nucleation\\Schematic;",
    detail:
      "PHP FFI binds the C ABI at runtime; names and payload shapes are generated, never hand-written.",
  },
  c: {
    title: "C",
    runtime: "stable ABI headers",
    control: "C",
    motif: "file",
    snippet: '#include "nucleation.h"',
    detail:
      "Stable ABI headers are the contract every other binding is built on; the symbols never drift.",
  },
  cpp: {
    title: "C++",
    runtime: "typed C ABI wrappers",
    control: "C++",
    motif: "layers",
    snippet: "#include <nucleation.hpp>",
    detail:
      "Typed wrappers add RAII and real types over the same exported C symbols, so nothing is duplicated.",
  },
  rust: {
    title: "Rust",
    runtime: "native crate · direct",
    control: "Rust",
    motif: "rust",
    snippet: "use nucleation::Schematic;",
    detail:
      "Native Rust skips the bridge entirely: crates depend on the core and call its API directly.",
  },
};

const DEFAULT_TITLE = "One definition, seven surfaces";
const DEFAULT_SNIPPET = "src/bridge/*.rs";
const DEFAULT_DETAIL =
  "Annotate the core once in src/bridge; Diplomat generates naming, byte and JSON contracts for every surface.";

// ---------------------------------------------------------------------------------------------
// Machine
// ---------------------------------------------------------------------------------------------

const focusEvents: Record<string, string> = {
  ...Object.fromEntries(SURFACES.map((surface) => [`FOCUS_${surface.toUpperCase()}`, surface])),
  RESET: "overview",
};

function surfaceState(surface: Surface) {
  return {
    label: SURFACE_COPY[surface].title,
    entry: [
      { type: "set" as const, var: "surface", value: surface },
      { type: "select" as const, node: `surface-${surface}` },
    ],
    on: focusEvents,
  };
}

function capitalise(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function surfaceSignals(): Record<string, SignalExpression> {
  const signals: Record<string, SignalExpression> = {};
  for (const surface of SURFACES) {
    signals[`${surface}Focus`] = {
      when: { var: "surface", op: "eq", value: surface },
      then: 1,
      else: 0,
    };
    signals[`${surface}Dim`] = {
      when: { var: "surface", op: "in", value: ["none", surface] },
      then: 1,
      else: 0.55,
    };
    signals[`edge${capitalise(surface)}`] = {
      when: { var: "surface", op: "eq", value: surface },
      then: 1,
      else: 0,
    };
    signals[`edge${capitalise(surface)}Tone`] = {
      when: { var: "surface", op: "in", value: ["none", surface] },
      then: "neutral",
      else: "muted",
    };
  }
  return signals;
}

const machine: StateMachineDefinition = {
  id: "binding-surfaces",
  initial: "overview",
  variables: { surface: "none" },
  states: {
    overview: {
      label: "All surfaces",
      entry: [
        { type: "set", var: "surface", value: "none" },
        { type: "select", node: null },
      ],
      on: focusEvents,
    },
    ...Object.fromEntries(SURFACES.map((surface) => [surface, surfaceState(surface)])),
  },
  signals: {
    focusTitle: {
      match: { var: "surface" },
      cases: Object.fromEntries(
        SURFACES.map((surface) => [
          surface,
          `${SURFACE_COPY[surface].title} · ${SURFACE_COPY[surface].runtime}`,
        ]),
      ),
      default: DEFAULT_TITLE,
    },
    snippet: {
      match: { var: "surface" },
      cases: Object.fromEntries(
        SURFACES.map((surface) => [surface, SURFACE_COPY[surface].snippet]),
      ),
      default: DEFAULT_SNIPPET,
    },
    detail: {
      match: { var: "surface" },
      cases: Object.fromEntries(SURFACES.map((surface) => [surface, SURFACE_COPY[surface].detail])),
      default: DEFAULT_DETAIL,
    },
    coreFocus: { when: { var: "surface", op: "neq", value: "none" }, then: 1, else: 0 },
    bridgeFocus: {
      when: { var: "surface", op: "in", value: [...LANGS] },
      then: 1,
      else: 0,
    },
    bridgeDim: { when: { var: "surface", op: "eq", value: "rust" }, then: 0.55, else: 1 },
    bridgeTone: {
      when: { var: "surface", op: "eq", value: "rust" },
      then: "muted",
      else: "neutral",
    },
    ...surfaceSignals(),
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

/** Pipeline stage: a card centred in a full-height column so the row reads as one line. */
function stage(
  id: string,
  options: {
    readonly eyebrow: string;
    readonly title: string;
    readonly body: string;
    readonly motif: string;
    readonly tone: "accent" | "info";
    readonly bind: NonNullable<GroupNode["bind"]>;
    readonly grow: number;
  },
): GroupNode {
  return stack(
    `col-${id}`,
    [
      fillHeader(
        card(id, {
          eyebrow: options.eyebrow,
          title: options.title,
          body: options.body,
          motif: options.motif,
          tone: options.tone,
          bind: options.bind,
          compact: true,
        }),
      ),
    ],
    { width: "fill", height: "fill", justify: "center", grow: options.grow },
  );
}

const core = stage("core", {
  eyebrow: "Native surface",
  title: "Rust core",
  body: "Schematics, fields, and simulation live here once.",
  motif: "rust",
  tone: "accent",
  bind: { highlight: "coreFocus" },
  grow: 5,
});

const annotations = stage("annotations", {
  eyebrow: "src/bridge",
  title: "Annotations",
  body: "Attributes mark what may cross the boundary.",
  motif: "code",
  tone: "accent",
  bind: { highlight: "bridgeFocus", opacity: "bridgeDim" },
  grow: 6,
});

const diplomat = stage("diplomat", {
  eyebrow: "Generator",
  title: "Diplomat",
  body: "Generated contracts: naming, bytes, JSON.",
  motif: "bridge",
  tone: "info",
  bind: { highlight: "bridgeFocus", opacity: "bridgeDim" },
  grow: 6,
});

function surfaceCard(surface: Surface): SceneNode {
  const copy = SURFACE_COPY[surface];
  return stack(
    `wrap-${surface}`,
    [
      fillHeader(
        card(`surface-${surface}`, {
          eyebrow: copy.runtime,
          title: copy.title,
          motif: copy.motif,
          tone: "success",
          interactive: true,
          onActivate: `FOCUS_${surface.toUpperCase()}`,
          description: copy.detail,
          bind: { highlight: `${surface}Focus`, opacity: `${surface}Dim` },
          metadata: { surface },
          compact: true,
          ...(surface === "rust"
            ? { frame: { fill: "surface", stroke: "border", dash: "dashed" } }
            : {}),
        }),
      ),
    ],
    { width: "fill" },
  );
}

const surfaces = stack(
  "surfaces",
  [
    eyebrow("surfaces-eyebrow", "Six generated surfaces"),
    responsive(
      "surfaces-grid",
      { wide: "stack", compact: "grid", narrow: "stack" },
      LANGS.map(surfaceCard),
      { gap: 10, width: "fill", columns: { compact: 2, narrow: 1 } },
    ),
    eyebrow("direct-eyebrow", "Direct, no bridge"),
    responsive(
      "surfaces-direct",
      { wide: "stack", compact: "grid", narrow: "stack" },
      [surfaceCard("rust")],
      { gap: 10, width: "fill", columns: { compact: 2, narrow: 1 } },
    ),
  ],
  { gap: 10, width: "fill", grow: 9 },
);

const footer = stack(
  "footer",
  [
    {
      id: "footer-legend",
      type: "legend",
      items: [
        { id: "one-definition", label: "one definition", swatch: "accent" },
        { id: "generated-naming", label: "generated naming", swatch: "info" },
        { id: "shared-contracts", label: "shared byte and JSON contracts", swatch: "success" },
      ],
      gap: 18,
    },
    responsive(
      "footer-focus",
      { wide: "row", narrow: "stack" },
      [
        stack(
          "footer-copy",
          [
            eyebrow("footer-title", DEFAULT_TITLE, { bind: { text: "focusTitle" } }),
            caption("footer-detail", DEFAULT_DETAIL, {
              bind: { text: "detail" },
              maxLines: 3,
              width: "fill",
            }),
          ],
          { gap: 3, width: "fill" },
        ),
        code("footer-snippet", DEFAULT_SNIPPET, {
          bind: { text: "snippet" },
          tone: "accent",
          maxLines: 1,
        }),
      ],
      { gap: { wide: 24, narrow: 8 }, align: { wide: "center", narrow: "start" }, width: "fill" },
    ),
  ],
  {
    gap: 12,
    padding: [12, 16],
    frame: { fill: "surfaceMuted", stroke: "border", dash: "dashed" },
    width: "fill",
  },
);

function fanEdge(surface: Lang): EdgeDefinition {
  return {
    id: `gen-${surface}`,
    from: { node: "diplomat", side: "right" },
    to: { node: `surface-${surface}`, side: "left" },
    route: "curve",
    curvature: 0.2,
    head: "arrow",
    packets: { count: 1, period: 2000 },
    hidden: { wide: false, compact: true },
    description: `Diplomat generates the ${SURFACE_COPY[surface].title} surface`,
    bind: { highlight: `edge${capitalise(surface)}`, tone: `edge${capitalise(surface)}Tone` },
  };
}

export const bindingsAndLanguagesScene: SceneDefinition = defineScene({
  schemaVersion: 2,
  id: "bindings-and-languages",
  title: "One annotated Rust bridge generating six foreign language bindings",
  description:
    "The Rust core is annotated once in src/bridge; Diplomat generates naming, byte and JSON contracts, and JavaScript, Python, Kotlin, PHP, C, and C++ surfaces all share them. Native Rust bypasses the bridge and calls the core directly.",
  breakpoints: { wide: 900, compact: 600 },
  root: stack(
    "root",
    [
      flowLayout("pipeline", [core, annotations, diplomat, surfaces], {
        gap: { wide: 44, compact: 26 },
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
      id: "core-annotations",
      from: { node: "core", side: { wide: "right", compact: "bottom" } },
      to: { node: "annotations", side: { wide: "left", compact: "top" } },
      route: "straight",
      head: "arrow",
      packets: { count: 1, period: 1800 },
      description: "The core is annotated in src/bridge",
      bind: { highlight: "bridgeFocus", tone: "bridgeTone" },
    },
    {
      id: "annotations-diplomat",
      from: { node: "annotations", side: { wide: "right", compact: "bottom" } },
      to: { node: "diplomat", side: { wide: "left", compact: "top" } },
      route: "straight",
      head: "arrow",
      packets: { count: 1, period: 1800 },
      description: "Diplomat reads the annotations",
      bind: { highlight: "bridgeFocus", tone: "bridgeTone" },
    },
    ...LANGS.map(fanEdge),
    {
      id: "gen-trunk",
      from: { node: "diplomat", side: "bottom" },
      to: { node: "surfaces-grid", side: "top" },
      route: "straight",
      head: "triangle",
      stroke: "flow",
      hidden: { wide: true, compact: false },
      description: "Diplomat generates all six surfaces",
      bind: { highlight: "bridgeFocus", tone: "bridgeTone" },
    },
    {
      id: "core-rust",
      from: { node: "core", side: { wide: "bottom", compact: "left" } },
      to: { node: "surface-rust", side: "left" },
      route: "orthogonal",
      cornerRadius: 10,
      head: "arrow",
      tail: "dot",
      stroke: "dashed",
      labels: [
        {
          text: "direct call, no bridge",
          placement: "middle",
          hidden: { wide: false, compact: true },
        },
      ],
      description: "Native Rust calls the core directly, bypassing Diplomat",
      bind: { highlight: "edgeRust", tone: "edgeRustTone" },
    },
  ],
  timeline: timeline([
    reveal("col-core", 0, 450, { scale: 0.96 }),
    drawEdge("core-annotations", 450, 850),
    flow("core-annotations", 850),
    reveal("col-annotations", 650, 1050, { scale: 0.96 }),
    drawEdge("annotations-diplomat", 1050, 1450),
    flow("annotations-diplomat", 1450),
    reveal("col-diplomat", 1250, 1650, { scale: 0.96 }),
    pulse("diplomat-motif", 1650, 700),
    fadeIn("surfaces-eyebrow", 1750, 2150),
    drawEdge("gen-trunk", 1800, 2300),
    ...LANGS.flatMap((surface, index) => {
      const start = 1850 + index * 220;
      return [
        drawEdge(`gen-${surface}`, start, start + 450),
        flow(`gen-${surface}`, start + 450),
        reveal(`wrap-${surface}`, start + 200, start + 600, { offset: -8 }),
      ];
    }),
    fadeIn("direct-eyebrow", 3450, 3850),
    drawEdge("core-rust", 3450, 4100),
    reveal("wrap-rust", 3850, 4250, { offset: -8 }),
    fadeIn("footer", 4200, 4700),
    progressTo("footer-detail", 4500, 5100),
  ]),
  machine,
  controls: [
    ...SURFACES.map((surface) => ({
      id: `focus-${surface}`,
      label: SURFACE_COPY[surface].control,
      event: `FOCUS_${surface.toUpperCase()}`,
      group: "Surface",
      description: SURFACE_COPY[surface].detail,
      activeWhen: { var: "surface", op: "eq" as const, value: surface },
    })),
    { id: "reset", kind: "reset" as const, label: "Show all" },
  ],
  metadata: { source: "bindings-and-languages/binding-pipeline.svg" },
});

export const bindingsAndLanguagesEntry: CatalogueEntry = {
  slug: "bindings-and-languages",
  order: 7,
  title: "Bindings and languages",
  summary:
    "One annotated Rust bridge and Diplomat generate six language surfaces that share naming, byte, and JSON contracts.",
  concept:
    "Bindings and languages: the Rust core and bridge annotations generate language surfaces with shared semantics.",
  interaction:
    "Pick a surface (click a card, keyboard, or the buttons) to light its path from the core, dim the others, and read its import line and guarantee; Rust shows the direct call that skips the bridge.",
  animation:
    "The core is annotated, Diplomat generates, six connectors fan out carrying packets to each language, native Rust bypasses the bridge, and the shared-contract strip appears.",
  source: "bindings-and-languages/binding-pipeline.svg",
  scene: bindingsAndLanguagesScene,
};
