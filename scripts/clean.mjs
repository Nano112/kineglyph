#!/usr/bin/env node
/** Removes every build output so `npm run check:clean` simulates a fresh clone. */
import { rmSync } from "node:fs";

const targets = [
  "packages/core",
  "packages/svg",
  "packages/anime",
  "packages/plot",
  "packages/scenes",
  "packages/web",
  "packages/react",
  "packages/export",
  "apps/playground",
];

for (const dir of targets) {
  rmSync(`${dir}/dist`, { recursive: true, force: true });
  rmSync(`${dir}/node_modules/.tmp`, { recursive: true, force: true });
}
console.log(`cleaned ${targets.length} build outputs`);
