import { describe, expect, it } from "vitest";
import { drafting, SHEET_HEIGHT, SHEET_WIDTH } from "./drafting.js";
import { figure } from "./figure.js";
import { resolveScene } from "./resolve.js";
import { draftingTheme } from "./theme-presets.js";

const sheetFigure = () =>
  figure(
    "drafting-test",
    {
      title: "Drafting test",
      background: "canvas",
      signals: { orbit: drafting.circle(1440, 900, 400), dv: "Δv = —" },
    },
    (f) => {
      const orbit = drafting.layer(f, drafting.circle(1440, 900, 400), {
        id: "orbit",
        stroke: "accent",
        strokeWidth: 2,
        dash: "dashed",
        sketch: { seed: 3 },
        bind: { path: "orbit" },
      });
      const dim = drafting.dimension(1440, 900, 1840, 900, { offset: 120 });
      const rule = drafting.layer(f, dim.d, { id: "dim", stroke: "textMuted" });
      const note = drafting.annotation(f, 2100, 500, ["BURN 1", { text: "Δv", bind: "dv" }], {
        id: "note",
        tone: "accent",
      });
      f.root(
        drafting.sheet(f, {
          id: "sheet",
          title: "Hohmann transfer",
          subtitle: "Minimum-energy transfer",
          ident: "Sheet 1 of 5",
          titleBlock: { title: "Sheet 01", rows: [["Epoch", "2026-08-28"]] },
          layers: [orbit, rule, note, drafting.text(f, "r₁", dim.label.x, dim.label.y, "bottom")],
        }),
      );
    },
  );

describe("drafting paths", () => {
  it("produces deterministic path data", () => {
    expect(drafting.line(0, 0, 10, 10)).toBe("M0 0 L10 10");
    expect(drafting.circle(100, 100, 50)).toBe(
      "M50 100 A50 50 0 1 0 150 100 A50 50 0 1 0 50 100 Z",
    );
    expect(drafting.rect(1, 2, 3, 4)).toBe("M1 2 H4 V6 H1 Z");
    expect(drafting.vector(0, 0, 100, 0)).toContain("Z");
    expect(drafting.at(1440, 900, "center")).toEqual({ x: 0.5, y: 0.5, anchor: "center" });
  });

  it("keeps dimension labels upright", () => {
    expect(drafting.dimension(100, 0, 0, 0).label.angle).toBe(0);
    expect(drafting.dimension(0, 0, 0, 100).label.angle).toBeCloseTo(90, 6);
    expect(drafting.dimension(0, 0, 100, 0, { offset: 20 }).label).toMatchObject({ x: 50, y: 20 });
  });

  it("samples ellipse arcs through the rotated frame", () => {
    const p = drafting.ellipsePoint(0, 0, 100, 50, 90, 0);
    expect(p.x).toBeCloseTo(0, 9);
    expect(p.y).toBeCloseTo(100, 9);
    expect(drafting.ellipseArc(0, 0, 100, 50, 0, 0, 180)).toMatch(/^M100 0 .* L-100 0$/);
  });

  it("indexes the frame with edge ticks", () => {
    const frame = drafting.frame();
    expect(frame.ticks.split("M").length - 1).toBe(2 * 7 + 2 * 4);
    expect(drafting.grid(1440).split("M").length - 1).toBe(3 + 2);
  });

  it("measures polygon area with the shoelace formula", () => {
    expect(
      drafting.polygonArea([
        { x: 0, y: 0 },
        { x: 4, y: 0 },
        { x: 4, y: 3 },
        { x: 0, y: 3 },
      ]),
    ).toBe(12);
  });
});

describe("drafting sheet", () => {
  it("sizes the sheet to its aspect at any width and resolves without errors", () => {
    for (const width of [960, 640, 440]) {
      const resolved = resolveScene(sheetFigure(), { width, theme: draftingTheme });
      const errors = (resolved.diagnostics ?? []).filter((entry) => entry.severity === "error");
      expect(errors).toEqual([]);
      const sheet = resolved.nodes.find((node) => node.id === "sheet");
      expect(sheet).toBeDefined();
      expect(sheet!.height / sheet!.width).toBeCloseTo(SHEET_HEIGHT / SHEET_WIDTH, 2);
    }
  });

  it("lets bound signals replace geometry and text without rebuilding", () => {
    const scene = sheetFigure();
    const before = resolveScene(scene, { width: 960, theme: draftingTheme });
    const after = resolveScene(scene, {
      width: 960,
      theme: draftingTheme,
      signals: { orbit: drafting.circle(1440, 900, 200), dv: "Δv = 2.426 km/s" },
    });
    const orbit = (resolved: typeof before) => resolved.nodes.find((node) => node.id === "orbit");
    expect(orbit(before)?.path?.d).not.toBe(orbit(after)?.path?.d);
    expect(orbit(after)?.path?.d).toBe(drafting.circle(1440, 900, 200));
    expect(JSON.stringify(after.nodes)).toContain("Δv = 2.426 km/s");
    expect(JSON.stringify(before.nodes)).not.toContain("Δv = 2.426 km/s");
  });

  it("carries the sketch material on sketched layers only", () => {
    const resolved = resolveScene(sheetFigure(), { width: 960, theme: draftingTheme });
    const orbit = resolved.nodes.find((node) => node.id === "orbit");
    const dim = resolved.nodes.find((node) => node.id === "dim");
    const effects = (node: typeof orbit) =>
      (node?.appearance?.effects ?? []).map((effect) => (effect as { name?: string }).name);
    expect(effects(orbit)).toContain("sketch");
    expect(effects(dim)).not.toContain("sketch");
  });
});
