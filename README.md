# Kineglyph

**Technical illustrations with a pulse.**

Kineglyph is a deterministic TypeScript system for technical illustrations that can be themed,
animated, inspected, embedded, and exported. A figure is authored once as semantic primitives,
typed connectors, a seekable timeline, and (when it helps) a deterministic state machine.
Renderers turn the same resolved scene into accessible interactive SVG, static SVG, PNG, or GIF.

Phase 2 ships the illustration suite: eight Nucleation figures rebuilt as semantic scenes,
projected through the Nucleation, Pock, and Schematio visual languages, and mountable in React,
vanilla JavaScript, and Laravel Blade — with the same scene exported to SVG, PNG, and GIF.

## What is here

- **General scene primitives** — groups with stack, row, grid, overlay, and absolute layouts;
  rect, circle, text, icon/motif, path, image, badge, legend, and callout marks; reusable
  recipes; caller-owned ids, explicit z-order, semantic tones and tokens, and named
  `wide` / `compact` / `narrow` layouts chosen by container width (never non-uniform scaling).
- **Edge grammar** — straight, orthogonal, curve, and arc routes; none/arrow/triangle/dot/diamond/
  bar heads and tails; solid, dashed, dotted, and animated flow strokes; per-layout ports and
  auto-distributed branching/merging; labels with collision-safe placement; deterministic reveal
  and time-positioned packets; accessible descriptions without redundant controls.
- **State machines** — serializable states, events, guards, entry/exit actions, and derived
  signals that drive text, visibility, tone, opacity, highlight, progress, and geometry through
  bindings; random-access state resolution for tests and export; optional history in the live
  controller only.
- **Runtimes** — `@kineglyph/web` (`mountKineglyph`, framework-neutral, ESM bundle, auto-mount
  from data attributes) and `@kineglyph/react` (a thin wrapper over the same runtime), with
  identical keyboard, inspection, and reduced-motion behaviour.
- **Export** — standalone SVG, deterministic PNG via resvg, deterministic GIF via gifenc, a small
  CLI, and clear errors for missing fonts, live-only media, or invalid output settings.
- **Catalogue** — `@kineglyph/scenes` holds the eight illustrations, the three product themes,
  and the recipes; the playground gallery shows every scene live at desktop / 820 px / 390 px.

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
| `@kineglyph/web`    | Framework-neutral `mountKineglyph` controller and self-contained ESM bundle    |
| `@kineglyph/react`  | React component and imperative handle over the web runtime                     |
| `@kineglyph/export` | SVG, PNG (resvg), and GIF (gifenc) export plus the `kineglyph-export` CLI      |
| `@kineglyph/scenes` | The eight Nucleation illustrations, product themes, recipes, and catalogue     |

See [the architecture specification](./docs/architecture.md), the
[phase 2 brief](./docs/phase-2-illustration-suite.md), the
[web runtime guide](./packages/web/README.md), the [export guide](./packages/export/README.md),
and the [Laravel Blade example](./examples/laravel-blade/README.md).

## A small authored scene

```ts
import {
  defineScene,
  resolveScene,
  seekTimeline,
  timeline,
  reveal,
  drawEdge,
} from "@kineglyph/core";
import { renderSvg } from "@kineglyph/svg";

const scene = defineScene({
  schemaVersion: 2,
  id: "data-to-shape",
  title: "Data becomes geometry",
  root: {
    id: "root",
    type: "group",
    layout: { wide: "row", compact: "stack" },
    gap: 24,
    children: [
      {
        id: "data",
        type: "group",
        width: "fill",
        padding: 14,
        frame: { fill: "surface", stroke: "border" },
        interactive: true,
        label: "Data",
        description: "Input values",
        children: [{ id: "data-title", type: "text", text: "Data", textStyle: "bodyStrong" }],
      },
      {
        id: "shape",
        type: "group",
        width: "fill",
        padding: 14,
        frame: { fill: "surface", stroke: "border" },
        interactive: true,
        label: "Shape",
        description: "Resolved geometry",
        children: [{ id: "shape-title", type: "text", text: "Shape", textStyle: "bodyStrong" }],
      },
    ],
  },
  edges: [
    {
      id: "data-to-shape",
      from: "data",
      to: "shape",
      route: "curve",
      head: "arrow",
      label: "resolve",
    },
  ],
  timeline: timeline([
    reveal("data", 0, 400),
    drawEdge("data-to-shape", 400, 900),
    reveal("shape", 700, 1100),
  ]),
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
