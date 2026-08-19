# Authoring cookbook

Practical recipes for writing Kineglyph figures with `figure()` (and `plot()` for charts). The
contract lives in [`authoring-api.md`](./authoring-api.md); this document is the "how do I…"
companion. Every snippet compiles against `@kineglyph/core`; the first figure below is also a
test (`packages/core/src/figure.example.test.ts`) that resolves at three widths with zero layout
diagnostics.

## 1. Mental model

Kineglyph has one intermediate representation, the `SceneDefinition`: typed nodes (`group`,
`text`, `rect`, `polyline`, `callout`, …) with stable ids, named layouts (`wide` / `compact` /
`narrow`), connectors (`edges`), one `timeline` of keyframe tracks, and an optional state
`machine` with `controls`. Everything downstream — the resolver, the SVG renderer, the web and
React runtimes, the export CLI — consumes only that IR.

`figure()` is an authoring surface _over_ the IR, not a second model:

- helpers create ordinary nodes and infer stable ids (`card-plan`, `heading-where-the-time-goes`),
- `f.add()` composes fragments (a compiled chart, a reusable cluster) under a scoped namespace,
- motion presets return **steps** that `f.sequence()` / `f.at()` place on the one timeline,
- `f.machine()` / `f.controls()` add interaction and are validated against the nodes you created,
- the result is a validated `SceneDefinition` — the same thing `defineScene()` returns.

Drop down to `defineScene()` (or `f.raw(node)` inside a figure) when you need a node shape the
helpers do not expose, when you generate a scene from data with hundreds of nodes and want full
control over ids, or when you are porting an existing hand-written scene. Nothing in the runtimes
knows whether a scene came from `figure()` or from raw IR.

## 2. Your first figure

A three-stage build explainer: three interactive cards joined by connectors, a callout whose text
follows the machine, a reveal sequence, and two controls. The figure itself stays under 80 lines
(plus the import), and needs no chart package.

```ts
import { figure, type MachineTransition, type Paint } from "@kineglyph/core";

export const buildExplainer = figure(
  "build-explainer",
  {
    title: "How a build request becomes blocks",
    description: "Plan the region, place the blocks, commit the result. Focus a stage to see why.",
  },
  (f) => {
    f.heading("Three stages, one guarantee: the world changes once");
    const stage = (n: number, title: string, motif: string, tone: Paint, body: string) =>
      f.card({
        eyebrow: `Stage ${n}`,
        title,
        body,
        motif,
        tone,
        interactive: true,
        onActivate: `FOCUS_${title.toUpperCase()}`,
        bind: { highlight: `${title.toLowerCase()}Focus` },
      });
    const plan = stage(1, "Plan", "graph", "info", "Bound the region and pick a brush.");
    const place = stage(2, "Place", "blocks", "accent", "Visit every cell and choose a block.");
    const commit = stage(3, "Commit", "cube", "success", "Write the blocks as one edit.");
    const toPlace = f.connect(plan, place, {
      head: "arrow",
      labels: [{ text: "region + brush", hidden: { compact: true } }],
    });
    const toCommit = f.connect(place, commit, { head: "triangle", packets: { count: 2 } });
    f.flow([plan, place, commit], { gap: { wide: 56, compact: 20 } });
    const note = f.callout("Pick a stage, or press Next stage, to read what it guarantees.", {
      pointer: "up",
      tone: "info",
      bind: { text: "note" },
    });
    // No f.root(): the root is a stack of the top-level nodes in creation order.
    f.sequence([
      f.reveal(plan, { scale: 0.96 }),
      [f.draw(toPlace), f.reveal(place, { scale: 0.96 })],
      [f.draw(toCommit), f.reveal(commit, { scale: 0.96 })],
      [f.flow(toCommit), f.reveal(note, { offset: 8 })],
    ]);
    const focus = (value: number): MachineTransition => ({
      target: "tour",
      actions: [{ type: "set", var: "stage", value }],
    });
    f.machine({
      initial: "tour",
      variables: { stage: 0 },
      states: {
        tour: {
          on: {
            NEXT: { target: "tour", actions: [{ type: "increment", var: "stage", max: 3 }] },
            FOCUS_PLAN: focus(1),
            FOCUS_PLACE: focus(2),
            FOCUS_COMMIT: focus(3),
          },
        },
      },
      signals: {
        note: {
          match: { var: "stage" },
          cases: {
            1: "Planning never touches the world: it only decides where and what.",
            2: "Placement is pure and repeatable: the same plan yields the same blocks.",
            3: "Commit is the only step with side effects, so undo is a single operation.",
          },
          default: "Pick a stage, or press Next stage, to read what it guarantees.",
        },
        planFocus: { when: { var: "stage", op: "eq", value: 1 }, then: 1, else: 0 },
        placeFocus: { when: { var: "stage", op: "eq", value: 2 }, then: 1, else: 0 },
        commitFocus: { when: { var: "stage", op: "eq", value: 3 }, then: 1, else: 0 },
      },
    });
    f.controls([
      { label: "Next stage", event: "NEXT" },
      { label: "Show all", kind: "reset" },
    ]);
  },
);
```

