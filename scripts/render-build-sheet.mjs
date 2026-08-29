#!/usr/bin/env node
// Native composite export of the beacon sheet: Nucleation renders the frames (Python), the
// Kineglyph export CLI composes the drafting sheet around them with the anchor leaders.
//
//   NUCLEATION_PACK=… NUCLEATION_PYTHON=… node scripts/render-build-sheet.mjs [--skip-frames]
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const example = resolve(root, "examples/nucleation-native");
const out = resolve(example, "out");
const python = process.env.NUCLEATION_PYTHON ?? "python3";
const FPS = "30";

const run = (file, args) => execFileSync(file, args, { cwd: example, stdio: "inherit" });

if (!process.argv.includes("--skip-frames")) {
  if (!process.env.NUCLEATION_PACK) throw new Error("set NUCLEATION_PACK to a resource pack zip");
  run(python, ["build.py", out, FPS]);
}
if (!existsSync(resolve(out, "beacon.glb"))) throw new Error(`no GLB at ${out}; run without --skip-frames`);

const cli = resolve(root, "packages/export/dist/cli.js");
const common = [
  "--scene", "sheet.mjs#default",
  "--theme", "sheet.mjs#theme",
  "--frame-signals", "sheet.mjs#frameSignals",
  "--surface", "build-view=out/frames/beacon-{frame}.png",
  "--fps", FPS,
];
run(process.execPath, [cli, "png", ...common, "--time", "1200", "--width", "1440", "--out", "out/beacon-sheet-1200.png"]);
run(process.execPath, [cli, "svg", ...common, "--time", "2400", "--out", "out/beacon-sheet.svg"]);
run(process.execPath, [cli, "gif", ...common, "--width", "1440", "--out", "out/beacon-sheet.gif"]);
console.log(`wrote ${out}/beacon-sheet-1200.png, beacon-sheet.svg, beacon-sheet.gif`);
