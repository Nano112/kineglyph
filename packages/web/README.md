# @kineglyph/web

Framework-neutral browser runtime for Kineglyph figures. It resolves a semantic scene for the
host element's width, renders accessible SVG, drives playback through the scoped Anime.js
runtime, and wires inspection, keyboard, reduced-motion, and state-machine interaction — with no
React dependency and no shared ids, so any number of figures can live on one page.

```sh
npm install @kineglyph/web
```

## Mount a figure

```ts
import { mountKineglyph } from "@kineglyph/web";
import { catalogue, themes } from "@kineglyph/scenes";

const controller = mountKineglyph(document.querySelector("#figure"), {
  scene: catalogue[0].scene, // SceneDefinition (or a legacy PipelineDefinition)
  theme: themes.nucleation,
  autoplay: true,
});

controller.play();
controller.pause();
controller.restart();
controller.seek(1200);
controller.send("FOCUS_FIELD"); // state-machine event (scenes with a machine)
controller.reset();
controller.setTheme(themes.pock);
controller.inspect("field"); // programmatic inspection; inspect(null) clears
controller.on("state", ({ step }) => console.log(step.transition));
controller.destroy(); // removes DOM, listeners, observers, and animations
```

`controller.state` reports time, duration, playing, reducedMotion, width, layout, machineState,
and the inspected target. `controller.scene` is the current `ResolvedScene`.

### Options

| Option            | Default         | Purpose                                                          |
| ----------------- | --------------- | ---------------------------------------------------------------- |
| `scene`           | —               | `SceneDefinition` or `PipelineDefinition`                        |
| `theme`           | `defaultTheme`  | Semantic theme tokens                                            |
| `layout`          | `"auto"`        | `auto`, `wide`, `compact`, `narrow` (or `stacked` for pipelines) |
| `width`           | measured        | Fixed width; otherwise the host is observed with ResizeObserver  |
| `autoplay`        | `true`          | Start playback on mount (never under reduced motion)             |
| `controls`        | `true`          | Compact play / restart / scrubber controls                       |
| `readout`         | `true`          | Inspection readout below the stage                               |
| `machineControls` | `true`          | Buttons for `scene.controls` with `aria-pressed` state           |
| `reducedMotion`   | media query     | Force the terminal frame and disable playback                    |
| `idPrefix`        | generated       | Stable DOM id prefix                                             |
| `initialState`    | machine initial | Start a machine in a specific `MachineState`                     |
| callbacks         | —               | `onInspect`, `onFrame`, `onPlaybackChange`, `onStateChange`      |

### Keyboard and accessibility

Interactive nodes are focusable buttons that send their `onActivate` event on Enter or Space;
described edges are exposed as images; the readout mirrors the inspected node; a polite live
region announces state-machine changes; Space toggles playback while the controls have focus;
machine buttons expose `aria-pressed`. Under `prefers-reduced-motion` the terminal frame is
shown, flow strokes stop, and playback controls are disabled.

## Auto-mount from data attributes

```html
<div data-kineglyph="fast-generation" data-theme="nucleation"></div>
<script type="module">
  import { autoMount } from "/vendor/kineglyph/kineglyph-web.js";
  autoMount();
</script>
```

`dist/kineglyph-web.js` is a self-contained ESM bundle (runtime + product themes + catalogue)
built with Vite for pages without a bundler. With a bundler, import `@kineglyph/web` and register
your own scenes with `registerScene(id, scene)` / `registerTheme(name, theme)` before calling
`autoMount()`. See `examples/laravel-blade` for a Blade integration.
