import type { ResolvedScene } from "@kineglyph/core";
import type { FontOptions } from "./raster.js";
import { assertNoLiveMedia, renderRaster } from "./raster.js";
import type { SvgExportOptions } from "./svg.js";
import { buildSvgDocument } from "./svg.js";

export interface PngExportOptions extends SvgExportOptions {
  /** Font sources for the raster renderer. Defaults to the fonts installed on this machine. */
  readonly fonts?: FontOptions;
}

/**
 * Renders a scene to PNG bytes with resvg. Output is deterministic for a given scene, option
 * set, and font set; pixel dimensions are `round(scene size × scale)` or the requested size.
 */
export async function exportPng(
  scene: ResolvedScene,
  options: PngExportOptions = {},
): Promise<Uint8Array> {
  assertNoLiveMedia(scene);
  const document = buildSvgDocument(scene, options, { raster: true });
  const image = await renderRaster(document, options.fonts);
  return new Uint8Array(image.asPng());
}
