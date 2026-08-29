#!/usr/bin/env node
import { dirname, isAbsolute, resolve as resolvePath } from "node:path";
import { pathToFileURL } from "node:url";
import type {
  LayoutName,
  PipelineDefinition,
  ResolvedScene,
  ResolvedSceneCrop,
  SceneDefinition,
  ResolveSceneOptions,
  TextMeasurer,
  ThemeTokens,
} from "@kineglyph/core";
import {
  createMachineState,
  resolvedSceneBounds,
  resolveMachineState,
  resolvePipeline,
  resolveScene,
} from "@kineglyph/core";
import { KineglyphExportError } from "./errors.js";
import { createEmbeddedFontMeasurer, type EmbeddedFontSource } from "./font-shaping.js";
import { exportFile } from "./file.js";
import { gifInfo, pngInfo } from "./formats.js";
import type { GifExportOptions } from "./gif.js";
import { exportGif } from "./gif.js";
import type { PngExportOptions } from "./png.js";
import { exportPng } from "./png.js";
import type { FontOptions } from "./raster.js";
import type { ExportPreset } from "./preset.js";
import type { SvgExportOptions } from "./svg.js";
import { exportSvg, resolveOutputSize, sceneDimensions } from "./svg.js";

const USAGE = `Usage: kineglyph-export [svg|png|gif] [--preset <module>#<export>] --out <file> [options]

Options:
  --preset <module>#<export> Reusable export defaults; explicit CLI flags override them
  --scene <module>#<export>  Scene export (required unless supplied by --preset)
  --theme <module>#<export>   Theme tokens module (object, factory, or dotted path like #themes.paper)
  --width <px>                Output width (height follows the scene aspect ratio)
  --height <px>               Output height (width follows the scene aspect ratio)
  --scale <factor>            Uniform scale (cannot be combined with --width/--height)
  --time <ms>                 Timeline time for svg/png (default: final frame)
  --fps <n>                   GIF sampling rate, 1-60 (default: 12)
  --hold-last <ms>            Extra hold on the final GIF frame (default: 800)
  --loop / --no-loop          Override GIF looping (default: loop)
  --background <mode>         transparent | theme | <css color> (default: theme)
  --crop <mode>               scene | surface | content (default: scene)
  --crop-padding <units>      Padding around surface/content crop
  --layout <mode>             auto | wide | compact | narrow (stacked for pipelines)
  --state <id>                Machine state to resolve (scene definitions with a machine)
  --var <key=value>           Override a machine variable before resolving (repeatable)
  --derive <module>#<export>  deriveSignals(variables, signals) hook, as a live host would run
  --width-container <px>      Container width used to resolve pipeline definitions (default: 960)
  --font <path>               Font file for png/gif (repeatable)
  --shape-font <family=path>  HarfBuzz font for layout and png/gif (repeatable)
  --system-fonts / --no-system-fonts  Override loading fonts installed on this machine
  --default-font <family>     Fallback font family for png/gif
  -h, --help                  Show this help
`;

interface CliArgs {
  readonly format?: "svg" | "png" | "gif";
  readonly preset?: string;
  readonly scene?: string;
  readonly out?: string;
  readonly theme?: string;
  readonly width?: number;
  readonly height?: number;
  readonly scale?: number;
  readonly time?: number;
  readonly fps?: number;
  readonly holdLast?: number;
  readonly loop?: boolean;
  readonly background?: string;
  readonly crop?: ResolvedSceneCrop;
  readonly cropPadding?: number;
  readonly layout?: LayoutName | "auto" | "stacked";
  readonly state?: string;
  readonly variables?: Readonly<Record<string, number | string | boolean>>;
  readonly derive?: string;
  readonly containerWidth?: number;
  readonly fonts: readonly string[];
  readonly shapeFonts: readonly string[];
  readonly loadSystemFonts?: boolean;
  readonly defaultFamily?: string;
}

class UsageError extends Error {}

