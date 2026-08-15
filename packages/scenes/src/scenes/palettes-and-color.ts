// PLACEHOLDER — replaced by the authored scene. Not presented as a finished illustration.
import { defineScene, type SceneDefinition } from "@kineglyph/core";
import type { CatalogueEntry } from "../catalogue.js";
import { caption, heading, stack } from "../recipes.js";

export const palettesAndColorScene: SceneDefinition = defineScene({
  schemaVersion: 2,
  id: "palettes-and-color",
  title: "Palettes and colour (placeholder)",
  description: "Placeholder awaiting the authored Palettes and colour illustration.",
  root: stack(
    "root",
    [heading("title", "Palettes and colour"), caption("body", "Scene not authored yet.")],
    {
      gap: 8,
    },
  ),
});

export const palettesAndColorEntry: CatalogueEntry = {
  slug: "palettes-and-color",
  order: 4,
  title: "Palettes and colour",
  summary: "Placeholder.",
  concept: "Placeholder.",
  interaction: "Placeholder.",
  animation: "Placeholder.",
  source: "palettes-and-color/color-pipeline.svg",
  scene: palettesAndColorScene,
};
