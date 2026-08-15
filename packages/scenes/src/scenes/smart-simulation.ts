import {
  defineScene,
  drawEdge,
  fadeIn,
  flow,
  progressTo,
  reveal,
  timeline,
  type Condition,
  type GroupNode,
  type MachineAction,
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
  code,
  eyebrow,
  flow as flowLayout,
  motif,
  row,
  rule,
  stack,
  title,
} from "../recipes.js";

/**
 * A decision laboratory: pick what the result must preserve (an intent), toggle extra
 * capabilities, and watch the recommended Nucleation engine, its explanation, and the
 * connectors change. The machine is a pure function of (intent, probes, ticks).
 */

const INTENTS = ["comparator", "placement", "circuit", "world"] as const;
type Intent = (typeof INTENTS)[number];
const ENGINES = ["shorthand", "authoring", "mchprs", "ticksim"] as const;
type Engine = (typeof ENGINES)[number];
type RowTone = "accent" | "success" | "info" | "warning";

const INTENT_COPY: Record<
  Intent,
  {
    readonly title: string;
    readonly body: string;
    readonly motif: string;
    readonly event: string;
    readonly engine: Engine;
    readonly tone: RowTone;
    readonly control: string;
  }
> = {
  comparator: {
    title: "Comparator value",
    body: "A container must read one signal strength, say 13.",
    motif: "signal",
    event: "INTENT_COMPARATOR",
    engine: "shorthand",
    tone: "accent",
    control: "Comparator value",
  },
  placement: {
    title: "Placed block state",
    body: "A block lands with the connections it would have in game.",
    motif: "blocks",
    event: "INTENT_PLACEMENT",
    engine: "authoring",
    tone: "success",
    control: "Placed block state",
  },
  circuit: {
    title: "Circuit output",
    body: "Given inputs, what does the redstone logic produce?",
    motif: "circuit",
    event: "INTENT_CIRCUIT",
    engine: "mchprs",
    tone: "info",
    control: "Circuit output",
  },
  world: {
    title: "World over time",
    body: "Pistons, fluids, and entities evolving tick after tick.",
    motif: "world",
    event: "INTENT_WORLD",
    engine: "ticksim",
    tone: "warning",
    control: "World over time",
  },
};

const ENGINE_COPY: Record<
  Engine,
  {
    readonly label: string;
    readonly token: string;
    readonly body: string;
    readonly badge: string;
    readonly motif: string;
    readonly tone: RowTone;
    readonly why: string;
  }
> = {
  shorthand: {
    label: "Descriptor shorthand",
    token: "signal=13",
    body: "Author the inventory NBT directly; no clock advances.",
    badge: "keeps the value",
    motif: "tag",
    tone: "accent",
    why: "Author the inventory NBT that yields the comparator value. Nothing is simulated and no clock advances.",
  },
  authoring: {
    label: "Smart authoring",
    token: "simulate=true",
    body: "Derive connections and settle local effects once.",
    badge: "keeps local effects",
    motif: "spark",
    tone: "success",
    why: "Placing the block state derives its connections and settles local effects once, then stops.",
  },
  mchprs: {
    label: "Fast logic evaluation",
    token: "MchprsWorld",
    body: "Compile the circuit, then probe many inputs cheaply.",
    badge: "keeps the logic",
    motif: "chip",
    tone: "info",
    why: "Compile the circuit once, then probe many inputs without paying for world mechanics.",
  },
  ticksim: {
    label: "Full mechanics",
    token: "TickSimulation",
    body: "Advance real ticks: pistons, fluids, entities in order.",
    badge: "keeps tick order",
    motif: "clockTick",
    tone: "warning",
    why: "Advance the world tick by tick so pistons, fluids, and entities keep their exact order.",
  },
};

const DEFAULT_WHY =
  "Choose an intent, or toggle a capability, to see which engine keeps what matters.";
const DEFAULT_NOTE = "Toggle a capability to see when a path escalates.";

// ---------------------------------------------------------------------------------------------
// Machine: states are recommendations, variables are the reader's answers
// ---------------------------------------------------------------------------------------------

