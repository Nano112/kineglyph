import type { MathRenderer } from "@kineglyph/math";

let pending: Promise<MathRenderer> | undefined;

/**
 * Loads the TeX renderer on demand. `@kineglyph/math` carries MathJax, so it is imported only
 * when a page asks for a formula; the returned renderer is synchronous and shared.
 */
export function loadMath(): Promise<MathRenderer> {
  pending ??= import("@kineglyph/math").then((module) => module.createMathRenderer());
  return pending;
}

export { mathMark } from "@kineglyph/math";
export type { MathGlyph, MathMark, MathMarkOptions, MathRenderer } from "@kineglyph/math";
