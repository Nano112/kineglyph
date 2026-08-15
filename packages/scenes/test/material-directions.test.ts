import { describe, expect, it } from "vitest";
import { resolveScene, validateScene } from "@kineglyph/core";
import { materialDirectionThemes, materialDirectionsScene } from "../src/index.js";

const LAYOUT_CODES = new Set(["overlap", "overflow", "text-truncated", "label-collision"]);

describe("material direction showcase", () => {
  it("keeps one valid responsive scene underneath every visual direction", () => {
    expect(validateScene(materialDirectionsScene).diagnostics).toEqual([]);
    const expectedIds = new Set<string>();
    for (const [name, theme] of Object.entries(materialDirectionThemes)) {
      for (const width of [760, 390]) {
        const resolved = resolveScene(materialDirectionsScene, { width, theme });
        const problems = (resolved.diagnostics ?? []).filter((entry) =>
          LAYOUT_CODES.has(entry.code),
        );
        expect(problems, `${name} at ${width}px`).toEqual([]);
        const ids = new Set(resolved.nodes.map((node) => node.id));
        if (expectedIds.size === 0) for (const id of ids) expectedIds.add(id);
        else expect(ids).toEqual(expectedIds);
      }
    }
  });

  it("proves that semantic roles can resolve to physical, glass, flat, or print treatments", () => {
    const chart = (name: keyof typeof materialDirectionThemes) =>
      resolveScene(materialDirectionsScene, {
        width: 760,
        theme: materialDirectionThemes[name],
      }).nodes.find((node) => node.id === "chart-surface")?.appearance;

    expect(chart("paper")?.effects).toEqual(
      expect.arrayContaining([expect.objectContaining({ type: "shadow", blur: 24 })]),
    );
    expect(chart("glass")?.effects).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "backdrop", blur: 22 }),
        expect.objectContaining({ type: "shader", name: "iridescence" }),
      ]),
    );
    expect(chart("terminal")?.effects).toEqual([]);
    expect(chart("terminal")?.radius).toBe(0);
    expect(chart("publication")?.effects).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "shadow", blur: 0, offset: [7, 7] }),
      ]),
    );
  });
});
