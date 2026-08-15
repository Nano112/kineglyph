# Authoring API: `figure()` and `plot()`

This is the public authoring surface. `defineScene()` remains available as the advanced escape
hatch (it is the IR that `figure()` produces), but new figures should start here.

## Design position

Kineglyph is a general technical-illustration compiler and runtime, not a node/edge graph library
and not a chart framework. The scene IR (`SceneDefinition`) is deliberately low level: typed
primitives, named layouts, timelines, and machines. Two compact authoring surfaces sit on top:

- `figure(id, meta, build)` — a builder that infers stable ids, composes recipes and fragments,
  sequences motion with presets, and flattens everything into one `SceneDefinition`.
- `plot(spec, options)` (`@kineglyph/plot`) — a pure compiler from a declarative `PlotSpec` to a
  `SceneFragment` of ordinary primitives in a `coordinates` group.

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
        y: { label: "ms", ticks: { wide: 5, narrow: 3 } },
        valueLabels: "auto",
      }),
    );
    const note = f.callout("Dense boxes need one bounds growth.", {
      pointer: "left",
      tone: "info",
    });
    f.root(f.stack([f.heading("Where the time goes"), f.flow([chart, note], { gap: 24 })]));
    f.sequence([f.reveal(chart), f.reveal(note, { offset: 8 })], { gap: 200 });
    f.machine({
      initial: "all",
      states: { all: { on: { SOLO: "solo" } }, solo: { on: { ALL: "all" } } },
    });
    f.controls([
      { label: "Solo dense", event: "SOLO" },
      { label: "Show all", event: "ALL" },
    ]);
  },
);
```

### Builder contract

Every helper returns the created node so it can be referenced by object; every helper accepts an
optional `id` in its options. When omitted, ids are inferred deterministically from the kind and a
slug of the primary text (`heading-where-the-time-goes`), de-duplicated with a counter, and stable
across builds of the same figure. Ids are validated: duplicates and unknown references throw with
the builder path in the message.

| Helper                                                                                                                                                                                                                     | Returns                                    | Notes                                                                                                                                                                                           |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `f.text(text, opts)`, `f.eyebrow`, `f.heading`, `f.title`, `f.caption`, `f.body`, `f.code`                                                                                                                                 | `TextMark`                                 | `opts`: `id, tone, align, maxLines, bind, hidden, width, transform`                                                                                                                             |
| `f.badge(text, opts)`                                                                                                                                                                                                      | `BadgeMark`                                | `tone, variant, bind`                                                                                                                                                                           |
| `f.icon(name, opts)`                                                                                                                                                                                                       | `IconMark`                                 | motif name from `@kineglyph/svg`                                                                                                                                                                |
| `f.rect(opts)`, `f.circle(opts)`, `f.polyline(points, opts)`, `f.path(d, viewBox, opts)`, `f.image(src, alt, opts)`, `f.legend(items, opts)`, `f.callout(text, opts)`                                                      | marks                                      | thin typed wrappers over the schema                                                                                                                                                             |
| `f.card(opts)`, `f.panel(children, opts)`, `f.pill(text, opts)`, `f.keyValue(k, v)`                                                                                                                                        | groups/marks                               | the recipes formerly in `@kineglyph/scenes/recipes` (moved to core, re-exported by scenes)                                                                                                      |
| `f.stack`, `f.row`, `f.grid`, `f.overlay`, `f.flow`, `f.coordinates`, `f.absolute`                                                                                                                                         | `GroupNode`                                | `flow` = row on wide, stack otherwise                                                                                                                                                           |
| `f.add(fragment, opts)`                                                                                                                                                                                                    | `SceneNode` (single root) or `SceneNode[]` | scopes the fragment's ids under `opts.id` (default inferred), appends its edges/controls, and registers its relative tracks as a motion step usable in `f.sequence` (or scheduled at `opts.at`) |
| `f.raw(node)`                                                                                                                                                                                                              | the node                                   | escape hatch: any `SceneNode`, still id-checked                                                                                                                                                 |
| `f.connect(from, to, opts)`                                                                                                                                                                                                | `EdgeDefinition`                           | `from`/`to` are nodes or ids; `opts` = every `EdgeDefinition` field except `id/from/to`                                                                                                         |
| `f.reveal(target, opts)`, `f.draw(edge, opts)`, `f.pulse(target, opts)`, `f.flow(edge, opts)`, `f.highlight(target, opts)`, `f.progress(target, opts)`, `f.rise(target, opts)` (revealY), `f.wipe(target, opts)` (revealX) | `MotionStep`                               | targets accept a node, an id, an array, or an added fragment (whose own preset tracks are used); `opts.duration`, `opts.stagger` for arrays                                                     |
| `f.sequence(steps, opts)`                                                                                                                                                                                                  | `void`                                     | schedules steps one after another (`opts.gap`, `opts.start`); an array inside `steps` runs its members in parallel                                                                              |
| `f.at(time, ...steps)`                                                                                                                                                                                                     | `void`                                     | absolute scheduling                                                                                                                                                                             |
| `f.machine(definition)`, `f.controls(list)`                                                                                                                                                                                | `void`                                     | machine `id` defaults to `${figureId}-machine`; control ids default to a slug of the label                                                                                                      |
| `f.root(node)`                                                                                                                                                                                                             | `void`                                     | sets the root; when omitted the root is a stack of top-level nodes in creation order                                                                                                            |

`figure()` returns a validated `SceneDefinition` (`defineScene` is applied). Diagnostics are
actionable: `figure "build-times": duplicate id "note" (second created at f.callout(...))`,
`f.connect: unknown target "chart:bar:v1:9"`.

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
  diverging ramp); `sparkline` (minimal mode).
- Axes, gridlines, derived legends, value labels (`auto` uses layout-aware rules), annotations:
  reference lines/bands, point labels, datum callouts.
- Output: a root group `${id}` containing an optional title/legend and `${id}:area` — a
  `coordinates` group with percent-sized rects, fractional polylines, circles, tick texts — plus a
  focus group per series (`${id}:series:${s}`) so a chart is one tab stop per series and marks are
  reached with the arrow keys. Every mark carries `inspect` (role, title, fields such as Series,
  Category, Value) and `revealAnchor` where relevant.
- Motion presets return relative tracks: `rise` (bars via `revealY`, staggered by index), `draw`
  (lines/areas via `progress`, then points), `sweep` (heatmap cells row by row), `auto` picks per
  mark. `figure()` schedules them with `f.sequence`.
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
