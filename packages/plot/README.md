# `@kineglyph/plot`

Pure, typed chart compilation for Kineglyph. `plot()` turns rows and field-name channels into an
ordinary `SceneFragment`; it does not use the DOM, callbacks, JSX, locale state, or a chart
runtime.

```ts
import { bar, plot, rule } from "@kineglyph/plot";

const rows = [
  { call: "fill", dense: 4, sparse: 9 },
  { call: "set", dense: 12, sparse: 5 },
];

const result = plot(rows, {
  id: "bench",
  title: "Milliseconds per 100k calls",
  x: "call",
  y: ["dense", "sparse"],
  marks: bar(),
  axes: { y: { label: "ms", ticks: { wide: 5, narrow: 3 } } },
  annotations: [rule({ y: 8, label: "budget" })],
  valueLabels: "auto",
});

result.fragment; // ready for f.add(), defineScene(), SVG, runtime, or export
result.handles.series.dense.marks; // stable, typed generated ids
result.handles.axes.y;
```

Channel names are checked against the row type. Quantitative channels (`y` and heatmap `value`)
accept only numeric or nullable-numeric fields; categorical, label, and tone channels likewise
reject incompatible fields. Cartesian plots require `y`; when `x` is omitted, the stable row
index is used.

## Marks and layers

Use `bar()`, `groupedBar()`, `stackedBar()`, `line()`, `area()`, `dot()`, or `sparkline()`.
Cartesian marks can be layered in paint order while sharing scales and one handle namespace:

```ts
import { alphaGradient, cubicBezier } from "@kineglyph/core";

const trend = plot(rows, {
  x: "call",
  y: "dense",
  marks: [
    area({
      fill: alphaGradient("chart1", { from: 0.5, to: 0, angle: 90 }),
      fillOpacity: 1,
    }),
    line(),
    dot(),
  ],
  easing: cubicBezier(0.16, 1, 0.3, 1),
});

trend.handles.series.dense.area;
trend.handles.series.dense.line;
trend.handles.series.dense.dots;
```

`fill` accepts a solid theme paint or a linear/radial gradient. `fillOpacity` controls the whole
bar or area independently of each gradient stop's opacity. `easing` accepts a named curve, cubic
Bézier data, or a damped spring and is copied to every generated motion track. Because the result
is a normal scene fragment, `f.add(trend)` can place it inside a card, grid, or custom composition.

Bars are grouped by default. `stackedBar()` (or `stack: true`) makes a diverging stack: positive
and negative values accumulate independently around zero. Missing values remain gaps. Scale
domains, ticks, category order, diagnostics, mark ids, and the generated accessible description
are returned with the fragment.

Long/tidy data can split series with `series: "field"`. Wide data uses `y: ["a", "b"]`; those
literal field names become typed keys in `handles.series`.

Series can bind to scene-machine signals without post-compilation transforms. The binding keys are
checked against inferred wide-data series:

```ts
plot(rows, {
  x: "call",
  y: ["dense", "sparse"],
  marks: bar(),
  seriesBindings: {
    dense: { hidden: "hideDense", opacity: "denseOpacity", highlight: "activeDense" },
  },
});
```

`hidden` and `opacity` bind the series group; `highlight` is propagated to every visual data mark
so it has an observable effect. Advanced `SeriesSpec` accepts the same serialisable `bind` object.

## Heatmaps

Heatmaps require row, column, and numeric value channels:

```ts
import { heatmap, plot } from "@kineglyph/plot";

const matrix = plot(
  [
    { row: "A", column: "X", score: -2 },
    { row: "A", column: "Y", score: 3 },
  ],
  {
    id: "matrix",
    marks: heatmap({
      row: "row",
      column: "column",
      value: "score",
      negativeTone: "danger",
      cellLabels: true,
    }),
  },
);

matrix.handles.cells?.[0]?.[1]; // "matrix:cell:0:1"
```

Category order is frozen by first appearance. Duplicate row/column pairs are deterministic (the
last value wins) and produce a diagnostic. A `negativeTone` enables a zero-centred diverging ramp.

## Annotations, motion, and accessibility

`rule()`, `range()`, `pointLabel()`, and `calloutAt()` return serialisable annotation data. Motion
is `auto` (mark-appropriate rise, draw, pop, or sweep tracks) or `none`; `duration` and `easing`
shape the preset. Tracks are relative fragment tracks that `figure().add()` can schedule.

Every data mark carries structured inspection fields. Series are roving focus groups, so dense
charts remain one tab stop per series. Above the interactive mark cap, the compiler emits a
series-level inspector and a diagnostic rather than creating hundreds of tab stops.

Equal input and options produce equal fragments and stable ids. Set `id` when several plots share
a scene or page; all generated ids are namespaced below it.

## Advanced IR

The explicit serialisable IR remains available for generated specs and lower-level control:

```ts
const result = plot(
  {
    series: [
      {
        id: "latency",
        label: "Latency",
        mark: "line",
        data: [
          { x: 0, y: 2 },
          { x: 1, y: null },
          { x: 2, y: 5 },
        ],
      },
    ],
    x: { type: "linear", domain: "auto" },
    y: { type: "linear", domain: "auto-zero" },
  },
  { id: "latency", motion: "auto" },
);
```

`compilePlot(spec, options)` is the named compiler behind this overload. Both entry points return
`{ fragment, handles, domains, ticks, description, diagnostics, markIds }`.

## Specialized families

Specialized compilers cover geometry that does not fit Cartesian marks:

- `pieChart()`, `donutChart()`, and `radialChart()`;
- `gaugeChart()` for threshold-aware operational readings;
- `histogram()` and `distributionPlot()`;
- `rangeChart()`, `boxPlot()`, and `confidenceBand()`;
- `ganttChart()` / `timelineChart()`;
- `sankey()`, `treemap()`, and `topology()`.

Each returns `{ fragment, handles, description }`. Marks are ordinary paths, rectangles, circles,
polylines, nodes, and edges—not renderer plugins—so `f.add(result)` works exactly as it does for a
Cartesian plot. Handles contain stable root, area, mark, and label ids. Automatic motion is a
relative opacity/scale stagger; set `motion: "none"` for a static fragment.

Current layout contracts are explicit: treemaps use deterministic recursive slice-and-dice,
Sankey links expect an acyclic graph and infer ranks, and topology uses normalized authored
positions or a stable circle. Equal data produces equal geometry under every renderer.

## Keyed live snapshots

`createKeyedLiveData()` is a transport-neutral store for high-frequency rows:

```ts
const stream = createKeyedLiveData<{ id: string; latency: number }>({
  key: "id",
  window: 240,
  maxBatch: 500,
});

stream.subscribe((snapshot) => {
  const chart = plot(snapshot.rows, { x: "id", y: "latency", marks: line() });
  render(chart, snapshot.sequence);
});

stream.upsert({ id: "api", latency: 42 });
```

Synchronous patches publish once per microtask by default. Manual mode exposes `flush()` as an
application transaction boundary. `replace`, `upsert`, and `remove` preserve keyed identity;
bounded windows retain the newest keys and count drops. Snapshots are immutable and include their
sequence, connection status, size, and rows. `reconnectDelay()` supplies bounded deterministic
exponential backoff without coupling the store to WebSocket, SSE, or polling APIs.