const setIntent = (intent: Intent): readonly MachineAction[] => [
  { type: "set", var: "intent", value: intent },
];
const toggleProbes: readonly MachineAction[] = [{ type: "toggle", var: "probes" }];
const toggleTicks: readonly MachineAction[] = [{ type: "toggle", var: "ticks" }];

/** Choosing an intent lands on its base engine unless a capability already forces a heavier one. */
function intentTransitions(intent: Intent): readonly MachineTransition[] {
  const actions = setIntent(intent);
  const list: MachineTransition[] = [
    {
      target: "ticksim",
      guard: { var: "ticks", op: "truthy" },
      actions,
      description: "Tick order always needs the full simulation",
    },
  ];
  if (intent === "placement")
    list.push({
      target: "mchprs",
      guard: { var: "probes", op: "truthy" },
      actions,
      description: "Many probes outgrow a single placement",
    });
  list.push({ target: INTENT_COPY[intent].engine, actions });
  return list;
}

/** Guards read the pre-toggle value, so each list is a case split on where probes will land. */
const probesTransitions: readonly MachineTransition[] = [
  {
    target: "ticksim",
    guard: {
      any: [
        { var: "ticks", op: "truthy" },
        { var: "intent", op: "eq", value: "world" },
      ],
    },
    actions: toggleProbes,
  },
  { target: "mchprs", guard: { var: "intent", op: "eq", value: "circuit" }, actions: toggleProbes },
  {
    target: "shorthand",
    guard: { var: "intent", op: "eq", value: "comparator" },
    actions: toggleProbes,
    description: "Probing does not change shorthand: the value is authored, not measured",
  },
  {
    target: "mchprs",
    guard: { var: "probes", op: "falsy" },
    actions: toggleProbes,
    description: "Turning probes on escalates to the compiled circuit",
  },
  {
    target: "authoring",
    guard: { var: "intent", op: "eq", value: "placement" },
    actions: toggleProbes,
  },
  { target: "idle", actions: toggleProbes },
];

const ticksTransitions: readonly MachineTransition[] = [
  {
    target: "ticksim",
    guard: {
      any: [
        { var: "ticks", op: "falsy" },
        { var: "intent", op: "eq", value: "world" },
      ],
    },
    actions: toggleTicks,
    description: "Turning tick order on forces the full simulation",
  },
  {
    target: "shorthand",
    guard: { var: "intent", op: "eq", value: "comparator" },
    actions: toggleTicks,
  },
  {
    target: "mchprs",
    guard: {
      any: [
        { var: "intent", op: "eq", value: "circuit" },
        { var: "probes", op: "truthy" },
      ],
    },
    actions: toggleTicks,
  },
  {
    target: "authoring",
    guard: { var: "intent", op: "eq", value: "placement" },
    actions: toggleTicks,
  },
  { target: "idle", actions: toggleTicks },
];

const resetTransition: MachineTransition = {
  target: "idle",
  actions: [
    { type: "set", var: "intent", value: "none" },
    { type: "set", var: "probes", value: false },
    { type: "set", var: "ticks", value: false },
  ],
};

const events = {
  INTENT_COMPARATOR: intentTransitions("comparator"),
  INTENT_PLACEMENT: intentTransitions("placement"),
  INTENT_CIRCUIT: intentTransitions("circuit"),
  INTENT_WORLD: intentTransitions("world"),
  TOGGLE_PROBES: probesTransitions,
  TOGGLE_TICKS: ticksTransitions,
  RESET: resetTransition,
} as const;

function engineState(engine: Engine) {
  return {
    label: ENGINE_COPY[engine].label,
    entry: [{ type: "select" as const, node: `engine-${engine}` }],
    on: events,
  };
}

