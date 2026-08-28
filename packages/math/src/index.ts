/**
 * `@kineglyph/math` — TeX formulas as deterministic path data.
 *
 * A formula becomes an ordinary `path` mark: it renders identically in the browser, in static
 * SVG, and in PNG/GIF export, takes semantic paint, and can be revealed, bound, and placed like any
 * other mark. `createMathRenderer()` is synchronous; `@kineglyph/web` exposes `loadMath()` which
 * imports this package on demand so pages without formulas do not pay for MathJax.
 */
export { createMathRenderer } from "./renderer.js";
export type { MathGlyph, MathRenderOptions, MathRenderer } from "./renderer.js";
export { parseTransform, transformPath } from "./path.js";
export type { Affine } from "./path.js";

import type { MathGlyph } from "./renderer.js";

export interface MathMarkOptions {
  /** Font size in pixels: how tall one em of the formula renders. */
  readonly size: number;
}

export interface MathMark {
  readonly d: string;
  readonly viewBox: { readonly width: number; readonly height: number };
  /** Rendered box in pixels. */
  readonly width: number;
  readonly height: number;
  /** Pixels from the top of the box to the baseline. */
  readonly baseline: number;
}

/** Sizes a glyph for `f.path(mark.d, mark.viewBox, { width: mark.width, height: mark.height })`. */
export function mathMark(glyph: MathGlyph, options: MathMarkOptions): MathMark {
  const scale = options.size / glyph.em;
  return {
    d: glyph.d,
    viewBox: glyph.viewBox,
    width: glyph.viewBox.width * scale,
    height: glyph.viewBox.height * scale,
    baseline: glyph.baseline * scale,
  };
}
