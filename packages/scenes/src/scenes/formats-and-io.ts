// PLACEHOLDER — replaced by the authored scene. Not presented as a finished illustration.
import { defineScene, type SceneDefinition } from "@kineglyph/core";
import type { CatalogueEntry } from "../catalogue.js";
import { caption, heading, stack } from "../recipes.js";

export const formatsAndIoScene: SceneDefinition = defineScene({
  schemaVersion: 2,
  id: "formats-and-io",
  title: "Formats and I/O (placeholder)",
  description: "Placeholder awaiting the authored Formats and I/O illustration.",
  root: stack(
    "root",
    [heading("title", "Formats and I/O"), caption("body", "Scene not authored yet.")],
    {
      gap: 8,
    },
  ),
});

export const formatsAndIoEntry: CatalogueEntry = {
  slug: "formats-and-io",
  order: 6,
  title: "Formats and I/O",
  summary: "Placeholder.",
  concept: "Placeholder.",
  interaction: "Placeholder.",
  animation: "Placeholder.",
  source: "formats-and-io/format-pipeline.svg",
  scene: formatsAndIoScene,
};
