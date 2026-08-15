// Marks the CLI entry executable so the `kineglyph-export` bin works when linked by npm.
import { chmodSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const cli = fileURLToPath(new URL("../dist/cli.js", import.meta.url));
if (existsSync(cli)) chmodSync(cli, 0o755);
