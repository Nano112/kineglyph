<p align="center">
  <picture>
    <source media="(prefers-reduced-motion: reduce)" srcset="./docs/assets/readme/cover@2x.png">
    <img src="./docs/assets/readme/cover@2x.gif" alt="Kineglyph: technical illustrations with a pulse" width="1400">
  </picture>
</p>

<p align="center">
  <a href="./docs/cookbook.md">Cookbook</a> ·
  <a href="./docs/authoring-api.md">Authoring API</a> ·
  <a href="./packages/plot/README.md">Plots</a> ·
  <a href="./packages/web/README.md">Web runtime</a> ·
  <a href="./packages/export/README.md">Export</a>
</p>

Kineglyph is a TypeScript scene system for technical diagrams, data graphics, and interactive
explainers. Geometry, motion, state, inspection data, and theme live in one serializable
definition. That definition can run as accessible SVG in a page or be exported to SVG, PNG, and
GIF.

The cover is a Kineglyph scene. Rebuild its PNG and GIF with `npm run render:readme-cover`.

## Compose a figure

`figure()` assigns stable ids, resolves responsive layout, routes connectors, and places motion on
one timeline.

```ts
import { figure } from "@kineglyph/core";

export const fillFigure = figure("fill", { title: "Shape plus brush" }, (f) => {
  const shape = f.card({
    eyebrow: "WHERE",
    title: "Sphere",
    body: "Selects cells",
    motif: "sphere",
    tone: "info",
  });
  const brush = f.card({
    eyebrow: "WHAT",
    title: "Stripes",
    body: "Chooses blocks",
    motif: "brush",
    tone: "warning",
  });
  const fill = f.card({ title: "BuildingTool.fill", motif: "blocks" });
  const result = f.card({ title: "Filled schematic", motif: "cube", tone: "success" });

  const where = f.connect(shape, fill, { route: "curve", head: "arrow", label: "where" });
  const what = f.connect(brush, fill, { route: "curve", head: "arrow", label: "what" });
  const build = f.connect(fill, result, { head: "arrow", label: "build" });

  f.root(f.flow([f.stack([shape, brush]), fill, result], { gap: 48 }));
  f.sequence([
    [f.reveal(shape), f.reveal(brush)],
    [f.draw(where), f.draw(what)],
    f.reveal(fill),
    f.draw(build),
    f.reveal(result),
  ]);
});
```

<p align="center">
  <img src="./docs/assets/readme/shapes-and-brushes.svg" alt="A Kineglyph diagram showing a shape and brush composed into a filled schematic" width="960">
</p>

Layout recipes include stack, row, grid, overlay, normalized coordinates, and absolute placement.
Every layout can supply `wide`, `compact`, and `narrow` values. The resolver recomputes geometry at
each breakpoint.

## Plot typed data

`plot<Row>()` checks channel names against the row type. It returns a normal scene fragment plus
stable handles, domains, ticks, descriptions, and diagnostics.

```ts
import { area, dot, line, plot, range, rule } from "@kineglyph/plot";

const activeChunks = [
  { second: 0, active: 8 },
  { second: 1, active: 21 },
  { second: 2, active: 39 },
  { second: 3, active: 62 },
  { second: 4, active: 78 },
  { second: 5, active: 86 },
  { second: 6, active: 82 },
  { second: 7, active: 88 },
  { second: 8, active: 84 },
  { second: 9, active: 87 },
];

const trend = plot(activeChunks, {
  id: "stream-trend",
  x: "second",
  y: "active",
  marks: [area({ curve: "monotone" }), line({ curve: "monotone" }), dot()],
  annotations: [range({ y: [75, 92], label: "steady operating band" }), rule({ y: 80 })],
  axes: { x: { label: "Elapsed time (s)" }, y: { label: "Active chunks" } },
  motion: "auto",
});

trend.fragment;
trend.handles.series.active.line;
```

<p align="center">
  <img src="./docs/assets/readme/throughput-over-time.svg" alt="A layered time series rendered by Kineglyph" width="960">
</p>

Bars, stacked bars, lines, areas, dots, heatmaps, and sparklines share the same theme, interaction,
and export path.

```ts
import { heatmap, plot } from "@kineglyph/plot";

const matrix = plot(
  [
    { workload: "Dense", operation: "fill", speedup: 38 },
    { workload: "Dense", operation: "set", speedup: 8 },
    { workload: "Sparse", operation: "fill", speedup: 1 },
    { workload: "Sparse", operation: "set", speedup: 29 },
  ],
  {
    id: "operation-matrix",
    marks: heatmap({
      row: "workload",
      column: "operation",
      value: "speedup",
      domain: [0, 40],
      cellLabels: true,
    }),
  },
);

matrix.handles.cells?.[1]?.[1];
```

<p align="center">
  <img src="./docs/assets/readme/operation-heatmap.svg" alt="A responsive operation heatmap rendered by Kineglyph" width="960">
</p>

## Animate the same scene

Timelines are serializable keyframe tracks. The browser runtime applies their resolved frames with
Anime.js. The exporter samples those tracks at fixed times, so the live and recorded versions use
the same geometry.

<p align="center">
  <img src="./docs/assets/readme/throughput-over-time@2x.gif" alt="A high-resolution Kineglyph animation drawing a time series" width="800">
</p>

The GIF above is 1600 pixels wide and displayed at half size.

```sh
kineglyph-export gif \
  --scene './packages/scenes/dist/index.js#throughputOverTimeScene' \
  --theme './packages/scenes/dist/index.js#themes.nucleation' \
  --width-container 960 \
  --width 1600 \
  --fps 12 \
  --out throughput.gif
```

State machines can drive the same timeline. Events, guards, variables, actions, and derived
signals can bind to copy, visibility, tone, opacity, progress, and geometry. Random-access state
resolution keeps tests and exports deterministic.

## Embed it

The framework-neutral controller owns resize observation, playback, state events, inspection, and
cleanup.

```ts
import { mountKineglyph } from "@kineglyph/web";

const controller = mountKineglyph(document.querySelector("#figure"), { scene, theme });
controller.send("NEXT");
controller.seek(900);
```

React is a thin wrapper over that controller:

```tsx
import { KineglyphFigure } from "@kineglyph/react";

<KineglyphFigure figure={scene} theme={theme} />;
```

The self-contained browser bundle also works from a plain script tag or a Blade component. See the
working [Laravel example](./examples/laravel-blade/README.md).

## Packages

| Package             | Responsibility                                                    |
| ------------------- | ----------------------------------------------------------------- |
| `@kineglyph/core`   | scene schema, authoring, layout, edges, timelines, state machines |
| `@kineglyph/svg`    | accessible SVG serialization and motifs                           |
| `@kineglyph/anime`  | scoped Anime.js frame application                                 |
| `@kineglyph/plot`   | typed plots, scales, marks, axes, annotations, and stable handles |
| `@kineglyph/web`    | framework-neutral controller and browser bundle                   |
| `@kineglyph/react`  | React component and imperative handle                             |
| `@kineglyph/export` | SVG, PNG, GIF, and the `kineglyph-export` CLI                     |
| `@kineglyph/scenes` | twelve catalogue scenes, shared recipes, and three themes         |

## Run the workbench

Kineglyph requires Node.js 22.12 or newer.

```sh
npm install
npm run dev
```

The playground serves the catalogue at `#/`, individual scenes at `#/scene/<slug>`, and the plain
browser integration at `#/embed`.

```sh
npm run check
```

This runs formatting, builds every workspace, lints, typechecks, tests, and audits dependencies.

## Status

Kineglyph is pre-release. Package APIs may still change. The repository is MIT licensed.
