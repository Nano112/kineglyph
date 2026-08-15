import type { SceneDefinition } from "@kineglyph/core";
import { benchmarkBreakdownEntry } from "./scenes/benchmark-breakdown.js";
import { bindingsAndLanguagesEntry } from "./scenes/bindings-and-languages.js";
import { bottleneckLensEntry } from "./scenes/bottleneck-lens.js";
import { operationHeatmapEntry } from "./scenes/operation-heatmap.js";
import {
  fastGenerationEntry,
  formatsAndIoEntry,
  meshingAndRenderingEntry,
  palettesAndColorEntry,
  sdfAndFieldsEntry,
  shapesAndBrushesEntry,
  smartSimulationEntry,
} from "./scenes/nucleation-system.js";
import { throughputOverTimeEntry } from "./scenes/throughput-over-time.js";

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

/** Nucleation illustrations and quantitative examples, in reading order. */
export const catalogue: readonly CatalogueEntry[] = [
  fastGenerationEntry,
  shapesAndBrushesEntry,
  sdfAndFieldsEntry,
  palettesAndColorEntry,
  smartSimulationEntry,
  formatsAndIoEntry,
  bindingsAndLanguagesEntry,
  meshingAndRenderingEntry,
  benchmarkBreakdownEntry,
  throughputOverTimeEntry,
  operationHeatmapEntry,
  bottleneckLensEntry,
].sort((a, b) => a.order - b.order);

export function findCatalogueEntry(slug: string): CatalogueEntry | undefined {
  return catalogue.find((entry) => entry.slug === slug || entry.scene.id === slug);
}
