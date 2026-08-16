/**
 * Self-contained browser bundle: runtime, authoring primitives, plots, and SVG rendering.
 * Consumers provide their own scenes and themes through `autoMount`, `registerScene`,
 * and `registerTheme`.
 */
export * from "./index.js";
export * from "@kineglyph/core";
export * from "@kineglyph/plot";
export { renderSvg } from "@kineglyph/svg";
// `@kineglyph/core` and `@kineglyph/plot` both export `formatNumber` and `rule`, so the two
// star re-exports above leave both names ambiguous (TS2308). Disambiguate without losing either:
// the bare names are core's (`rule(id, tone)`, `formatNumber(value, precision)`), and plot's
// (`rule(options)` annotation, `formatNumber(value, spec)`) keep aliases.
export { formatNumber, rule } from "@kineglyph/core";
export { rule as plotRule, formatNumber as formatPlotNumber } from "@kineglyph/plot";
