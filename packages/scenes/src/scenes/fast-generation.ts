// PLACEHOLDER — replaced by the authored scene. Not presented as a finished illustration.
import { defineScene, type SceneDefinition } from "@kineglyph/core";
import type { CatalogueEntry } from "../catalogue.js";
import { caption, heading, stack } from "../recipes.js";

export const fastGenerationScene: SceneDefinition = defineScene({
  schemaVersion: 2,
  id: "fast-generation",
  title: "Fast generation (placeholder)",
  description: "Placeholder awaiting the authored Fast generation illustration.",
  root: stack(
    "root",
    [heading("title", "Fast generation"), caption("body", "Scene not authored yet.")],
    {
      gap: 8,
    },
  ),
});

export const fastGenerationEntry: CatalogueEntry = {
  slug: "fast-generation",
  order: 1,
  title: "Fast generation",
  summary: "Placeholder.",
  concept: "Placeholder.",
  interaction: "Placeholder.",
  animation: "Placeholder.",
  source: "fast-generation/operation-map.svg",
  scene: fastGenerationScene,
};
