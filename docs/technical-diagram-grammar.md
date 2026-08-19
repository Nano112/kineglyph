# Technical diagram grammar

Kineglyph's technical grammar stores **relationships and meaning**, not final SVG coordinates.
Named ports, nets, constraints, annotations, and domain recipes are plain serializable data. A
renderer can choose a responsive layout without making the author repeat geometry at every width.

```ts
import { defineTechnicalDiagram, rel, technical } from "kineglyph";
```

Both `rel.*` and `technical.*` are callback-free. `defineRelationalDiagram` and
`defineTechnicalDiagram` validate duplicate ids and broken references early; the underlying specs
remain usable by custom renderers, build tools, and future Kineglyph compilers.

## Named geometry and annotations

The minimal form names two nodes and aligns them. The customised form adds ports, distribution,
attachment, containment, a leader, a bracket, and a measured dimension:

```ts
const minimal = rel.diagram("row", [{ id: "a" }, { id: "b" }], {
  constraints: [rel.align("y", ["a", "b"])],
});

const custom = rel.diagram(
  "pipeline",
  [
    { id: "decode", ports: [rel.port("out", "right", { direction: "output", width: 8 })] },
    { id: "execute", ports: [rel.port("in", "left", { direction: "input", width: 8 })] },
    { id: "shell" },
  ],
  {
    constraints: [
      rel.align("y", ["decode", "execute"]),
      rel.distribute("x", ["decode", "execute"], { gap: 48 }),
      rel.attach(rel.ref("decode", "out"), rel.ref("execute", "in")),
      rel.contain("shell", ["decode", "execute"], 16),
    ],
    annotations: [
      rel.leader("opcode", "decoded opcode", rel.ref("decode", "out")),
      rel.bracket("stage", rel.at("decode", "top-left"), rel.at("execute", "top-right"), {
        label: "execute stage",
        style: "brace",
      }),
      rel.dimension("width", rel.at("decode", "bottom-left"), rel.at("execute", "bottom-right"), {
        unit: "px",
      }),
    ],
  },
);
```

Fractional anchors such as `rel.anchor(0, 0.3)` put multiple pins on one side without baking in
pixels. Named anchors cover the common nine box positions plus `baseline`.

## Circuits, signals, buses, and junctions

_Dogfood · the semantic spec below drives the cards and connectors in the live figure._

```kineglyph live id=grammar-circuit view=preview height=310
import { counterTerminalTheme, defineTechnicalDiagram, figure, material, rel, technical } from "kineglyph";

export const theme = counterTerminalTheme;

const input = technical.component("input-a", "input", [
  rel.port("out", "right", { direction: "output" }),
], { label: "A" });
const xor = technical.gate("xor", "xor", { label: "XOR", tone: "info" });
const fork = technical.junction("fork", { label: "JUNCTION" });
const output = technical.component("sum", "output", [
  rel.port("in", "left", { direction: "input", width: 4 }),
], { label: "SUM", bits: 4, tone: "success" });

const spec = defineTechnicalDiagram(technical.circuit("adder-slice", [input, xor, fork, output], [
  technical.net("a-xor", rel.ref("input-a", "out"), rel.ref("xor", "a"), { animated: true }),
  technical.net("xor-fork", rel.ref("xor", "y"), rel.ref("fork")),
  technical.bus("sum-bus", 4, rel.ref("fork"), rel.ref("sum", "in"), { label: "sum[3:0]" }),
], {
  constraints: [rel.align("y", ["input-a", "xor", "fork", "sum"])],
  annotations: [rel.leader("fanout", "signal fan-out", rel.ref("fork"))],
}));

export default figure("grammar-circuit", { title: "Semantic circuit grammar" }, (f) => {
  const cards = new Map(spec.elements.map((element) => [element.id, f.card({
    id: element.id,
    eyebrow: element.kind.toUpperCase(),
    title: element.label ?? element.id,
    body: element.gate ? `${element.gate.toUpperCase()} gate` : element.bits ? `${element.bits}-bit` : "signal",
    motif: element.kind === "junction" ? "circle" : element.kind === "gate" ? "grid" : "arrow-right",
    tone: element.tone ?? "accent",
    frame: material("raised"),
  })]));
  const order = spec.constraints?.find((item) => item.kind === "align")?.nodes ?? spec.elements.map(({ id }) => id);
  f.root(f.flow(order.map((id) => cards.get(id)), { gap: 52, width: "fill", align: "center" }));
  spec.nets.forEach((net) => net.to.forEach((target) => f.connect(cards.get(net.from.node), cards.get(target.node), {
    head: "arrow",
    route: "orthogonal",
    strokeWidth: net.kind === "bus" ? 4 : 2,
    labels: net.label ? [{ text: net.label }] : undefined,
    packets: net.animated ? { count: 2 } : undefined,
  })));
});
```

