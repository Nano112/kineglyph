import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  createTheme,
  defineScene,
  measureText,
  resolveScene,
  type TextFont,
} from "@kineglyph/core";
import { createEmbeddedFontMeasurer, exportPng } from "../src/index.js";

const geist = fileURLToPath(
  new URL("../../../docs/assets/fonts/GeistMono[wght].ttf", import.meta.url),
);
const font: TextFont = {
  family: "Geist Mono, monospace",
  size: 16,
  weight: 400,
  lineHeight: 24,
};

describe("createEmbeddedFontMeasurer", () => {
  it("shapes from explicit bytes and falls back only when the family does not match", async () => {
    const embedded = await createEmbeddedFontMeasurer([{ file: geist }]);
    const first = measureText("AV fi سلام", font, embedded);
    const second = measureText("AV fi سلام", font, embedded);
    expect(embedded.families).toEqual(["Geist Mono"]);
    expect(embedded.files).toEqual([geist]);
    expect(first).toBe(second);
    expect(first).toBeGreaterThan(0);
    expect(measureText("abc", { ...font, size: 32 }, embedded)).toBeCloseTo(
      measureText("abc", font, embedded) * 2,
      3,
    );
    const unmatched = { ...font, family: "No Such Family" };
    expect(measureText("abc", unmatched, embedded)).toBe(measureText("abc", unmatched));
  });

  it("drives layout and rasterization from the same font file", async () => {
    const embedded = await createEmbeddedFontMeasurer([{ file: geist }]);
    const theme = createTheme({
      typography: Object.fromEntries(
        Object.entries(createTheme().typography).map(([name, value]) => [
          name,
          { ...value, family: "Geist Mono, monospace" },
        ]),
      ),
    });
    const scene = defineScene({
      schemaVersion: 2,
      id: "shaped",
      title: "Shaped",
      root: {
        id: "root",
        type: "group",
        width: "fill",
        padding: 12,
        children: [{ id: "copy", type: "text", text: "A deterministic embedded font run" }],
      },
    });
    const resolved = resolveScene(scene, { width: 220, theme, textMeasurer: embedded });
    expect(resolveScene(scene, { width: 220, theme, textMeasurer: embedded })).toEqual(resolved);
    const options = { fonts: { files: embedded.files, loadSystemFonts: false } } as const;
    const [first, second] = await Promise.all([
      exportPng(resolved, options),
      exportPng(resolved, options),
    ]);
    expect(Buffer.compare(first, second)).toBe(0);
  });
});
