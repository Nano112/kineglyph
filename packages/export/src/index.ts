export { KineglyphExportError, isKineglyphExportError } from "./errors.js";
export type { KineglyphExportErrorCode } from "./errors.js";
export { embedSvgFonts, svgTextCharacters } from "./fonts.js";
export type {
  EmbedSvgFontsOptions,
  SvgEmbeddedFont,
  SvgFontBytes,
  SvgFontFormat,
  SvgFontSubsetContext,
  SvgFontSubsetResult,
  SvgFontSubsetter,
} from "./fonts.js";
export {
  createEmbeddedFontMeasurer,
  type EmbeddedFontMeasurer,
  type EmbeddedFontSource,
} from "./font-shaping.js";
export { exportSvg } from "./svg.js";
export type { ExportBackground, SvgExportOptions } from "./svg.js";
export { exportPng } from "./png.js";
export type { PngExportOptions } from "./png.js";
export { exportGif, planGifFrames } from "./gif.js";
export type { GifExportOptions, GifFramePlan } from "./gif.js";
export type { FontOptions } from "./raster.js";
export { gifInfo, pngInfo } from "./formats.js";
export type { GifInfo, PngInfo } from "./formats.js";
export { exportFile } from "./file.js";
export { prerender, rewriteImports } from "./prerender.js";
export type { PrerenderOptions, PrerenderResult, PrerenderTheme } from "./prerender.js";
export { defineExportPreset } from "./preset.js";
export type { ExportPreset } from "./preset.js";
export {
  bytesToDataUri,
  exportImageSequence,
  exportSpriteSheet,
  planFrameSequence,
} from "./sequence.js";
export type {
  FrameSequenceOptions,
  ImageSequenceFrame,
  SpriteSheetOptions,
  SpriteSheetResult,
} from "./sequence.js";
export { exportApng } from "./apng.js";
export type { ApngExportOptions } from "./apng.js";
export { exportVideo } from "./video.js";
export type { VideoExportOptions } from "./video.js";
export {
  DEFAULT_REGRESSION_VIEWPORTS,
  assertRegressionMatch,
  captureRegressionSnapshots,
  compareRegressionManifests,
  createRegressionManifest,
  fingerprintRegressionContent,
  formatRegressionReport,
} from "./regression.js";
export type {
  RegressionCaptureOptions,
  RegressionChange,
  RegressionComparison,
  RegressionFormat,
  RegressionManifest,
  RegressionManifestEntry,
  RegressionMotion,
  RegressionSnapshot,
  RegressionSnapshotSet,
  RegressionViewport,
} from "./regression.js";