function parseArgs(argv: readonly string[]): CliArgs | "help" {
  const positional: string[] = [];
  const values = new Map<string, string>();
  const fonts: string[] = [];
  const variableFlags: string[] = [];
  const shapeFonts: string[] = [];
  let loop: boolean | undefined;
  let loadSystemFonts: boolean | undefined;
  const valueFlags = new Set([
    "scene",
    "preset",
    "out",
    "theme",
    "width",
    "height",
    "scale",
    "time",
    "fps",
    "hold-last",
    "background",
    "crop",
    "crop-padding",
    "layout",
    "state",
    "var",
    "derive",
    "width-container",
    "font",
    "shape-font",
    "default-font",
  ]);
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index] ?? "";
    if (arg === "-h" || arg === "--help") return "help";
    if (arg === "--no-loop") {
      loop = false;
      continue;
    }
    if (arg === "--loop") {
      loop = true;
      continue;
    }
    if (arg === "--no-system-fonts") {
      loadSystemFonts = false;
      continue;
    }
    if (arg === "--system-fonts") {
      loadSystemFonts = true;
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
      else if (name === "shape-font") shapeFonts.push(value);
      else if (name === "var") variableFlags.push(value);
      else values.set(name, value);
      continue;
    }
    positional.push(arg);
  }
  const rawFormat = positional[0];
  const format: CliArgs["format"] =
    rawFormat === "svg" || rawFormat === "png" || rawFormat === "gif" ? rawFormat : undefined;
  if (rawFormat !== undefined && format === undefined)
    throw new UsageError("first argument must be one of: svg, png, gif");
  if (positional.length > 1) throw new UsageError(`unexpected argument ${positional[1] ?? ""}`);
  const scene = values.get("scene");
  const out = values.get("out");
  const preset = values.get("preset");
  if (preset === undefined && format === undefined)
    throw new UsageError("choose a format or supply --preset");
  if (preset === undefined && scene === undefined) throw new UsageError("--scene is required");
  if (preset === undefined && out === undefined) throw new UsageError("--out is required");
  const layout = parseLayout(values.get("layout"));
  const state = values.get("state");
  return {
    ...optional("format", format),
    ...optional("preset", preset),
    ...optional("scene", scene),
    ...optional("out", out),
    ...optional("theme", values.get("theme")),
    ...optional("width", numeric("width", values.get("width"))),
    ...optional("height", numeric("height", values.get("height"))),
    ...optional("scale", numeric("scale", values.get("scale"))),
    ...optional("time", numeric("time", values.get("time"))),
    ...optional("fps", numeric("fps", values.get("fps"))),
    ...optional("holdLast", numeric("hold-last", values.get("hold-last"))),
    ...optional("loop", loop),
    ...optional("background", values.get("background")),
    ...optional("crop", parseCrop(values.get("crop"))),
    ...optional("cropPadding", numeric("crop-padding", values.get("crop-padding"))),
    ...optional("layout", layout),
    ...optional("state", state),
    ...(variableFlags.length === 0 ? {} : { variables: parseVariables(variableFlags) }),
    ...optional("derive", values.get("derive")),
    ...optional("containerWidth", numeric("width-container", values.get("width-container"))),
    fonts,
    shapeFonts,
    ...optional("loadSystemFonts", loadSystemFonts),
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

function parseCrop(value: string | undefined): ResolvedSceneCrop | undefined {
  if (value === undefined || value === "scene" || value === "surface" || value === "content")
    return value;
  throw new UsageError("--crop must be scene, surface, or content");
}

function parseShapeFont(value: string): { family: string; file: string } {
  const equals = value.indexOf("=");
  const family = equals < 0 ? "" : value.slice(0, equals).trim();
  const file = equals < 0 ? "" : value.slice(equals + 1).trim();
  if (family.length === 0 || file.length === 0)
    throw new UsageError(`--shape-font expects <family=path> (received "${value}")`);
  return { family, file };
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

function presetRelative(spec: string, base: string): string {
  const hash = spec.lastIndexOf("#");
  const modulePath = hash === -1 ? spec : spec.slice(0, hash);
  const suffix = hash === -1 ? "" : spec.slice(hash);
  return `${isAbsolute(modulePath) ? modulePath : resolvePath(base, modulePath)}${suffix}`;
}

async function loadPreset(spec: string | undefined): Promise<ExportPreset> {
  if (spec === undefined) return {};
  let value = await loadExport(spec);
  if (typeof value === "function") value = await (value as () => unknown)();
  if (!isRecord(value)) throw new UsageError(`${spec} does not export an export preset object`);
  if (
    value.format !== undefined &&
    value.format !== "svg" &&
    value.format !== "png" &&
    value.format !== "gif"
  )
    throw new UsageError(`${spec}: preset format must be svg, png, or gif`);
  for (const key of ["scene", "out", "theme"] as const)
    if (value[key] !== undefined && typeof value[key] !== "string")
      throw new UsageError(`${spec}: preset ${key} must be a string`);
  if (value.fonts !== undefined && !Array.isArray(value.fonts))
    throw new UsageError(`${spec}: preset fonts must be an array of paths`);
  if (Array.isArray(value.fonts) && value.fonts.some((file) => typeof file !== "string"))
    throw new UsageError(`${spec}: every preset font must be a path string`);
  if (value.shapeFonts !== undefined && !Array.isArray(value.shapeFonts))
    throw new UsageError(`${spec}: preset shapeFonts must be an array of font sources`);
  if (
    Array.isArray(value.shapeFonts) &&
    value.shapeFonts.some((source) => !isRecord(source) || typeof source.file !== "string")
  )
    throw new UsageError(`${spec}: every preset shape font needs a file path`);
  const preset = value as unknown as ExportPreset;
  const hash = spec.lastIndexOf("#");
  const modulePath = hash === -1 ? spec : spec.slice(0, hash);
  const base = dirname(resolvePath(process.cwd(), modulePath));
  return {
    ...preset,
    ...(preset.scene === undefined ? {} : { scene: presetRelative(preset.scene, base) }),
    ...(preset.theme === undefined ? {} : { theme: presetRelative(preset.theme, base) }),
    ...(preset.fonts === undefined
      ? {}
      : { fonts: preset.fonts.map((file) => (isAbsolute(file) ? file : resolvePath(base, file))) }),
    ...(preset.shapeFonts === undefined
      ? {}
      : {
          shapeFonts: preset.shapeFonts.map((source) => ({
            ...source,
            file: isAbsolute(source.file) ? source.file : resolvePath(base, source.file),
          })),
        }),
  };
}

interface ResolveContext {
  readonly width: number;
  readonly layout: LayoutName | "auto" | "stacked" | undefined;
  readonly theme: ThemeTokens | undefined;
  readonly state: string | undefined;
  readonly variables: Readonly<Record<string, number | string | boolean>> | undefined;
  readonly deriveSignals: ResolveSceneOptions["deriveSignals"] | undefined;
  readonly textMeasurer: TextMeasurer | undefined;
}

/** `key=value` pairs; numbers and booleans are parsed, everything else stays a string. */
function parseVariables(flags: readonly string[]): Record<string, number | string | boolean> {
  const out: Record<string, number | string | boolean> = {};
  for (const flag of flags) {
    const equals = flag.indexOf("=");
    if (equals <= 0) throw new UsageError(`--var expects key=value, got "${flag}"`);
    const key = flag.slice(0, equals).trim();
    const raw = flag.slice(equals + 1).trim();
    out[key] =
      raw === "true"
        ? true
        : raw === "false"
          ? false
          : raw !== "" && Number.isFinite(Number(raw))
            ? Number(raw)
            : raw;
  }
  return out;
}

async function loadDerive(spec: string | undefined): Promise<ResolveSceneOptions["deriveSignals"]> {
  if (spec === undefined) return undefined;
  const value = await loadExport(spec);
  if (typeof value !== "function") throw new UsageError(`--derive ${spec} is not a function`);
  return value as NonNullable<ResolveSceneOptions["deriveSignals"]>;
}

async function loadScene(spec: string, context: ResolveContext): Promise<ResolvedScene> {
  let value = await loadExport(spec);
  if (typeof value === "function") {
    value = await (value as (input: ResolveContext) => unknown)(context);
  }
  if (isResolvedScene(value)) return value;
  if (isSceneDefinition(value)) {
    const base =
      context.state === undefined || value.machine === undefined
        ? value.machine === undefined || context.variables === undefined
          ? undefined
          : createMachineState(value.machine)
        : resolveMachineState(value.machine, context.state);
    const machineState =
      base === undefined || context.variables === undefined
        ? base
        : { ...base, variables: { ...base.variables, ...context.variables } };
    return resolveScene(value, {
      width: context.width,
      ...(context.layout === undefined
        ? {}
        : { layout: context.layout === "stacked" ? "compact" : context.layout }),
      ...(context.theme === undefined ? {} : { theme: context.theme }),
      ...(machineState === undefined ? {} : { machineState }),
      ...(context.deriveSignals === undefined ? {} : { deriveSignals: context.deriveSignals }),
      ...(context.textMeasurer === undefined ? {} : { textMeasurer: context.textMeasurer }),
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

export async function runExport(argv: readonly string[]): Promise<number> {
  const parsed = parseArgs(argv);
  if (parsed === "help") {
    process.stdout.write(USAGE);
    return 0;
  }
  const preset = await loadPreset(parsed.preset);
  const format = parsed.format ?? preset.format;
  if (format !== "svg" && format !== "png" && format !== "gif")
    throw new UsageError("format is required (svg, png, or gif)");
  const sceneSpec = parsed.scene ?? preset.scene;
  if (sceneSpec === undefined) throw new UsageError("--scene is required (directly or in preset)");
  const out = parsed.out ?? preset.out;
  if (out === undefined) throw new UsageError("--out is required (directly or in preset)");
  const themeSpec = parsed.theme ?? preset.theme;
  const theme = await loadTheme(themeSpec);
  const shapeSources: EmbeddedFontSource[] = [
    ...(preset.shapeFonts ?? []),
    ...parsed.shapeFonts.map(parseShapeFont),
  ];
  const shapedFonts =
    shapeSources.length === 0 ? undefined : await createEmbeddedFontMeasurer(shapeSources);
  const containerWidth = parsed.containerWidth ?? preset.containerWidth ?? 960;
  const layout = parsed.layout ?? preset.layout;
  const state = parsed.state ?? preset.state;
  const variables = parsed.variables ?? preset.variables;
  const deriveSignals = await loadDerive(parsed.derive ?? preset.derive);
  const scene = await loadScene(sceneSpec, {
    width: containerWidth,
    layout,
    state,
    variables,
    deriveSignals,
    theme,
    textMeasurer: shapedFonts,
  });
  const width = parsed.width ?? preset.width;
  const height = parsed.height ?? preset.height;
  const scale = parsed.scale ?? preset.scale;
  const background = parsed.background ?? preset.background;
  const crop = parsed.crop ?? preset.crop;
  const cropPadding = parsed.cropPadding ?? preset.cropPadding;
  const time = parsed.time ?? preset.time;
  const frameOptions: Omit<SvgExportOptions, "time"> = {
    ...(width === undefined ? {} : { width }),
    ...(height === undefined ? {} : { height }),
    ...(scale === undefined ? {} : { scale }),
    ...(background === undefined ? {} : { background }),
    ...(crop === undefined ? {} : { crop }),
    ...(cropPadding === undefined ? {} : { cropPadding }),
  };
  const timeOptions: SvgExportOptions = {
    ...frameOptions,
    ...(time === undefined ? {} : { time }),
  };
  const loadSystemFonts = parsed.loadSystemFonts ?? preset.loadSystemFonts ?? true;
  const defaultFamily = parsed.defaultFamily ?? preset.defaultFamily;
  const fonts: FontOptions = {
    files: [...new Set([...(preset.fonts ?? []), ...parsed.fonts, ...(shapedFonts?.files ?? [])])],
    loadSystemFonts,
    ...(defaultFamily === undefined ? {} : { defaultFamily }),
  };

  let summary: string;
  if (format === "svg") {
    const svg = exportSvg(scene, timeOptions);
    await exportFile(out, svg);
    sceneDimensions(scene);
    const size = resolveOutputSize(
      resolvedSceneBounds(scene, crop ?? "scene", cropPadding ?? 0),
      timeOptions,
      false,
    );
    summary = `${size.width}x${size.height}, ${svg.length} chars`;
  } else if (format === "png") {
    const pngOptions: PngExportOptions = { ...timeOptions, fonts };
    const png = await exportPng(scene, pngOptions);
    await exportFile(out, png);
    const info = pngInfo(png);
    summary = `${info.width}x${info.height}, ${png.length} bytes`;
  } else {
    const gifOptions: GifExportOptions = {
      ...frameOptions,
      fonts,
      loop: parsed.loop ?? preset.loop ?? true,
      ...((parsed.fps ?? preset.fps) === undefined ? {} : { fps: parsed.fps ?? preset.fps }),
      ...((parsed.holdLast ?? preset.holdLast) === undefined
        ? {}
        : { holdLast: parsed.holdLast ?? preset.holdLast }),
    };
    const gif = await exportGif(scene, gifOptions);
    await exportFile(out, gif);
    const info = gifInfo(gif);
    summary = `${info.width}x${info.height}, ${info.frameCount} frame${info.frameCount === 1 ? "" : "s"}, ${gif.length} bytes`;
  }
  process.stdout.write(`wrote ${out} (${format}, ${summary})\n`);
  return 0;
}

const invokedPath = process.argv[1];
if (invokedPath !== undefined && import.meta.url === pathToFileURL(invokedPath).href)
  runExport(process.argv.slice(2)).then(
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