Minimal circuits need only `technical.gate`, `technical.net`, and `technical.circuit`. Custom gates
can replace default `a`, `b`, and `y` pins; `technical.component` covers inputs, outputs, clocks,
registers, memory, and custom symbols. A net can fan out to several targets. `technical.bus` requires
a positive logical width, while `signal`, `clock`, `power`, `ground`, and `analog` nets retain their
semantic kind for a renderer or legend.

## Timing diagrams

```kineglyph live id=grammar-timing view=preview height=330
import { counterTerminalTheme, defineTechnicalDiagram, figure, material, technical } from "kineglyph";

export const theme = counterTerminalTheme;

const spec = defineTechnicalDiagram(technical.timing("write-cycle", [
  technical.clock("clk", 4),
  technical.timingSignal("data", [
    { value: "x", duration: 1 },
    { value: 13, duration: 4, label: "0x0d" },
    { value: "z", duration: 1 },
  ]),
  technical.timingSignal("write", [
    { value: 0, duration: 2 }, { value: 1, duration: 2 }, { value: 0, duration: 2 },
  ]),
], { unit: "ns", markers: [{ id: "sample", at: 3, label: "sample" }] }));

export default figure("grammar-timing", {
  title: "One write cycle",
  description: "Clock, write-enable, and data signals show when one register write is sampled.",
}, (f) => {
  const rows = spec.signals.map((signal) => f.row([
    f.code(signal.id.toUpperCase(), { width: 64, tone: "textMuted" }),
    ...signal.segments.map((segment, index) => f.stack([
      f.code(segment.label ?? String(segment.value), { tone: segment.value === 1 ? "warning" : "textMuted" }),
    ], {
      id: `${signal.id}-${index}`,
      width: "fill",
      height: segment.value === 1 ? 42 : 30,
      padding: [6, 8],
      justify: segment.value === 1 ? "start" : "end",
      frame: material(segment.value === 1 ? "raised" : "flat"),
    })),
  ], { gap: 4, width: "fill", align: "center" }));
  f.root(f.stack(rows, { gap: 14, padding: 18, width: "fill", frame: material("flat") }));
});
```

The minimal timing signal is `technical.timingSignal("ready", [{ value: 0, duration: 1 }])`.
Custom diagrams add `x`/`z` states, numeric bus values, labels, radix, units, and named markers.
`technical.clock(id, cycles, period)` expands a deterministic low/high clock without hand-writing
segments.

## State charts and sequences

Minimal and customised state charts use the same explicit references:

```ts
const minimalState = technical.stateChart(
  "toggle",
  [{ id: "off", initial: true }, { id: "on" }],
  [{ id: "toggle", from: "off", to: "on" }],
);
const customState = technical.stateChart(
  "request",
  [
    { id: "idle", initial: true },
    { id: "loading", tone: "info" },
    { id: "done", terminal: true, tone: "success" },
  ],
  [
    { id: "fetch", from: "idle", to: "loading", event: "FETCH" },
    { id: "resolve", from: "loading", to: "done", guard: "response.ok", action: "cache" },
  ],
  { direction: "left-to-right" },
);

const minimalSequence = technical.sequence(
  "ping",
  [{ id: "client" }, { id: "server" }],
  [{ id: "ping", from: "client", to: "server" }],
);
const customSequence = technical.sequence(
  "cache-miss",
  [{ id: "browser" }, { id: "cache" }, { id: "origin" }],
  [
    { id: "lookup", from: "browser", to: "cache", style: "call" },
    { id: "miss", from: "cache", to: "origin", style: "async" },
  ],
  { notes: [{ id: "ttl", label: "TTL expired", over: ["cache"] }] },
);
```

