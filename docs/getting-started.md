# Getting started

Kineglyph is published as small packages that share one scene model. Install only the renderer or
runtime your application needs.

```sh
npm install @kineglyph/core @kineglyph/svg
```

## Build and render a figure

`figure()` creates a serializable `SceneDefinition`. `resolveScene()` chooses a responsive layout
for the container width, measures text, and routes connectors; the SVG renderer draws that resolved
geometry.

The example is preview-first. Choose **Edit figure** underneath to change a card or switch `f.flow`
to `f.stack`.

```kineglyph live id=getting-started-figure view=preview height=390
import { figure } from "kineglyph";

export default figure("first-figure", { title: "First figure" }, (f) => {
  const source = f.card({ title: "Scene", body: "Serializable structure", motif: "code" });
  const result = f.card({
    title: "Explanation",
    body: "Responsive and deterministic",
    motif: "spark",
    tone: "success",
  });
  const edge = f.connect(source, result, { head: "arrow", packets: { count: 2 } });

  f.root(f.flow([source, result], { gap: 48 }));
  f.sequence([f.reveal(source), f.draw(edge), f.reveal(result), f.flow(edge)]);
});
```

The equivalent application-side render path is:

```ts
import { figure, resolveScene } from "@kineglyph/core";
import { renderSvg } from "@kineglyph/svg";

const scene = figure("first-figure", { title: "First figure" }, (f) => {
  const source = f.card({ title: "Scene", body: "Serializable structure", motif: "code" });
  const result = f.card({
    title: "Explanation",
    body: "Responsive and deterministic",
    motif: "spark",
    tone: "success",
  });
  const edge = f.connect(source, result, { head: "arrow" });

  f.root(f.flow([source, result], { gap: 32 }));
  f.sequence([f.reveal(source), f.draw(edge), f.reveal(result)]);
});

const resolved = resolveScene(scene, { width: 720 });
document.querySelector("#figure")!.innerHTML = renderSvg(resolved);
```

The same definition can be resolved again at a different width. Layout, endpoint sides, text
wrapping, and connector routes adapt together rather than scaling one desktop image down.

## Choose the integration

| Package             | Use it for                                                         |
| ------------------- | ------------------------------------------------------------------ |
| `@kineglyph/core`   | scene authoring, layout, themes, motion, and interaction state     |
| `@kineglyph/svg`    | deterministic SVG strings                                          |
| `@kineglyph/plot`   | bars, lines, areas, dots, heatmaps, and editorial charts           |
| `@kineglyph/web`    | framework-neutral playback, controls, inspection, and live figures |
| `@kineglyph/react`  | React bindings                                                     |
| `@kineglyph/export` | SVG, PNG, and GIF files in Node.js                                 |
| `@kineglyph/anime`  | Anime.js timeline integration                                      |
| `@kineglyph/scenes` | example scenes and reusable themes                                 |

For browser playback, install `@kineglyph/web`; for files generated during a build or from the
command line, install `@kineglyph/export`.

For dense tables, `@kineglyph/svg` also exposes `renderMicroSvg()`—a runtime-free 64 × 16 line,
area, bar, pie, or donut chart. Full live figures accept external data through
`controller.setSignals()`; `@kineglyph/web` includes a burst-coalescing WebSocket adapter. See
[Live data and microcharts](./live-data-and-microcharts.md) for both tiers.

## Continue

- [Authoring API](./authoring-api.md) lists every `figure()` helper and its return type.
- [Cookbook](./cookbook.md) covers responsive layouts, connectors, plots, motion, and state
  machines through complete patterns.
- [Embedding and theming](./embedding-and-theming.md) covers the web runtime and host-page styling.
- [Professional themes](./theme-gallery.md) compares six built-in professional presets against the
  same scene.
- [Editorial infographic patterns](./infographic-patterns.md) rebuilds workflow, matrix, lane,
  timeline, and comparison patterns as editable scenes.
- [Live data and microcharts](./live-data-and-microcharts.md) covers WebSockets, external signals,
  and tiny table-cell SVGs.
