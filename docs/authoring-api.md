# Authoring API: `figure()` and `plot()`

This is the public authoring surface. `defineScene()` remains available as the advanced escape
hatch (it is the IR that `figure()` produces), but new figures should start here.

## Design position

Kineglyph is a general technical-illustration compiler and runtime, not a node/edge graph library
and not a chart framework. The scene IR (`SceneDefinition`) is deliberately low level: typed
primitives, named layouts, timelines, and machines. Two compact authoring surfaces sit on top:

- `figure(id, meta, build)` — a builder that infers stable ids, composes recipes and fragments,
  sequences motion with presets, and flattens everything into one `SceneDefinition`.
- `plot(rows, options)` (`@kineglyph/plot`) — a typed compiler from ordinary row data to a
  `SceneFragment` of primitives in a `coordinates` group; `plot(spec)` exposes its advanced IR.

Critique we accepted: the edge grammar is an _illustration connector_ system (ports, routes,
markers, labels) — it must not grow into automatic graph layout; charts are not nodes with edges
and must not be expressed through the connector vocabulary; the current 400–800-line catalogue
scenes prove that raw `defineScene()` is a good IR but a poor default authoring API. `figure()`
and `plot()` exist to fix that. Escape hatches (`f.raw(node)`, `defineScene`) always remain.

## `figure()`

```ts
import { figure } from "@kineglyph/core";
import { bar, plot, rule } from "@kineglyph/plot";

// Rows are plain records; channels are typed field names — a misspelled field is a compile error.
const rows = [
  { call: "fill_cuboid", dense: 4, sparse: 9 },
  { call: "set_blocks", dense: 12, sparse: 5 },
  { call: "prepare + place", dense: 7, sparse: 8 },
];

export const buildTimes = figure(
  "build-times",
  { title: "Bulk API cost per placed block", description: "Illustrative benchmark." },
  (f) => {
    const chart = f.add(
      plot(rows, {
        title: "Milliseconds per 100k blocks (illustrative)",
        x: "call",
        y: ["dense", "sparse"], // two series inferred from wide data
        marks: bar(),
        annotations: [rule({ y: 8, label: "budget" })],
        axes: { y: { label: "ms", ticks: { wide: 5, narrow: 3 } } },
        valueLabels: "auto",
      }),
    );
    const note = f.callout("Dense boxes need one bounds growth.", {
      pointer: "left",
      tone: "info",
    });
    f.root(f.stack([f.heading("Where the time goes"), f.flow([chart, note], { gap: 24 })]));
    f.sequence([f.reveal(chart), f.reveal(note, { offset: 8 })], { gap: 200 });
  },
);
```

### Builder contract

Every helper returns the created node so it can be referenced by object; every helper accepts an
optional `id` in its options. When omitted, ids are inferred deterministically from the kind and a
slug of the primary text (`heading-where-the-time-goes`), de-duplicated with a counter, and stable
across builds of the same figure. Ids are validated: duplicates and unknown references throw with
the builder path in the message.

