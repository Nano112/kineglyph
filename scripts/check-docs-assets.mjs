#!/usr/bin/env node
// Check the deployed output, not just successful figure prerendering. These assets are
// loaded dynamically by the Nucleation figures, so Pagina needs explicit article links.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const out = process.argv[2];
assert.ok(out, "Usage: node scripts/check-docs-assets.mjs <built-site-directory>");
const assets = [
  "field-observatory.png",
  "gyroid-bloom.gif",
  "gyroid-bloom.schem",
  "solar-system-pack.zip",
  "build-pack.zip",
  "nucleation-build.glb",
  "setup.mjs",
];
for (const name of assets) {
  const relative = `assets/nucleation/${name}`;
  const source = await readFile(new URL(`../docs/${relative}`, import.meta.url));
  assert.ok(source.length > 0, `Source asset is empty: ${relative}`);
  const shipped = await readFile(resolve(out, relative));
  assert.deepEqual(shipped, source, `Built asset differs from source: ${relative}`);
}
console.log(
  `Documentation asset check passed: ${assets.length} runtime assets match their sources.`,
);
