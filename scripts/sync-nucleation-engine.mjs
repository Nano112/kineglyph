#!/usr/bin/env node
/**
 * Copies a built Nucleation npm package (its `dist/npm`) into docs/assets/nucleation/engine so the
 * docs can load the WASM engine locally while the matching version is unpublished. The folder is
 * gitignored; the docs fall back to the published package on jsDelivr when it is absent.
 *
 *   node scripts/sync-nucleation-engine.mjs [--from ~/RustroverProjects/Nucleation/dist/npm]
 */
import { copyFileSync, mkdirSync, readdirSync, rmSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index === -1 ? fallback : args[index + 1];
};
const from = resolve(
  option(
    "from",
    process.env.NUCLEATION_DIST ?? resolve(homedir(), "RustroverProjects/Nucleation/dist/npm"),
  ),
);
const to = resolve(process.cwd(), "docs/assets/nucleation/engine");

statSync(resolve(from, "nucleation.wasm"));
rmSync(to, { recursive: true, force: true });
mkdirSync(to, { recursive: true });
let bytes = 0;
const copy = (dir, rel = "") => {
  for (const entry of readdirSync(resolve(dir, rel), { withFileTypes: true })) {
    const path = rel === "" ? entry.name : `${rel}/${entry.name}`;
    if (entry.isDirectory()) {
      mkdirSync(resolve(to, path), { recursive: true });
      copy(dir, path);
      continue;
    }
    if (!/\.(mjs|wasm|json|d\.ts|d\.mts)$/.test(entry.name)) continue;
    copyFileSync(resolve(dir, path), resolve(to, path));
    bytes += statSync(resolve(to, path)).size;
  }
};
copy(from);
process.stdout.write(`synced ${from} → ${to} (${(bytes / 1024 / 1024).toFixed(1)} MB)\n`);
