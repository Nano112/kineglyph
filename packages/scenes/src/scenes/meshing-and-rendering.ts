// PLACEHOLDER — replaced by the authored scene. Not presented as a finished illustration.
import { defineScene, type SceneDefinition } from "@kineglyph/core";
import type { CatalogueEntry } from "../catalogue.js";
import { caption, heading, stack } from "../recipes.js";

export const meshingAndRenderingScene: SceneDefinition = defineScene({
  schemaVersion: 2,
  id: "meshing-and-rendering",
  title: "Meshing and rendering (placeholder)",
  description: "Placeholder awaiting the authored Meshing and rendering illustration.",
  root: stack(
    "root",
    [heading("title", "Meshing and rendering"), caption("body", "Scene not authored yet.")],
    {
      gap: 8,
    },
  ),
});

export const meshingAndRenderingEntry: CatalogueEntry = {
  slug: "meshing-and-rendering",
  order: 8,
  title: "Meshing and rendering",
  summary: "Placeholder.",
  concept: "Placeholder.",
  interaction: "Placeholder.",
  animation: "Placeholder.",
  source: "meshing-and-rendering/render-pipeline.svg",
  scene: meshingAndRenderingScene,
};
