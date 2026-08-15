import type { ResolvedScene } from "@kineglyph/core";
import { seekTimeline } from "@kineglyph/core";
import type { SvgRenderOptions } from "@kineglyph/svg";
import { renderSvg } from "@kineglyph/svg";
import { KineglyphExportError } from "./errors.js";
import { toRasterCompatibleSvg } from "./raster-compat.js";

/**
 * Background treatment for exported artwork.
 *
 * - `"theme"` (default) paints `scene.theme.background` behind the scene.
 * - `"transparent"` paints nothing.
 * - Any other string is used verbatim as a CSS colour.
 */
export type ExportBackground = "transparent" | "theme" | (string & NonNullable<unknown>);

export interface SvgExportOptions {
  /** Output width. Height follows the scene aspect ratio unless `height` is also given. */
  readonly width?: number;
  /** Output height. Width follows the scene aspect ratio unless `width` is also given. */
  readonly height?: number;
  /** Uniform multiplier of the scene size. Cannot be combined with `width`/`height`. */
  readonly scale?: number;
  /** Background treatment. Defaults to `"theme"`. */
  readonly background?: ExportBackground;
  /**
   * Timeline time in milliseconds. Defaults to the final frame (`timeline.duration`, or 0 when
   * the scene has no timeline). Values above the duration are clamped; negative or non-finite
   * values are rejected with `invalid-time`.
   */
  readonly time?: number;
  /** Overrides the accessible name emitted by the SVG renderer. */
  readonly title?: string;
  /** Overrides the accessible description emitted by the SVG renderer. */
  readonly description?: string;
  /** Stable prefix for generated DOM ids. */
  readonly idPrefix?: string;
}

export const XML_DECLARATION = '<?xml version="1.0" encoding="UTF-8"?>';

/** Renders a standalone SVG document for a scene at a single point in time. */
export function exportSvg(scene: ResolvedScene, options: SvgExportOptions = {}): string {
  return buildSvgDocument(scene, options, { raster: false }).svg;
}

// ---------------------------------------------------------------------------------------------
// Internal document builder shared by the SVG, PNG, and GIF exporters.
// ---------------------------------------------------------------------------------------------

export interface OutputSize {
  readonly width: number;
  readonly height: number;
}

export interface SvgDocument {
  /** Standalone SVG source (including the XML declaration). */
  readonly svg: string;
  /** Root viewport size (device pixels for raster output). */
  readonly size: OutputSize;
  /** Resolved background colour, or `undefined` for transparent output. */
  readonly background: string | undefined;
  /** Timeline time that was rendered. */
  readonly time: number;
  /** Whether the document contains `<text>` content (drives font requirements). */
  readonly hasText: boolean;
}

export interface BuildOptions {
  /** Produce integer pixel dimensions and apply raster renderer compatibility rewrites. */
  readonly raster: boolean;
  /** Overrides `options.time` (used by the GIF sampler). */
  readonly time?: number;
}

export function buildSvgDocument(
  scene: ResolvedScene,
  options: SvgExportOptions,
  build: BuildOptions,
): SvgDocument {
  const sceneSize = sceneDimensions(scene);
  const size = resolveOutputSize(sceneSize, options, build.raster);
  const time = build.time ?? resolveTime(scene, options.time);
  const frame = seekTimeline(scene, time);
  const renderOptions: SvgRenderOptions = {
    ...(options.idPrefix === undefined ? {} : { idPrefix: options.idPrefix }),
    ...(options.title === undefined ? {} : { title: options.title }),
    ...(options.description === undefined ? {} : { description: options.description }),
  };
  const rendered = renderSvg(frame, renderOptions);
  const root = parseRootTag(rendered);
  if (root === undefined) {
    throw new KineglyphExportError("encoder", "the SVG renderer did not produce an <svg> root");
  }

  const viewBox = parseViewBox(root.attributes.get("viewBox")) ?? {
    x: 0,
    y: 0,
    width: sceneSize.width,
    height: sceneSize.height,
  };
  const attributes = new Map(root.attributes);
  attributes.set(
    "viewBox",
    `${format(viewBox.x)} ${format(viewBox.y)} ${format(viewBox.width)} ${format(viewBox.height)}`,
  );
  attributes.set("width", format(size.width));
  attributes.set("height", format(size.height));
  const bothRequested = options.width !== undefined && options.height !== undefined;
  if (bothRequested || !attributes.has("preserveAspectRatio")) {
    attributes.set("preserveAspectRatio", "xMidYMid meet");
  }

  const background = resolveBackground(scene, options.background);
  const backgroundRect =
    background === undefined
      ? ""
      : `<rect class="kg-export-background" x="${format(viewBox.x)}" y="${format(viewBox.y)}" width="${format(viewBox.width)}" height="${format(viewBox.height)}" fill="${escapeAttribute(background)}"/>`;

  const openTag = `<svg${[...attributes].map(([name, value]) => ` ${name}="${value}"`).join("")}>`;
  const body = root.selfClosing
    ? `${openTag}${backgroundRect}</svg>`
    : `${openTag}${backgroundRect}${rendered.slice(root.end)}`;
  let svg = `${XML_DECLARATION}\n${rendered.slice(0, root.start)}${body}`;
  if (build.raster) svg = toRasterCompatibleSvg(svg);
  return { svg, size, background, time, hasText: /<text[\s/>]/.test(svg) };
}

