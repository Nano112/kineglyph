# Tooling, scale, and output

Kineglyph keeps one `ResolvedScene` as the boundary between authoring and every output surface.
That makes performance work composable: retain stable SVG elements for ordinary figures, opt into a
single canvas for dense marks, move serializable resolution work to an application-owned worker,
and audit or export the same result without changing the scene definition.

The distinctions matter. Canvas is not automatically better than SVG, a worker does not make
non-serializable code transferable, and deterministic rendering is not the same thing as a complete
visual-regression service. This page documents what is shipped, what is opt-in, and what still
belongs to the host application.

## One scene, three delivery strategies

_Dogfood · this decision guide is itself a responsive, animated Kineglyph figure._

```kineglyph live id=tooling-renderer-guide view=preview height=390
import { figure, kineglyphTheme, material } from "kineglyph";

export const theme = kineglyphTheme;

export default figure("tooling-renderer-guide", {
  title: "Choose a delivery strategy",
  description: "Accessible SVG is the default, Canvas handles dense paint, and workers isolate expensive serializable computation.",
}, (f) => {
  const svg = f.card({
    id: "svg",
    eyebrow: "DEFAULT",
    title: "Accessible SVG",
    body: "Inspection, focus, tooltips, motion, and stable keyed updates.",
    motif: "code",
    tone: "accent",
    frame: material("raised"),
  });
  const canvas = f.card({
    id: "canvas",
    eyebrow: "DENSE PAINT",
    title: "Canvas + summary",
    body: "One bitmap surface, a bounded DOM summary, and an SVG fallback.",
    motif: "grid",
    tone: "info",
    frame: material("flat"),
  });
  const worker = f.card({
    id: "worker",
    eyebrow: "EXPENSIVE RESOLVE",
    title: "Worker + scheduler",
    body: "Typed RPC, cancellation, burst coalescing, and a bounded result cache.",
    motif: "gear",
    tone: "success",
    frame: material("flat"),
  });

  f.root(f.flow([svg, canvas, worker], {
    gap: { wide: 46, compact: 26, narrow: 16 },
    width: "fill",
    padding: { wide: 24, compact: 18, narrow: 12 },
    frame: material("flat"),
  }));
  f.sequence([
    f.reveal(svg, { duration: 260 }),
    f.reveal(canvas, { duration: 260 }),
    f.reveal(worker, { duration: 260 }),
  ], { gap: 90 });
});
```

Start with SVG. Move to Canvas when profiling shows that thousands of paintable marks or DOM nodes
are the bottleneck. Add a worker when resolution or plot compilation blocks the main thread. These
choices are independent: a worker may still produce an accessible SVG, and Canvas may be useful
without a worker.

## Choose the smallest entry point

Package subpaths keep optional surfaces out of modules that do not use them. A production bundler
can also tree-shake the main ESM entries because the packages declare no global side effects.

| Need                             | Import                    | Delivery guidance                            |
| -------------------------------- | ------------------------- | -------------------------------------------- |
| Define and resolve scenes        | `@kineglyph/core`         | No DOM or renderer                           |
| Compile quantitative plots       | `@kineglyph/plot`         | Produces ordinary scene primitives           |
| Render an SVG string             | `@kineglyph/svg`          | Static or server-side SVG                    |
| Mount an ordinary browser figure | `@kineglyph/web`          | Default accessible runtime                   |
| Mount without bundled authoring  | `@kineglyph/web/runtime`  | Runtime-only public surface                  |
| Paint a dense resolved scene     | `@kineglyph/web/canvas`   | Opt-in Canvas renderer and SVG fallback      |
| Resolve through a worker         | `@kineglyph/web/worker`   | Typed RPC and incremental scheduler          |
| Mount the development audit      | `@kineglyph/web/doctor`   | Bounds and actionable findings               |
| Thousands of tiny charts         | `@kineglyph/web/micro`    | No full figure runtime per cell              |
| WebSocket lifecycle              | `@kineglyph/web/stream`   | Coalescing and optional reconnect            |
| Canvas, media, or app islands    | `@kineglyph/web/surfaces` | Application-owned live renderers             |
| Parameter and source controls    | `@kineglyph/web/controls` | Plain DOM controls                           |
| In-page editor                   | `@kineglyph/web/lab`      | CodeMirror and editable-preview tooling      |
| Browser export and clipboard     | `@kineglyph/web/export`   | Download/copy helpers without the editor     |
| Optional shader surfaces         | `@kineglyph/web/shaders`  | WebGL enhancement layer                      |
| No-bundler authoring and editing | `@kineglyph/web/bundle`   | Largest, self-contained browser surface      |
| Deterministic files in Node.js   | `@kineglyph/export`       | resvg, gifenc, HarfBuzz, and optional ffmpeg |

