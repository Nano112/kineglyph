# Kineglyph

**Technical illustrations with a pulse.**

Kineglyph is a deterministic TypeScript system for technical illustrations that can be themed,
animated, inspected, embedded, and exported. A figure is authored once as semantic nodes,
connections, layout constraints, and a seekable timeline. Renderers turn the same resolved scene
into accessible interactive SVG or static output.

This repository begins with one deliberately complete vertical slice: the Nucleation
SDF-and-fields pipeline, rendered in Nucleation, Pock, and Schematio visual languages without
theme-specific coordinates.

## What works in the first slice

- Constraint-resolved wide and stacked layouts that never stretch the drawing.
- Semantic theme tokens for colour, typography, geometry, and motion.
- A deterministic timeline that can be evaluated at any time with `seek(t)`.
- Accessible SVG strings with titles, descriptions, focusable stages, and stable identifiers.
- Anime.js v4 playback with a scoped lifecycle and deterministic scrubbing.
- A React wrapper with hover/focus inspection and reduced-motion handling.
- A Vite playground with theme switching, play/pause, restart, and a timeline scrubber.

## Quick start

```sh
npm install
npm run check
npm run dev
```

Then open the Vite URL printed by the terminal.

## Packages

| Package             | Purpose                                                             |
| ------------------- | ------------------------------------------------------------------- |
| `@kineglyph/core`   | Scene schema, themes, constraint layout, and seekable timelines     |
| `@kineglyph/svg`    | Deterministic accessible SVG serialization                          |
| `@kineglyph/anime`  | Scoped Anime.js v4 browser runtime                                  |
| `@kineglyph/react`  | React component and interaction wrapper                             |
| `@kineglyph/export` | Export contract placeholder for a later resvg-backed implementation |

Read [the architecture specification](./docs/architecture.md) for the invariants and package
boundaries.

## A small authored scene

```ts
import { definePipeline, resolvePipeline, seekTimeline } from "@kineglyph/core";

const scene = definePipeline({
  id: "example",
  title: "Data becomes geometry",
  nodes: [
    { id: "data", label: "Data", description: "Input values" },
    { id: "shape", label: "Shape", description: "Resolved geometry" },
  ],
  edges: [{ id: "data-to-shape", from: "data", to: "shape" }],
});

const resolved = resolvePipeline(scene, {
  width: 960,
  layout: "wide",
  theme: myTheme,
});

const frame = seekTimeline(resolved, 720);
```

## Status

Kineglyph is pre-release. The scene and layout contracts are intentionally small while the first
illustration set establishes the right primitives. The project is MIT licensed.
