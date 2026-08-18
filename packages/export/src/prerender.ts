import { readFileSync } from "node:fs";
import {
  resolveFigure,
  sceneNeedsRuntime,
  seekTimeline,
  type FigureSource,
  type TextMeasurer,
  type ThemeTokens,
} from "@kineglyph/core";
import { exportSvg } from "./svg.js";
import { KineglyphExportError } from "./errors.js";

export interface PrerenderTheme {
  readonly name: string;
  readonly tokens: ThemeTokens;
}

export interface PrerenderOptions {
  readonly themes: readonly PrerenderTheme[];
  /** Layout width used to resolve the figure. Defaults to 960. Ignored when `widths` is given. */
  readonly width?: number;
  /**
   * Container widths to draw the figure at, one variant each — the responsive answer to a figure
   * whose geometry is measured once and then cannot reflow in the page.
   *
   * A scene resolves *to the width it is given*: text wraps against it, boxes are sized from it,
   * and a row that is allowed to becomes a column below the narrow breakpoint. So a figure drawn
   * at 320 and the same figure drawn at 960 are two different, individually correct pictures
   * rather than one picture at two scales — which is the whole reason to emit both and let the
   * page choose, instead of scaling one down until the labels stop being readable.
   *
   * Results come back widest first, tagged with the `containerWidth` each was drawn for. Every
   * variant costs a full copy of the drawing, so an embedder should pick a small set (three is
   * usually enough: a phone, a column, and a wide page) rather than one per plausible screen.
   */
  readonly widths?: readonly number[];
  /** Absolute URL the module "lives at"; relative imports resolve against it. */
  readonly baseUrl?: string;
  /** Extra bare-specifier mappings. `kineglyph` is always mapped to `@kineglyph/web/bundle` (the entry that re-exports core authoring helpers). */
  readonly imports?: Readonly<Record<string, string>>;
  readonly idPrefix?: string;
  /** Embedded-font shaper used while resolving every responsive variant. */
  readonly textMeasurer?: TextMeasurer;
}

export interface PrerenderResult {
  readonly theme: string;
  /** A standalone SVG document, ready to write to a file. */
  readonly svg: string;
  /**
   * The same frame as a fragment for an HTML document — no XML declaration, no opaque background
   * rect. An embedder that inlines the figure into a page (which is what lets the page's CSS and
   * its accessibility tree reach it) wants this one; a file on disk wants `svg`.
   */
  readonly inlineSvg: string;
  /**
   * The container width this variant was resolved for — the number an embedder writes its query
   * against. Not the same as `width`: a scene may draw itself narrower than the room it was given.
   */
  readonly containerWidth: number;
  readonly width: number;
  readonly height: number;
  /**
   * Whether the live runtime could show this reader anything this frame does not — see
   * `sceneNeedsRuntime`. An embedder that pre-renders can carry the answer into the page (as an
   * attribute, say) and skip hydrating the figures that would only redraw what is already there.
   */
  readonly needsRuntime: boolean;
}

const IMPORT_RE =
  /(?<staticHead>\bimport\s*(?:[\w*\s{},$]*?\s*from\s*)?)(?<staticQuote>["'])(?<staticSpec>[^"']+)\k<staticQuote>|(?<exportHead>\bexport\s*(?:\*(?:\s+as\s+[\w$]+)?|\{[^}]*\})\s*from\s*)(?<exportQuote>["'])(?<exportSpec>[^"']+)\k<exportQuote>|(?<dynHead>\bimport\s*\(\s*)(?<dynQuote>["'])(?<dynSpec>[^"']+)\k<dynQuote>(?<dynTail>\s*\))/g;

/**
 * Rewrites every import specifier through `resolve`. Handles `import x from "s"`,
 * `import "s"`, `import("s")`, and re-exports (`export { x } from "s"`, `export * from "s"`,
 * `export * as ns from "s"`). String literals outside imports/exports are untouched.
 */
export function rewriteImports(source: string, resolve: (specifier: string) => string): string {
  return source.replace(IMPORT_RE, (match: string, ...rest: unknown[]) => {
    const groups = rest[rest.length - 1] as Record<string, string | undefined>;
    // JSON.stringify escapes quotes/backslashes/control chars, so a resolved specifier can never
    // break out of its string literal.
    if (groups.staticHead !== undefined && groups.staticSpec !== undefined)
      return `${groups.staticHead}${JSON.stringify(resolve(groups.staticSpec))}`;
    if (groups.exportHead !== undefined && groups.exportSpec !== undefined)
      return `${groups.exportHead}${JSON.stringify(resolve(groups.exportSpec))}`;
    if (groups.dynHead !== undefined && groups.dynSpec !== undefined)
      return `${groups.dynHead}${JSON.stringify(resolve(groups.dynSpec))}${groups.dynTail ?? ""}`;
    return match;
  });
}

/**
 * Resolves the runtime URL for `@kineglyph/web/bundle`.
 *
 * Under plain Node, `import.meta.resolve` picks the package's `import` condition and
 * yields the built JS bundle. Under Vitest/Vite, a `development` condition is applied
 * ahead of `import`, so the same call instead yields the raw TypeScript source
 * (`./src/bundle.ts`) — a file Node's loader cannot execute standalone (its own relative
 * `./index.js` specifier doesn't exist on disk; only `index.ts` does). Detect that case
 * and fall back to reading the package's `exports["./bundle"].import` entry directly, so
 * `prerender()` is correct regardless of which conditions the calling process installed.
 */