The root `@kineglyph/web` entry also re-exports its browser helpers for convenience. Prefer a named
subpath when a page needs only the runtime, Canvas, microcharts, streaming, workers, controls,
browser export, shaders, or the doctor.
Reserve `@kineglyph/web/bundle` for import-map and no-build environments: it intentionally combines
runtime, authoring, plots, SVG rendering, and the lab surface.

There is not yet a published compressed-byte budget for every entry. Measure the production build
that users actually receive—after minification, tree shaking, code splitting, and compression—and
gate that result in the host application's bundle analyser. Source-package or `dist/` file sizes are
not reliable transfer-size promises. In particular, load `@kineglyph/web/lab` only on pages with an
editor and load Node exporters only in build or server tooling.

## Stable ids make ordinary updates cheaper

`mountKineglyph()` automatically patches the existing SVG on signal, state, theme, scene, and
responsive changes. Compatible elements with a stable `data-node-id`, `data-edge-id`,
`data-surface-id`, or DOM `id` retain their identity while attributes, text, children, and order are
updated. Focus and element-bound listeners therefore survive ordinary keyed updates. Non-SVG live
layers beside the root SVG are left alone by the patcher.

Authors get stable keys by giving authored nodes and edges stable, unique ids:

```ts
const rate = f.code("waiting", {
  id: "request-rate",
  bind: { text: "rate" },
});

controller.setSignals({ rate: "1,284 req/s" });
```

Changing a keyed element's tag or namespace replaces it. Removing or reusing ids defeats identity,
and duplicate ids remain an authoring error. The reconciler is deterministic and listener-safe; it
is not a virtual DOM exposed as an application API.

The current lifecycle still performs a full scene resolution and SVG-string render for each
`setSignals()`, state transition, theme change, or resize. It disposes and recreates the animator,
shader manager, and live-surface manager around that render, then restores focused-node identity.
There is no dirty-region resolver or unchanged-subtree cache yet. Coalesce very hot feeds, keep ids
stable, and profile the resolver separately from DOM patching.

## Canvas for high-density paint

Canvas consumes a `ResolvedScene`; it does not change authoring or layout. `preferredRenderer()` is
a heuristic only—`750` nodes plus edges by default—and does not silently change the renderer used
by `mountKineglyph()`.

```ts
import { createTheme, resolveScene } from "@kineglyph/core";
import { mountCanvasScene, preferredRenderer } from "@kineglyph/web/canvas";
import { downloadSvg } from "@kineglyph/web";

const resolved = resolveScene(definition, {
  width: host.clientWidth,
  theme: createTheme(),
});

if (preferredRenderer(resolved, { threshold: 1_000 }) === "canvas") {
  const view = mountCanvasScene(host, resolved, {
    maxSummaryItems: 150,
    pixelRatio: window.devicePixelRatio,
  });

  view.update(nextResolvedScene);
  downloadSvg(view.svg(), { filename: "dense-scene.svg" });
  view.destroy();
}
```

`mountCanvasScene()` creates one `role="img"` canvas with the scene title or description as its
label. By default it also creates an ordered-list summary of meaningful visible nodes—labelled,
inspectable, or interactive—bounded to `200` entries. `maxSummaryItems` changes that bound;
`summary: false` removes the list. `handle.svg()` renders the complete current scene with portable
effects, suitable for a download or a separate accessible fallback.

The accessibility contract is deliberate: the Canvas surface has no per-mark focus targets,
tooltips, or pointer interaction. The list is a bounded overview, not a hidden copy of thousands of
DOM marks. Keep SVG for diagrams whose individual marks must be explored, or provide an
application-level table/search/detail view next to the Canvas.

