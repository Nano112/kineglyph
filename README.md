# Kineglyph

**Technical illustrations with a pulse.**

Kineglyph is a deterministic TypeScript system for technical illustrations and quantitative
graphics that can be themed, animated, inspected, embedded, and exported. Author diagrams,
charts, matrices, comparisons, build sequences, and interactive explainers once; render the same
figure as accessible live SVG, static SVG, PNG, or GIF.

The catalogue includes eight Nucleation figures rebuilt as semantic scenes plus four quantitative
examples, all projected through the Nucleation, Pock, and Schematio visual languages. They mount
in React, vanilla JavaScript, and Laravel Blade, with the same scene exported to SVG, PNG, and GIF.

## What is here

- **Compact authoring** — `figure()` infers stable ids, composes layout recipes and compiled
  fragments, draws typed connectors, schedules motion presets, and attaches deterministic state
  machines. The serializable scene IR remains available as an escape hatch, not a tax on ordinary
  figures.
- **General scene primitives** — groups with stack, row, grid, overlay, coordinates, and absolute layouts;
  rect, circle, text, icon/motif, path, image, badge, legend, and callout marks; reusable
  recipes; caller-owned ids, explicit z-order, semantic tones and tokens, and named
  `wide` / `compact` / `narrow` layouts chosen by container width (never non-uniform scaling).
- **Edge grammar** — straight, orthogonal, curve, and arc routes; none/arrow/triangle/dot/diamond/
  bar heads and tails; solid, dashed, dotted, and animated flow strokes; per-layout ports and
  auto-distributed branching/merging; labels with collision-safe placement; deterministic reveal
  and time-positioned packets; accessible descriptions without redundant controls.
- **Plots and charts** — typed data channels, linear and band scales, axes, legends, annotations,
  bars, areas, lines, dots, heatmaps, and sparklines. Layered marks compile to ordinary scene
  primitives with stable handles, so they animate, inspect, theme, and export like every other
  figure.
- **State machines** — serializable states, events, guards, entry/exit actions, and derived
  signals that drive text, visibility, tone, opacity, highlight, progress, and geometry through
  bindings; random-access state resolution for tests and export; optional history in the live
  controller only.
- **Runtimes** — `@kineglyph/web` (`mountKineglyph`, framework-neutral, ESM bundle, auto-mount
  from data attributes) and `@kineglyph/react` (a thin wrapper over the same runtime), with
  identical keyboard, inspection, and reduced-motion behaviour.
- **Export** — standalone SVG, deterministic PNG via resvg, deterministic GIF via gifenc, a small
  CLI, and clear errors for missing fonts, live-only media, or invalid output settings.
- **Catalogue** — `@kineglyph/scenes` holds the eight source illustrations, four quantitative
  examples, and three product themes; the playground gallery shows every scene live at desktop /
  820 px / 390 px.

## Quick start

```sh
npm install
npm run check   # format, build, lint, strict typecheck, tests
npm run dev     # gallery: #/  ·  scene pages: #/scene/<slug>  ·  vanilla runtime: #/embed
```

## Packages

| Package             | Purpose                                                                        |
| ------------------- | ------------------------------------------------------------------------------ |
| `@kineglyph/core`   | Scene schema, themes, layout resolver, edge routing, timelines, state machines |
| `@kineglyph/svg`    | Deterministic accessible SVG serialization and the motif library               |
| `@kineglyph/anime`  | Scoped Anime.js v4 browser runtime applying resolved frames to the DOM         |
| `@kineglyph/plot`   | Typed plots, scales, marks, axes, annotations, and stable animation handles    |
| `@kineglyph/web`    | Framework-neutral `mountKineglyph` controller and self-contained ESM bundle    |
| `@kineglyph/react`  | React component and imperative handle over the web runtime                     |
| `@kineglyph/export` | SVG, PNG (resvg), and GIF (gifenc) export plus the `kineglyph-export` CLI      |
| `@kineglyph/scenes` | Nucleation illustrations, quantitative examples, themes, and catalogue         |

Start with the [authoring cookbook](./docs/cookbook.md) and
[authoring API](./docs/authoring-api.md). See also [the architecture specification](./docs/architecture.md), the
[phase 2 brief](./docs/phase-2-illustration-suite.md), the
[web runtime guide](./packages/web/README.md), the [export guide](./packages/export/README.md),
and the [Laravel Blade example](./examples/laravel-blade/README.md).

## A small authored figure

```ts
import { figure, resolveScene, seekTimeline } from "@kineglyph/core";
import { renderSvg } from "@kineglyph/svg";

const scene = figure("data-to-shape", { title: "Data becomes geometry" }, (f) => {
  const data = f.card({ title: "Data", body: "Input values", motif: "code" });
  const shape = f.card({ title: "Shape", body: "Resolved geometry", motif: "box" });
  const edge = f.connect(data, shape, { route: "curve", head: "arrow", label: "resolve" });

  f.root(f.flow([data, shape], { gap: 24 }));
  f.sequence([f.reveal(data), f.draw(edge), f.reveal(shape)]);
});

const resolved = resolveScene(scene, { width: 960, theme: myTheme });
const svg = renderSvg(seekTimeline(resolved, 720));
```

Mount it live with `mountKineglyph(element, { scene, theme })` from `@kineglyph/web`, or
`<KineglyphFigure figure={scene} theme={theme} />` from `@kineglyph/react`, and export it with
`exportPng(resolved)` from `@kineglyph/export`.

## Status

Kineglyph is pre-release. The scene, edge, and machine contracts are typed and serializable; the
legacy pipeline API from the first vertical slice remains supported through `resolveFigure`.
The project is MIT licensed.
