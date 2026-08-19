import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import * as bundle from "../src/bundle.js";

const DIST = fileURLToPath(new URL("../dist/kineglyph-web.js", import.meta.url));

/**
 * `@kineglyph/core` and `@kineglyph/plot` both export `rule` and `formatNumber`. The bundle must
 * ship BOTH: core's under the bare names, plot's under `plotRule` / `formatPlotNumber`.
 */
describe("bundle export disambiguation", () => {
  it("exposes core's rule under the bare name", () => {
    const mark = bundle.rule("x");
    expect(mark.type).toBe("rect");
    expect(mark.id).toBe("x");
  });

  it("exposes plot's rule as plotRule", () => {
    expect(bundle.plotRule).not.toBe(bundle.rule);
    expect(bundle.plotRule({ y: 1 })).toEqual({ type: "reference-line", axis: "y", value: 1 });
  });

  it("exposes core's formatNumber under the bare name and plot's as formatPlotNumber", () => {
    expect(typeof bundle.formatNumber).toBe("function");
    expect(typeof bundle.formatPlotNumber).toBe("function");
    expect(bundle.formatPlotNumber).not.toBe(bundle.formatNumber);
    // core: (value, precision) — plot: (value, spec)
    expect(bundle.formatNumber(1.234, 1)).toBe("1.2");
    expect(bundle.formatPlotNumber(12345, { compact: true })).toContain("k");
  });

  it("exposes the professional theme presets from the browser bundle", () => {
    expect(Object.keys(bundle.professionalThemes)).toEqual([
      "swiss",
      "ledger",
      "blueprint",
      "fieldManual",
      "studio",
      "civic",
    ]);
    expect(bundle.swissTheme.name).toBe("swiss");
    expect(bundle.blueprintTheme.materials.glass.effects ?? []).toEqual([]);
    expect(bundle.studioTheme.radii.lg).not.toBe(bundle.swissTheme.radii.lg);
  });

  it("exposes file-tree, terminal, typing, and asciicast authoring in the browser bundle", () => {
    expect(typeof bundle.fileTree).toBe("function");
    expect(typeof bundle.terminal).toBe("function");
    expect(typeof bundle.asciicast).toBe("function");
    expect(typeof bundle.parseAsciicast).toBe("function");
    const parsed = bundle.parseAsciicast(
      '{"version":3,"term":{"cols":80,"rows":24}}\n[0.1,"o","ready\\r\\n"]',
    );
    expect(parsed.duration).toBe(100);
  });

  it.skipIf(!existsSync(DIST))("the built bundle re-exports the plot aliases too", async () => {
    const source = readFileSync(DIST, "utf8");
    expect(source).toContain("plotRule");
    expect(source).toContain("formatPlotNumber");
    const built = (await import(
      /* @vite-ignore */ new URL("../dist/kineglyph-web.js", import.meta.url).href
    )) as typeof bundle;
    expect(built.rule("x").type).toBe("rect");
    expect(built.plotRule({ y: 1 })).toEqual({ type: "reference-line", axis: "y", value: 1 });
    expect(built.plotRule).not.toBe(built.rule);
    expect(built.formatPlotNumber).not.toBe(built.formatNumber);
    expect(built.professionalThemes.civic.name).toBe("civic");
    expect(typeof built.asciicast).toBe("function");
  });
});
