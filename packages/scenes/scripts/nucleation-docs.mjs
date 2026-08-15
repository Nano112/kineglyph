#!/usr/bin/env node
import { resolve } from "node:path";
import { resolveScene } from "@kineglyph/core";
import { exportFile, exportSvg } from "@kineglyph/export";
import { catalogue, themes } from "@kineglyph/scenes";

const slugs = [
  "fast-generation",
  "shapes-and-brushes",
  "sdf-and-fields",
  "palettes-and-color",
  "smart-simulation",
  "formats-and-io",
  "bindings-and-languages",
  "meshing-and-rendering",
];

const output = resolve(process.argv[2] ?? "dist/nucleation-docs");
const width = Number(process.argv[3] ?? 960);
if (!Number.isFinite(width) || width < 280) {
  throw new Error(
    `width must be a finite number of at least 280px (received ${String(process.argv[3])})`,
  );
}
const entries = slugs.map((slug) => {
  const entry = catalogue.find((candidate) => candidate.slug === slug);
  if (entry === undefined) throw new Error(`missing catalogue scene: ${slug}`);
  return entry;
});

for (const entry of entries) {
  const scene = resolveScene(entry.scene, { width, theme: themes.nucleation });
  const problems = (scene.diagnostics ?? []).filter((diagnostic) =>
    ["error", "overflow", "overlap", "text-truncated", "label-collision"].includes(
      diagnostic.severity === "error" ? "error" : diagnostic.code,
    ),
  );
  if (problems.length > 0) {
    throw new Error(
      `${entry.slug}:\n${problems.map((diagnostic) => `${diagnostic.code}: ${diagnostic.message}`).join("\n")}`,
    );
  }
  await exportFile(
    resolve(output, `${entry.slug}.svg`),
    exportSvg(scene, {
      idPrefix: `nucleation-${entry.slug}`,
      title: entry.title,
      description: entry.summary,
    }),
  );
}

await exportFile(
  resolve(output, "manifest.json"),
  `${JSON.stringify(
    {
      schemaVersion: 1,
      theme: "nucleation",
      width,
      scenes: entries.map(({ slug, title, summary }) => ({ slug, title, summary })),
    },
    null,
    2,
  )}\n`,
);

process.stdout.write(`wrote ${entries.length} Nucleation docs illustrations to ${output}\n`);
