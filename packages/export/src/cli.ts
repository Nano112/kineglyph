#!/usr/bin/env node
import { resolve as resolvePath } from "node:path";
import { pathToFileURL } from "node:url";
import type {
  LayoutName,
  PipelineDefinition,
  ResolvedScene,
  SceneDefinition,
  ThemeTokens,
} from "@kineglyph/core";
import { resolveMachineState, resolvePipeline, resolveScene } from "@kineglyph/core";
import { KineglyphExportError } from "./errors.js";
import { exportFile } from "./file.js";
import { gifInfo, pngInfo } from "./formats.js";
import type { GifExportOptions } from "./gif.js";
import { exportGif } from "./gif.js";
import type { PngExportOptions } from "./png.js";
import { exportPng } from "./png.js";
import type { FontOptions } from "./raster.js";
import type { SvgExportOptions } from "./svg.js";
import { exportSvg, resolveOutputSize, sceneDimensions } from "./svg.js";

const USAGE = `Usage: kineglyph-export <svg|png|gif> --scene <module>[#export] --out <file> [options]

Options:
  --theme <module>#<export>   Theme tokens module (object, factory, or dotted path like #themes.paper)
  --width <px>                Output width (height follows the scene aspect ratio)
  --height <px>               Output height (width follows the scene aspect ratio)
  --scale <factor>            Uniform scale (cannot be combined with --width/--height)
  --time <ms>                 Timeline time for svg/png (default: final frame)
  --fps <n>                   GIF sampling rate, 1-60 (default: 12)
  --hold-last <ms>            Extra hold on the final GIF frame (default: 800)
  --no-loop                   Play the GIF once instead of looping
  --background <mode>         transparent | theme | <css color> (default: theme)
  --layout <mode>             auto | wide | compact | narrow (stacked for pipelines)
  --state <id>                Machine state to resolve (scene definitions with a machine)
  --width-container <px>      Container width used to resolve pipeline definitions (default: 960)
  --font <path>               Font file for png/gif (repeatable)
  --no-system-fonts           Do not load fonts installed on this machine
  --default-font <family>     Fallback font family for png/gif
  -h, --help                  Show this help
`;

interface CliArgs {
  readonly format: "svg" | "png" | "gif";
  readonly scene: string;
  readonly out: string;
  readonly theme?: string;
  readonly width?: number;
  readonly height?: number;
  readonly scale?: number;
  readonly time?: number;
  readonly fps?: number;
  readonly holdLast?: number;
  readonly loop: boolean;
  readonly background?: string;
  readonly layout?: LayoutName | "auto" | "stacked";
  readonly state?: string;
  readonly containerWidth?: number;
  readonly fonts: readonly string[];
  readonly loadSystemFonts: boolean;
  readonly defaultFamily?: string;
}

class UsageError extends Error {}

function parseArgs(argv: readonly string[]): CliArgs | "help" {
  const positional: string[] = [];
  const values = new Map<string, string>();
  const fonts: string[] = [];
  let loop = true;
  let loadSystemFonts = true;
  const valueFlags = new Set([
    "scene",
    "out",
    "theme",
    "width",
    "height",
    "scale",
    "time",
    "fps",
    "hold-last",
    "background",
    "layout",
    "state",
    "width-container",
    "font",
    "default-font",
  ]);
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index] ?? "";
    if (arg === "-h" || arg === "--help") return "help";
    if (arg === "--no-loop") {
      loop = false;
      continue;
    }
    if (arg === "--no-system-fonts") {
      loadSystemFonts = false;
      continue;
    }
    if (arg.startsWith("--")) {
      const equals = arg.indexOf("=");
      const name = equals === -1 ? arg.slice(2) : arg.slice(2, equals);
      if (!valueFlags.has(name)) throw new UsageError(`unknown option --${name}`);
      let value: string | undefined;
      if (equals !== -1) value = arg.slice(equals + 1);
      else {
        value = argv[index + 1];
        index += 1;
      }
      if (value === undefined) throw new UsageError(`--${name} requires a value`);
      if (name === "font") fonts.push(value);
      else values.set(name, value);
      continue;
    }
    positional.push(arg);
  }
  const format = positional[0];
  if (format !== "svg" && format !== "png" && format !== "gif") {
    throw new UsageError("first argument must be one of: svg, png, gif");
  }
  if (positional.length > 1) throw new UsageError(`unexpected argument ${positional[1] ?? ""}`);
  const scene = values.get("scene");
  const out = values.get("out");
  if (scene === undefined) throw new UsageError("--scene is required");
  if (out === undefined) throw new UsageError("--out is required");
  const layout = parseLayout(values.get("layout"));
  const state = values.get("state");
  return {
    format,
    scene,
    out,
    ...optional("theme", values.get("theme")),
    ...optional("width", numeric("width", values.get("width"))),
    ...optional("height", numeric("height", values.get("height"))),
    ...optional("scale", numeric("scale", values.get("scale"))),
    ...optional("time", numeric("time", values.get("time"))),
    ...optional("fps", numeric("fps", values.get("fps"))),
    ...optional("holdLast", numeric("hold-last", values.get("hold-last"))),
    loop,
    ...optional("background", values.get("background")),
    ...optional("layout", layout),
    ...optional("state", state),
    ...optional("containerWidth", numeric("width-container", values.get("width-container"))),
    fonts,
    loadSystemFonts,
    ...optional("defaultFamily", values.get("default-font")),
  };
}