The current Canvas renderer is a fast subset. It paints edges, text, rectangles, badges, callouts,
circles, ellipses, and `Path2D` paths, including solid strokes, fills, and linear/radial gradients.
Images, SVG filters/material effects, markers, rich per-mark interaction, and the browser animation
runtime remain SVG features. `update()` diffs stable node/edge ids, unions old and new bounds, and
clips repainting to the resulting dirty regions. A theme, background, viewport, large-area, or
highly fragmented change deliberately collapses to one full repaint. The renderer replays the
display list through the clip rather than retaining native objects, keeping ordering deterministic
without a second scene graph. Test `Path2D` availability in non-window canvas runtimes. Always keep
the SVG fallback for feature parity and export.

## Worker resolution, scheduling, and cancellation

Kineglyph does not create a global worker. The application owns the module URL, security policy,
worker lifetime, and serializable input. The worker-side adapter receives an `AbortSignal` and
posts only results that have not been cancelled.

```ts
// resolve.worker.ts
import { createTheme, resolveScene, type SceneDefinition } from "@kineglyph/core";
import { installWorkerResolver } from "@kineglyph/web/worker";

type Request = { scene: SceneDefinition; width: number };

installWorkerResolver<Request, ReturnType<typeof resolveScene>>(
  self,
  ({ scene, width }, signal) => {
    if (signal.aborted) throw signal.reason;
    return resolveScene(scene, { width, theme: createTheme() });
  },
);
```

```ts
// main.ts
import type { ResolvedScene, SceneDefinition } from "@kineglyph/core";
import { createIncrementalScheduler, createWorkerResolver } from "@kineglyph/web/worker";

type Request = { scene: SceneDefinition; width: number };

const worker = new Worker(new URL("./resolve.worker.ts", import.meta.url), {
  type: "module",
});
const remote = createWorkerResolver<Request, ResolvedScene>(worker);

const scheduled = createIncrementalScheduler<Request, ResolvedScene>(
  (input) => remote.resolve(input),
  {
    key: ({ width, scene }) => `${scene.id}:${width}`,
    maxEntries: 16,
    schedule(flush) {
      const frame = requestAnimationFrame(flush);
      return () => cancelAnimationFrame(frame);
    },
  },
);

const resolved = await scheduled.submit({ scene, width: host.clientWidth });

// Route teardown:
scheduled.destroy();
remote.destroy(); // rejects pending requests and terminates this worker when supported
```

Synchronous submissions before a scheduled flush collapse to the newest input; every waiter in
that burst receives the newest result. Successful results enter an insertion-ordered cache bounded
to `32` entries by default. The application defines the cache key, so include every value that can
change the result. `clear()` drops cached results and `destroy()` cancels a scheduled flush, rejects
waiters, and clears the cache.

The scheduler does not abort computation that has already started. For latest-only work, own an
`AbortController` and pass its signal to `remote.resolve(input, { signal })`; abort the previous
controller before issuing the next request. Cancellation posts a `kineglyph:cancel` message. The
worker handler discards a cancelled result, but expensive custom work stops early only when it
cooperatively checks the supplied signal. `transfer` can move transferable buffers without copying.

Worker inputs and outputs must be structured-cloneable. Functions, DOM nodes, font measurers,
Canvas contexts, and application class instances do not cross this boundary. Resolve callback-free
scene data in the worker, or return a compact plot/geometry result and perform DOM work on the main
thread.

## Audit while authoring

Enable the development overlay on an ordinary mount:

```ts
const controller = mountKineglyph(host, {
  scene,
  doctor: import.meta.env.DEV,
});
```

The overlay maps node-specific findings to resolved bounds and exposes a compact findings panel. It
updates with the mounted scene and is removed by `controller.destroy()`. For a custom renderer,
`mountDoctorOverlay(stage, resolved)` from `@kineglyph/web/doctor` returns `update()`,
`setVisible()`, and `destroy()` methods.

For reports and CI, the core API audits wide, compact, and narrow resolutions:

