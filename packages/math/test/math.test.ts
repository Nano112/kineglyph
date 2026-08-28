import { describe, expect, it } from "vitest";
import { createMathRenderer, mathMark, parseTransform, transformPath } from "../src/index.js";

describe("path transforms", () => {
  it("parses translate/scale/matrix into one affine", () => {
    expect(parseTransform("translate(10,20) scale(2)")).toEqual([2, 0, 0, 2, 10, 20]);
    expect(parseTransform("scale(1,-1)")).toEqual([1, 0, 0, -1, 0, 0]);
    expect(parseTransform("matrix(1 0 0 1 5 6)")).toEqual([1, 0, 0, 1, 5, 6]);
    expect(parseTransform(undefined)).toEqual([1, 0, 0, 1, 0, 0]);
  });

  it("rewrites relative and shorthand commands as absolute M/L/C/Q/Z", () => {
    const d = transformPath(
      "M10 10 h20 v5 l-5 5 q5 5 10 0 t10 0 c1 1 2 2 3 3 s2 2 4 4 Z",
      [1, 0, 0, -1, 0, 100],
    );
    expect(d).toBe(
      "M10 90 L30 90 L30 85 L25 80 Q30 75 35 80 Q40 85 45 80 C46 79 47 78 48 77 C49 76 50 75 52 73 Z",
    );
    expect(d).not.toMatch(/[hvstHVST]/);
  });
});

describe("createMathRenderer", () => {
  const math = createMathRenderer();

  it("folds a formula into one y-down path with sensible metrics", () => {
    const glyph = math.tex("v^2 = \\mu\\left(\\frac{2}{r} - \\frac{1}{a}\\right)", {
      display: true,
    });
    expect(glyph.d.startsWith("M")).toBe(true);
    expect(glyph.d).not.toMatch(/transform|use|rect/);
    expect(glyph.viewBox.width).toBeGreaterThan(glyph.viewBox.height);
    expect(glyph.baseline).toBeGreaterThan(0);
    expect(glyph.baseline).toBeLessThan(glyph.viewBox.height);
    expect(glyph.em).toBe(1000);
    // Every coordinate lies inside the box (fraction bars included).
    const numbers = glyph.d.match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? [];
    for (let i = 0; i < numbers.length; i += 2) {
      expect(numbers[i]).toBeGreaterThanOrEqual(-1);
      expect(numbers[i]).toBeLessThanOrEqual(glyph.viewBox.width + 1);
      expect(numbers[i + 1]).toBeGreaterThanOrEqual(-1);
      expect(numbers[i + 1]).toBeLessThanOrEqual(glyph.viewBox.height + 1);
    }
  });

  it("is deterministic and cached", () => {
    const a = math.tex("\\Delta v_1");
    const b = math.tex("\\Delta v_1");
    expect(a).toBe(b);
    expect(createMathRenderer().tex("\\Delta v_1").d).toBe(a.d);
  });

  it("renders fraction bars as subpaths", () => {
    const inline = math.tex("\\frac{a}{b}");
    expect(inline.d.split("M").length - 1).toBeGreaterThanOrEqual(3);
  });

  it("sizes marks by em", () => {
    const glyph = math.tex("x");
    const mark = mathMark(glyph, { size: 20 });
    expect(mark.height).toBeCloseTo((glyph.viewBox.height * 20) / 1000, 6);
    expect(mark.baseline).toBeLessThan(mark.height);
  });
});