What to notice:

- **Ids are inferred and stable.** `f.card({ title: "Plan" })` is `card-plan`; its children are
  `card-plan-title`, `card-plan-body`, `card-plan-motif`. The heading is
  `heading-three-stages-one-guarantee-the-w` (slugs are capped at 32 characters), the callout is
  `callout-pick-a-stage-or-press-next-stage`, the connectors are `card-plan-card-place` and
  `card-place-card-commit`, the controls are `next-stage` and `show-all`, the machine is
  `build-explainer-machine`. Pass `id` to any helper to override.
- **Root inference.** Nothing called `f.root()`, so the root is a `stack` (gap 16) of the
  top-level nodes in creation order: heading, the flow group, the callout. Cards are not
  top-level because `f.flow([...])` placed them.
- **Motion is a sequence of steps.** `f.sequence` starts each step when the previous one ends
  (plus a 120 ms gap); an inner array runs its members in parallel and the sequence continues
  after the longest. Here that gives reveal(plan) 0–500, draw + reveal 620–1120, … , a 2360 ms
  timeline.
- **State is checked at build time.** `bind: { highlight: "planFocus" }` must name a machine
  variable or signal, `FOCUS_PLAN` must be a real transition target, and `controls` require a
  machine — all reported as `figure "build-explainer": …` errors before anything renders.

The same idea written as raw IR is roughly 400 lines (see
`packages/scenes/src/scenes/sdf-and-fields.ts`, which hand-writes ids, six machine states, an
explicit `edges` array, and absolute keyframe times like `reveal("field", 100, 600)`). A short
before/after excerpt:

```ts
// before: raw IR
edges: [{ id: "field-graph", from: { node: "field", side: { wide: "right", compact: "bottom" } },
          to: { node: "graph", side: { wide: "left", compact: "top" } }, head: "arrow" }],
timeline: timeline([reveal("field", 100, 600, { scale: 0.96 }), drawEdge("field-graph", 650, 1150)]),

// after: figure()
const edge = f.connect(field, graph, { head: "arrow" }); // sides are chosen from geometry per layout
f.sequence([f.reveal(field, { scale: 0.96 }), f.draw(edge)]);
```

## 3. Layout recipes

Every group helper takes children plus `ContainerOptions` (`gap`, `padding`, `align`, `justify`,
`width`, `height`, `minWidth`, `maxWidth`, `grow`, `columns`, `frame`, `hidden`, `label`,
`interactive`, `bind`, `focusGroup`, …) and an optional `id`.

| Helper                                                            | Use it for                                                                                                                                                                                                                       |
| ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `f.stack` / `f.row`                                               | vertical / horizontal flow; `width: "fill"` children share the row's free space (weighted by `grow`), other children take their intrinsic width and shrink last                                                                  |
| `f.flow`                                                          | `row` on the wide layout, `stack` on compact and narrow — the default for "cards side by side that must stack on phones"                                                                                                         |
| `f.grid`                                                          | `columns` cells of equal width; make it responsive with `columns: { wide: 3, compact: 2, narrow: 1 }`                                                                                                                            |
| `f.overlay`                                                       | children on top of each other, centred by default (`justifySelf` / `alignSelf` per child); overlaps here are intended and not diagnosed                                                                                          |
| `f.coordinates`                                                   | a normalised box: children carry `position: { x, y, anchor }` in 0..1 fractions and percent sizes (`width: "20%"`, `height: "60%"`); it has no natural height, so give it `height` (responsive is fine). This is what charts use |
| `f.absolute`                                                      | pixel positions inside the parent's content box (rare; prefer `coordinates`)                                                                                                                                                     |
| `f.card`, `f.panel`, `f.keyValue`, `f.pill`, `f.rule`, `f.spacer` | the shared recipes: a framed card with motif/eyebrow/title/body/badge/extras; a muted dashed panel with optional head; key/value rows; status pills; separators                                                                  |