const machine: StateMachineDefinition = {
  id: "smart-simulation-lab",
  initial: "idle",
  variables: { intent: "none", probes: false, ticks: false },
  states: {
    idle: { label: "No path yet", entry: [{ type: "select", node: null }], on: events },
    shorthand: engineState("shorthand"),
    authoring: engineState("authoring"),
    mchprs: engineState("mchprs"),
    ticksim: engineState("ticksim"),
  },
  signals: {
    engine: {
      match: { state: true },
      cases: Object.fromEntries(ENGINES.map((engine) => [engine, ENGINE_COPY[engine].token])),
      default: "No path yet",
    },
    engineLabel: {
      match: { state: true },
      cases: Object.fromEntries(ENGINES.map((engine) => [engine, ENGINE_COPY[engine].label])),
      default: "waiting for an intent",
    },
    engineWhy: {
      match: { state: true },
      cases: Object.fromEntries(ENGINES.map((engine) => [engine, ENGINE_COPY[engine].why])),
      default: DEFAULT_WHY,
    },
    engineTone: {
      match: { state: true },
      cases: Object.fromEntries(ENGINES.map((engine) => [engine, ENGINE_COPY[engine].tone])),
      default: "muted",
    },
    probesOn: { when: { var: "probes" }, then: 1, else: 0 },
    ticksOn: { when: { var: "ticks" }, then: 1, else: 0 },
    intentLabel: {
      match: { var: "intent" },
      cases: Object.fromEntries(INTENTS.map((intent) => [intent, INTENT_COPY[intent].title])),
      default: "none",
    },
    probesState: { when: { var: "probes" }, then: "on", else: "off" },
    ticksState: { when: { var: "ticks" }, then: "on", else: "off" },
    probesDescription: {
      when: { var: "probes" },
      then: "Probe many inputs: on. The answer is pulled to MchprsWorld unless tick order is also needed.",
      else: "Probe many inputs: off. Activate to require evaluating the same logic for many inputs.",
    },
    ticksDescription: {
      when: { var: "ticks" },
      then: "Needs tick order: on. Only TickSimulation preserves the exact tick sequence.",
      else: "Needs tick order: off. Activate to require the exact game tick sequence.",
    },
    probesTone: { when: { var: "probes" }, then: "info", else: "muted" },
    ticksTone: { when: { var: "ticks" }, then: "warning", else: "muted" },
    capabilityNote: {
      when: { var: "ticks" },
      then: {
        when: { var: "probes" },
        then: "Tick order wins: the probes run under full mechanics, slower but exact.",
        else: "Tick order forces the full simulation; nothing lighter preserves it.",
      },
      else: {
        when: { var: "probes" },
        then: {
          match: { var: "intent" },
          cases: {
            comparator: "Probing does not change shorthand: the value is authored, not measured.",
            placement: "Many probes outgrow one placement: compile the circuit instead.",
            world: "The world path already ticks; probing rides on the full simulation.",
          },
          default: "Compile once, probe many: MchprsWorld answers without ticking the world.",
        },
        else: DEFAULT_NOTE,
      },
    },
    noteTone: {
      when: { any: [{ var: "probes" }, { var: "ticks" }] },
      then: "warning",
      else: "muted",
    },
    ...focusSignals(),
    forceProbes: { when: { all: [{ var: "probes" }, { state: "mchprs" }] }, then: 1, else: 0 },
    forceProbesTone: { when: { var: "probes" }, then: "info", else: "muted" },
    forceTicks: { when: { all: [{ var: "ticks" }, { state: "ticksim" }] }, then: 1, else: 0 },
    forceTicksTone: { when: { var: "ticks" }, then: "warning", else: "muted" },
  },
};

