import { describe, expect, it } from "vitest";
import { drafting, draftingTheme, figure, resolveScene, sketch } from "@kineglyph/core";
import { renderSvg } from "@kineglyph/svg";

describe("sketch material", () => {
  it("renders a seeded fractal-noise displacement filter on sketched layers", () => {
    const scene = figure("sketched", { title: "Sketched" }, (f) => {
      const orbit = drafting.layer(f, drafting.circle(1440, 900, 400), {
        id: "orbit",
        sketch: { seed: 11, strength: 4, frequency: 0.012 },
      });
      const plain = drafting.layer(f, drafting.circle(1440, 900, 200), { id: "plain" });
      f.root(
        drafting.sheet(f, { id: "sheet", title: "Sketched", frame: false, layers: [orbit, plain] }),
      );
    });
    const svg = renderSvg(resolveScene(scene, { width: 960, theme: draftingTheme }), {
      idPrefix: "s",
    });
    expect(svg).toContain('<filter id="s-material-orbit"');
    expect(svg).toMatch(
      /<feTurbulence[^>]*type="fractalNoise"[^>]*baseFrequency="0.012"[^>]*seed="11"/,
    );
    expect(svg).toMatch(/<feDisplacementMap[^>]*scale="4"/);
    expect(svg).toContain('data-shader="sketch"');
    expect(svg).not.toContain('<filter id="s-material-plain"');
    // Stroke widths stay in screen pixels: the 2880-unit sheet is scaled to 0.317, so the default
    // 1px stroke is written as 1 / 0.317 sheet units and scales back down with the transform —
    // which is why path marks are excluded from the non-scaling-stroke rule.
    expect(svg).toMatch(/data-shape-of="orbit"[^>]*stroke-width="3\.1/);
    expect(svg).toMatch(/data-shape-of="orbit"[^>]*scale\(0\.317\)/);
    expect(svg).toContain(".kg-node-shape:not(.kg-path){vector-effect:non-scaling-stroke}");
    expect(svg).toMatch(/data-shape-of="orbit"[^>]*stroke-linecap="butt"/);
  });

  it("is a first-class shader effect with defaults", () => {
    expect(sketch()).toEqual({
      type: "shader",
      name: "sketch",
      uniforms: { strength: 4.5, frequency: 0.01, seed: 7 },
    });
  });
});