Percent lengths resolve against the parent's content box (`"50%"` inside a stack is half the
stack's inner width; inside `coordinates`, heights resolve against the box height too).

**A row is a band; a column is a column.** On the cross axis a _container_ child fills its parent
by default — every card in a row is the height of the tallest, every card in a column is the width
of the column — so a row reads as one band and, because a connector attaches at the middle of a
side, the arrows between the cards come out level. A _leaf_ mark (text, `f.pill`, `f.rule`, a dot,
an icon) keeps its own size, because for a mark the size is the content and not the slot. Say
otherwise with `align` on the container or `alignSelf` on one child: `"start"`, `"center"`, `"end"`
or `"stretch"`. A deliberately ragged row is one word; `align: "center"` gives ragged heights with
their middles lined up.

**Responsive values.** Anything typed `Responsive<T>` accepts either a value or a map
`{ wide?, compact?, narrow? }`. The cascade is desktop-first: `compact` falls back to `wide`,
`narrow` falls back to `compact` then `wide`, and a value declared only for a narrower layout
never leaks into a wider one. So `gap: { wide: 56, compact: 20 }` means 56 on wide and 20 on both
compact and narrow, and `hidden: { compact: true }` hides on compact _and_ narrow while staying
visible on wide. Breakpoints default to wide ≥ 900 px and compact ≥ 560 px; override per figure
with `figure(id, { breakpoints: { wide: 960, compact: 600 } }, …)`.

```ts
const grid = f.grid(cells, { columns: { wide: 3, compact: 2, narrow: 1 }, gap: 12 });
const area = f.coordinates(
  [
    f.rect({
      position: { x: 0.1, y: 1, anchor: "bottom-left" },
      width: "20%",
      height: "60%",
      fill: "chart1",
      revealAnchor: "bottom",
    }),
    f.polyline(
      [
        [0, 0.8],
        [0.5, 0.2],
        [1, 0.5],
      ],
      {
        position: { x: 0, y: 0 },
        width: "100%",
        height: "100%",
        stroke: "chart3",
        curve: "monotone",
      },
    ),
  ],
  { height: { wide: 160, compact: 120 }, focusGroup: true },
);
```

Text helpers (`f.text`, `f.eyebrow`, `f.heading`, `f.title`, `f.caption`, `f.body`, `f.code`)
take `tone`, `align`, `maxLines`, `bind`, `hidden`, `width`, `transform`; `f.text` also takes an
explicit `textStyle`. Marks (`f.badge`, `f.icon`, `f.rect`, `f.circle`, `f.polyline`, `f.path`,
`f.image`, `f.legend`, `f.callout`) are thin typed wrappers over the schema — every field of the
mark except `type`/`id`/its primary arguments is an option.

## 4. Connecting things

`f.connect(from, to, options)` returns the `EdgeDefinition`. Endpoints are nodes, ids, or
`{ node, side?, offset?, gap? }`; `options` are every edge field except `id/from/to`
(`route`, `head`, `tail`, `stroke`, `width`, `tone`, `curvature`, `bend`, `cornerRadius`,
`label` / `labels`, `packets`, `description`, `bind`, `hidden`, `z`). Ids default to
`${fromId}-${toId}` and are de-duplicated (`-2`, `-3`) for parallel edges.

```ts
const branch = f.connect(
  { node: field, side: { wide: "right", compact: "left" } },
  { node: brush, side: { wide: "left", compact: "left" } },
  {
    route: { wide: "curve", compact: "orthogonal" },
    head: "arrow",
    packets: { count: 2, period: 2200 },
    labels: [{ text: "same field", placement: "middle", hidden: { compact: true } }],
    description: "The same field feeds the brush", // edges without a description are decorative for assistive tech
  },
);
```

