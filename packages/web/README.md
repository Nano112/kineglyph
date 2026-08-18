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
import { createTheme, figure } from "@kineglyph/core";
import { mountKineglyph } from "@kineglyph/web";

const scene = figure("request", { title: "Request path" }, (f) => {
  const input = f.card({ title: "Input" });
  const output = f.card({ title: "Output" });
  f.connect(input, output, { head: "arrow" });
  f.root(f.flow([input, output]));
});
const theme = createTheme({ colors: { accent: "#237f74" } });

const controller = mountKineglyph(document.querySelector("#figure"), {
  scene,
  theme,
  autoplay: "in-view",
  inView: { delay: 180 },
});

controller.play();
controller.pause();
controller.restart();
controller.seek(1200);
controller.send("FOCUS_FIELD"); // state-machine event, when the scene has one
controller.reset();
controller.setTheme(createTheme({ colors: { accent: "#6475b7" } }));
controller.setSignals({ rate: "1,284 req/s", status: "live" });
controller.inspect("field"); // programmatic inspection; inspect(null) clears
controller.on("state", ({ step }) => console.log(step.transition));
controller.destroy(); // removes DOM, listeners, observers, and animations
```

`controller.state` reports time, duration, playing, reducedMotion, width, layout, machineState,
resolved signals, and the inspected target. `controller.scene` is the current `ResolvedScene`.

For network feeds, `connectWebSocket()` parses JSON, coalesces bursts to the newest message once
per animation frame, and optionally reconnects with bounded exponential backoff. For table cells,
`mountMicrochart()` and `mountAllMicrocharts()` update tiny standalone SVGs without mounting full
figure runtimes. See [Live data and microcharts](../../docs/live-data-and-microcharts.md).

For thousands of cells, `mountMicrochartBatch()` uses one intersection observer and one shared
frame queue. Only visible charts retain SVG DOM, offscreen updates retain numbers only, and repeated
updates to one cell before paint collapse into a single draw.

Editable modules mounted through `@kineglyph/web/lab` may also export
`setup(controller, element)`. It runs after each successful preview mount and may return a cleanup
function. The lab disposes the previous setup before rerunning edited source and on destroy, so a
demo can safely own a timer, observer, or WebSocket while remaining hot-reloadable.

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
        const mesh = meshSchematic(schematic); // application-owned adapter
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

### Adapt operations and synchronized media

`adaptLiveSurface()` gives application renderers a lifecycle without letting slow async work race
the timeline. It serializes frame work and retains only the newest pending frame while one is in
flight. Playback changes are delivered separately, including pauses that emit no later frame.

```ts
import { adaptLiveSurface, mountKineglyph } from "@kineglyph/web";

const preview = adaptLiveSurface({
  mount({ element }) {
    const canvas = element.appendChild(document.createElement("canvas"));
    return createApplicationRenderer(canvas);
  },
  async frame(renderer, { time, signals }, signal) {
    const operation = operationAt(time, signals); // application-owned domain adapter
    await renderer.render(operation, { signal });
  },
  destroy(renderer) {
    renderer.destroy();
  },
});

mountKineglyph(host, { scene, liveSurfaces: { "build-preview": preview } });
```

For rendered video, `videoSurface({ src, offset?, rate? })` keeps the media element paused and
sets its decoded `currentTime` from every Kineglyph frame. The figure's clock remains the only
clock, so pause, seek, restart, reduced motion, and timeline export all agree.

```ts
mountKineglyph(host, {
  scene,
  liveSurfaces: { "simulation-video": videoSurface({ src: "/simulation.mp4" }) },
});
```

### Add parameters and binding-aware source

`createParameterPanel` and `createCodeDrawer` cover the controls around a live renderer. They are
plain DOM helpers: no React dependency, no application assumptions, and no host-page CSS required.

```ts
import { createCodeDrawer, createParameterPanel, type LiveSurfaceContext } from "@kineglyph/web";

