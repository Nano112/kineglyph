# @kineglyph/export

Deterministic SVG, PNG, and animated GIF export for Kineglyph scenes. Raster output is
produced with [resvg](https://github.com/RazrFalcon/resvg) (via `@resvg/resvg-js`) and GIFs are
encoded with [gifenc](https://github.com/mattdesl/gifenc); both dependencies live only in this
package, so `@kineglyph/core`, `@kineglyph/svg`, and the interactive runtime stay free of native
code. Node.js only.

## Library

```ts
import { createTheme, resolvePipeline } from "@kineglyph/core";
import { exportFile, exportGif, exportPng, exportSvg } from "@kineglyph/export";

const scene = resolvePipeline(definition, { width: 960, theme: createTheme() });

// Standalone SVG of the final frame (XML declaration, themed background rect).
await exportFile("out/pipeline.svg", exportSvg(scene));

// PNG at 2x, mid-animation.
await exportFile("out/pipeline@2x.png", await exportPng(scene, { scale: 2, time: 250 }));

// Animated GIF sampled at 12 fps with an 800 ms hold on the last frame.
await exportFile("out/pipeline.gif", await exportGif(scene, { fps: 12 }));
```

### API

| Function                                                | Returns               | Notes                                                              |
| ------------------------------------------------------- | --------------------- | ------------------------------------------------------------------ |
| `exportSvg(scene, options?)`                            | `string`              | `renderSvg(seekTimeline(scene, time))` plus declaration and sizing |
| `exportPng(scene, options?)`                            | `Promise<Uint8Array>` | resvg rasterization; pixel size = `round(scene × scale)`           |
| `exportGif(scene, options?)`                            | `Promise<Uint8Array>` | samples the timeline at `fps`, quantizes each frame with gifenc    |
| `planGifFrames(duration, { fps, holdLast, maxFrames })` | `GifFramePlan`        | frame times/delays used by `exportGif`                             |
| `pngInfo(bytes)` / `gifInfo(bytes)`                     | header summaries      | dimensions, frame count, delays (ms), loop flag                    |
| `exportFile(path, data)`                                | `Promise<void>`       | writes bytes or text, creating parent directories                  |

Common options (`SvgExportOptions`):

- `width` / `height` — output size. One dimension keeps the scene aspect ratio; both together
  letterbox the scene (`preserveAspectRatio="xMidYMid meet"`, viewBox unchanged). Never stretched.
- `scale` — uniform multiplier (cannot be combined with `width`/`height`).
- `background` — `"theme"` (default, paints `scene.theme.background`), `"transparent"`, or any
  CSS colour. Themed/coloured output inserts a `<rect class="kg-export-background">` as the first
  child of the root and, for raster output, also fills letterbox bars.
- `time` — timeline time in ms. Defaults to the final frame; values past the duration clamp;
  negative/non-finite values raise `invalid-time`.
- `title`, `description`, `idPrefix` — forwarded to `renderSvg`.

`PngExportOptions` adds `fonts: { files?, defaultFamily?, loadSystemFonts? }`.
`GifExportOptions` adds `fps` (1–60, default 12), `holdLast` (ms, default 800), `loop`
(default `true`), and `maxFrames` (default 600) and drops `time`.

Errors are `KineglyphExportError` instances with a `code`: `invalid-time`, `invalid-output`,
`missing-font`, `live-media` (image nodes flagged `live`), or `encoder`.

### GIF sampling

Frames are sampled every `1000 / fps` ms from `t = 0`, giving
`floor(duration × fps / 1000) + 1` frames. The last frame is always rendered at exactly
`duration` (snapped forward by less than one period when the duration is not a multiple of the
frame period). Every frame is shown for `round(100 / fps) × 10` ms — GIF delays have 10 ms
resolution — and the last frame for that delay plus `holdLast`. Scenes without a timeline
produce a single-frame GIF.

## CLI

```
kineglyph-export <svg|png|gif> --scene <module>[#export] --out <file>
    [--theme <module>#<export>] [--width N] [--height N] [--scale N] [--time MS]
    [--fps N] [--hold-last MS] [--no-loop] [--background transparent|theme|<color>]
    [--layout auto|wide|compact|narrow] [--state <machine state>] [--width-container N]
    [--font <path>]... [--no-system-fonts]
```

`--scene` is imported dynamically. The chosen export (default export, then `scene`, then
`pipeline`, or `#name` — dotted paths such as `#themes.paper` walk into exported records) may be a
`ResolvedScene`, a `SceneDefinition` (resolved with `resolveScene` at `--width-container`, default
960, optionally in a named `--layout` and a machine `--state`), a `PipelineDefinition` (resolved
with `resolvePipeline`), or a `resolve({ width, theme, layout, state })` function. `--theme`
points at theme tokens or a factory such as `createTheme`. Export errors print `error: <message>`
and exit with code 1.

```sh
kineglyph-export png --scene node_modules/@kineglyph/scenes/dist/index.js#smartSimulationScene \
  --theme node_modules/@kineglyph/scenes/dist/index.js#themes.paper --state circuit \
  --width-container 1200 --out smart-simulation-circuit.png
```

## Determinism

The same scene, options, and fonts always yield identical bytes: resvg is deterministic, GIF
palettes are computed with a deterministic quantizer, and frame timing is derived from integers.
Two things vary between machines and must be pinned for reproducible output:

- **Fonts.** By default resvg loads the fonts installed on the machine, so text glyphs (and
  therefore pixels) depend on the host. Pass `fonts: { files: [...], loadSystemFonts: false }`
  to render with explicit font files. This is also much faster: loading the system font database
  costs roughly 100 ms per rendered frame, whereas explicit files load in a few milliseconds.
- **Renderer versions.** Pin `@resvg/resvg-js` and `gifenc` if pixel-exact output matters.

When `loadSystemFonts` is `false`, no font files are given, and the scene contains text, export
fails early with `missing-font` rather than producing blank labels.

## Backgrounds and raster compatibility

Browsers paint the scene background from CSS (`.kg-scene { background: var(--kg-background) }`),
which raster renderers ignore. The exporter therefore materialises the background as a real
`<rect>` (unless `background: "transparent"`), inlines the CSS custom properties from the root
`style` attribute (resvg does not support `var()`), and rewrites `pathLength`-relative dash
arrays into user-space lengths (resvg does not support `pathLength`). These rewrites only touch
standard SVG syntax; the SVG exporter itself leaves the renderer's markup untouched apart from
the declaration, root sizing attributes, and background rect.

Material shadows, inner shadows, blur, seeded texture, and displacement are ordinary SVG filters
and therefore survive rasterization. Browser-only backdrop sampling and WebGL programs use their
declared portable fallback during SVG, PNG, and GIF export.

Known raster limitations: `vector-effect: non-scaling-stroke` is ignored by resvg, so strokes
scale with `scale`; markers and text follow resvg's SVG support.
