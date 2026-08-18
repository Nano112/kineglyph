import type { LayoutName } from "@kineglyph/core";
import type { EmbeddedFontSource } from "./font-shaping.js";

/** Reusable CLI defaults. Relative module/font paths resolve from the preset module. */
export interface ExportPreset {
  readonly format?: "svg" | "png" | "gif";
  readonly scene?: string;
  readonly out?: string;
  readonly theme?: string;
  readonly width?: number;
  readonly height?: number;
  readonly scale?: number;
  readonly time?: number;
  readonly fps?: number;
  readonly holdLast?: number;
  readonly loop?: boolean;
  readonly background?: string;
  readonly layout?: LayoutName | "auto" | "stacked";
  readonly state?: string;
  readonly containerWidth?: number;
  readonly fonts?: readonly string[];
  readonly shapeFonts?: readonly EmbeddedFontSource[];
  readonly loadSystemFonts?: boolean;
  readonly defaultFamily?: string;
}

/** Identity helper that checks preset keys and preserves literal values. */
export function defineExportPreset<const Preset extends ExportPreset>(preset: Preset): Preset {
  return preset;
}
