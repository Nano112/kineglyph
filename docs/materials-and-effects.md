# Materials and effects

Kineglyph has no house style. A scene describes structure and asks for semantic surface roles; a
theme supplies the visual direction. The warm paper treatment used in the README is one theme,
not a core default.

## Material roles

Five roles cover the common relationships between surfaces:

- `flat` belongs to its background.
- `raised` sits one layer above it.
- `floating` is detached and more prominent.
- `inset` is recessed into its parent.
- `glass` reveals or reacts to content behind it.

Use the role in the scene and keep its physical treatment in the theme:

```ts
import { material } from "@kineglyph/core";

const card = f.stack(content, {
  frame: material("raised"),
});
```

The same role may be a soft shadow in an editorial theme, a one-pixel outline in a terminal theme,
or a hard offset block in a publication theme. Local paint overrides material paint without
discarding the role's effects:

```ts
import { linearGradient, material } from "@kineglyph/core";

const frame = material("raised", {
  fill: linearGradient([
    { at: 0, color: "surfaceRaised" },
    { at: 1, color: "surfaceMuted" },
  ]),
});
```

Shapes accept `material` directly. Group frames extend the material style, so `material()` can be
used anywhere a frame is accepted.

## Theme definitions

`ThemeTokens.materials` maps every role to a `MaterialDefinition`:

```ts
import { createTheme, innerShadow, shadow } from "@kineglyph/core";

const paper = createTheme({
  materials: {
    raised: {
      fill: "surfaceRaised",
      stroke: "border",
      effects: [shadow({ color: "text", opacity: 0.14, blur: 24, spread: 1, offset: [0, 10] })],
    },
    inset: {
      fill: "surfaceMuted",
      stroke: "border",
      effects: [innerShadow({ color: "text", opacity: 0.08, blur: 7, offset: [0, 2] })],
    },
  },
});
```

Materials may set fill, stroke, stroke width, radius, opacity, blend mode, and an ordered effect
list. All colors remain semantic paint tokens and resolve through the active theme.

## Portable effects

The renderer-neutral effects are:

- `shadow()` and `innerShadow()` with color, opacity, blur, spread, and offset;
- `blur()` for the surface itself;
- `backdrop()` with blur, saturation, and brightness;
- `noise()` with a fixed seed, scale, amount, and monochrome mode.

SVG filters implement shadows, inner shadows, blur, deterministic turbulence, blending, and
displacement. The raster exporter evaluates those filters through the same SVG document, so PNG
and GIF preserve the material hierarchy.

The live browser renderer additionally applies CSS backdrop filtering. If the browser cannot
provide it, translucent paint, texture, borders, and shadows still form the authored fallback.

## Named shaders

`shader()` records intent, uniforms, and an explicit portable fallback. It never stores arbitrary
GLSL or WGSL in a scene:

```ts
import { noise, shader } from "@kineglyph/core";

const frost = shader("frosted-glass", {
  uniforms: { refraction: 0.08, grain: 0.024 },
  fallback: [noise({ amount: 0.026, scale: 0.55, seed: 17 })],
});
```

The initial named programs are `frosted-glass`, `iridescence`, `liquid`, `grain`, and `sketch`. In
the web runtime, supported rectangular surfaces receive a transparent WebGL canvas inserted behind
their SVG paint. The shader time uniform follows `controller.seek()` and timeline playback. Copy,
inspection, focus, and interaction remain ordinary accessible SVG above that surface.

Static renderers consume the declared fallback. The `liquid` and `sketch` presets also map to
deterministic SVG displacement filters — `liquid` ripples with turbulence, `sketch` (`sketch({
seed, strength, frequency })`) wanders with seeded fractal noise so a plotted line reads as
hand-drafted; see [Drafting sheets](./drafting-sheets.md). A missing WebGL context simply leaves
the fallback visible.

This split is deliberate:

| Capability                   | Live web | SVG               | PNG/GIF           |
| ---------------------------- | -------- | ----------------- | ----------------- |
| Semantic paint and gradients | Yes      | Yes               | Yes               |
| Outer and inner shadows      | Yes      | Yes               | Yes               |
| Seeded texture and blur      | Yes      | Yes               | Yes               |
| Backdrop sampling            | Enhanced | Fallback          | Fallback          |
| Named GPU program            | WebGL    | Declared fallback | Declared fallback |
| Random-access time           | Yes      | Fixed frame       | Sampled frames    |

Renderer capability changes fidelity, not scene validity. A document remains inspectable,
seekable, and exportable without its richest renderer.

## Rebuild the comparison

The README comparison resolves `materialDirectionsScene` against four themes and exports each SVG
from the same script:

```sh
npm run render:readme-materials
```

`materialDirectionThemes` is documentation material, not a list of preferred product styles. Use
it as a test that scene structure is independent from appearance.