const livePreview = (context: LiveSurfaceContext) => {
  let settings = { size: 6, detail: 1.2 };
  const preview = context.element.ownerDocument.createElement("canvas");
  const source = createCodeDrawer(context.element.ownerDocument, {
    samples: sourceFor(settings), // [{ id, label, code }, ...]
  });
  const parameters = createParameterPanel(context.element.ownerDocument, {
    parameters: [
      { id: "size", label: "Size", min: 2, max: 12, step: 0.1, value: settings.size },
      { id: "detail", label: "Detail", min: 0, max: 3, step: 0.05, value: settings.detail },
    ],
    onInput: ({ values }) => {
      settings = { ...settings, ...values };
      source.update(sourceFor(settings));
    },
    onChange: ({ values }) => renderPreview(values),
  });

  context.element.append(preview, parameters.element, source.element);
  return {
    destroy() {
      parameters.destroy();
      source.destroy();
      preview.remove();
    },
  };
};
```

`onInput` is immediate, so readouts and source can follow the thumb. `onChange` is debounced while
dragging and flushes on a committed change, which keeps expensive rendering off the hot path.
`update()` replaces parameter definitions or source samples without losing the selected language.

### Lifecycle guarantees

- Mounting sets `aria-busy="false"` on the host (hosts may advertise `aria-busy="true"` while
  waiting for the script); `destroy()` removes the attribute, the DOM, listeners, observers, and
  animations, and the controller then throws on use.
- Figures default to their first frame until they enter the viewport, then play after 180ms.
  `autoplay: true` starts immediately; `false` presents the complete terminal frame. Reduced-motion
  figures also present the terminal frame, stop flow strokes, and disable playback controls.
- `setScene(scene, { initialState? })` re-mounts a different figure in place: a fresh machine
  (optionally started in `initialState`), rebuilt machine controls (never a stale handler even when
  ids and labels repeat), and a reset timeline. `setTheme` and `resize` keep time and state.
- Stage listeners are attached once per mount; re-renders replace SVG markup only, so no duplicate
  listeners accumulate. Ids are prefixed per mount (`kineglyph-<n>` or your `idPrefix`), so
  markers, clip paths, and titles never collide between figures.
- `startWhenVisible(element, start, { delay, threshold, rootMargin, once })` starts a figure when it
  scrolls into view (low default threshold so very tall narrow figures still start).

### Options

| Option            | Default          | Purpose                                                             |
| ----------------- | ---------------- | ------------------------------------------------------------------- |
| `scene`           | —                | `SceneDefinition` or `PipelineDefinition`                           |
| `theme`           | `defaultTheme`   | Semantic theme tokens                                               |
| `layout`          | `"auto"`         | `auto`, `wide`, `compact`, `narrow` (or `stacked` for pipelines)    |
| `width`           | measured         | Fixed width; otherwise the host is observed with ResizeObserver     |
| `autoplay`        | `"in-view"`      | Viewport start; `true` is immediate and `false` is a finished still |
| `inView`          | `{ delay: 180 }` | Delay, threshold, root margin, and once/replay policy               |
| `controls`        | `true`           | Compact play / restart / scrubber controls; `"auto"` if animated    |
| `readout`         | `true`           | Inspection readout below the stage; `"auto"` if inspectable         |
| `machineControls` | `true`           | Buttons for `scene.controls`; `"auto"` if the scene has a machine   |
| `reducedMotion`   | media query      | Force the terminal frame and disable playback                       |
| `idPrefix`        | generated        | Stable DOM id prefix                                                |
| `initialState`    | machine initial  | Start a machine in a specific `MachineState`                        |
| `signals`         | scene defaults   | Initial external values for declared live signal bindings           |
| `liveSurfaces`    | —                | HTML/WebGL renderers keyed by live image node id                    |
| callbacks         | —                | `onInspect`, `onFrame`, `onPlaybackChange`, `onStateChange`         |

### Keyboard and accessibility

Interactive nodes are focusable buttons that send their `onActivate` event on Enter or Space;
described edges are exposed as images; the readout mirrors the inspected node; a polite live
region announces state-machine changes; Space toggles playback while the controls have focus;
machine buttons expose `aria-pressed`. Under `prefers-reduced-motion` the terminal frame is
shown, flow strokes stop, and playback controls are disabled.

## Auto-mount from data attributes

```html
<div data-kineglyph="request-path" data-theme="docs"></div>
<script type="module">
  import { autoMount } from "/vendor/kineglyph/kineglyph-web.js";
  import { scenes, themes } from "/assets/figures.js";
  autoMount({ scenes, themes });
</script>
```

`dist/kineglyph-web.js` is a self-contained ESM bundle of the runtime and authoring primitives.
It intentionally contains no consumer scenes or themes. Pass registries to `autoMount`, or call
`registerScene(id, scene)` and `registerTheme(name, theme)` first. See
`examples/laravel-blade` for a Blade integration.

Because the bundle re-exports both `@kineglyph/core` and `@kineglyph/plot`, and both packages
export `rule` and `formatNumber`, the bare names are core's (`rule(id, tone)` thin divider,
`formatNumber(value, precision)`) and plot's are aliased to `plotRule(options)` and
`formatPlotNumber(value, spec)`. Importing from `@kineglyph/plot` directly is unaffected.

## Embedding (`mountAll`)

`mountAll(options?)` upgrades every embedded figure already in the document — the contract an
external renderer (docs site, CMS, static-site generator) writes HTML against. It resolves once
every mount attempt has settled and returns the figures that mounted.

```ts
import { mountAll } from "@kineglyph/web";

