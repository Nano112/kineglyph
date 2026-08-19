// Marks the CLI entry executable so the `kineglyph-export` bin works when linked by npm.
import { chmodSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

for (const file of ["cli.js", "doctor-cli.js"]) {
  const cli = fileURLToPath(new URL(`../dist/${file}`, import.meta.url));
  if (existsSync(cli)) chmodSync(cli, 0o755);
}
