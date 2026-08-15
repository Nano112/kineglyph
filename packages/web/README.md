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

Named material shaders are progressively enhanced in the live runtime. Rectangular shader surfaces
receive a WebGL canvas inside their SVG group; its time uniform follows playback and `seek()`. The
canvas sits below normal SVG content, so text, focus, inspection, and controls remain accessible.
When WebGL is unavailable, the SVG filter fallback remains visible. See
[Materials and effects](../../docs/materials-and-effects.md).

## Put a live renderer inside a scene

Mark an image node `live: true`; its image stays in SVG, PNG, and no-JavaScript output. In the
browser, key a renderer by that node id. Kineglyph aligns the HTML layer to the node and hands it
the current machine state, resolved signals, theme, timeline time, and an abort signal.

```ts
import "@google/model-viewer";
import { modelViewerSurface, mountKineglyph } from "@kineglyph/web";

const controller = mountKineglyph(host, {
  scene,
  liveSurfaces: {
    "build-preview": modelViewerSurface({
      alt: "Generated Minecraft build",
      source: async ({ signals, signal }) => {
        const schematic = buildSchematic(signals, { signal });
        const mesh = meshWithNucleation(schematic); // custom WASM build with `meshing`
        return mesh.toGlb();
      },
    }),
  },
});
```

When a scene event changes its state, Kineglyph re-resolves the figure and remounts the surface
with the new signals. Async work is aborted on state changes, resize, scene changes, and destroy.
If `<model-viewer>` is unavailable or generation fails, the static image remains visible. A custom
`LiveSurfaceRenderer` can mount Three.js, a native canvas, an iframe, or an application component
instead.

### Lifecycle guarantees

- Mounting sets `aria-busy="false"` on the host (hosts may advertise `aria-busy="true"` while
  waiting for the script); `destroy()` removes the attribute, the DOM, listeners, observers, and
  animations, and the controller then throws on use.
- Non-autoplaying and reduced-motion figures present their complete terminal frame; Play restarts
  from the beginning. `setReducedMotion(true)` also stops flow strokes and disables playback
  controls; the `prefers-reduced-motion` media query is followed live unless overridden.
- `setScene(scene, { initialState? })` re-mounts a different figure in place: a fresh machine
  (optionally started in `initialState`), rebuilt machine controls (never a stale handler even when
  ids and labels repeat), and a reset timeline. `setTheme` and `resize` keep time and state.
- Stage listeners are attached once per mount; re-renders replace SVG markup only, so no duplicate
  listeners accumulate. Ids are prefixed per mount (`kineglyph-<n>` or your `idPrefix`), so
  markers, clip paths, and titles never collide between figures.
- `startWhenVisible(element, start, { threshold, rootMargin, once })` starts a figure when it
  scrolls into view (low default threshold so very tall narrow figures still start).

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
| `liveSurfaces`    | —               | HTML/WebGL renderers keyed by live image node id                 |
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
