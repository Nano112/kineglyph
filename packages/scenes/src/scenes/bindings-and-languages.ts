// PLACEHOLDER — replaced by the authored scene. Not presented as a finished illustration.
import { defineScene, type SceneDefinition } from "@kineglyph/core";
import type { CatalogueEntry } from "../catalogue.js";
import { caption, heading, stack } from "../recipes.js";

export const bindingsAndLanguagesScene: SceneDefinition = defineScene({
  schemaVersion: 2,
  id: "bindings-and-languages",
  title: "Bindings and languages (placeholder)",
  description: "Placeholder awaiting the authored Bindings and languages illustration.",
  root: stack(
    "root",
    [heading("title", "Bindings and languages"), caption("body", "Scene not authored yet.")],
    {
      gap: 8,
    },
  ),
});

export const bindingsAndLanguagesEntry: CatalogueEntry = {
  slug: "bindings-and-languages",
  order: 7,
  title: "Bindings and languages",
  summary: "Placeholder.",
  concept: "Placeholder.",
  interaction: "Placeholder.",
  animation: "Placeholder.",
  source: "bindings-and-languages/binding-pipeline.svg",
  scene: bindingsAndLanguagesScene,
};