```ts
import { doctorScene } from "@kineglyph/core";

const report = doctorScene(scene, {
  widths: { wide: 1_200, compact: 720, narrow: 390 },
  minTouchTarget: 44,
  minTextContrast: 4.5,
  effectsBudget: 12,
  paletteBudget: 12,
});

if (!report.ok) throw new Error(JSON.stringify(report.findings, undefined, 2));
```

Installing `@kineglyph/export` also installs the `kineglyph-doctor` binary:

```sh
npm exec -- kineglyph-doctor \
  --scene ./figures/latency.mjs#scene \
  --wide 1200 --compact 720 --narrow 390 \
  --fail-on warning --json
```

The current doctor reports schema/resolver diagnostics, duplicate ids, undersized interactive
targets, text below 10px, literal-colour contrast against the scene background, excessive shadow
blur, unused vertical gutters, text density, effects count, and palette size. Every finding includes
a remedy and, when available, layout and node id. It does not yet prove collision-free routing,
truncation, port correctness, contrast over every nested material, or every timeline frame. Treat a
clean report as a guardrail, not as a substitute for responsive and assistive-technology review.

## A reusable regression harness

`captureRegressionSnapshots()` owns the repeatable part of visual regression: explicit responsive
layouts, exact timeline times, terminal reduced-motion variants, SVG/PNG rendering, stable DOM ids,
and SHA-256 fingerprints. Store its content-free manifest in the application repository and compare
it in any test runner:

```ts
import { readFile } from "node:fs/promises";
import {
  assertRegressionMatch,
  captureRegressionSnapshots,
  compareRegressionManifests,
  createRegressionManifest,
  formatRegressionReport,
} from "@kineglyph/export";
import scene from "../figures/latency.js";

const fonts = {
  files: ["./docs/assets/fonts/GeistMono[wght].ttf"],
  loadSystemFonts: false,
  defaultFamily: "Geist Mono",
} as const;

const captures = await captureRegressionSnapshots(scene, {
  times: [0, 600],
  includeFinal: true,
  includeReducedMotion: true,
  formats: ["svg", "png", "gif"],
  png: { fonts },
  gif: { fonts, fps: 8 },
});
const actual = createRegressionManifest(captures);
const expected = JSON.parse(await readFile("./figures/latency.regression.json", "utf8"));
const comparison = compareRegressionManifests(expected, actual);
console.log(formatRegressionReport(comparison));
assertRegressionMatch(comparison);
```

The default matrix is explicit `wide`/`compact`/`narrow`; custom viewports remain possible. PNG and
GIF fingerprints require pinned repository fonts. APNG/video remain outside this matrix so an
application can choose a small canonical codec sample. Browser interaction, focus, tooltip,
viewport autoplay, and live-surface tests still need an application-owned browser runner. Never
update baselines automatically on CI; review the changed artifact and code together.

## Export targets and their boundaries

The Node exporter owns reproducible files. The browser lab owns convenient client-side downloads.
They intentionally have different compatibility envelopes.

| Target                    | Status               | Notes                                                               |
| ------------------------- | -------------------- | ------------------------------------------------------------------- |
| SVG                       | Shipped              | Standalone or inline markup at an exact timeline time               |
| PNG                       | Shipped              | Deterministic resvg rasterization in Node                           |
| GIF                       | Shipped              | Deterministic gifenc sampling; 1-bit transparency                   |
| APNG                      | Shipped              | Deterministic RGBA frames; no external codec executable             |
| PNG sequence              | Shipped              | Timestamped `frame-0000.png` records                                |
| Sprite sheet              | Shipped              | PNG plus SVG sheet and frame coordinates                            |
| WebM / MP4                | Optional adapter     | `exportVideo()` requires an external ffmpeg executable and codec    |
| Data URI                  | Shipped in Node      | `bytesToDataUri(bytes, mime)`                                       |
| Browser download          | Shipped              | Existing bytes or SVG through a short-lived object URL              |
| Browser clipboard         | Capability-dependent | Rich typed item when supported; SVG can fall back to source text    |
| Embedded/subset SVG fonts | Shipped              | Full bytes by default; real subsetting is a caller-provided adapter |