function capitalise(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/** Per-intent, per-engine, and per-connector focus/dim/tone signals. */
function focusSignals(): Record<string, SignalExpression> {
  const signals: Record<string, SignalExpression> = {};
  for (const intent of INTENTS) {
    const engine = INTENT_COPY[intent].engine;
    const served: Condition = {
      all: [{ var: "intent", op: "eq", value: intent }, { state: engine }],
    };
    signals[`${intent}Focus`] = {
      when: { var: "intent", op: "eq", value: intent },
      then: 1,
      else: 0,
    };
    signals[`${intent}Dim`] = {
      when: { var: "intent", op: "in", value: ["none", intent] },
      then: 1,
      else: 0.55,
    };
    signals[`flow${capitalise(intent)}`] = { when: served, then: 1, else: 0 };
    signals[`flow${capitalise(intent)}Tone`] = {
      when: { any: [{ var: "intent", op: "eq", value: "none" }, served] },
      then: "neutral",
      else: "muted",
    };
  }
  for (const engine of ENGINES) {
    signals[`${engine}Focus`] = { when: { state: engine }, then: 1, else: 0 };
    signals[`${engine}Dim`] = { when: { state: ["idle", engine] }, then: 1, else: 0.55 };
  }
  return signals;
}

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

// ---------------------------------------------------------------------------------------------
// Nodes
// ---------------------------------------------------------------------------------------------

const question = row(
  "question",
  [
    motif("question-motif", "target", { tone: "accent", size: 28 }),
    stack(
      "question-copy",
      [
        eyebrow("question-eyebrow", "Decision lab"),
        title("question-title", "What must the result preserve?"),
        caption(
          "question-caption",
          "Pick an intent, toggle what it must also keep, and the engine that guarantees it lights up.",
          { maxLines: 4 },
        ),
      ],
      { gap: 4, width: "fill" },
    ),
  ],
  {
    gap: 16,
    align: "center",
    padding: [14, 18],
    frame: { fill: "surfaceMuted", stroke: "border", dash: "dashed" },
    width: "fill",
  },
);

/** Cards keep the bindings; the wrapper carries the entrance track so both stay effective. */
function intentCard(intent: Intent): SceneNode {
  const copy = INTENT_COPY[intent];
  return stack(
    `wrap-intent-${intent}`,
    [
      fillHeader(
        card(`intent-${intent}`, {
          eyebrow: "Preserve",
          title: copy.title,
          body: copy.body,
          motif: copy.motif,
          tone: copy.tone,
          interactive: true,
          onActivate: copy.event,
          description: `${copy.body} Recommended: ${ENGINE_COPY[copy.engine].token}.`,
          bind: { highlight: `${intent}Focus`, opacity: `${intent}Dim` },
          metadata: { intent, engine: copy.engine },
          compact: true,
          height: "fill",
        }),
      ),
    ],
    { width: "fill", height: "fill", grow: 2 },
  );
}

function engineCard(engine: Engine): SceneNode {
  const copy = ENGINE_COPY[engine];
  return stack(
    `wrap-engine-${engine}`,
    [
      fillHeader(
        card(`engine-${engine}`, {
          eyebrow: copy.label,
          title: copy.token,
          body: copy.body,
          motif: copy.motif,
          tone: copy.tone,
          extras: [dotLine(`engine-${engine}-keeps`, copy.badge, copy.tone)],
          description: copy.why,
          bind: { highlight: `${engine}Focus`, opacity: `${engine}Dim` },
          metadata: { engine },
          compact: true,
          height: "fill",
        }),
      ),
    ],
    { width: "fill", height: "fill", grow: 3 },
  );
}

const pairs = stack(
  "pairs",
  INTENTS.map((intent) =>
    responsive(
      `pair-${intent}`,
      { wide: "row", narrow: "stack" },
      [intentCard(intent), engineCard(INTENT_COPY[intent].engine)],
      { gap: { wide: 56, narrow: 22 }, align: "stretch", width: "fill" },
    ),
  ),
  { gap: { wide: 18, narrow: 30 }, width: "fill", grow: 2 },
);

function chip(
  id: string,
  options: {
    readonly label: string;
    readonly motif: string;
    readonly tone: RowTone;
    readonly event: string;
    readonly signal: "probes" | "ticks";
    readonly description: string;
  },
): SceneNode {
  return row(
    id,
    [
      motif(`${id}-motif`, options.motif, { tone: options.tone, size: 20 }),
      caption(`${id}-label`, options.label, { tone: "text", width: "fill" }),
      {
        id: `${id}-state`,
        type: "circle",
        radius: 5,
        fill: "muted",
        stroke: "none",
        bind: { tone: `${options.signal}Tone` },
      },
    ],
    {
      gap: 10,
      align: "center",
      padding: [10, 12],
      frame: { fill: "surface", stroke: "border" },
      width: "fill",
      interactive: true,
      onActivate: options.event,
      label: options.label,
      description: options.description,
      bind: { highlight: `${options.signal}On`, description: `${options.signal}Description` },
    },
  );
}

/** A tone-coloured dot followed by a short line: what a path guarantees. */
function dotLine(id: string, text: string, tone: RowTone): SceneNode {
  return row(
    id,
    [
      { id: `${id}-dot`, type: "circle", radius: 4.5, fill: tone, stroke: "none" },
      caption(`${id}-text`, text, { tone: "text", width: "fill", maxLines: 2 }),
    ],
    { gap: 8, align: "center", width: "fill" },
  );
}

const capabilities = stack(
  "caps",
  [
    eyebrow("caps-eyebrow", "Also needs"),
    responsive(
      "chips",
      { wide: "stack", compact: "row", narrow: "stack" },
      [
        chip("chip-probes", {
          label: "probe many inputs",
          motif: "compare",
          tone: "info",
          event: "TOGGLE_PROBES",
          signal: "probes",
          description: "Evaluate the same logic for many inputs. Pulls the answer to MchprsWorld.",
        }),
        chip("chip-ticks", {
          label: "needs tick order",
          motif: "clock",
          tone: "warning",
          event: "TOGGLE_TICKS",
          signal: "ticks",
          description: "The exact game tick sequence matters. Forces TickSimulation.",
        }),
      ],
      { gap: 10, width: "fill" },
    ),
  ],
  { gap: 8, width: "fill" },
);

const recommendation = stack(
  "recommendation",
  [
    eyebrow("rec-eyebrow", "Recommended path"),
    title("rec-engine", "No path yet", { bind: { text: "engine" } }),
    row(
      "rec-label",
      [
        {
          id: "rec-label-dot",
          type: "circle",
          radius: 4.5,
          fill: "muted",
          stroke: "none",
          bind: { tone: "engineTone" },
        },
        eyebrow("rec-label-text", "waiting for an intent", {
          bind: { text: "engineLabel" },
          width: "fill",
        }),
      ],
      { gap: 8, align: "center", width: "fill" },
    ),
    caption("rec-why", DEFAULT_WHY, { bind: { text: "engineWhy" }, maxLines: 4 }),
    {
      id: "rec-note",
      type: "callout",
      text: DEFAULT_NOTE,
      tone: "muted",
      pointer: "none",
      maxLines: 3,
      width: "fill",
      bind: { text: "capabilityNote", tone: "noteTone" },
    },
    rule("rec-rule"),
    readout("readout-intent", "intent", "intentLabel"),
    readout("readout-probes", "probe many inputs", "probesState"),
    readout("readout-ticks", "needs tick order", "ticksState"),
  ],
  {
    gap: 8,
    padding: [14, 16],
    frame: { fill: "surfaceMuted", stroke: "border", dash: "dashed" },
    width: "fill",
    height: { wide: "fill", compact: "hug" },
  },
);

/** One line of the lab's variable readout: a label and its live value. */
function readout(id: string, label: string, signal: string): SceneNode {
  return row(
    id,
    [
      caption(`${id}-key`, label),
      code(`${id}-value`, "none", { tone: "text", bind: { text: signal } }),
    ],
    { gap: 8, justify: "between", align: "center", width: "fill" },
  );
}

const side = stack("side", [capabilities, recommendation], {
  gap: 18,
  width: { wide: 336, compact: "fill" },
  height: { wide: "fill", compact: "hug" },
});

export const smartSimulationScene: SceneDefinition = defineScene({
  schemaVersion: 2,
  id: "smart-simulation",
  title: "Choose a Nucleation authoring or simulation path",
  description:
    "A decision laboratory for Nucleation's four paths: descriptor shorthand, simulate=true placement, MchprsWorld, and TickSimulation. Choosing what the result must preserve, and which capabilities it needs, selects the engine that guarantees it.",
  breakpoints: { wide: 900, compact: 600 },
  root: stack(
    "root",
    [
      question,
      flowLayout("lab", [pairs, side], {
        gap: { wide: 56, compact: 24 },
        align: "stretch",
        width: "fill",
      }),
    ],
    { gap: 22, width: "fill" },
  ),
  edges: [
    ...INTENTS.map((intent) => ({
      id: `flow-${intent}`,
      from: {
        node: `intent-${intent}`,
        side: { wide: "right" as const, narrow: "bottom" as const },
      },
      to: {
        node: `engine-${INTENT_COPY[intent].engine}`,
        side: { wide: "left" as const, narrow: "top" as const },
      },
      route: "straight" as const,
      head: "arrow" as const,
      packets: { count: 1, period: 1800 },
      description: `${INTENT_COPY[intent].title} is served by ${ENGINE_COPY[INTENT_COPY[intent].engine].token}`,
      bind: { highlight: `flow${capitalise(intent)}`, tone: `flow${capitalise(intent)}Tone` },
    })),
    {
      id: "force-probes",
      from: { node: "chip-probes", side: "left" },
      to: { node: "engine-mchprs", side: "right" },
      route: "curve",
      curvature: 0.35,
      head: "arrow",
      tail: "dot",
      stroke: "dashed",
      hidden: { wide: false, compact: true },
      description: "Probing many inputs pulls the answer to MchprsWorld",
      bind: { highlight: "forceProbes", tone: "forceProbesTone" },
    },
    {
      id: "force-ticks",
      from: { node: "chip-ticks", side: "left" },
      to: { node: "engine-ticksim", side: "right" },
      route: "curve",
      curvature: 0.35,
      head: "arrow",
      tail: "dot",
      stroke: "dashed",
      hidden: { wide: false, compact: true },
      description: "Needing tick order forces TickSimulation",
      bind: { highlight: "forceTicks", tone: "forceTicksTone" },
    },
  ],
  timeline: timeline([
    reveal("question", 0, 500, { scale: 0.97 }),
    reveal("wrap-intent-comparator", 450, 850, { offset: -10 }),
    reveal("wrap-intent-placement", 600, 1000, { offset: -10 }),
    reveal("wrap-intent-circuit", 750, 1150, { offset: -10 }),
    reveal("wrap-intent-world", 900, 1300, { offset: -10 }),
    drawEdge("flow-comparator", 1350, 1750),
    flow("flow-comparator", 1750),
    reveal("wrap-engine-shorthand", 1600, 2000, { scale: 0.96 }),
    drawEdge("flow-placement", 1850, 2250),
    flow("flow-placement", 2250),
    reveal("wrap-engine-authoring", 2100, 2500, { scale: 0.96 }),
    drawEdge("flow-circuit", 2350, 2750),
    flow("flow-circuit", 2750),
    reveal("wrap-engine-mchprs", 2600, 3000, { scale: 0.96 }),
    drawEdge("flow-world", 2850, 3250),
    flow("flow-world", 3250),
    reveal("wrap-engine-ticksim", 3100, 3500, { scale: 0.96 }),
    reveal("caps", 3450, 3850, { offset: 8 }),
    drawEdge("force-probes", 3700, 4150),
    drawEdge("force-ticks", 3800, 4250),
    fadeIn("recommendation", 4150, 4600),
    progressTo("rec-why", 4450, 5000),
  ]),
  machine,
  controls: [
    ...INTENTS.map((intent) => ({
      id: `intent-${intent}-control`,
      label: INTENT_COPY[intent].control,
      event: INTENT_COPY[intent].event,
      group: "Preserve",
      description: INTENT_COPY[intent].body,
      activeWhen: { var: "intent", op: "eq" as const, value: intent },
    })),
    {
      id: "toggle-probes",
      label: "Probe many inputs",
      event: "TOGGLE_PROBES",
      group: "Also needs",
      description: "Toggle whether many inputs must be evaluated",
      activeWhen: { var: "probes", op: "truthy" as const },
    },
    {
      id: "toggle-ticks",
      label: "Tick order",
      event: "TOGGLE_TICKS",
      group: "Also needs",
      description: "Toggle whether the exact tick sequence must be preserved",
      activeWhen: { var: "ticks", op: "truthy" as const },
    },
    { id: "reset", kind: "reset" as const, label: "Clear" },
  ],
  metadata: { source: "smart-simulation/choose-engine.svg" },
});

export const smartSimulationEntry: CatalogueEntry = {
  slug: "smart-simulation",
  order: 5,
  title: "Smart simulation",
  summary:
    "Asking what the result must preserve picks between descriptor shorthand, simulate=true placement, MchprsWorld, and TickSimulation.",
  concept:
    "Smart simulation: a state-machine decision laboratory for shorthand, placement, circuits, and ticks.",
  interaction:
    "Choose an intent card or toggle a capability (click, keyboard, or the buttons) to change the recommended engine, its explanation, and the highlighted connectors; Clear resets.",
  animation:
    "The question is posed, the four intents appear, each connector carries a packet to its engine, and the recommendation panel opens waiting for a choice.",
  source: "smart-simulation/choose-engine.svg",
  scene: smartSimulationScene,
};
