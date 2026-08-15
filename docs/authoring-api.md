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

| Helper                                                                                                                                                                                                                     | Returns                         | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `f.text(text, opts)`, `f.eyebrow`, `f.heading`, `f.title`, `f.caption`, `f.body`, `f.code`                                                                                                                                 | `TextMark`                      | `opts`: `id, tone, align, maxLines, bind, hidden, width, transform`                                                                                                                                                                                                                                                                                                                                                                                     |
| `f.badge(text, opts)`                                                                                                                                                                                                      | `BadgeMark`                     | `tone, variant, bind`                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `f.icon(name, opts)`                                                                                                                                                                                                       | `IconMark`                      | motif name from `@kineglyph/svg`                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `f.rect(opts)`, `f.circle(opts)`, `f.polyline(points, opts)`, `f.path(d, viewBox, opts)`, `f.image(src, alt, opts)`, `f.legend(items, opts)`, `f.callout(text, opts)`                                                      | marks                           | thin typed wrappers over the schema                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `f.card(opts)`, `f.panel(children, opts)`, `f.pill(text, opts)`, `f.keyValue(k, v, opts)`, `f.rule(opts)`, `f.spacer(size, opts)`                                                                                          | groups/marks                    | the recipes formerly in `@kineglyph/scenes/recipes` (moved to core, re-exported by scenes)                                                                                                                                                                                                                                                                                                                                                              |
| `f.stack`, `f.row`, `f.grid`, `f.overlay`, `f.flow`, `f.coordinates`, `f.absolute`                                                                                                                                         | `GroupNode`                     | `flow` = row on wide, stack otherwise                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `f.add(fragment, opts)`                                                                                                                                                                                                    | `SceneNode` (the fragment root) | accepts a `SceneFragment` or a result carrying one (`plot()`); scopes the fragment's ids under `opts.id` (default inferred from the root id) unless they already live in that namespace, appends its edges/controls, and registers its relative tracks as the step `f.reveal(root)` plays (or schedules them at `opts.at`); fragments with several top-level nodes are wrapped in a `stack` named after the scope so the return type is always one node |
| `f.raw(node)`                                                                                                                                                                                                              | the node                        | escape hatch: any `SceneNode`, still id-checked                                                                                                                                                                                                                                                                                                                                                                                                         |
| `f.connect(from, to, opts)`                                                                                                                                                                                                | `EdgeDefinition`                | `from`/`to` are nodes or ids; `opts` = every `EdgeDefinition` field except `id/from/to`                                                                                                                                                                                                                                                                                                                                                                 |
| `f.reveal(target, opts)`, `f.draw(edge, opts)`, `f.pulse(target, opts)`, `f.flow(edge, opts)`, `f.highlight(target, opts)`, `f.progress(target, opts)`, `f.rise(target, opts)` (revealY), `f.wipe(target, opts)` (revealX) | `MotionStep`                    | targets accept a node, an id, an array, or an added fragment (`f.reveal` then plays the fragment's own preset tracks); `opts.duration`, `opts.stagger`, and `opts.easing`; `pulse`/`highlight`/`progress` and plain `reveal` also accept edges, `rise`/`wipe`/slide/scale are node-only and throw otherwise; `f.flow` is overloaded — children make the flow _layout_, an edge makes the packet _motion_                                                |
| `f.sequence(steps, opts)`                                                                                                                                                                                                  | `void`                          | schedules steps one after another (`opts.gap`, `opts.start`); an array inside `steps` runs its members in parallel                                                                                                                                                                                                                                                                                                                                      |
| `f.at(time, ...steps)`                                                                                                                                                                                                     | `void`                          | absolute scheduling                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `f.machine(definition)`, `f.controls(list)`                                                                                                                                                                                | `void`                          | machine `id` defaults to `${figureId}-machine`; control ids default to a slug of the label                                                                                                                                                                                                                                                                                                                                                              |
| `f.root(node)`                                                                                                                                                                                                             | `void`                          | sets the root; when omitted the root is a stack of top-level nodes in creation order                                                                                                                                                                                                                                                                                                                                                                    |

`figure()` returns a validated `SceneDefinition` (`defineScene` is applied). Diagnostics are
actionable and thrown eagerly with the figure id and the originating helper:
`figure "build-times": duplicate id "note" (first created by f.callout("Dense boxes need one bo…"), again by f.text("Again"))`,
`figure "build-times": f.connect: unknown target "chart:bar:v1:9"`. At the end of the build the
builder also rejects created nodes that ended up outside the root, controls without a machine,
invalid machines (`validateStateMachine` against the created node ids), and bindings that name a
signal or variable the machine does not declare — the same problems `resolveScene` would surface
later, but with the node and property named.

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
- Recipes gained a `text` recipe (explicit `textStyle`) and `ContainerOptions` gained
  `minHeight`, `justifySelf`, `position`, `opacity`, `focusGroup`, `inspect`, `revealAnchor`,
  `allowOverflow`; `rule` / `spacer` return `RectMark`. Core exports the flow layout as
  `flowLayout` (core's `flow` is the packet timeline helper); `@kineglyph/scenes` re-exports it as
  `flow`.

## `plot()`

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
- Axes, gridlines, derived legends, value labels (`auto` uses layout-aware rules), annotations:
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
- Determinism: equal input → byte-identical fragment; category order and domains are frozen and
  reported in `domains`/`ticks`.

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
