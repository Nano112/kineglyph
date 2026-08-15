// PLACEHOLDER — replaced by the authored scene. Not presented as a finished illustration.
import { defineScene, type SceneDefinition } from "@kineglyph/core";
import type { CatalogueEntry } from "../catalogue.js";
import { caption, heading, stack } from "../recipes.js";

export const smartSimulationScene: SceneDefinition = defineScene({
  schemaVersion: 2,
  id: "smart-simulation",
  title: "Smart simulation (placeholder)",
  description: "Placeholder awaiting the authored Smart simulation illustration.",
  root: stack(
    "root",
    [heading("title", "Smart simulation"), caption("body", "Scene not authored yet.")],
    {
      gap: 8,
    },
  ),
});

export const smartSimulationEntry: CatalogueEntry = {
  slug: "smart-simulation",
  order: 5,
  title: "Smart simulation",
  summary: "Placeholder.",
  concept: "Placeholder.",
  interaction: "Placeholder.",
  animation: "Placeholder.",
  source: "smart-simulation/choose-engine.svg",
  scene: smartSimulationScene,
};