function optional<K extends string, V>(key: K, value: V | undefined): Partial<Record<K, V>> {
  return value === undefined ? {} : ({ [key]: value } as Record<K, V>);
}

function parseLayout(value: string | undefined): LayoutName | "auto" | "stacked" | undefined {
  if (
    value === undefined ||
    value === "auto" ||
    value === "wide" ||
    value === "compact" ||
    value === "narrow" ||
    value === "stacked"
  )
    return value;
  throw new UsageError("--layout must be auto, wide, compact, narrow, or stacked");
}

function numeric(flag: string, value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (value.trim() === "" || !Number.isFinite(parsed)) {
    throw new UsageError(`--${flag} expects a number (received "${value}")`);
  }
  return parsed;
}

async function loadExport(spec: string): Promise<unknown> {
  const hash = spec.lastIndexOf("#");
  const modulePath = hash === -1 ? spec : spec.slice(0, hash);
  const exportName = hash === -1 ? undefined : spec.slice(hash + 1);
  const url = pathToFileURL(resolvePath(process.cwd(), modulePath)).href;
  const module = (await import(url)) as Record<string, unknown>;
  if (exportName !== undefined && exportName !== "") {
    // Dotted paths (e.g. "themes.paper") walk into exported records.
    const [head = "", ...rest] = exportName.split(".");
    if (!(head in module)) {
      throw new UsageError(
        `${modulePath} has no export named "${head}" (available: ${Object.keys(module).join(", ")})`,
      );
    }
    let value: unknown = module[head];
    for (const key of rest) {
      if (!isRecord(value) || !(key in value))
        throw new UsageError(`${modulePath}#${exportName}: "${key}" not found`);
      value = value[key];
    }
    return value;
  }
  for (const candidate of ["default", "scene", "pipeline"]) {
    if (module[candidate] !== undefined) return module[candidate];
  }
  const names = Object.keys(module);
  if (names.length === 1) return module[names[0] ?? ""];
  throw new UsageError(
    `${modulePath} has no default export; choose one with #name (available: ${names.join(", ")})`,
  );
}

async function loadTheme(spec: string | undefined): Promise<ThemeTokens | undefined> {
  if (spec === undefined) return undefined;
  let value = await loadExport(spec);
  if (typeof value === "function") value = await (value as () => unknown)();
  if (!isRecord(value) || !isRecord(value.colors)) {
    throw new UsageError(`${spec} does not export theme tokens (expected an object with colors)`);
  }
  return value as unknown as ThemeTokens;
}

interface ResolveContext {
  readonly width: number;
  readonly layout: LayoutName | "auto" | "stacked" | undefined;
  readonly theme: ThemeTokens | undefined;
  readonly state: string | undefined;
}