- **Routes and markers.** `route`: `straight`, `orthogonal` (14 px stubs, single jog when the
  ends face each other, U-shape when they attach on the same side), `curve`, `arc` (`bend` in px
  or `curvature` 0..1). `head` / `tail`: `arrow`, `triangle`, `dot`, `diamond`, `bar`, `none`.
  `stroke`: `solid`, `dashed`, `dotted`, `flow`; `packets: { count, size, tone, period }` puts
  travelling dots on the edge that `f.flow(edge)` switches on.
- **Sides per layout.** When you omit `side`, ports are chosen from geometry (horizontal when the
  boxes sit side by side, vertical when stacked), so a `flow` layout usually needs nothing. Set
  `side: { wide: "right", compact: "bottom" }` when the automatic choice is wrong on one layout.
- **A connector is on an axis or it is routed — never leaning.** When two boxes attach on sides
  that face each other and neither port was placed by hand, both ports move to the middle of the
  span the two boxes **share** on the cross axis, so the run is exactly perpendicular: identical
  boxes meet centre to centre, and a small box beside a tall one is entered at its own middle. If
  the boxes share none of that axis there is no perpendicular run to draw, so a `straight` edge is
  routed `orthogonal` instead of leaning across the gap. Both ends stay exactly where you put them
  the moment you give either an `offset`, and a fan of edges spread along one side keeps its fan.
- **Gutters for U-turns.** An orthogonal edge that leaves and enters on the _same_ side (left →
  left in a stacked layout) swings 14 px outside the boxes. Reserve room for it, otherwise it
  reports `overflow`: give the parent `padding: { wide: 0, compact: [0, 22] }` or an endpoint `gap`.
- **Labels.** `label: "text"` is a middle label; `labels: [{ text, placement: "start" | "middle" | "end", offset, tone, hidden, bind }]` gives you several. Labels are nudged away from
  nodes automatically; when there is no room (short connectors on narrow layouts) hide them per
  layout with `hidden: { compact: true }` rather than accepting a `label-collision`.
- **Binding.** `bind: { highlight: "edgeFieldGraph", hidden: "…", tone: "…", label: "…", flow: "…" }` drives edges from machine signals exactly like nodes.

## 5. Motion presets and sequencing

Presets return a `MotionStep` (`{ duration, tracks(start) }`) and do nothing until scheduled.

| Preset                                                            | Property                       | Notes                                                                                           |
| ----------------------------------------------------------------- | ------------------------------ | ----------------------------------------------------------------------------------------------- |
| `f.reveal(target, { duration = 500, offset?, scale?, stagger? })` | opacity (+ translateY / scale) | the default entrance; on a fragment root it plays the fragment's own preset instead (see below) |
| `f.draw(edge, { duration = 450 })`                                | edge opacity + `edgeReveal`    | draws a connector from source to target                                                         |
| `f.flow(edge, { duration? })`                                     | `flow`                         | packets on; with `duration` they fade out again 200 ms after                                    |
| `f.pulse(target, { duration = 500 })`                             | `highlight` 0 → 1 → 0          | nodes or edges                                                                                  |
| `f.highlight(target, { duration = 500, peak = 1, rest = peak })`  | `highlight`                    | rises to `peak`, settles at `rest` (use `rest: 0` for a flash)                                  |
| `f.progress(target, { duration = 600, from = 0, to = 1 })`        | `progress`                     | nodes bound to progress (bars, line-by-line text) or edges                                      |
| `f.rise(target, { duration = 500 })`                              | `revealY` 0 → 1                | grows from `revealAnchor` (default bottom); nodes only                                          |
| `f.wipe(target, { duration = 500 })`                              | `revealX` 0 → 1                | grows from `revealAnchor` (default left); nodes only                                            |

Targets are nodes, ids, or arrays; arrays are staggered by `stagger` ms (default 0), and the step
lasts `duration + stagger × (n − 1)`.

```ts
f.sequence(
  [
    f.reveal(cards, { stagger: 80 }), // 0 → 660 (500 + 2 × 80)
    [f.draw(edge), f.reveal(note, { offset: 8 })], // both start at 780; the group lasts 500
    f.rise(bars, { stagger: 60 }), // starts at 1400
  ],
  { gap: 120, start: 0 },
);
f.at(3000, f.pulse(commit), f.flow(edge, { duration: 1500 })); // absolute scheduling
```

