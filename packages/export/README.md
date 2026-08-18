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

### Shape with the embedded font

Rasterizing with an explicit font file pins the pixels, but layout also needs that face's real
OpenType advances if wrapping and box geometry must be exact. `createEmbeddedFontMeasurer()` loads
the file through HarfBuzz; pass the returned object into the resolver and its files into export:

```ts
import { resolveScene } from "@kineglyph/core";
import { createEmbeddedFontMeasurer, exportPng } from "@kineglyph/export";

const fonts = await createEmbeddedFontMeasurer([
  { family: "Geist Mono", file: "fonts/GeistMono[wght].ttf" },
]);
const resolved = resolveScene(scene, { width: 960, theme, textMeasurer: fonts });
const png = await exportPng(resolved, {
  fonts: { files: fonts.files, loadSystemFonts: false, defaultFamily: "Geist Mono" },
});
```

The family is inferred from the font's OpenType name when omitted. Variable `wght` faces follow
each semantic text style's requested weight. CSS family stacks choose the first loaded match; an
unmatched family keeps core's portable glyph-class estimate unless a source is marked
`fallback: true`. `prerender()` also accepts `textMeasurer`.

Errors are `KineglyphExportError` instances with a `code`: `invalid-time`, `invalid-output`,
`missing-font`, `live-media` (image nodes flagged `live`), or `encoder`.

### GIF sampling

Frames are sampled every `1000 / fps` ms from `t = 0`, giving
`floor(duration × fps / 1000) + 1` frames. The last frame is always rendered at exactly
`duration` (snapped forward by less than one period when the duration is not a multiple of the
frame period). Every frame is shown for `round(100 / fps) × 10` ms — GIF delays have 10 ms
resolution — and the last frame for that delay plus `holdLast`. Scenes without a timeline
produce a single-frame GIF.

### `prerender()`

`prerender(moduleSource, options)` evaluates a scene _module_ under Node and returns one SVG per
theme — the static fallback an external renderer ships next to a live figure.

```ts
import { prerender } from "@kineglyph/export";
import { defaultTheme, createTheme } from "@kineglyph/core";

const results = await prerender(await readFile("figures/latency.mjs", "utf8"), {
  themes: [
    { name: "light", tokens: defaultTheme },
    { name: "dark", tokens: createTheme({ colors: { canvas: "#0b0f17", text: "#f2f5fa" } }) },
  ],
  width: 960,
  baseUrl: pathToFileURL("figures/latency.mjs").href,
});
// [{ theme: "light", svg, width, height }, { theme: "dark", ... }]
```

The module must `export default` a scene definition. Its import specifiers are rewritten before
evaluation:

- `kineglyph` — the bare specifier authors write — maps to `@kineglyph/web/bundle` (core
  authoring primitives, plot, and the runtime), resolved to the built JS bundle even when the
  caller runs under Vitest's `development` condition.
- extra bare specifiers come from `options.imports`.
- relative specifiers resolve against `options.baseUrl` (required if the module has any).
- anything else falls back to `import.meta.resolve`; unresolvable specifiers raise
  `KineglyphExportError("invalid-scene")`.

Each theme renders the final timeline frame with `idPrefix: "${idPrefix ?? "kg"}-${theme.name}"`,
so several prerendered figures can coexist in one document without id collisions. Scene
diagnostics of severity `error` raise `invalid-scene` rather than emitting a broken SVG.

## CLI

```
kineglyph-export [svg|png|gif] [--preset <module>#<export>] --out <file>
    [--scene <module>[#export]]
    [--theme <module>#<export>] [--width N] [--height N] [--scale N] [--time MS]
    [--fps N] [--hold-last MS] [--loop|--no-loop] [--background transparent|theme|<color>]
    [--layout auto|wide|compact|narrow] [--state <machine state>] [--width-container N]
    [--font <path>]... [--shape-font <family=path>]... [--system-fonts|--no-system-fonts]
```

### Export presets

Keep the theme, responsive container width, output size, animation settings, and font shaping next
to the figure, then override only what changes at the command line. Paths inside a preset resolve
relative to the preset module:

```ts
import { defineExportPreset } from "@kineglyph/export";

export const socialGif = defineExportPreset({
  format: "gif",
  scene: "./eclipses.js#eclipses",
  theme: "./eclipses.js#theme",
  containerWidth: 1200,
  width: 1120,
  fps: 10,
  holdLast: 1000,
  shapeFonts: [{ family: "Georgia", file: "./fonts/Georgia.ttf" }],
  loadSystemFonts: false,
  defaultFamily: "Georgia",
});
```

```sh
kineglyph-export --preset ./eclipses.js#socialGif --out eclipses.gif
# Explicit flags win over preset values:
kineglyph-export --preset ./eclipses.js#socialGif --fps 15 --width 1400 --out eclipses-hq.gif
```

`--scene` is imported dynamically. The chosen export (default export, then `scene`, then
`pipeline`, or `#name` — dotted paths such as `#themes.paper` walk into exported records) may be a
`ResolvedScene`, a `SceneDefinition` (resolved with `resolveScene` at `--width-container`, default
960, optionally in a named `--layout` and a machine `--state`), a `PipelineDefinition` (resolved
with `resolvePipeline`), or a `resolve({ width, theme, layout, state })` function. `--theme`
points at theme tokens or a factory such as `createTheme`. Export errors print `error: <message>`
and exit with code 1.

`--shape-font "Geist Mono=fonts/GeistMono[wght].ttf"` uses the same file for HarfBuzz layout and
rasterization. Combine it with `--no-system-fonts --default-font "Geist Mono"` for an export whose
typography is independent of the machine running the command.

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
  therefore pixels) depend on the host. Use `createEmbeddedFontMeasurer()` during resolution and
  pass `fonts: { files: [...], loadSystemFonts: false }` during rasterization to derive geometry
  and pixels from the same bytes. This is also much faster: loading the system font database
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
