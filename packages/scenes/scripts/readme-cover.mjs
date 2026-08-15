#!/usr/bin/env node
import { resolve } from "node:path";
import { resolveScene } from "@kineglyph/core";
import { exportFile, exportGif, exportPng } from "@kineglyph/export";
import { readmeCoverScene, readmeCoverTheme } from "@kineglyph/scenes";

const font = resolve(process.cwd(), "docs/assets/fonts/GeistMono[wght].ttf");
const output = resolve(process.cwd(), "docs/assets/readme");
const scene = resolveScene(readmeCoverScene, { width: 1400, theme: readmeCoverTheme });
const problems = (scene.diagnostics ?? []).filter((entry) => entry.severity === "error");
if (problems.length > 0) {
  throw new Error(problems.map((entry) => `${entry.code}: ${entry.message}`).join("\n"));
}

const fonts = { files: [font], defaultFamily: "Geist Mono", loadSystemFonts: false };
const png = await exportPng(scene, { scale: 2, time: 3000, fonts });
const gif = await exportGif(scene, { scale: 2, fps: 12, holdLast: 0, fonts });

await Promise.all([
  exportFile(resolve(output, "cover@2x.png"), png),
  exportFile(resolve(output, "cover@2x.gif"), gif),
]);

process.stdout.write(
  `wrote docs/assets/readme/cover@2x.png and cover@2x.gif from ${readmeCoverScene.id}\n`,
);