State customisation covers nested `parent` states, initial/terminal roles, events, guards, actions,
direction, tone, and prose. Sequences add participant roles, ordered call/return/async/create/destroy
messages, and notes spanning named participants.

## Neural, dataflow, DAG, and convergence

```ts
const minimalNeural = technical.neural("classifier", [
  { id: "input", units: 3 },
  { id: "output", units: 2 },
]);
const customNeural = technical.neural(
  "classifier",
  [
    { id: "input", label: "Features", units: 3 },
    { id: "hidden", units: 6, activation: "ReLU", tone: "info" },
    { id: "output", label: "Classes", units: 2 },
  ],
  { connections: "dense", title: "Tiny classifier" },
);

const nodes = [{ id: "source" }, { id: "parse" }, { id: "emit" }];
const links = [
  { id: "source-parse", from: "source", to: "parse" },
  { id: "parse-emit", from: "parse", to: "emit" },
];
const flow = technical.dataflow("build", nodes, links);
const dag = technical.dag("tasks", nodes, links, { direction: "top-to-bottom" });
const merge = technical.convergence(
  "merge",
  [{ id: "one" }, { id: "two" }, { id: "result", tone: "success" }],
  [
    { id: "one-result", from: "one", to: "result" },
    { id: "two-result", from: "two", to: "result" },
  ],
);
```

The minimal graph is one node and no links. Custom nodes add groups, values, semantic tones, and
ports; links add direction, labels, and signal bindings. DAG validation rejects cycles, while
convergence intentionally allows many incoming links.

## Memory, registers, buffers, and comparisons

```ts
const minimalMemory = technical.memory("ram", [{ address: 0, value: 0 }]);
const customMemory = technical.memory(
  "stack",
  [
    { address: "0xff00", value: 42, label: "counter", changed: true },
    { address: "0xff08", value: 7, label: "limit" },
  ],
  { wordSize: 64, columns: ["address", "value", "label"] },
);

const minimalRegister = technical.register("flags", [0]);
const customRegister = technical.register("flags", [1, 0, 1, 0], {
  labels: ["Z", "N", "C", "V"],
  msbFirst: true,
});

const minimalBuffer = technical.buffer("queue", 2, []);
const customBuffer = technical.buffer(
  "queue",
  4,
  [
    { id: "e1", label: "click" },
    { id: "e2", label: "paint" },
  ],
  { discipline: "fifo", head: 0, tail: 2 },
);

const minimalComparison = technical.comparison(
  "formats",
  [{ id: "svg" }],
  [{ id: "sharp", values: { svg: true } }],
);
const customComparison = technical.comparison(
  "formats",
  [{ id: "svg", emphasis: true }, { id: "canvas" }],
  [
    { id: "sharp", label: "Sharp at any size", values: { svg: true, canvas: false } },
    { id: "marks", label: "Many marks", values: { svg: "good", canvas: "best" } },
  ],
);
```

Memory customisation covers addresses, changed cells, word size, and columns. Registers retain
unknown/high-impedance bits and optional per-bit labels. Buffers understand capacity, FIFO/LIFO/
ring/queue discipline, head, and tail. Comparison rows are keyed by column id, so validation catches
typos before a renderer silently drops a cell.

## Validation and custom renderers

Use `validateTechnicalDiagram(spec)` when an editor needs all diagnostics. Use
`defineTechnicalDiagram(spec)` when construction should throw immediately. The grammar deliberately
does not prescribe card geometry, wire routing, waveform pixels, or table styling; a Kineglyph
compiler, a tiny table renderer, and a native application can all consume the same semantic spec.