Timing math: `f.sequence` keeps a clock starting at `start` (default 0); each entry starts at the
clock, and the clock advances by the entry's duration (the longest member for a parallel array)
plus `gap` (default 120). The timeline duration is the last keyframe plus `meta.hold`
(`figure(id, { hold: 600 }, …)`), so the terminal frame is complete: every reveal ends at 1,
every drawn edge is fully drawn. Scheduling the same preset on the same target twice is allowed;
the second track gets a deterministic `#2` suffix.

**Composing fragment motion.** A fragment (for instance a `plot()` result) may carry its own
relative tracks — a chart's `rise` or `draw` preset. `f.add(result)` remembers them, and
`f.reveal(chart)` plays them at the scheduled time (its duration is the preset's length). Pass
`f.add(result, { at: 800 })` to schedule the preset directly. `f.pulse(chart)` and friends target
the chart's root group as usual.

## 6. State and interaction

`f.machine({ initial, variables?, states, signals?, events? })` (id defaults to
`${figureId}-machine`) and `f.controls([{ label, event, description?, group?, activeWhen? }, { label, kind: "reset" }])`
(ids default to a slug of the label). Nodes join in three ways:

- **Bindings** on any node or edge: `bind: { text, hidden, tone, opacity, highlight, progress, description, width, height }` name a machine variable or signal (or `$state` / `$selection`). Timeline opacity multiplies bound opacity, timeline highlight takes the max — a dimmed card still fades in.
- **Activation**: `interactive: true` + `onActivate: "FOCUS_PLAN"` sends the event on click / Enter / Space (cards get their accessible name from `title` unless you set `label`).
- **Inspection**: `inspect: { role: "Stage", title, summary, fields: [{ label, value }] }` feeds the hover/focus tooltip, optional readout, and SVG `<title>`/`<desc>` for interactive marks; `label` and `description` fall back to `inspect.title` / `inspect.summary`. Tooltips are on by default and can be disabled with `tooltips: false` when an application renders `onInspect` into its own UI.
- **Focus groups**: `focusGroup: true` on a group makes it a single tab stop whose interactive descendants are reached with the arrow keys — dense marks (bars, cells) should live in one.

Signals are serializable expressions evaluated in declaration order (`when`/`then`/`else`,
`match`/`cases`, `concat`, `not`, `{ var }`, `{ signal }`, `{ state: true }`), and machines are
plain data, so a scene can be exported at any state (`kineglyph-export png --state solo …`). The
`expr` builders make arithmetic, bit operations, comparisons, and deterministic formatting terse
without putting callbacks into that data:

```ts
import { expr } from "@kineglyph/core";

f.machine({
  initial: "ready",
  variables: { a: 13, b: 3 },
  states: { ready: {} },
  signals: {
    total: expr.add(expr.var("a"), expr.var("b")),
    carry: expr.bit(expr.signal("total"), 4),
    binary: expr.format(expr.signal("total"), { radix: 2, pad: 5 }),
    selected: expr.eq(expr.signal("carry"), 1),
  },
});
```

Arithmetic includes `add`, `subtract`, `multiply`, `divide`, `modulo`, `power`, `min`, `max`,
`clamp`, `abs`, `floor`, `ceil`, and `round`. Bitwise expressions include `bitAnd`, `bitOr`,
`bitXor`, `bitNot`, the three shifts, and `bit(value, index)`; like JavaScript bitwise operators,
they operate on 32-bit integers. Comparisons are `eq`, `neq`, `gt`, `gte`, `lt`, and `lte`.
`expr.format` supports radix 2–36, left padding, fixed precision, case, prefix, and suffix without
locale-dependent output. Machine validation catches bad arity, known non-numeric operands,
out-of-range bit indexes, literal division by zero, and incompatible format options. If a valid
dynamic expression later receives an unusable value (for example a variable divisor becomes
zero), it resolves to `null` instead of producing `NaN` or `Infinity`.

Small collection and string operations use the same serializable IR. `expr.list(...)` creates a
flat scalar collection; `at`, `length`, `join`, `includes`, `slice`, and `sum` consume collections
without callbacks. `upper`, `lower`, `trim`, and literal `replace` cover display-oriented string
cleanup. Lists may also live in machine variables, so a live feed can replace a small set of values
and all dependent labels update deterministically:

```ts
signals: {
  stages: expr.list("parse", expr.upper("execute"), "commit"),
  breadcrumb: expr.join(expr.signal("stages"), " → "),
  activeStage: expr.at(expr.signal("stages"), expr.var("step")),
  total: expr.sum(expr.var("samples")),
  command: expr.lower(expr.trim(expr.var("rawCommand"))),
}
```

Collections are deliberately small and flat: the expression IR is for derived UI state, not a
general data-processing language. Large tables and streams should stay in the live-data surface.

`figure()` validates the machine against the nodes you created (`select` actions and `selection`
conditions must name real nodes) and every binding against the machine's variables and signals.

```ts
f.machine({
  initial: "all",
  states: { all: { on: { SOLO: "solo" } }, solo: { on: { ALL: "all" } } },
  signals: { dimmed: { when: { state: "solo" }, then: 0.35, else: 1 } },
});
f.controls([
  { label: "Solo fill_cuboid", event: "SOLO" },
  { label: "Show all", event: "ALL" },
]);
```

## 7. Charts with `plot()`

Charts are not nodes joined by edges: `plot()` (package `@kineglyph/plot`) compiles a declarative
spec into a `SceneFragment` of ordinary primitives — a `coordinates` group with percent-sized
rects, fractional polylines, tick texts, a focus group per series, and inspect metadata on every
mark — and `f.add()` composes it like anything else. See `authoring-api.md` for the full spec.

```ts
// depends on @kineglyph/plot
import { figure } from "@kineglyph/core";
import { bar, plot, rule } from "@kineglyph/plot";

const rows = [
  { call: "fill_cuboid", dense: 4, sparse: 9 },
  { call: "set_blocks", dense: 12, sparse: 5 },
];

export const buildTimes = figure("build-times", { title: "Bulk API cost (illustrative)" }, (f) => {
  const chart = f.add(
    plot(rows, {
      title: "Milliseconds per 100k blocks (illustrative)",
      x: "call",
      y: ["dense", "sparse"],
      marks: bar(),
      annotations: [rule({ y: 8, label: "budget" })],
      axes: { y: { label: "ms", ticks: { wide: 5, narrow: 3 } } },
      valueLabels: "auto",
    }),
  );
  const note = f.callout("Dense boxes need one bounds growth.", { pointer: "left", tone: "info" });
  f.root(f.stack([f.heading("Where the time goes"), f.flow([chart, note], { gap: 24 })]));
  f.sequence([f.reveal(chart), f.reveal(note, { offset: 8 })], { gap: 200 });
});
```

`f.add` keeps the plot's compiler-chosen namespace, so
`result.handles.series.dense.marks` stay valid motion targets
(`f.rise(result.handles.series.dense.marks, { stagger: 40 })`). Choose a specific namespace with
the plot's own `id` option, then call `f.add(result)`. Kineglyph refuses to re-scope a result that
exposes handles: `f.add(result, { id: "other" })` would make those typed ids stale, so it fails with
an actionable error instead. Compile a second result with a second `id` when the same chart must
appear twice. Label illustrative data as such in the title.

## 8. Consuming figures

A figure is a `SceneDefinition`, so every runtime accepts it directly.

**TypeScript / bundlers**

```ts
import { mountKineglyph } from "@kineglyph/web";
import { buildExplainer } from "./figures.js";

const controller = mountKineglyph(document.querySelector("#figure")!, {
  scene: buildExplainer,
  autoplay: true,
});
controller.send("NEXT"); // machine events; controller.destroy() when the host goes away
```

**Vanilla `<script type="module">`** — the self-contained web bundle exports the runtime and
authoring surface. The application owns its scenes and themes:

```html
<div id="explainer"></div>
<script type="module">
  import { createTheme, figure, mountKineglyph } from "/vendor/kineglyph/kineglyph-web.js";
  const scene = figure("hello", { title: "Hello" }, (f) => {
    const a = f.card({ title: "A" });
    const b = f.card({ title: "B" });
    f.connect(a, b, { head: "arrow" });
    f.flow([a, b]);
  });
  const theme = createTheme({ colors: { accent: "#237f74" } });
  mountKineglyph(document.getElementById("explainer"), { scene, theme });
</script>
```

**React**

```tsx
import { KineglyphFigure } from "@kineglyph/react";
<KineglyphFigure figure={buildExplainer} controls readout tooltips />;
```

**Blade (Laravel)** — register the figure in the Vite entry and drop the component in a view; each
`<x-kineglyph-figure>` mounts its own controller, so several figures on one page never collide:

```js
// resources/js/kineglyph.js
import { registerScene, registerTheme, autoMount } from "@kineglyph/web";
import { buildExplainer, docsTheme } from "./figures.js";
registerScene("build-explainer", buildExplainer);
registerTheme("docs", docsTheme);
autoMount();
```

```blade
<x-kineglyph-figure scene="build-explainer" theme="docs" :autoplay="false"
    caption="Focus a stage to read what it guarantees." />
```

**Export CLI** — static SVG/PNG/GIF from the same definition (`--state` picks a machine state,
`--layout` a named layout, `--time` a timeline moment):

```sh
kineglyph-export svg --scene ./dist/figures.js#buildExplainer --out build-explainer.svg
kineglyph-export png --scene ./dist/figures.js#buildExplainer --out build-explainer.png --width 1200 --state tour
kineglyph-export gif --scene ./dist/figures.js#buildExplainer --out build-explainer.gif --fps 12
```

## 9. Diagnostics you may see

Build-time errors from `figure()` are prefixed `figure "<id>":` and stop the build:

| Message                                                                       | Fix                                                                                                              |
| ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `duplicate id "note" (first created by f.callout("…"), again by f.text("…"))` | drop one explicit `id` (inferred ids never collide)                                                              |
| `f.connect: unknown target "chart:bar:v1:9"` / `f.reveal: unknown target "…"` | create the node first (helpers, `f.add`, or `f.raw`) or fix the id; forward references by string are not allowed |
| `f.rise: "card-plan-card-place" is an edge, not a node`                       | `revealX/Y`, slide, and scale are node properties — use `f.draw` / `f.flow` / `f.pulse` for connectors           |
| `node "heading-a" is already inside another group`                            | you placed the same object twice; create a second node                                                           |
| `"heading-b" (f.heading("B")) is not inside the root`                         | add it to a group or to the `f.root(...)` tree (or remove it)                                                    |
| `controls need a state machine` / `invalid machine: …`                        | call `f.machine`, fix the listed transitions, states, or `select` node ids                                       |
| `"card-plan" binds highlight to unknown signal "planFocus"`                   | declare the signal or variable in the machine                                                                    |
| `f.add: the fragment reports errors`                                          | the fragment (e.g. `plot()`) rejected its input; read its `diagnostics`                                          |

Layout warnings come from `resolveScene(scene, { width })` (`resolved.diagnostics`) and are what
the test harnesses assert to be empty at 1200 / 820 / 390 px:

| Code                                      | Meaning                                                                                | Usual fix                                                                                                                                                              |
| ----------------------------------------- | -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `overlap`                                 | two siblings intersect inside a stack/row/grid                                         | add `gap`, give rows `width: "fill"` children, or move the pair into `f.overlay` if the overlap is intended                                                            |
| `overflow`                                | a child extends outside its parent's content box, or a row's content exceeds its width | let the row `flow` on compact layouts, shorten text, add `maxLines`, reserve gutters for U-turn edges, or set `allowOverflow: true` on the group for intentional spill |
| `text-truncated`                          | text hit `maxLines` and ended with `…`                                                 | shorten it, raise `maxLines` for that layout, or give the node more width                                                                                              |
| `label-collision`                         | an edge label overlaps a node                                                          | hide the label on that layout (`hidden: { compact: true }`), shorten it, or widen the gap                                                                              |
| `coordinates-height`                      | a `coordinates` group has no height and fell back to 160 px                            | give it `height` (responsive is fine) or `minHeight`                                                                                                                   |
| `unknown-signal` (error, thrown)          | a binding names a signal the machine does not produce                                  | figures catch this at build time; raw scenes must declare it                                                                                                           |
| `invalid state machine …` (error, thrown) | machine validation failed at resolve time                                              | see the listed paths; figures validate earlier                                                                                                                         |

Everything else (`duplicate-id`, `missing-node`, `missing-target`, `control-event`) comes from
`validateScene` and can only appear in hand-written scenes — `figure()` prevents them.
