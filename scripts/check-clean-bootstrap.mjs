#!/usr/bin/env node
/** Regression probe: no pre-existing workspace declarations may rescue the build. */
import assert from "node:assert/strict";
import { existsSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";

const root = fileURLToPath(new URL("../", import.meta.url));
const { workspaces } = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
);
// Enumerate workspaces independently of clean.mjs: forgotten packages must not mask cycles.
for (const workspace of workspaces) {
  rmSync(`${root}/${workspace}/dist`, { recursive: true, force: true });
  assert.equal(existsSync(`${root}/${workspace}/dist`), false);
}
const result = spawnSync("npm", ["run", "bootstrap"], { cwd: root, stdio: "inherit" });
assert.equal(result.status, 0, "bootstrap must succeed without existing workspace outputs");
// Exercise the published export paths, not source aliases or development conditions.
const core = await import("@kineglyph/core/surfaces");
const web = await import("@kineglyph/web");
const surfaces = await import("@kineglyph/web/surfaces");
const nucleation = await import("@kineglyph/nucleation");
assert.equal(web.bindLiveSurface, core.bindLiveSurface);
assert.equal(surfaces.adaptLiveSurface, core.adaptLiveSurface);
assert.equal(typeof nucleation.buildSurface, "function");
console.log("Clean bootstrap and published surface exports passed.");
