// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { composeSurfaceSnapshots } from "../src/compose.js";

const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 100 60">
  <g data-node-id="view"><image data-live="true" href="fallback.png" width="40" height="30"/></g>
  <g data-node-id="other"><image data-live="true" href="other.png" width="10" height="10"/></g>
  <g data-node-id="static"><image href="static.png" width="10" height="10"/></g>
</svg>`;

describe("composeSurfaceSnapshots", () => {
  it("swaps the live fallback of the named node only", () => {
    const out = composeSurfaceSnapshots(
      svg,
      new Map([["view", "data:image/png;base64,AAAA"]]),
      document,
    );
    expect(out).toContain('href="data:image/png;base64,AAAA"');
    expect(out).toContain('href="other.png"');
    expect(out).toContain('href="static.png"');
    expect(out).not.toContain("fallback.png");
  });

  it("returns the input untouched without snapshots or matches", () => {
    expect(composeSurfaceSnapshots(svg, new Map(), document)).toBe(svg);
    expect(composeSurfaceSnapshots(svg, new Map([["missing", "data:,"]]), document)).toBe(svg);
  });
});
