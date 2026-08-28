#!/usr/bin/env node
import { extname, basename } from "node:path";
import { pathToFileURL } from "node:url";
import { runExport } from "./cli.js";
import { runDoctor } from "./doctor-cli.js";
import { startDevServer } from "./dev-server.js";
import { scaffoldFigure } from "./scaffold.js";

const USAGE = `Usage: kineglyph <command> [options]

Commands:
  create [directory]        Scaffold a small TypeScript figure
  dev <scene.ts>            Live-reloading local preview
  render <scene>            Export svg, png, or gif
  doctor --scene <scene>    Audit wide, compact, and narrow layouts

Run kineglyph <command> --help for command options.
`;

function value(args: readonly string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index < 0 ? undefined : args[index + 1];
}

export async function runKineglyph(argv: readonly string[]): Promise<number> {
  const [command, ...args] = argv;
  if (command === undefined || command === "help" || command === "--help" || command === "-h") {
    process.stdout.write(USAGE);
    return 0;
  }
  if (command === "doctor") return runDoctor(args);
  if (command === "create") {
    if (args.includes("--help")) {
      process.stdout.write("Usage: kineglyph create [directory]\n");
      return 0;
    }
    const result = await scaffoldFigure(args[0]);
    process.stdout.write(
      `created ${result.directory}\n${result.files.map((file) => `  ${file}`).join("\n")}\n`,
    );
    return 0;
  }
  if (command === "dev") {
    if (args.includes("--help") || args[0] === undefined) {
      process.stdout.write("Usage: kineglyph dev <scene.ts> [--host 127.0.0.1] [--port 4178]\n");
      return args[0] === undefined && !args.includes("--help") ? 1 : 0;
    }
    const scene = args[0];
    const rawPort = value(args, "--port");
    const port = rawPort === undefined ? 4178 : Number(rawPort);
    if (!Number.isInteger(port) || port <= 0) throw new Error("--port must be a positive integer");
    const host = value(args, "--host");
    const handle = await startDevServer({ scene, ...(host === undefined ? {} : { host }), port });
    process.stdout.write(`${handle.url}\n`);
    const stop = async () => {
      await handle.close();
      process.exitCode = 0;
    };
    process.once("SIGINT", () => void stop());
    process.once("SIGTERM", () => void stop());
    return 0;
  }
  if (command === "render") {
    if (args.includes("--help") || args[0] === undefined) {
      process.stdout.write(
        "Usage: kineglyph render <scene> [--format svg|png|gif] [--out file] [export options]\n",
      );
      return args[0] === undefined && !args.includes("--help") ? 1 : 0;
    }
    const scene = args[0];
    const format = value(args, "--format") ?? "svg";
    if (format !== "svg" && format !== "png" && format !== "gif")
      throw new Error("--format must be svg, png, or gif");
    const out = value(args, "--out") ?? `${basename(scene, extname(scene))}.${format}`;
    const forwarded: string[] = [];
    for (let index = 1; index < args.length; index += 1) {
      const arg = args[index];
      if (arg === "--format" || arg === "--out") {
        index += 1;
        continue;
      }
      if (arg !== undefined) forwarded.push(arg);
    }
    return runExport([format, "--scene", scene, "--out", out, ...forwarded]);
  }
  throw new Error(`unknown command ${command}\n${USAGE}`);
}

const invokedPath = process.argv[1];
if (invokedPath !== undefined && import.meta.url === pathToFileURL(invokedPath).href)
  runKineglyph(process.argv.slice(2)).then(
    (code) => {
      process.exitCode = code;
    },
    (error: unknown) => {
      process.stderr.write(`error: ${error instanceof Error ? error.message : String(error)}\n`);
      process.exitCode = 1;
    },
  );