async function loadScene(spec: string, context: ResolveContext): Promise<ResolvedScene> {
  let value = await loadExport(spec);
  if (typeof value === "function") {
    value = await (value as (input: ResolveContext) => unknown)(context);
  }
  if (isResolvedScene(value)) return value;
  if (isSceneDefinition(value)) {
    const machineState =
      context.state === undefined || value.machine === undefined
        ? undefined
        : resolveMachineState(value.machine, context.state);
    return resolveScene(value, {
      width: context.width,
      ...(context.layout === undefined
        ? {}
        : { layout: context.layout === "stacked" ? "compact" : context.layout }),
      ...(context.theme === undefined ? {} : { theme: context.theme }),
      ...(machineState === undefined ? {} : { machineState }),
    });
  }
  if (isPipelineDefinition(value)) {
    return resolvePipeline(value, {
      width: context.width,
      ...(context.layout === undefined ? {} : { layout: pipelineLayout(context.layout) }),
      ...(context.theme === undefined ? {} : { theme: context.theme }),
    });
  }
  throw new UsageError(
    `${spec} must export a ResolvedScene, a SceneDefinition, a PipelineDefinition, or a resolve({ width, theme, layout }) function`,
  );
}

function isSceneDefinition(value: unknown): value is SceneDefinition {
  return isRecord(value) && value.schemaVersion === 2 && isRecord(value.root);
}

function pipelineLayout(layout: string): "auto" | "wide" | "stacked" {
  return layout === "wide" ? "wide" : layout === "auto" ? "auto" : "stacked";
}

function isResolvedScene(value: unknown): value is ResolvedScene {
  return (
    isRecord(value) &&
    Array.isArray(value.nodes) &&
    typeof value.width === "number" &&
    typeof value.height === "number"
  );
}

function isPipelineDefinition(value: unknown): value is PipelineDefinition {
  return (
    isRecord(value) &&
    Array.isArray(value.nodes) &&
    Array.isArray(value.edges) &&
    typeof value.title === "string"
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function run(argv: readonly string[]): Promise<number> {
  const args = parseArgs(argv);
  if (args === "help") {
    process.stdout.write(USAGE);
    return 0;
  }
  const theme = await loadTheme(args.theme);
  const scene = await loadScene(args.scene, {
    width: args.containerWidth ?? 960,
    layout: args.layout,
    state: args.state,
    theme,
  });
  const frameOptions: Omit<SvgExportOptions, "time"> = {
    ...(args.width === undefined ? {} : { width: args.width }),
    ...(args.height === undefined ? {} : { height: args.height }),
    ...(args.scale === undefined ? {} : { scale: args.scale }),
    ...(args.background === undefined ? {} : { background: args.background }),
  };
  const timeOptions: SvgExportOptions = {
    ...frameOptions,
    ...(args.time === undefined ? {} : { time: args.time }),
  };
  const fonts: FontOptions = {
    files: args.fonts,
    loadSystemFonts: args.loadSystemFonts,
    ...(args.defaultFamily === undefined ? {} : { defaultFamily: args.defaultFamily }),
  };

  let summary: string;
  if (args.format === "svg") {
    const svg = exportSvg(scene, timeOptions);
    await exportFile(args.out, svg);
    const size = resolveOutputSize(sceneDimensions(scene), timeOptions, false);
    summary = `${size.width}x${size.height}, ${svg.length} chars`;
  } else if (args.format === "png") {
    const pngOptions: PngExportOptions = { ...timeOptions, fonts };
    const png = await exportPng(scene, pngOptions);
    await exportFile(args.out, png);
    const info = pngInfo(png);
    summary = `${info.width}x${info.height}, ${png.length} bytes`;
  } else {
    const gifOptions: GifExportOptions = {
      ...frameOptions,
      fonts,
      loop: args.loop,
      ...(args.fps === undefined ? {} : { fps: args.fps }),
      ...(args.holdLast === undefined ? {} : { holdLast: args.holdLast }),
    };
    const gif = await exportGif(scene, gifOptions);
    await exportFile(args.out, gif);
    const info = gifInfo(gif);
    summary = `${info.width}x${info.height}, ${info.frameCount} frame${info.frameCount === 1 ? "" : "s"}, ${gif.length} bytes`;
  }
  process.stdout.write(`wrote ${args.out} (${args.format}, ${summary})\n`);
  return 0;
}

run(process.argv.slice(2)).then(
  (code) => {
    process.exitCode = code;
  },
  (error: unknown) => {
    if (error instanceof KineglyphExportError) {
      process.stderr.write(`error: ${error.message}\n`);
    } else if (error instanceof UsageError) {
      process.stderr.write(`error: ${error.message}\n${USAGE}`);
    } else {
      const message = error instanceof Error ? error.message : String(error);
      process.stderr.write(`error: ${message}\n`);
    }
    process.exitCode = 1;
  },
);
