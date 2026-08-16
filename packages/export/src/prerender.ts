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
  /(\bimport\s*(?:[\w*\s{},$]*?\s*from\s*)?)(["'])([^"']+)\2|(\bimport\s*\(\s*)(["'])([^"']+)\5(\s*\))/g;

/**
 * Rewrites every import specifier through `resolve`. Handles `import x from "s"`,
 * `import "s"`, and `import("s")`. String literals outside imports are untouched.
 */
export function rewriteImports(source: string, resolve: (specifier: string) => string): string {
  return source.replace(
    IMPORT_RE,
    (
      _m: string,
      staticHead: string | undefined,
      _q1: string | undefined,
      staticSpec: string | undefined,
      dynHead: string | undefined,
      _q2: string | undefined,
      dynSpec: string | undefined,
      dynTail: string | undefined,
    ) => {
      if (staticHead !== undefined && staticSpec !== undefined)
        return `${staticHead}"${resolve(staticSpec)}"`;
      if (dynHead !== undefined && dynSpec !== undefined)
        return `${dynHead}"${resolve(dynSpec)}"${dynTail ?? ""}`;
      return _m;
    },
  );
}

function makeResolver(options: PrerenderOptions): (specifier: string) => string {
  const bare: Record<string, string> = {
    kineglyph: import.meta.resolve("@kineglyph/web/bundle"),
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
