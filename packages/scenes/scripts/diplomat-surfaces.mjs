#!/usr/bin/env node
import { resolve } from "node:path";
import { resolveScene } from "@kineglyph/core";
import { exportFile, exportGif, exportPng, exportSvg } from "@kineglyph/export";
import { diplomatSurfacesScene, diplomatSurfacesTheme } from "@kineglyph/scenes";

const font = resolve(process.cwd(), "docs/assets/fonts/GeistMono[wght].ttf");
const output = resolve(process.cwd(), "docs/assets/examples");
const fonts = { files: [font], defaultFamily: "Geist Mono", loadSystemFonts: false };

function checked(width) {
  const scene = resolveScene(diplomatSurfacesScene, { width, theme: diplomatSurfacesTheme });
  const problems = (scene.diagnostics ?? []).filter((entry) => entry.severity === "error");
  if (problems.length > 0) {
    throw new Error(problems.map((entry) => `${entry.code}: ${entry.message}`).join("\n"));
  }
  return scene;
}

const wide = checked(1600);
const compact = checked(820);
const png = await exportPng(wide, { scale: 1.5, fonts });
const compactPng = await exportPng(compact, { scale: 1.5, fonts });
const gif = await exportGif(wide, { scale: 0.75, fps: 8, holdLast: 900, fonts });

await Promise.all([
  exportFile(
    resolve(output, "diplomat-surfaces.svg"),
    exportSvg(wide, { idPrefix: "diplomat-surfaces" }),
  ),
  exportFile(resolve(output, "diplomat-surfaces@2x.png"), png),
  exportFile(resolve(output, "diplomat-surfaces-compact@2x.png"), compactPng),
  exportFile(resolve(output, "diplomat-surfaces.gif"), gif),
]);

process.stdout.write(
  `wrote Diplomat SVG, wide PNG, compact PNG, and GIF (${wide.width}x${wide.height}; ${compact.width}x${compact.height})\n`,
);
