import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { render } from "../../packages/server/dist/render.js";
import { anatomyChart, anatomyInstrument } from "./fixtures.mjs";
const destination = resolve(process.argv[2] ?? "docs/assets/anatomy");
await mkdir(destination, { recursive: true });
for (const theme of ["anatomy", "anatomy-dark"]) {
  for (const [kind, request] of [
    ["chart", anatomyChart],
    ["instrument", { scene: anatomyInstrument, width: 960 }],
  ]) {
    for (const format of ["svg", "png"]) {
      const path = resolve(destination, `${theme}-${kind}.${format}`);
      await writeFile(path, await render({ ...request, theme }, format));
      console.log(path);
    }
  }
}
