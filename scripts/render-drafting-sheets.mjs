#!/usr/bin/env node
/**
 * Renders every live sheet on docs/drafting-sheets.md and docs/drafting-styles.md as a 2880 × 1800 wallpaper PNG.
 *
 * The sheets are authored for a ~960px docs column, so they are laid out at that width and
 * rasterised at 3× — text keeps its designed proportion instead of shrinking to a 2880px layout.
 * Requires the workspace to be built (`npm run bootstrap`).
 *
 *   node scripts/render-drafting-sheets.mjs [--out docs/assets/drafting] [--only drafting-hohmann]
 */
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { resolveScene } from "@kineglyph/core";
import { exportFile, exportPng } from "@kineglyph/export";

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index === -1 ? fallback : args[index + 1];
};
const outDir = resolve(process.cwd(), option("out", "docs/assets/drafting"));
const only = option("only");
const width = Number(option("width", "960"));
const scale = Number(option("scale", "3"));

const pages = ["docs/drafting-sheets.md", "docs/drafting-styles.md"];
const blocks = pages
  .flatMap((page) => [
    ...readFileSync(resolve(process.cwd(), page), "utf8").matchAll(
      /```kineglyph live id=([^\s]+)[^\n]*\n([\s\S]*?)```/g,
    ),
  ])
  .map(([, id, body]) => ({ id, body }))
  .filter((block) => only === undefined || block.id === only);

const scratch = resolve(process.cwd(), "node_modules/.cache/kineglyph-drafting-sheets");
rmSync(scratch, { recursive: true, force: true });
mkdirSync(scratch, { recursive: true });
writeFileSync(
  resolve(scratch, "kineglyph.mjs"),
  'export * from "@kineglyph/core";\nexport { loadMath, mathMark } from "@kineglyph/web";\n',
);
mkdirSync(outDir, { recursive: true });

const font = resolve(process.cwd(), "docs/assets/fonts/GeistMono[wght].ttf");
// Geist Mono carries the Latin text; Greek and math symbols fall through to the system fonts.
const fonts = { files: [font], defaultFamily: "Geist Mono", loadSystemFonts: true };

for (const block of blocks) {
  const file = resolve(scratch, `${block.id}.mjs`);
  writeFileSync(file, block.body.replace(/from "kineglyph"/g, 'from "./kineglyph.mjs"'));
  const module = await import(pathToFileURL(file).href);
  const scene = resolveScene(module.default, {
    width,
    theme: module.theme,
    ...(module.deriveSignals === undefined ? {} : { deriveSignals: module.deriveSignals }),
  });
  const problems = (scene.diagnostics ?? []).filter((entry) => entry.severity === "error");
  if (problems.length > 0)
    throw new Error(
      `${block.id}: ${problems.map((entry) => `${entry.code}: ${entry.message}`).join("\n")}`,
    );
  const png = await exportPng(scene, { scale, fonts });
  const target = resolve(outDir, `${block.id}.png`);
  await exportFile(target, png);
  process.stdout.write(
    `wrote ${target} (${Math.round(width * scale)}×${Math.round(width * scale * 0.625)})\n`,
  );
}
rmSync(scratch, { recursive: true, force: true });