await mountAll(); // default selector: figure.kg, [data-kineglyph]
```

Each host element is classified by `detectSource`, in priority order:

| Markup                                           | Source        | Loaded by                                      |
| ------------------------------------------------ | ------------- | ---------------------------------------------- |
| `<script type="text/kineglyph">…</script>` child | inline        | blob module URL (page import maps still apply) |
| `data-scene="…"`                                 | module        | `import()` of the URL, relative to `baseURI`   |
| `data-kineglyph="id"`                            | registered    | `getRegisteredScene(id)`                       |
| none of the above                                | _static-only_ | left untouched                                 |

```html
<figure class="kg">
  <img src="latency.svg" alt="Latency" />
  <script type="text/kineglyph">
    import { defineScene, stack, heading } from "kineglyph";
    export default defineScene({ /* … */ });
  </script>
</figure>

<figure class="kg" data-scene="/figures/latency.mjs">
  <img src="latency.svg" alt="Latency" />
</figure>

<figure class="kg"><img src="latency.svg" alt="Latency" /></figure>
```

A static-only figure is a feature, not a failure: its `<img>`/`<picture>` fallback simply stays.
Mounting hides the fallback and sets `data-kineglyph-mounted="true"`; a failed mount keeps the
fallback visible and records the message in `data-kineglyph-error`. Destroying a figure's
controller restores the fallback and clears the mounted flag, so mounting is reversible.

Per-element attributes `data-theme`, `data-autoplay`, `data-autoplay-delay`, `data-controls`, and
`data-readout` feed the mount; `options.theme`, `options.load`, and `options.mountOptions` accept functions of the element
when the host needs to override per figure. Elements already carrying
`data-kineglyph-mounted="true"` are skipped, so `mountAll` is safe to call again after new markup
arrives.

### Chrome that the scene decides: `"auto"`

`controls`, `readout` and `machineControls` are three-valued (`ChromeSetting = boolean | "auto"`).
`true`/`false` are obeyed and `undefined` still means `true`, so nothing that never asked changes
its answer. `"auto"` — also spelled `data-controls="auto"` / `data-readout="auto"` — hands the
decision to the resolved scene:

| Setting           | `"auto"` draws it when                                                               |
| ----------------- | ------------------------------------------------------------------------------------ |
| `controls`        | the scene has a timeline to drive (`resolved.timeline.duration > 0`)                 |
| `readout`         | some node is inspectable — `interactive`, or carrying both a label and a description |
| `machineControls` | the scene declares a machine                                                         |

The predicates are about _content_, not about the reader: they are settled once, at the first
resolve, so chrome never appears or vanishes under a reader who resizes the page or flips
`prefers-reduced-motion`. Each is decided independently, which is the point — a scene with
inspectable parts and no timeline gets a readout and no transport, rather than a Play button it
could only ever render disabled.

This is the setting an embedder wants for a figure that sits in prose, where the picture is the
point. Kineglyph has no opinion about which figures those are; deciding that is the embedder's job.

### `kineglyph:update`

Dispatch a `kineglyph:update` `CustomEvent` on the document to refresh figures in place — the hook
a dev server's HMR channel drives:

```js
document.dispatchEvent(new CustomEvent("kineglyph:update", { detail: { selector: "#latency" } }));
document.dispatchEvent(
  new CustomEvent("kineglyph:update", { detail: { url: "/figures/latency.mjs" } }),
);
```

`selector` targets matching elements; `url` targets every `[data-scene]` whose URL has the same
pathname. Already-mounted figures reload their source (module URLs get a cache-busting query so
`import()` re-fetches) and swap the scene through the live controller, preserving the element.
An element with no live figure — never mounted, or whose first mount threw — is mounted fresh
using the options from the most recent `mountAll` call, so a figure that failed once recovers on
the next update instead of staying dead.

## Live documentation examples

`mountAllKineglyphLabs()` upgrades an inline scene into a three-mode documentation example:
read-only source, a live editor beside its preview, and preview alone. Successful edits replace the
scene in place; a broken edit leaves the last good preview visible and reports the module error.
The CodeMirror editor is loaded as a separate chunk only when a source pane is opened.

```html
<figure data-kineglyph-lab data-view="split" data-height="440">
  <script type="text/kineglyph">
    import { defineScene, heading, stack } from "kineglyph";
    export default defineScene({
      schemaVersion: 2,
      id: "hello",
      title: "Hello",
      root: stack("root", [heading("title", "Edit me")], { padding: 24, width: "fill" }),
    });
  </script>
</figure>
```

```ts
import { mountAllKineglyphLabs } from "@kineglyph/web/lab";

const labs = await mountAllKineglyphLabs({
  theme: () => currentTheme(),
});

// Theme switches use the same controller contract as ordinary figures.
for (const lab of labs) lab.setTheme(nextTheme);
```

The default loader evaluates a browser ESM blob, so bare imports such as `"kineglyph"` are owned
by the host page's import map. A module may also `export const theme = myTheme`; the lab scopes its
colour tokens to that preview, leaving the surrounding page alone. `load` is injectable for a
restricted compiler or sandboxed runner.
Auto-run is debounced by 220ms, `Cmd/Ctrl+Enter` runs immediately, and `data-height="…"` accepts a
240–1200px editor height. The authoring surface is container-responsive and stacks vertically
below 760px.
