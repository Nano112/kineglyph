/**
 * Self-contained browser bundle: runtime, authoring primitives, plots, and SVG rendering.
 * Consumers provide their own scenes and themes through `autoMount`, `registerScene`,
 * and `registerTheme`.
 */
export * from "./index.js";
export * from "@kineglyph/core";
export * from "@kineglyph/plot";
export { renderSvg } from "@kineglyph/svg";