| Helper                                                                                                                                                                                                                                               | Returns                             | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `f.text(text, opts)`, `f.eyebrow`, `f.heading`, `f.title`, `f.caption`, `f.body`, `f.code`                                                                                                                                                           | `TextMark`                          | Text plus every ordinary node placement/material option; `position` and `width` may be responsive                                                                                                                                                                                                                                                                                                                                                       |
| `f.textAt(text, position, opts)`, `f.labelAt(text, position, opts)`                                                                                                                                                                                  | `TextMark`                          | Coordinate/absolute text without `f.raw`; `labelAt` defaults to `bodyStrong`, and `position` may provide `wide` / `compact` / `narrow` values                                                                                                                                                                                                                                                                                                           |
| `f.badge(text, opts)`                                                                                                                                                                                                                                | `BadgeMark`                         | `tone, variant, bind`                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `f.icon(name, opts)`                                                                                                                                                                                                                                 | `IconMark`                          | motif name from `@kineglyph/svg`                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `f.rect(opts)`, `f.circle(opts)`, `f.polyline(points, opts)`, `f.spline(nodes, opts)`, `f.path(d, viewBox, opts)`, `f.image(src, alt, opts)`, `f.legend(items, opts)`, `f.callout(text, opts)`                                                       | marks                               | thin typed wrappers over the schema; `spline` derives a smooth path from placed-node positions                                                                                                                                                                                                                                                                                                                                                          |
| `f.card(opts)`, `f.panel(children, opts)`, `f.pill(text, opts)`, `f.keyValue(k, v, opts)`, `f.rule(opts)`, `f.spacer(size, opts)`                                                                                                                    | groups/marks                        | the recipes formerly in `@kineglyph/scenes/recipes` (moved to core, re-exported by scenes)                                                                                                                                                                                                                                                                                                                                                              |
| `f.codeBlock(source, opts)`, `f.window(content, opts)`, `f.panes(panes, opts)`                                                                                                                                                                       | `GroupNode`                         | portable code/editor application surfaces; code supports deterministic viewports, cursors, exact tokens or an author-time tokenizer, while windows provide semantic tabs/chrome/status and panes switch layout responsively with machine activation/bindings                                                                                                                                                                                            |
| `f.gate(kind, opts)`, `f.junction(opts)`                                                                                                                                                                                                             | group/mark                          | portable circuit symbols: AND, OR, XOR, their inverted forms, NOT, buffer, and mux; schematic gates use the same neutral channel and active signal inks as circuit wires, while `variant: "solid"` restores a compact filled symbol; `orientation` accepts right/down/left/up responsively, while `f.circuit()` defaults to automatic signal direction; junctions make fan-out explicit                                                                 |
| `f.terminal(lines, opts)`, `f.terminalWindow(panes, opts)`, `f.fileTree(entries, opts)`                                                                                                                                                              | `GroupNode`                         | responsive terminal, split-pane/tmux window, and recursive file-tree surfaces; terminal chrome is composable, `typing` selects commands/all/static rows, and files and folders may carry detail, status, and tone                                                                                                                                                                                                                                       |
| `f.place(node, position)`                                                                                                                                                                                                                            | the same node                       | assigns responsive placement before an existing node enters `coordinates` / `absolute`; preserves identity and ids                                                                                                                                                                                                                                                                                                                                      |
| `f.stack`, `f.row`, `f.grid`, `f.overlay`, `f.flow`, `f.coordinates`, `f.absolute`                                                                                                                                                                   | `GroupNode`                         | `flow` = row on wide, stack otherwise                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `f.graph(layers, opts)`                                                                                                                                                                                                                              | `GroupNode`                         | ranked node-link layout; presets are `flow`, `circuit`, and `tree`, with responsive `direction`, shared rank defaults, and per-rank layout/columns/gap overrides                                                                                                                                                                                                                                                                                        |
| `f.circuit(nodes, connections, opts)`                                                                                                                                                                                                                | `{ root, edges, ranks, entrance }`  | infers DAG ranks from the netlist, aligns terminal sinks, orients peers for the responsive direction, and authors semantic wires; `entrance` reveals each rank while its incoming wires draw, so incomplete topology is never shown; feedback links can opt out of rank inference                                                                                                                                                                       |
| `f.logicCircuit(spec, opts)`                                                                                                                                                                                                                         | circuit result + `machine`, `nodes` | compiles named Boolean inputs, gates, and outputs into terminals, responsive nets, expressions, input toggles, and the progressive circuit entrance; supports AND, OR, XOR, their inverted forms, NOT, and buffer                                                                                                                                                                                                                                       |
| `f.add(fragment, opts)`                                                                                                                                                                                                                              | `SceneNode` (the fragment root)     | accepts a `SceneFragment` or a result carrying one (`plot()`); scopes the fragment's ids under `opts.id` (default inferred from the root id) unless they already live in that namespace, appends its edges/controls, and registers its relative tracks as the step `f.reveal(root)` plays (or schedules them at `opts.at`); fragments with several top-level nodes are wrapped in a `stack` named after the scope so the return type is always one node |
| `f.raw(node)`                                                                                                                                                                                                                                        | the node                            | escape hatch: any `SceneNode`, still id-checked                                                                                                                                                                                                                                                                                                                                                                                                         |
| `f.connect(from, to, opts)`                                                                                                                                                                                                                          | `EdgeDefinition`                    | `from`/`to` are nodes or ids; `opts` = every `EdgeDefinition` field except `id/from/to`                                                                                                                                                                                                                                                                                                                                                                 |
| `f.wire(from, to, opts)`                                                                                                                                                                                                                             | `EdgeDefinition`                    | semantic presets for `signal`, `bus`, `control`, `data`, `clock`, `feedback`, `optional`, packet-bearing `flow`, and obstacle-routed `spline`; every route, port, marker, stroke, label, signal state, and tone remains overridable                                                                                                                                                                                                                     |
| `f.reveal(target, opts)`, `f.draw(edge, opts)`, `f.pulse(target, opts)`, `f.flow(edge, opts)`, `f.highlight(target, opts)`, `f.progress(target, opts)`, `f.rotate(target, opts)`, `f.rise(target, opts)` (revealY), `f.wipe(target, opts)` (revealX) | `MotionStep`                        | targets accept a node, an id, an array, or an added fragment (`f.reveal` then plays the fragment's own preset tracks); `opts.duration`, `opts.stagger`, and `opts.easing`; `rotate` uses clockwise `from` / `to` degrees; edge-capable presets reject node-only transforms; `f.flow` is overloaded — children make the flow _layout_, an edge makes the packet _motion_                                                                                 |
| `f.typewrite(target, opts)`                                                                                                                                                                                                                          | `MotionStep`                        | sequential source-ordered character progress for prompts, syntax tokens, or any `TextMark` with `reveal: "characters"`; `characterDuration` and `lineDelay` tune cadence, while `mode: "overlap"` opts into the layered legacy effect                                                                                                                                                                                                                   |
| `f.sequence(steps, opts)`                                                                                                                                                                                                                            | `void`                              | schedules steps one after another (`opts.gap`, `opts.start`); an array inside `steps` runs its members in parallel                                                                                                                                                                                                                                                                                                                                      |
| `f.at(time, ...steps)`                                                                                                                                                                                                                               | `void`                              | absolute scheduling                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `f.machine(definition)`, `f.controls(list)`                                                                                                                                                                                                          | `void`                              | machine `id` defaults to `${figureId}-machine`; control ids default to a slug of the label                                                                                                                                                                                                                                                                                                                                                              |
| `f.root(node)`                                                                                                                                                                                                                                       | `void`                              | sets the root; when omitted the root is a stack of top-level nodes in creation order                                                                                                                                                                                                                                                                                                                                                                    |

`figure()` returns a validated `SceneDefinition` (`defineScene` is applied). Diagnostics are
actionable and thrown eagerly with the figure id and the originating helper:
`figure "build-times": duplicate id "note" (first created by f.callout("Dense boxes need one bo…"), again by f.text("Again"))`,
`figure "build-times": f.connect: unknown target "chart:bar:v1:9"`. At the end of the build the
builder also rejects created nodes that ended up outside the root, controls without a machine,
invalid machines (`validateStateMachine` against the created node ids), and bindings that name a
signal or variable the machine does not declare — the same problems `resolveScene` would surface
later, but with the node and property named.

Orthogonal connectors route around intervening framed nodes through a deterministic visibility
graph. Node placement and port sides remain authored; Kineglyph minimizes route length and bends
without rearranging the graph. When no corridor exists, the fallback route is preserved and
`resolveScene()` reports an `edge-collision` diagnostic.

`f.graph()` is a convenience compiler over the same ordinary groups, not a second scene format.
An inner array is a parallel rank; an object rank can choose its own layout, columns, gap, and id.
The preset supplies defaults, and every structural choice may be overridden:

```ts
const functionBank = f.panel([add, and, or, xor], {
  id: "functions",
  layout: "grid",
  columns: 4,
});

const xorGate = f.gate("xor", { tone: "info", width: 104, height: 68 });
const branch = f.junction({ tone: "info", label: "A fan-out" });

const circuit = f.graph(
  [{ id: "inputs", nodes: [registerA, registerB], gap: 12 }, functionBank, mux, output],
  {
    style: "circuit",
    direction: { wide: "horizontal", compact: "vertical" },
    layerGap: { wide: 64, compact: 44 },
    nodeGap: 12,
  },
);

f.wire(registerA, functionBank, { kind: "bus", tone: "info" });
f.wire(selector, mux, { kind: "control", label: "select" });
f.wire(branch, { node: xorGate, side: "left", offset: 0.34 }, { head: "none" });
```

The named styles are therefore starting grammars rather than locked templates: `flow` follows
article prose, `tree` centres ranked branches, and `circuit` defaults to stable ranks and
orthogonal wires. Responsive direction and rank-level overrides work with every preset.
When the netlist is already known, `f.circuit()` removes the manual rank bookkeeping as well:

```ts
const circuit = f.circuit(
  [inputA, inputB, xorGate, andGate, sum, carry],
  [
    { from: inputA, to: [xorGate, andGate], kind: "flow", head: "none" },
    { from: inputB, to: [xorGate, andGate], kind: "flow", head: "none" },
    { from: xorGate, to: sum, kind: "data" },
    { from: andGate, to: carry, kind: "data" },
  ],
  { direction: { wide: "horizontal", compact: "horizontal", narrow: "vertical" } },
);

f.root(circuit.root);
f.sequence([circuit.entrance]);
```

Ranks are inferred from the directed connections. Nodes at the same depth become peers; horizontal
circuits stack peers within a column, while vertical circuit grids use `columns: "auto"` to fit
the current allocation instead of guessing from a named breakpoint. Terminal sinks align in the
final rank. Automatic gates face right or down with named `in-0`, `in-1`, and `out` ports placed on
the endpoints of their visible electrical pins; gate text remains upright. `f.circuit()` assigns
incoming nets to those pins in netlist order and fixes ordinary terminals to the responsive flow
side, so reflow never falls back to a visually convenient but electrically wrong edge. Set an
explicit responsive `orientation` only when the symbol must disagree with the circuit flow.
The returned `entrance` motion reveals the source rank first, then draws every next rank's incoming
wires in parallel with its nodes. Tune it with `opts.entrance.nodeDuration`, `edgeDuration`,
`nodeStagger`, `edgeStagger`, `stageGap`, and `easing`.
Set `contributesToLayout: false` on a decorative link,
or use `kind: "feedback"`, when an edge should be routed without changing the DAG. Passing several
targets shares the source port without adding a component to the graph. Pass `junction: { ... }`
only when a visible, laid-out fan-out contact is part of the explanation.
Automatic ports try another side when their nearest exit corridor is blocked. Circuit wires avoid
nodes by default; choose `avoid: "nodes-and-edges"` when a dense topology should also reserve routed
centre-lines as soft obstacles. Later nets then prefer a separate lane over an exact overlap and pay
a stable, configurable penalty for crossings. The same topology can therefore reflow without a
second set of mobile coordinates. Circuit wires also receive a restrained `casing` by default: a
wider canvas-coloured stroke below the signal ink. It separates crossings without inventing a
junction, rounds the channel around corners, and follows draw/reveal motion in every renderer.

For moving packets, prefer `speed` when several wires should share one visual velocity. Use
`period` only when every packet must finish its route in a fixed amount of time; an explicit
`period` takes priority over `speed`.

Automatic junctions remain neutral while their signal is off and inherit their authored tone
only while active. Crossings without electrical contact keep the canvas-coloured wire casing and
never receive a junction dot.
Override or remove it per edge when the diagram needs a different material language.

For Boolean logic, `f.logicCircuit()` removes the remaining terminal, net, binding, and machine
boilerplate while preserving the lower-level result:

```ts
const adder = f.logicCircuit({
  inputs: {
    a: { label: "A", tone: "info" },
    b: { label: "B", tone: "accent" },
    cin: { label: "CIN", tone: "success" },
  },
  gates: {
    xor1: { kind: "xor", inputs: ["a", "b"], tone: "info" },
    and1: { kind: "and", inputs: ["a", "b"], tone: "accent" },
    xor2: { kind: "xor", inputs: ["xor1", "cin"], tone: "warning" },
    and2: { kind: "and", inputs: ["xor1", "cin"], tone: "success" },
    carry: { kind: "or", inputs: ["and1", "and2"], tone: "success" },
  },
  outputs: {
    sum: { from: "xor2", tone: "warning" },
    cout: { from: "carry", tone: "success" },
  },
});

f.root(adder.root);
f.sequence([adder.entrance]);
f.machine(adder.machine);
```

The keys form the netlist. Inputs become directly toggleable terminals, gate expressions and live
wire state are derived automatically, and outputs display the referenced bit. Use `adder.nodes`
for selective annotation or additional authored wires; use `f.circuit()` whenever the topology is
not Boolean logic or needs completely custom nodes.

Signal state is one binding, not a bundle of coordinated appearance expressions:

```ts
f.wire(input, gate, {
  kind: "flow",
  casing: { tone: "canvas", width: 5, opacity: 0.94 },
  signal: {
    onTone: "success",
    offTone: "connector",
    onWidth: 3,
    offOpacity: 0.42,
  },
  bind: { signal: "inputOn" },
});
```

The resolver selects the on/off paint and packet visibility. Static diagrams can set
`signal: { value: true, onTone: "success" }`. SVG emits `data-signal="on|off"` and stable state
classes; canvas, PNG, GIF, and live playback receive the same resolved appearance. `flow` and
`spline` wire presets also enable a short animated trail. Override it without changing the route:

```ts
f.wire(input, gate, {
  kind: "spline",
  packets: {
    count: 2,
    period: 1_400,
    trail: true,
    trailLength: 0.07,
    trailWidth: 2,
    trailOpacity: 0.68,
  },
});
```

The bead and trail share the resolved centre-line, keep moving after a finite entrance sequence,
pause with the figure, and use the current seek time in deterministic exports. Reduced-motion mode
holds them at the resolved frame.

Choose routing independently from appearance. `route: "orthogonal"` produces rounded rectilinear
traces; `route: "spline"` first finds the same obstacle-safe centre-line, then applies either
`spline: "rounded"` or `spline: "fluid"`. `avoid` accepts `"none"`, `"nodes"`, or
`"nodes-and-edges"`; `clearance`, `laneGap`, and `crossingCost` expose the routing trade-offs without
requiring manual bend points.

```ts
f.wire(source, sink, {
  kind: "spline",
  spline: "fluid",
  avoid: "nodes-and-edges",
  cornerRadius: 24,
});
```

```kineglyph live id=authoring-routed-splines view=preview height=300
import { figure, ledgerTheme } from "kineglyph";

export const theme = ledgerTheme;

export default figure("routed-splines", {
  title: "Animated splines keep their lanes",
  description: "Two packet-bearing paths route through parallel stages without sharing a centre-line.",
}, (f) => {
  const source = f.tile({ icon: "code", eyebrow: "INPUT", title: "Events", variant: "compact" });
  const normalise = f.tile({ icon: "settings", eyebrow: "PATH A", title: "Normalise", variant: "compact" });
  const enrich = f.tile({ icon: "spark", eyebrow: "PATH B", title: "Enrich", variant: "compact" });
  const sink = f.tile({ icon: "check", eyebrow: "OUTPUT", title: "Ready", variant: "compact", active: true });

  f.root(f.graph([source, [normalise, enrich], sink], {
    style: "tree",
    layerGap: { wide: 76, compact: 48 },
    padding: 14,
    width: "fill",
  }));
  const edges = [
    f.wire(source, normalise, { kind: "spline", tone: "info" }),
    f.wire(source, enrich, { kind: "spline", tone: "accent", spline: "rounded" }),
    f.wire(normalise, sink, { kind: "spline", tone: "success" }),
    f.wire(enrich, sink, { kind: "spline", tone: "warning", spline: "rounded" }),
  ];
  f.sequence([f.reveal([source, normalise, enrich, sink], { stagger: 70 }), f.draw(edges, { stagger: 60 }), f.flow(edges)]);
});
```

Gate shapes and junctions are recipes over normal paths, circles, and groups—not renderer-only
objects—so the same schematic is available in SVG, PNG, GIF, and the live runtime. The gate's
rotatable silhouette is separated from its upright label, and its outer bounds swap with the
orientation. Its 3:2 connection box exactly matches the path view box, so a routed edge and the
visible pin share the same coordinate rather than merely looking close at one scale. The default
`variant: "schematic"` draws a neutral channel below an active signal overlay, matching the casing
and ink grammar of connected wires. Choose `variant: "solid"` when the gate should read as a compact
filled icon instead of part of an electrical schematic.

Every node may expose reusable named ports, and any connector may target one directly:

```ts
const device = f.raw({
  id: "device",
  type: "rect",
  width: 120,
  height: 72,
  ports: [
    { id: "clock", side: "left", offset: 0.75 },
    { id: "data", side: "right", offset: 0.5 },
  ],
});

f.wire(clock, { node: device, port: "clock" }, { kind: "clock" });
f.wire(device, output, { kind: "data" });
```

Explicit `side` and `offset` still override a named port for unusual schematics. Ordinary automatic
ports remain useful for cards and graphs; named ports are the exact contract for circuits and other
symbols whose attachment point is part of their shape.
For a schematic plane where topology must remain exact, use `f.place(gate, responsivePosition)`
before adding the same node to `f.coordinates()`. Unlike an object spread, `f.place()` preserves
the builder node's identity and makes accidental duplicate ids impossible.

When a line should pass through positioned symbols, create and place the symbols first, then use
`f.spline([source, stage, output])`. Their positions become the spline knots, so moving a symbol
also reshapes the line; there is no second point array to keep in sync.

Icon-first topologies and layered physical controls have portable recipes too:

```ts
const input = f.tile({ icon: "code", eyebrow: "SOURCE", title: "Compile files" });
const output = f.tile({
  icon: "export",
  title: "Output",
  detail: "12 modules",
  detailStyle: "code",
  variant: "compact",
  active: true,
});
const socket = f.port({ active: true });
const grid = f.gridPlane({ columns: 12, rows: 8 });
const choices = f.cardFan([draft, selected, archived], { angle: 9, activeIndex: 1 });
```

Labelled tiles measure their content by default and cap it at a responsive readable width. Choose
`variant: "icon"` for square topology nodes, `"compact"` for an icon beside copy, or `"labelled"`
for a centred vertical composition. `detail` and `detailBind` add a live value or third line without
hand-authoring another container.

`tile`, `port`, `gridPlane`, and `cardFan` compile to ordinary marks and groups. Their standalone
forms are `tileNode()`, `port()`, `gridPlane()`, and `cardFan()`. The
[glyph style laboratory](./glyph-style-lab.md) renders the same primitives under `signalTheme`,
`integrationTheme`, and `instrumentTheme`.

A transparent figure canvas and a visible card are independent choices. Keep the embed transparent
in the figure metadata, then wrap only the diagram that needs a surface:

```ts
const circuit = f.logicCircuit(netlist);
f.root(
  f.panel([circuit.root], {
    padding: { wide: 18, compact: 15, narrow: 12 },
    frame: material("raised"),
  }),
);
```

That produces intentional card padding and a theme-aware surface without reintroducing a second
background around every glyph.

`editorialCircuitTheme` combines the counter automaton's monospace palette with Instrument's
surface hierarchy: neutral contact shadows, beveled terminal cards, muted inactive rails, and no
coloured glow. It is the default dogfood theme on the CPU-from-bits page.

### Fill paint

`FrameStyle.fill` and the fill on rectangles, circles, paths, and polylines accept theme-aware
linear or radial gradients. Stops are serializable data; alpha belongs to each stop.

```ts
import { alphaGradient, linearGradient, radialGradient } from "@kineglyph/core";

const area = alphaGradient("chart1", { from: 0.5, to: 0, angle: 90 });
const card = linearGradient(
  [
    { at: 0, color: "surfaceRaised" },
    { at: 1, color: "surfaceMuted" },
  ],
  { angle: 118 },
);
const glow = radialGradient(
  [
    { at: 0, color: "accent", opacity: 0.35 },
    { at: 1, color: "accent", opacity: 0 },
  ],
  { center: [0.35, 0.25], radius: 0.8 },
);
```

Angles run clockwise: `0` is left-to-right and `90` is top-to-bottom. Stop positions, center,
focal point, radius, and spread mode are explicit. The resolver substitutes theme tokens before
SVG or raster export, so one gradient definition works under every theme.

### Easing

Easing stays serializable. Use a named curve for a familiar default, `cubicBezier()` for exact
control, or `spring()` for a damped overshoot. The same evaluator drives timeline seeking, browser
playback, and frame export; no function callbacks or renderer-only curve names enter the scene.

```ts
import { cubicBezier, spring, track } from "@kineglyph/core";

const draw = cubicBezier(0.16, 1, 0.3, 1);
const settle = spring({ frequency: 9.5, damping: 7.5 });

f.reveal(chart, { duration: 900, easing: draw });
f.reveal(stats, { stagger: 90, scale: 0.97, easing: settle });

const custom = track("path", "progress", [
  { time: 0, value: 0 },
  { time: 700, value: 1, easing: "easeOutExpo" },
]);
```

Named curves are `linear`, `easeIn`, `easeOut`, `easeInOut`, their cubic variants,
`easeOutBack`, and `easeOutExpo`. Cubic Bézier x handles must remain between 0 and 1; y handles and
springs may overshoot. Exact endpoints make loops and deterministic snapshots safe.

### Deterministic transform motion

Rotation is a first-class responsive node property and timeline property, measured clockwise in
degrees around the resolved node centre. Use `rotation: { wide: -9, narrow: -4 }` for a static
layered composition; `rotateTo()` authors a serializable motion track. `seekTimeline()`, SVG frames,
live browser playback, PNG, and GIF all evaluate the same angle. Values are not reduced modulo 360,
so a track from `0` to `720` makes two complete turns instead of becoming a still.

```kineglyph live id=authoring-rotation-parity view=preview height=250
import { defineScene, kineglyphTheme, rotateTo, timeline } from "kineglyph";

export const theme = kineglyphTheme;
export const loop = true;

export default defineScene({
  schemaVersion: 2,
  id: "rotation-parity",
  title: "One deterministic turn",
  description: "A square follows a circular guide while rotating twice around its own centre.",
  root: {
    id: "root",
    type: "group",
    layout: "coordinates",
    height: 180,
    children: [
      {
        id: "orbit",
        type: "circle",
        position: { x: 0.5, y: 0.5, anchor: "center" },
        radius: 58,
        fill: "none",
        stroke: "border",
        dash: "dotted",
      },
      {
        id: "needle",
        type: "path",
        position: { x: 0.5, y: 0.5, anchor: "center" },
        width: 140,
        height: 56,
        d: "M 8 28 L 124 28 L 107 12 M 124 28 L 107 44",
        viewBox: { width: 140, height: 56 },
        fill: "none",
        stroke: "accent",
        strokeWidth: 3,
        lineCap: "round",
      },
      {
        id: "hub",
        type: "circle",
        position: { x: 0.5, y: 0.5, anchor: "center" },
        radius: 7,
        fill: "text",
        stroke: "canvas",
        strokeWidth: 2,
      },
    ],
  },
  timeline: timeline([rotateTo("needle", 0, 1800, 0, 360)]),
});
```

```ts
import { rotateTo, timeline } from "@kineglyph/core";

const motion = timeline([
  rotateTo("needle", 0, 800, -30, 45),
  rotateTo("needle", 900, 1_600, 45, 180),
]);
```

The same deterministic track model now covers solid paint, geometry, numbers, paths, and motion
paths. Helpers remain plain-data constructors:

```ts
import {
  cue,
  fillTo,
  followPath,
  layoutTo,
  morphPath,
  numericTextTo,
  reusableTimeline,
  strokeTo,
  strokeWidthTo,
  timeline,
  useTimeline,
} from "@kineglyph/core";

const source = timeline(
  [
    fillTo("card", 0, 500, "#1d4ed8", "#0f766e"),
    strokeTo("card", 0, 500, "#93c5fd", "#5eead4"),
    strokeWidthTo("card", 0, 500, 1, 4),
    numericTextTo("count", 0, 900, 0, 12_480, { thousands: true, suffix: " req/s" }),
    morphPath("trend", 0, 900, "M 0 20 L 20 8 L 40 16", "M 0 8 L 20 18 L 40 4"),
    layoutTo(
      "card",
      0,
      700,
      { x: 20, y: 30, width: 120, height: 60 },
      { x: 180, y: 20, width: 180, height: 90 },
    ),
    followPath(
      "packet",
      0,
      900,
      [
        { x: 0, y: 0 },
        { x: 90, y: 0 },
        { x: 140, y: 50 },
      ],
      { orient: true },
    ),
  ],
  900,
  [cue("settled", 900)],
);

const reusable = reusableTimeline(source);
const secondCard = useTimeline(reusable, { prefix: "secondary", at: 250, speed: 1.25 });
```

Inside `figure()`, the same track is normally shorter:

```ts
f.sequence([f.rotate(needle, { from: -30, to: 180, duration: 1_600 })]);
```

Transform support is intentionally renderer-parity-first:

| Property                           | Seek | Live browser | SVG | PNG/GIF | Reduced motion |
| ---------------------------------- | ---- | ------------ | --- | ------- | -------------- |
| opacity                            | Yes  | Yes          | Yes | Yes     | Final value    |
| translate X/Y and scale            | Yes  | Yes          | Yes | Yes     | Final value    |
| rotation about node centre         | Yes  | Yes          | Yes | Yes     | Final value    |
| solid fill, stroke, and text color | Yes  | Yes          | Yes | Yes     | Final value    |
| stroke width and corner radius     | Yes  | Yes          | Yes | Yes     | Final value    |
| numeric text                       | Yes  | Yes          | Yes | Yes     | Final value    |
| keyed x/y/width/height layout      | Yes  | Yes          | Yes | Yes     | Final value    |
| compatible path morphs             | Yes  | Yes          | Yes | Yes     | Final value    |
| follow path, optional orientation  | Yes  | Yes          | Yes | Yes     | Final value    |
| progress, reveal, highlight, flow  | Yes  | Yes          | Yes | Yes     | Final value    |

Reduced motion never leaves a rotating or partially transformed object in an indeterminate state:
the runtime renders the deterministic terminal frame immediately, and manual seeks continue to
hold that frame until reduced motion is disabled.

Literal hex colours interpolate by channel. Semantic paint tokens deliberately hold until the end
keyframe because their resolved values depend on the active theme. Path morphs interpolate only
when both paths have matching command topology and numeric arity; incompatible paths hold the first
shape and switch at the endpoint. Numeric text reuses its resolved box instead of reflowing every
frame. Layout tracks animate one resolved node box; they do not rerun responsive layout or routing
mid-frame. Named cues are metadata for transport/editor affordances, and reusable timelines remain
ordinary serializable tracks after scoping and time scaling.

### Materials and effects

`material(role, overrides)` separates a surface's semantic relationship from its visual treatment.
Roles are `flat`, `raised`, `floating`, `inset`, and `glass`; themes map them to paint, elevation,
texture, blur, blending, and named shader intent. Group frames accept the returned style, and shape
nodes accept a `material` reference directly. See [Materials and effects](./materials-and-effects.md).

Implementation notes (`packages/core/src/figure.ts`; the cookbook is `cookbook.md`):

- Ids: `${kind}-${slug(primaryText)}` — kind is the helper name (`heading`, `card`, `stack`,
  `key-value`, …), the slug is lower-case ASCII (diacritics stripped, everything else collapsed to
  `-`) capped at 32 characters, de-duplicated with `-2`, `-3`, … in creation order; groups use
  their `label` as primary text, marks their text / name / alt / label. Fragment scopes default to
  the first segment of the fragment root's id (`plot` for a plot); already-namespaced fragments are
  left untouched so `plot()` handles stay valid. A compiler result that exposes `handles` is never
  re-scoped: a conflicting `f.add(result, { id })` or a second insertion fails with an instruction
  to set `id` in the compiler call. This turns a potentially stale typed handle into an immediate,
  actionable authoring error.
- Timing: `f.sequence` keeps a clock from `opts.start` (default 0); every entry starts at the
  clock and advances it by its duration (the longest member of a parallel array) plus `opts.gap`
  (default 120). Staggered arrays last `duration + stagger × (n − 1)`. Duplicate track ids get a
  deterministic `#2` suffix; the timeline duration is the last keyframe plus `meta.hold`.
- Recipes include icon tiles, ports, construction grids, responsive card fans, and a `text` recipe
  (explicit `textStyle`). `ContainerOptions` includes
  `minHeight`, `justifySelf`, `position`, `opacity`, `focusGroup`, `inspect`, `revealAnchor`,
  `allowOverflow`, and responsive `rotation`; `rule` / `spacer` return `RectMark`. Core exports the flow layout as
  `flowLayout` (core's `flow` is the packet timeline helper); `@kineglyph/scenes` re-exports it as
  `flow`.

## `plot()`

For a publication-style single-series bar chart, start with the opinionated recipe. It supplies
responsive heights and label density, display typography, a hidden y axis, gradient/glow bars,
zero labels, and rise motion; every choice remains overridable through normal plot options:

```ts
import { editorialBarChart, editorialDarkTheme } from "@kineglyph/plot";

const chart = editorialBarChart(
  [
    { eclipses: "0", years: 0 },
    { eclipses: "1", years: 0 },
    { eclipses: "2", years: 3610 },
    { eclipses: "3", years: 894 },
  ],
  {
    x: "eclipses",
    y: "years",
    title: "Solar eclipses in a year",
    subtitle: "2000 BCE – 3000 CE",
    axisLabel: "number of solar eclipses in the year",
  },
);
```

Use `editorialDarkTheme` directly or derive a branded variant with
`createTheme(overrides, editorialDarkTheme)`. `editorialBarChart` also accepts `fill`, `material`,
`radius`, `barPadding`, `zeroLabel`, responsive `height`, ordinary axis/grid options, and the full
`valueLabels` object (`show`, `format`, `textStyle`, `tone`, `gap`).

The primary entry point is generic and inferred from data:

`plot<Row>(rows, options)` where channels are typed field names of `Row` (`x`, `y` or
`y: [..fields]` for wide data, `series` for long/tidy data, `tone`, `label`) and `marks` is a
mark helper: `bar()`, `groupedBar()`, `stackedBar()`, `line()`, `area()`, `dot()`,
`heatmap({ row, column, value })`, `sparkline()`; semantic annotations come from `rule`,
`range`, `calloutAt`, `pointLabel`. A misspelled field name is a compile-time error. Series ids
and labels are inferred (field name or distinct value, slugged, deterministic) and returned as
typed `handles` (`result.handles.series.dense.marks`, `.line`, `.area`, `handles.axes.x`) so
authors never spell generated ids.

The declarative `PlotSpec` (`series[]` with explicit ids and `Datum{x, y}` or `DataChannels`)
remains available as the advanced/internal IR: `plot(spec, options)`. Both forms share one
compiler and return `{ fragment, handles, domains, ticks, description, diagnostics, markIds }`.

- Scales: `linear` (domain auto / auto-zero / explicit; nice ticks via 1-2-5 stepping; explicit
  tick arrays) and `band` (frozen category order = first appearance, `padding`).
- Series marks: `bar` (grouped by default, stacked via `stackedBar`/`stack: true`, negatives
  diverge below the baseline), `line`, `area`, `scatter`/`dot`; `heatmap` (sequential or
  diverging ramp); `sparkline` (minimal mode). Bar and area helpers accept `fill` and
  `fillOpacity`; line and point color remains `tone`.
- Axes, gridlines, derived legends, value labels (`auto` uses layout-aware rules; the object form
  adds responsive `show`, zero replacement, formatting, style, tone, and gap), annotations:
  reference lines/bands, point labels, datum callouts.
- Output: a root group `${id}` containing an optional title/legend and `${id}:area` — a
  `coordinates` group with percent-sized rects, fractional polylines, circles, tick texts — plus a
  focus group per inspectable series (`${id}:series:${s}`) so it is one tab stop and its marks are
  reached with the arrow keys; `interactive: "none"` emits no focus group. Every inspectable mark
  carries `inspect` (role, title, fields such as Series, Category, Value) and `revealAnchor` where
  relevant.
- Motion is `auto` or `none`. `auto` emits mark-appropriate relative tracks: bars rise, lines and
  areas draw before their points appear, and heatmap cells sweep row by row. `duration` and
  `easing` control the generated tracks. `figure()` schedules those tracks with `f.sequence`;
  `none` emits no plot motion.
- Specialized families: `pieChart`, `donutChart`, `radialChart`, threshold-aware `gaugeChart`,
  `histogram`, `distributionPlot`, `rangeChart`, `boxPlot`, `confidenceBand`, `ganttChart` /
  `timelineChart`, `treemap`, `sankey`, and `topology`. Each compiles to ordinary scene nodes and
  stable handles, so it remains inspectable and exportable in every renderer.
- Determinism: equal input → byte-identical fragment; category order and domains are frozen and
  reported in `domains`/`ticks`.

## External live signals

A figure that receives values from application state or a network feed declares its binding keys
and defaults in metadata. It does not need a state machine:

```ts
const live = figure(
  "live-rate",
  { title: "Live rate", signals: { rate: "waiting", severity: "textMuted" } },
  (f) => {
    const value = f.code("waiting", {
      textStyle: "display",
      bind: { text: "rate", tone: "severity" },
    });
    f.root(f.stack([f.eyebrow("REQUESTS / SECOND"), value]));
  },
);

const controller = mountKineglyph(element, { scene: live });
controller.setSignals({ rate: "1,284", severity: "success" });
```

The builder validates `bind` names against the union of metadata signals, machine variables, and
machine-derived signals. Resolution starts with metadata defaults, then overlays machine values,
then external values supplied to `resolveScene(..., { signals })` or `setSignals()`. This ordering
lets a remote feed own measurements while a local machine still owns selection and controls.
Text, tone, dimensions, visibility, progress, and path data can all be bound; path bindings let a
rolling sparkline update without replacing its scene or restarting an entrance timeline.

## Pointer, drag, hover, and focus are semantic events

Gesture handlers name machine events; they are still plain scene data. Pointer and drag payloads
are normalized `[x, y]` values within the owning node, coalesced to one event per animation frame.
Hover/focus events have no payload. Drag targets are focusable and the arrow keys provide a coarse
keyboard fallback, so the same explanation is not pointer-only.

```kineglyph live id=authoring-gesture-pad view=preview height=360
import { expr, figure, kineglyphTheme, material } from "kineglyph";

export const theme = kineglyphTheme;

export default figure("gesture-pad", { title: "Semantic gesture pad" }, (f) => {
  const pad = f.rect({
    id: "gesture-surface",
    label: "Drag position",
    description: "Drag, move the pointer, or use an arrow key to change normalized coordinates.",
    width: "fill",
    height: 150,
    fill: "surfaceMuted",
    stroke: "border",
    strokeWidth: 1,
    radius: 12,
    onPointer: "POINT",
    onDrag: "POINT",
    onHover: "ENTER",
    onLeave: "LEAVE",
    onFocus: "ENTER",
    onBlur: "LEAVE",
    bind: { highlight: "engaged" },
  });
  const xBar = f.rect({ width: 130, height: 8, radius: 4, fill: "accent", bind: { width: "xWidth" } });
  const yBar = f.rect({ width: 130, height: 8, radius: 4, fill: "info", bind: { width: "yWidth" } });
  f.root(f.stack([
    pad,
    f.row([
      f.stack([f.eyebrow("X"), f.code("0.50", { bind: { text: "x" } }), xBar], { gap: 5, width: "fill" }),
      f.stack([f.eyebrow("Y"), f.code("0.50", { bind: { text: "y" } }), yBar], { gap: 5, width: "fill" }),
      f.badge("READY", { bind: { text: "status", tone: "statusTone" } }),
    ], { gap: 18, align: "center", width: "fill" }),
  ], { gap: 16, padding: 16, width: "fill", frame: material("flat") }));
  f.machine({
    initial: "ready",
    variables: { point: [0.5, 0.5], engaged: false },
    states: { ready: { on: {
      POINT: { target: "ready", actions: [{ type: "set", var: "point", value: { fromEvent: true } }] },
      ENTER: { target: "ready", actions: [{ type: "set", var: "engaged", value: true }] },
      LEAVE: { target: "ready", actions: [{ type: "set", var: "engaged", value: false }] },
    } } },
    signals: {
      xValue: expr.at(expr.var("point"), 0),
      yValue: expr.at(expr.var("point"), 1),
      x: expr.format(expr.signal("xValue"), { precision: 2 }),
      y: expr.format(expr.signal("yValue"), { precision: 2 }),
      xWidth: expr.multiply(expr.signal("xValue"), 130),
      yWidth: expr.multiply(expr.signal("yValue"), 130),
      status: expr.when({ var: "engaged", op: "truthy" }, "TRACKING", "READY"),
      statusTone: expr.when({ var: "engaged", op: "truthy" }, "success", "textMuted"),
    },
  });
});
```

Use `onActivate` for click/Enter/Space actions. Use `onHover`/`onLeave` only for transient context,
never as the sole route to information. `onFocus`/`onBlur` should mirror meaningful hover state.
`onPointer` observes movement without capture; `onDrag` captures after pointer-down and continues
until release. The event payload is a serializable number pair and may be stored with
`{ fromEvent: true }`, replayed in tests, or snapshotted for export.

For a complete WebSocket lifecycle and the separate runtime-free microchart renderer, see
[Live data and microcharts](./live-data-and-microcharts.md).

## Data channels

Data is always plain rows plus field names — never accessor callbacks — so scenes stay
serializable and exportable. The generic form types the field names against `Row`; the advanced
IR accepts `Datum[]` or `{ rows, x, y, tone?, label?, description? }`.

## Consumption

- TypeScript / bundlers: `import { figure } from "@kineglyph/core"; import { plot } from "@kineglyph/plot";`
  then `mountKineglyph(element, { scene: myFigure, theme })` or `<KineglyphFigure figure={myFigure} />`.
- Vanilla `<script type="module">`: the web bundle re-exports `figure`, `plot`, themes, and
  `mountKineglyph`.
- Blade: register the figure with `registerScene("build-times", myFigure)` in the Vite entry and
  use `<x-kineglyph-figure scene="build-times" />`.
- Export: `kineglyph-export png --scene ./figures.js#buildTimes --out build-times.png`.
