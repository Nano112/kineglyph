#!/usr/bin/env node
import { resolve } from "node:path";
import { resolveScene } from "@kineglyph/core";
import { exportFile, exportSvg } from "@kineglyph/export";
import { materialDirectionThemes, materialDirectionsScene } from "@kineglyph/scenes";

const output = resolve(process.cwd(), "docs/assets/readme");

for (const [name, theme] of Object.entries(materialDirectionThemes)) {
  const scene = resolveScene(materialDirectionsScene, { width: 760, theme });
  const problems = (scene.diagnostics ?? []).filter((entry) => entry.severity === "error");
  if (problems.length > 0) {
    throw new Error(problems.map((entry) => `${entry.code}: ${entry.message}`).join("\n"));
  }
  await exportFile(
    resolve(output, `material-${name}.svg`),
    exportSvg(scene, { idPrefix: `readme-material-${name}` }),
  );
}

process.stdout.write(
  `wrote ${Object.keys(materialDirectionThemes).length} material-direction SVGs from ${materialDirectionsScene.id}\n`,
);
