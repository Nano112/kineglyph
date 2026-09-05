import type { ResolvedScene } from "@kineglyph/core";
import { KineglyphExportError } from "./errors.js";
import { planFrameSequence } from "./sequence.js";
import { exportSvg, sceneDuration, type SvgExportOptions } from "./svg.js";

export interface AnimatedSvgExportOptions extends Omit<SvgExportOptions, "time" | "destination"> {
  /** Vector snapshots per second. Identical consecutive snapshots are coalesced. */
  readonly fps?: number;
  readonly maxFrames?: number;
  /** Plays once by default, then holds the final frame. */
  readonly repeat?: number | "indefinite";
}

/**
 * A self-contained animated SVG, including when displayed by an <img>. Uses CSS discrete
 * keyframes, never script or raster frames. Reduced motion shows the completed scene.
 * Sampling supports every timeline mark; a live surface still needs supplied frame images.
 */
export function exportAnimatedSvg(scene: ResolvedScene, options: AnimatedSvgExportOptions = {}): string {
  const duration = sceneDuration(scene);
  const repeat = options.repeat ?? 1;
  if (repeat !== "indefinite" && (!Number.isSafeInteger(repeat) || repeat < 1)) {
    throw new KineglyphExportError("invalid-output", "SVG repeat must be a positive integer or indefinite.");
  }
  if (duration === 0) return exportSvg(scene, options);
  const plan = planFrameSequence(scene, options);
  const prefix = `${options.idPrefix ?? "kg"}-animated`;
  // The renderer validates/escapes IDs and descriptions in the document. A CSS identifier
  // needs a stricter alphabet; do not interpolate an arbitrary author string into <style>.
  const cssId = prefix.replace(/[^a-zA-Z0-9_-]/g, "_");
  const samples: { time: number; source: string }[] = [];
  for (const time of [...plan.times, duration]) {
    const source = exportSvg(scene, { ...options, time, destination: "inline", idPrefix: prefix });
    if (source !== samples.at(-1)?.source) samples.push({ time, source });
  }
  if (samples.length === 1) return exportSvg(scene, { ...options, time: duration });
  const final = exportSvg(scene, { ...options, time: duration, idPrefix: `${prefix}-still` });
  const openEnd = final.indexOf(">", final.indexOf("<svg")) + 1;
  const root = final.slice(0, openEnd);
  // Outer accessible title/description and defs belong to the still. Animated copies are
  // hidden from assistive technology and get distinct IDs, including clip paths and masks.
  const inner = final.slice(openEnd, final.lastIndexOf("</svg>"));
  const pct = (time: number) => (100 * time / duration).toFixed(6).replace(/\.?0+$/, "");
  const rules: string[] = [];
  const frames = samples.map((sample, index) => {
    const start = pct(sample.time);
    const end = pct(samples[index + 1]?.time ?? duration);
    const last = index === samples.length - 1;
    const name = `${cssId}-${index}`;
    const keys = `${sample.time > 0 ? "0%{visibility:hidden}" : ""}${start}%{visibility:visible}${last ? "100%{visibility:visible}" : `${end}%,100%{visibility:hidden}`}`;
    rules.push(`@keyframes ${name}{${keys}}.${name}{visibility:hidden;animation:${name} ${duration}ms steps(1,end) ${repeat === "indefinite" ? "infinite" : repeat} both}`);
    const source = exportSvg(scene, { ...options, time: sample.time, destination: "inline", idPrefix: `${prefix}-${index}` });
    return `<g class="${cssId}-motion ${name}" aria-hidden="true">${source}</g>`;
  }).join("");
  const style = `<style>.${cssId}-still{visibility:hidden}${rules.join("")}@media(prefers-reduced-motion:reduce){.${cssId}-motion{display:none}.${cssId}-still{visibility:visible}}</style>`;
  return `${root}${style}<g class="${cssId}-still">${inner}</g>${frames}</svg>`;
}
