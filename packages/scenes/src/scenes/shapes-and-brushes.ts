// PLACEHOLDER — replaced by the authored scene. Not presented as a finished illustration.
import { defineScene, type SceneDefinition } from "@kineglyph/core";
import type { CatalogueEntry } from "../catalogue.js";
import { caption, heading, stack } from "../recipes.js";

export const shapesAndBrushesScene: SceneDefinition = defineScene({
  schemaVersion: 2,
  id: "shapes-and-brushes",
  title: "Shapes and brushes (placeholder)",
  description: "Placeholder awaiting the authored Shapes and brushes illustration.",
  root: stack(
    "root",
    [heading("title", "Shapes and brushes"), caption("body", "Scene not authored yet.")],
    {
      gap: 8,
    },
  ),
});

export const shapesAndBrushesEntry: CatalogueEntry = {
  slug: "shapes-and-brushes",
  order: 2,
  title: "Shapes and brushes",
  summary: "Placeholder.",
  concept: "Placeholder.",
  interaction: "Placeholder.",
  animation: "Placeholder.",
  source: "shapes-brushes/shape-brush-map.svg",
  scene: shapesAndBrushesScene,
};
