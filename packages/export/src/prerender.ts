import { readFileSync } from "node:fs";
import { resolveFigure, seekTimeline, type FigureSource, type ThemeTokens } from "@kineglyph/core";
import { exportSvg } from "./svg.js";
import { KineglyphExportError } from "./errors.js";

export interface PrerenderTheme {
  readonly name: string;
  readonly tokens: ThemeTokens;
}

export interface PrerenderOptions {
  readonly themes: readonly PrerenderTheme[];
  /** Layout width used to resolve the figure. Defaults to 960. */
  readonly width?: number;
  /** Absolute URL the module "lives at"; relative imports resolve against it. */
  readonly baseUrl?: string;
  /** Extra bare-specifier mappings. `kineglyph` is always mapped to `@kineglyph/web/bundle` (the entry that re-exports core authoring helpers). */
  readonly imports?: Readonly<Record<string, string>>;
  readonly idPrefix?: string;
}

export interface PrerenderResult {
  readonly theme: string;
  readonly svg: string;
  readonly width: number;
  readonly height: number;
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
    if (groups.staticHead !== undefined && groups.staticSpec !== undefined)
      return `${groups.staticHead}"${resolve(groups.staticSpec)}"`;
    if (groups.exportHead !== undefined && groups.exportSpec !== undefined)
      return `${groups.exportHead}"${resolve(groups.exportSpec)}"`;
    if (groups.dynHead !== undefined && groups.dynSpec !== undefined)
      return `${groups.dynHead}"${resolve(groups.dynSpec)}"${groups.dynTail ?? ""}`;
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
  const bare: Record<string, string> = {
    kineglyph: resolveRuntimeUrl(),
    ...(options.imports ?? {}),
  };
  return (specifier) => {
    if (specifier in bare) return bare[specifier]!;
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

/** Evaluates a scene module under Node and renders one SVG per theme. */
export async function prerender(
  moduleSource: string,
  options: PrerenderOptions,
): Promise<PrerenderResult[]> {
  const width = options.width ?? 960;
  const figure = await loadFigure(moduleSource, options);
  const results: PrerenderResult[] = [];
  for (const theme of options.themes) {
    const scene = resolveFigure(figure, { width, theme: theme.tokens });
    const errors = (scene.diagnostics ?? []).filter((d) => d.severity === "error");
    if (errors.length > 0)
      throw new KineglyphExportError(
        "invalid-scene",
        `${scene.id ?? "scene"} (${theme.name}):\n${errors.map((d) => `- ${d.code}: ${d.message}`).join("\n")}`,
      );
    const frame = seekTimeline(scene, scene.timeline?.duration ?? 0);
    const svg = exportSvg(frame, {
      idPrefix: `${options.idPrefix ?? "kg"}-${theme.name}`,
    });
    results.push({ theme: theme.name, svg, width: frame.width, height: frame.height });
  }
  return results;
}
