/**
 * Self-contained browser bundle: runtime, authoring primitives, plots, and SVG rendering.
 * Consumers provide their own scenes and themes through `autoMount`, `registerScene`,
 * and `registerTheme`.
 */
export * from "./index.js";
export * from "@kineglyph/core";
export * from "@kineglyph/plot";
export { renderSvg } from "@kineglyph/svg";
// `./index.js` and `@kineglyph/core` both export `formatNumber` and `rule`; re-declare them
// explicitly (last export wins) so the ambiguous re-export doesn't fail typecheck (TS2308).
export { formatNumber, rule } from "@kineglyph/core";