/** Resolves the requested output size; integer pixel sizes are used for raster output. */
export function resolveOutputSize(
  scene: OutputSize,
  options: Pick<SvgExportOptions, "width" | "height" | "scale">,
  integer: boolean,
): OutputSize {
  const { width, height, scale } = options;
  if (scale !== undefined && (width !== undefined || height !== undefined)) {
    throw new KineglyphExportError(
      "invalid-output",
      "scale cannot be combined with width or height; pick one sizing mode",
    );
  }
  for (const [name, value] of [
    ["width", width],
    ["height", height],
    ["scale", scale],
  ] as const) {
    if (
      value !== undefined &&
      (typeof value !== "number" || !Number.isFinite(value) || value <= 0)
    ) {
      throw new KineglyphExportError(
        "invalid-output",
        `${name} must be a finite number greater than 0 (received ${String(value)})`,
      );
    }
  }
  const round = (value: number): number => (integer ? Math.max(1, Math.round(value)) : value);
  if (width !== undefined && height !== undefined) {
    return { width: round(width), height: round(height) };
  }
  if (width !== undefined) {
    return { width: round(width), height: round((width * scene.height) / scene.width) };
  }
  if (height !== undefined) {
    return { width: round((height * scene.width) / scene.height), height: round(height) };
  }
  const factor = scale ?? 1;
  return { width: round(scene.width * factor), height: round(scene.height * factor) };
}

/** Validates and clamps the requested timeline time. */
export function resolveTime(scene: ResolvedScene, time: number | undefined): number {
  const duration = sceneDuration(scene);
  if (time === undefined) return duration;
  if (typeof time !== "number" || !Number.isFinite(time) || time < 0) {
    throw new KineglyphExportError(
      "invalid-time",
      `time must be a finite number of milliseconds >= 0 (received ${String(time)})`,
    );
  }
  return Math.min(time, duration);
}

/** Timeline duration in milliseconds (0 for static scenes). */
export function sceneDuration(scene: ResolvedScene): number {
  const duration = scene.timeline?.duration ?? 0;
  if (typeof duration !== "number" || !Number.isFinite(duration) || duration < 0) {
    throw new KineglyphExportError(
      "invalid-time",
      `scene timeline duration must be a finite number >= 0 (received ${String(duration)})`,
    );
  }
  return duration;
}

export function sceneDimensions(scene: ResolvedScene): OutputSize {
  const { width, height } = scene;
  if (!isPositiveFinite(width) || !isPositiveFinite(height)) {
    throw new KineglyphExportError(
      "invalid-output",
      `scene width and height must be finite numbers greater than 0 (received ${String(width)}x${String(height)})`,
    );
  }
  return { width, height };
}

function resolveBackground(
  scene: ResolvedScene,
  background: ExportBackground | undefined,
): string | undefined {
  const mode = background ?? "theme";
  if (mode === "transparent") return undefined;
  if (mode === "theme") {
    const themed: unknown = (scene as { theme?: { background?: unknown } }).theme?.background;
    return typeof themed === "string" && themed.trim().length > 0 ? themed.trim() : undefined;
  }
  const custom = mode.trim();
  return custom.length > 0 ? custom : undefined;
}

// ---------------------------------------------------------------------------------------------
// Root tag parsing helpers (tolerant, quote-aware, no DOM required)
// ---------------------------------------------------------------------------------------------

interface RootTag {
  readonly start: number;
  readonly end: number;
  readonly selfClosing: boolean;
  readonly attributes: ReadonlyMap<string, string>;
}

const ATTRIBUTE_PATTERN = /\s+([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/y;

function parseRootTag(svg: string): RootTag | undefined {
  const match = /<svg(?=[\s/>])/.exec(svg);
  if (match === null) return undefined;
  const start = match.index;
  let cursor = start + 4;
  const attributes = new Map<string, string>();
  for (;;) {
    ATTRIBUTE_PATTERN.lastIndex = cursor;
    const attribute = ATTRIBUTE_PATTERN.exec(svg);
    if (attribute === null) break;
    const name = attribute[1];
    if (name === undefined) break;
    attributes.set(name, attribute[2] ?? attribute[3] ?? attribute[4] ?? "");
    cursor = ATTRIBUTE_PATTERN.lastIndex;
  }
  const rest = /^\s*(\/?)>/.exec(svg.slice(cursor));
  if (rest === null) return undefined;
  const end = cursor + rest[0].length;
  return { start, end, selfClosing: rest[1] === "/", attributes };
}

interface ViewBox {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

function parseViewBox(value: string | undefined): ViewBox | undefined {
  if (value === undefined) return undefined;
  const parts = value
    .trim()
    .split(/[\s,]+/)
    .map(Number);
  const [x, y, width, height] = parts;
  if (
    parts.length !== 4 ||
    x === undefined ||
    y === undefined ||
    width === undefined ||
    height === undefined ||
    !parts.every(Number.isFinite) ||
    width <= 0 ||
    height <= 0
  ) {
    return undefined;
  }
  return { x, y, width, height };
}

function isPositiveFinite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

/** Formats lengths compactly with at most three decimals. */
export function format(value: number): string {
  const rounded = Number(value.toFixed(3));
  return Object.is(rounded, -0) ? "0" : String(rounded);
}

function escapeAttribute(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
