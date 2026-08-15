import type { SceneDefinition } from "@kineglyph/core";
import { bindingsAndLanguagesEntry } from "./scenes/bindings-and-languages.js";
import { fastGenerationEntry } from "./scenes/fast-generation.js";
import { formatsAndIoEntry } from "./scenes/formats-and-io.js";
import { meshingAndRenderingEntry } from "./scenes/meshing-and-rendering.js";
import { palettesAndColorEntry } from "./scenes/palettes-and-color.js";
import { sdfAndFieldsEntry } from "./scenes/sdf-and-fields.js";
import { shapesAndBrushesEntry } from "./scenes/shapes-and-brushes.js";
import { smartSimulationEntry } from "./scenes/smart-simulation.js";

export interface CatalogueEntry {
  /** Stable slug used in routes and file names. */
  readonly slug: string;
  readonly order: number;
  readonly title: string;
  /** One-sentence summary shown on gallery cards. */
  readonly summary: string;
  /** The conceptual direction from the phase brief. */
  readonly concept: string;
  /** What the reader can do with the figure. */
  readonly interaction: string;
  /** What the animation explains. */
  readonly animation: string;
  /** Reference asset this rebuilds (read-only input, never copied). */
  readonly source: string;
  readonly scene: SceneDefinition;
}

/** All eight Nucleation illustrations, in reading order. */
export const catalogue: readonly CatalogueEntry[] = [
  fastGenerationEntry,
  shapesAndBrushesEntry,
  sdfAndFieldsEntry,
  palettesAndColorEntry,
  smartSimulationEntry,
  formatsAndIoEntry,
  bindingsAndLanguagesEntry,
  meshingAndRenderingEntry,
].sort((a, b) => a.order - b.order);

export function findCatalogueEntry(slug: string): CatalogueEntry | undefined {
  return catalogue.find((entry) => entry.slug === slug || entry.scene.id === slug);
}