function resolveRuntimeUrl(): string {
  const resolved = import.meta.resolve("@kineglyph/web/bundle");
  if (!/\.(ts|tsx|mts|cts)$/.test(resolved)) return resolved;

  const pkgUrl = import.meta.resolve("@kineglyph/web/package.json");
  const pkg = JSON.parse(readFileSync(new URL(pkgUrl), "utf8")) as {
    exports?: Record<string, unknown>;
  };
  const bundleExport = pkg.exports?.["./bundle"];
  const importEntry =
    typeof bundleExport === "string"
      ? bundleExport
      : typeof bundleExport === "object" && bundleExport !== null
        ? (bundleExport as Record<string, unknown>)["import"]
        : undefined;
  if (typeof importEntry !== "string")
    throw new KineglyphExportError(
      "invalid-scene",
      '@kineglyph/web package.json has no usable exports["./bundle"].import entry',
    );
  return new URL(importEntry, pkgUrl).href;
}

function makeResolver(options: PrerenderOptions): (specifier: string) => string {
  // Null-prototype: a scene importing "toString" or "constructor" must not hit Object.prototype.
  const bare: Record<string, string> = Object.assign(
    Object.create(null) as Record<string, string>,
    {
      kineglyph: resolveRuntimeUrl(),
      ...(options.imports ?? {}),
    },
  );
  return (specifier) => {
    if (Object.hasOwn(bare, specifier)) return bare[specifier]!;
    if (specifier.startsWith("./") || specifier.startsWith("../") || specifier.startsWith("/")) {
      if (options.baseUrl === undefined)
        throw new KineglyphExportError(
          "invalid-scene",
          `relative import "${specifier}" needs prerender({ baseUrl })`,
        );
      return new URL(specifier, options.baseUrl).href;
    }
    if (/^[a-z]+:/i.test(specifier)) return specifier; // already a URL
    try {
      return import.meta.resolve(specifier);
    } catch {
      throw new KineglyphExportError("invalid-scene", `cannot resolve import "${specifier}"`);
    }
  };
}

async function loadFigure(moduleSource: string, options: PrerenderOptions): Promise<FigureSource> {
  const rewritten = rewriteImports(moduleSource, makeResolver(options));
  const url = `data:text/javascript;base64,${Buffer.from(rewritten, "utf8").toString("base64")}`;
  const mod = (await import(url)) as { default?: unknown };
  const scene = mod.default;
  if (scene === null || typeof scene !== "object")
    throw new KineglyphExportError(
      "invalid-scene",
      "scene module must have a default export that is a scene definition",
    );
  return scene as FigureSource;
}

/** Evaluates a scene module under Node and renders one SVG per theme, per container width. */
export async function prerender(
  moduleSource: string,
  options: PrerenderOptions,
): Promise<PrerenderResult[]> {
  const widths = containerWidths(options);
  const figure = await loadFigure(moduleSource, options);
  const results: PrerenderResult[] = [];
  for (const containerWidth of widths) {
    for (const theme of options.themes) {
      const scene = resolveFigure(figure, {
        width: containerWidth,
        theme: theme.tokens,
        ...(options.textMeasurer === undefined ? {} : { textMeasurer: options.textMeasurer }),
      });
      const errors = (scene.diagnostics ?? []).filter((d) => d.severity === "error");
      if (errors.length > 0)
        throw new KineglyphExportError(
          "invalid-scene",
          `${scene.id ?? "scene"} (${theme.name} at ${containerWidth}px):\n${errors.map((d) => `- ${d.code}: ${d.message}`).join("\n")}`,
        );
      const frame = seekTimeline(scene, scene.timeline?.duration ?? 0);
      // The width is part of the id prefix only when there is more than one, so a single-width
      // call — every caller that existed before variants did — emits byte-for-byte what it did.
      const suffix = widths.length === 1 ? "" : `-${containerWidth}`;
      const idPrefix = `${options.idPrefix ?? "kg"}-${theme.name}${suffix}`;
      const svg = exportSvg(frame, { idPrefix });
      const inlineSvg = exportSvg(frame, { idPrefix, destination: "inline" });
      results.push({
        theme: theme.name,
        svg,
        inlineSvg,
        containerWidth,
        width: frame.width,
        height: frame.height,
        needsRuntime: sceneNeedsRuntime(scene),
      });
    }
  }
  return results;
}

/**
 * The container widths to draw, de-duplicated and drawn widest first.
 *
 * Widest first because that is the order a reader's fallback wants: an embedder that stacks the
 * variants and picks one with a query still has a sensible first child if no query ever matches.
 */
function containerWidths(options: PrerenderOptions): readonly number[] {
  const requested = options.widths ?? (options.width === undefined ? undefined : [options.width]);
  const widths = [...new Set(requested ?? [960])].sort((a, b) => b - a);
  for (const width of widths)
    if (!Number.isFinite(width) || width <= 0)
      throw new KineglyphExportError(
        "invalid-scene",
        `prerender widths must be positive, finite numbers (received ${width})`,
      );
  return widths;
}