```ts
import { exportApng, exportImageSequence, exportSpriteSheet, exportVideo } from "@kineglyph/export";

const apng = await exportApng(resolved, { fps: 12, fonts });
const frames = await exportImageSequence(resolved, { fps: 12, fonts });
const sheet = await exportSpriteSheet(resolved, { columns: 8, gap: 2, fonts });

// Optional: ffmpeg must be installed and the selected codec must be available.
const webm = await exportVideo(resolved, { format: "webm", fps: 30, fonts });
```

`exportImageSequence()`, `exportSpriteSheet()`, APNG, and the video adapter currently materialize
many frames in memory. Bound `fps`, `maxFrames`, scale, and duration for large scenes. MP4 uses an
opaque `yuv420p` path; WebM alpha depends on the selected ffmpeg codec and downstream player.
Choose APNG for lossless partial alpha, GIF for broad simple playback, and a video only when its
size benefit justifies an external codec dependency.

In the browser, the editable lab offers SVG and PNG for portable scenes and GIF when a timeline is
present. Its GIF path is intentionally bounded to 960×720, 180 frames, and 12 fps so an edit does
not freeze the page. The lab hides export for setup-driven modules and scenes containing live image
nodes, because a DOM/WebGL/media island cannot be reconstructed from the serializable fallback
without an application-specific capture policy.

`downloadSvg()`, `downloadBytes()`, `copySvgToClipboard()`, and `copyBytesToClipboard()` are
available from `@kineglyph/web`. Clipboard writes require browser support, a secure context,
permission, and usually a user gesture. Rich `image/svg+xml` clipboard support varies; `format:
"auto"` falls back to source text. Binary clipboard writes never silently coerce bytes to text.

### Fonts, transparency, and reproducibility

An explicit font should drive both layout and raster pixels:

```ts
const shaped = await createEmbeddedFontMeasurer([
  { family: "Geist Mono", file: "./fonts/GeistMono[wght].ttf" },
]);
const resolved = resolveScene(scene, {
  width: 960,
  theme,
  textMeasurer: shaped,
});
const png = await exportPng(resolved, {
  fonts: {
    files: shaped.files,
    loadSystemFonts: false,
    defaultFamily: "Geist Mono",
  },
});
```

SVG and PNG are emitted at each requested exact time. GIF is a full-timeline artifact, so the
harness emits it once per viewport at the terminal exact variant instead of duplicating identical
animations for every still-frame timestamp. Keep GIF opt-in for broad matrices because every frame
must be rasterized; use a repository-owned font set for portable PNG and GIF fingerprints.

System-font discovery changes pixels between machines and is slower per frame. Disable it and pin
the exact font files for regression output. `embedSvgFonts(svg, faces)` can add caller-owned font
bytes as data-URL `@font-face` rules. Its optional `subset` callback receives the unique characters
used by SVG text and must return a real font subset produced by fonttools, HarfBuzz, or another
chosen adapter; Kineglyph never truncates bytes and calls that a subset. Check the font licence
before redistributing or embedding font bytes.

Transparent SVG, PNG, and APNG preserve continuous alpha. GIF reduces alpha to transparent or
opaque. Raster output follows resvg's SVG support; `vector-effect: non-scaling-stroke` is not
preserved when scaling, and markers/text inherit resvg's compatibility. Browser-generated PNG/GIF
also inherit the user's browser rasterizer and should be treated as convenient downloads, not
cross-machine golden files.

## Production checklist

- Keep authored ids stable and unique; coalesce feeds before `setSignals()` when updates exceed the
  useful paint rate.
- Start with accessible SVG. Switch dense, non-interactive paint to Canvas only after profiling and
  provide the summary plus complete SVG fallback.
- Own worker creation and teardown, include every dependency in the scheduler key, and make custom
  computation cooperate with cancellation.
- Keep the doctor in editable/development surfaces and run `kineglyph-doctor --fail-on warning` at
  the breakpoints your product supports.
- Import the narrowest package surface and measure the minified, compressed application chunks—not
  repository artifacts.
- Pin fonts, renderer versions, dimensions, theme, state, time, fps, and background in regression
  tests.
- Bound frame count and pixel area before APNG, sequence, sprite, GIF, or video export.
- Keep a portable serializable fallback for every live surface; application-specific media capture
  remains an explicit adapter.
