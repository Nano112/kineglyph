import { existsSync } from "node:fs";
import type { ResolvedScene } from "@kineglyph/core";
import type { RenderedImage, ResvgRenderOptions } from "@resvg/resvg-js";
import { renderAsync } from "@resvg/resvg-js";
import { KineglyphExportError } from "./errors.js";
import type { SvgDocument } from "./svg.js";

/** Font sources made available to the raster renderer. */
export interface FontOptions {
  /**
   * Font files (TTF, OTF, TTC, WOFF, WOFF2) loaded before rendering. Every path must exist,
   * otherwise `missing-font` is raised before any rendering happens.
   */
  readonly files?: readonly string[];
  /** Family used when a requested family is unavailable. */
  readonly defaultFamily?: string;
  /**
   * Whether fonts installed on this machine may be used. Defaults to `true`. Disable it and pass
   * `files` for output that is reproducible across machines.
   */
  readonly loadSystemFonts?: boolean;
}

/** Rasterizes an exported SVG document with resvg. */
export async function renderRaster(
  document: SvgDocument,
  fonts: FontOptions | undefined,
): Promise<RenderedImage> {
  const font = resolveFontOptions(fonts, document.hasText);
  const background = resvgBackground(document.background);
  const options: ResvgRenderOptions = {
    fitTo: { mode: "original" },
    font,
    logLevel: "off",
    ...(background === undefined ? {} : { background }),
  };
  try {
    return await renderAsync(document.svg, options);
  } catch (error) {
    throw new KineglyphExportError(
      "encoder",
      `resvg failed to rasterize the scene: ${errorMessage(error)}`,
      { cause: error },
    );
  }
}

type ResvgFontOptions = NonNullable<ResvgRenderOptions["font"]>;

/** Validates font inputs and maps them onto resvg's option shape. */
export function resolveFontOptions(
  fonts: FontOptions | undefined,
  hasText: boolean,
): ResvgFontOptions {
  const files = [...(fonts?.files ?? [])];
  const missing = files.filter((file) => !existsSync(file));
  if (missing.length > 0) {
    throw new KineglyphExportError(
      "missing-font",
      `font file${missing.length === 1 ? "" : "s"} not found: ${missing.join(", ")}`,
    );
  }
  const loadSystemFonts = fonts?.loadSystemFonts ?? true;
  if (!loadSystemFonts && files.length === 0 && hasText) {
    throw new KineglyphExportError(
      "missing-font",
      "the scene contains text but no fonts are available: pass fonts.files or enable fonts.loadSystemFonts",
    );
  }
  return {
    loadSystemFonts,
    fontFiles: files,
    ...(fonts?.defaultFamily === undefined ? {} : { defaultFontFamily: fonts.defaultFamily }),
  };
}

const RESVG_COLOR_PATTERN =
  /^(?:#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})|(?:rgba?|hsla?)\([^()]*\)|[a-z]+)$/i;

/** resvg only understands CSS Color Level 3 syntax; anything else relies on the background rect. */
function resvgBackground(color: string | undefined): string | undefined {
  return color !== undefined && RESVG_COLOR_PATTERN.test(color) ? color : undefined;
}

type UnknownRecord = Record<string, unknown>;

/** Rejects scenes containing media that has no deterministic static fallback. */
export function assertNoLiveMedia(scene: ResolvedScene): void {
  for (const node of walkNodes(scene.nodes)) {
    if (isLiveMedia(node)) {
      const id = typeof node.id === "string" ? node.id : "<anonymous>";
      throw new KineglyphExportError(
        "live-media",
        `node "${id}" is live-only media and cannot be exported statically`,
      );
    }
  }
}

function* walkNodes(nodes: readonly unknown[]): Generator<UnknownRecord> {
  for (const node of nodes) {
    if (!isRecord(node)) continue;
    yield node;
    if (Array.isArray(node.children)) yield* walkNodes(node.children as readonly unknown[]);
  }
}

function isLiveMedia(node: UnknownRecord): boolean {
  if (node.kind !== "image") return false;
  const image = isRecord(node.image) ? node.image : {};
  const metadata = isRecord(node.metadata) ? node.metadata : {};
  if (metadata.live === true || node.live === true) return true;
  if (image.live !== true) return false;
  const fallback = typeof image.href === "string" ? image.href : image.src;
  return typeof fallback !== "string" || fallback.length === 0;
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
