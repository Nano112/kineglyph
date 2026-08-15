import { describe, expect, it } from "vitest";
import {
  inlineCssVariables,
  normalizePathLength,
  pathLength,
  toRasterCompatibleSvg,
} from "../src/raster-compat.js";

describe("inlineCssVariables", () => {
  it("substitutes root custom properties in attributes and style blocks", () => {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" style="--fill:#ff0000;--font:&quot;Inter&quot;, sans-serif">' +
      "<style>.a{fill:var(--fill);font-family:var(--font)}</style>" +
      '<rect fill="var(--fill)" stroke="var(--missing, #00ff00)" font-family="var(--font)"/>' +
      '<circle fill="var(--nope)"/></svg>';
    const output = inlineCssVariables(svg);
    expect(output).toContain(".a{fill:#ff0000;font-family:&quot;Inter&quot;, sans-serif}");
    expect(output).toContain(
      '<rect fill="#ff0000" stroke="#00ff00" font-family="&quot;Inter&quot;, sans-serif"/>',
    );
    // Unresolvable references without a fallback are left alone.
    expect(output).toContain('<circle fill="var(--nope)"/>');
  });

  it("resolves nested references and :root rules", () => {
    const svg =
      '<svg style="--a:var(--b);--b:#123456"><style>:root{--c:#abcdef}</style>' +
      '<rect fill="var(--a)" stroke="var(--x, var(--c))"/></svg>';
    expect(inlineCssVariables(svg)).toContain('<rect fill="#123456" stroke="#abcdef"/>');
  });

  it("returns the input untouched when there is nothing to do", () => {
    const svg = '<svg><rect fill="#fff"/></svg>';
    expect(inlineCssVariables(svg)).toBe(svg);
    expect(toRasterCompatibleSvg(svg)).toBe(svg);
  });
});

describe("normalizePathLength", () => {
  it("rescales dash values by the real geometry and drops pathLength", () => {
    const svg =
      '<svg><line x1="0" y1="0" x2="30" y2="40" pathLength="1" stroke-dasharray="0.5 1" stroke-dashoffset="0.25"/>' +
      '<circle cx="0" cy="0" r="10" pathLength="100" stroke-dasharray="25 75"/>' +
      '<rect x="0" y="0" width="10" height="20" pathLength="1" stroke-dasharray="0.5 1"/>' +
      '<rect x="0" y="0" width="10" height="20" rx="5" pathLength="1" stroke-dasharray="1 1"/>' +
      '<polygon points="0,0 3,0 3,4" pathLength="2" stroke-dasharray="1 1"/>' +
      '<path d="M 0 0 L 10 0" pathLength="1" stroke-dasharray="none"/>' +
      '<path d="M 0 0 L 10 0" stroke-dasharray="0.5 1"/></svg>';
    const output = normalizePathLength(svg);
    expect(output).not.toContain("pathLength");
    expect(output).toContain(
      '<line x1="0" y1="0" x2="30" y2="40" stroke-dasharray="25 50" stroke-dashoffset="12.5"/>',
    );
    const circumference = 2 * Math.PI * 10;
    expect(output).toContain(
      `<circle cx="0" cy="0" r="10" stroke-dasharray="${format(circumference / 4)} ${format((circumference * 3) / 4)}"/>`,
    );
    expect(output).toContain('<rect x="0" y="0" width="10" height="20" stroke-dasharray="30 60"/>');
    // Rounded rect: straight runs (0 + 2×10) plus a full circle of radius 5.
    const rounded = 2 * (10 - 10) + 2 * (20 - 10) + 2 * Math.PI * 5;
    expect(output).toContain(`rx="5" stroke-dasharray="${format(rounded)} ${format(rounded)}"/>`);
    // 3-4-5 triangle perimeter is 12; authored length 2 → ratio 6.
    expect(output).toContain('<polygon points="0,0 3,0 3,4" stroke-dasharray="6 6"/>');
    expect(output).toContain('<path d="M 0 0 L 10 0" stroke-dasharray="none"/>');
    // Elements without pathLength are untouched.
    expect(output).toContain('<path d="M 0 0 L 10 0" stroke-dasharray="0.5 1"/>');
  });

  it("measures path data including curves, arcs, and relative commands", () => {
    expect(pathLength("M 0 0 L 3 4 l 3 4 H 10 V 10 Z")).toBeCloseTo(
      5 + 5 + 4 + 2 + Math.hypot(10, 10),
      6,
    );
    // Quarter circle as a cubic (radius 10) is within 0.1% of the analytic arc length.
    expect(pathLength("M 10 0 C 10 5.523 5.523 10 0 10")).toBeCloseTo((Math.PI * 10) / 2, 1);
    expect(pathLength("M 0 0 A 10 10 0 0 1 10 10")).toBeCloseTo((Math.PI * 10) / 2, 2);
    expect(pathLength("M 0 0 A 10 10 0 1 0 10 10")).toBeCloseTo((3 * Math.PI * 10) / 2, 2);
    expect(pathLength("M 0 0 Q 5 0 10 0 T 20 0")).toBeCloseTo(20, 6);
    expect(pathLength("M0,0 10,0 10,10")).toBe(20);
    expect(pathLength("M 0 0 A 10 10 0 01 10 10")).toBeCloseTo((Math.PI * 10) / 2, 2);
    expect(pathLength("garbage")).toBeUndefined();
  });
});

function format(value: number): string {
  return String(Number(value.toFixed(4)));
}
