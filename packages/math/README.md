# @kineglyph/math

TeX formulas as deterministic Kineglyph path data.

```ts
import { createMathRenderer, mathMark } from "@kineglyph/math";

const math = createMathRenderer();
const glyph = math.tex("v^2 = \\mu\\left(\\frac{2}{r} - \\frac{1}{a}\\right)");
const mark = mathMark(glyph, { size: 14 });
f.path(mark.d, mark.viewBox, {
  width: mark.width,
  height: mark.height,
  fill: "text",
  stroke: "none",
});
```

MathJax lays the formula out and emits font-free outlines; this package folds its transformed
group tree into one absolute path, so the same formula renders identically in the browser, in
static SVG, and in PNG/GIF export. In `@kineglyph/web`, `loadMath()` imports the renderer on
demand.
