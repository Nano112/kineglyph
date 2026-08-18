import type { SceneDefinition } from "@kineglyph/core";
import { benchmarkBreakdownEntry } from "./scenes/benchmark-breakdown.js";
import { bottleneckLensEntry } from "./scenes/bottleneck-lens.js";
import { diplomatSurfacesEntry } from "./scenes/diplomat-surfaces.js";
import { materialDirectionsScene } from "./scenes/material-directions.js";
import { operationHeatmapEntry } from "./scenes/operation-heatmap.js";
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

const materialDirectionsEntry: CatalogueEntry = {
  slug: "material-directions",
  order: 1,
  title: "Material directions",
  summary: "One responsive composition rendered through several semantic material systems.",
  concept: "Theme tokens change surface physics without changing scene structure.",
  interaction: "Switch themes in the playground to compare the same resolved nodes.",
  animation: "The chart and material surfaces enter on one seekable timeline.",
  source: "material-directions.svg",
  scene: materialDirectionsScene,
};

/** Generic examples shipped with Kineglyph. Product scenes belong to their consumers. */
export const catalogue: readonly CatalogueEntry[] = [
  materialDirectionsEntry,
  diplomatSurfacesEntry,
  benchmarkBreakdownEntry,
  throughputOverTimeEntry,
  operationHeatmapEntry,
  bottleneckLensEntry,
].sort((a, b) => a.order - b.order);

export function findCatalogueEntry(slug: string): CatalogueEntry | undefined {
  return catalogue.find((entry) => entry.slug === slug || entry.scene.id === slug);
}
