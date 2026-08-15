import { existsSync } from "node:fs";
import type { ResolvedScene } from "@kineglyph/core";
import { createTheme, resolvePipeline } from "@kineglyph/core";
import type { FontOptions } from "../src/index.js";
import { pipeline } from "./fixtures/pipeline.mjs";

const theme = createTheme();

const FONT_CANDIDATES = [
  "/System/Library/Fonts/Helvetica.ttc",
  "/System/Library/Fonts/Supplemental/Arial.ttf",
  "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
  "/usr/share/fonts/dejavu/DejaVuSans.ttf",
  "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
  "C:\\Windows\\Fonts\\arial.ttf",
];

/** A single local font file when one is available (system font loading costs ~100 ms/render). */
export const fontFile = FONT_CANDIDATES.find((candidate) => existsSync(candidate));

/** Fast, deterministic font options for tests; falls back to system fonts. */
export const testFonts: FontOptions =
  fontFile === undefined
    ? { loadSystemFonts: true }
    : { loadSystemFonts: false, files: [fontFile] };

/** Small animated fixture (three nodes, 400 ms timeline). */
export function animatedScene(width = 640): ResolvedScene {
  return resolvePipeline(pipeline, { width, theme });
}

/** Same fixture without a timeline. */
export function staticScene(width = 640): ResolvedScene {
  const { timeline, ...definition } = pipeline;
  void timeline;
  return resolvePipeline(definition, { width, theme });
}

/** Reads an attribute from the first tag matching `tag`. */
export function attribute(svg: string, tag: string, name: string): string | undefined {
  const match = new RegExp(`<${tag}(?=[\\s/>])[^>]*?\\s${name}="([^"]*)"`).exec(svg);
  return match?.[1];
}

/** All values of `attribute` for elements carrying `data-edge-id`/`data-node-id`. */
export function progressValues(svg: string): string[] {
  return [...svg.matchAll(/data-progress="([^"]*)"/g)].map((match) => match[1] ?? "");
}
