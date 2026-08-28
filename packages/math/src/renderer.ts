/**
 * TeX → path data through MathJax.
 *
 * MathJax's SVG output is already font-free: every glyph is an outline. What it is not is a
 * single mark — it is a tree of translated and scaled groups. This module walks that tree with
 * MathJax's DOM-free `liteAdaptor`, folds every transform into the path data, turns fraction bars
 * and rules (`<rect>`) into subpaths, and reports the metrics a scene needs to size and align
 * the result as if it were text.
 */
import { mathjax } from "mathjax-full/js/mathjax.js";
import { TeX } from "mathjax-full/js/input/tex.js";
import { SVG } from "mathjax-full/js/output/svg.js";
import { liteAdaptor, type LiteAdaptor } from "mathjax-full/js/adaptors/liteAdaptor.js";
import { RegisterHTMLHandler } from "mathjax-full/js/handlers/html.js";
import { AllPackages } from "mathjax-full/js/input/tex/AllPackages.js";
import type { LiteElement } from "mathjax-full/js/adaptors/lite/Element.js";
import type { LiteText } from "mathjax-full/js/adaptors/lite/Text.js";
import type { MathDocument } from "mathjax-full/js/core/MathDocument.js";
import { apply, IDENTITY, multiply, parseTransform, transformPath, type Affine } from "./path.js";

/** A formula as one path in its own box. Units are MathJax's: 1000 per em. */
export interface MathGlyph {
  readonly tex: string;
  readonly display: boolean;
  /** Absolute `M L C Q Z` path data in the `viewBox` space, y down. */
  readonly d: string;
  readonly viewBox: { readonly width: number; readonly height: number };
  /** Distance from the top of the box to the baseline, in viewBox units. */
  readonly baseline: number;
  /** viewBox units per em. */
  readonly em: number;
}

export interface MathRenderOptions {
  /** Display (block) style: larger operators, stacked fractions. Default inline. */
  readonly display?: boolean;
  /** Decimal places kept in the path data. */
  readonly precision?: number;
}

export interface MathRenderer {
  tex(source: string, options?: MathRenderOptions): MathGlyph;
}

/** MathJax lays out in ex; its SVG viewBox uses 1000 units per em and this many per ex. */
const UNITS_PER_EM = 1000;

type Adaptor = LiteAdaptor;
type Node = LiteElement | LiteText;

function attribute(adaptor: Adaptor, node: LiteElement, name: string): string | undefined {
  const value = adaptor.getAttribute(node, name) as string | null | undefined;
  return value === null || value === undefined ? undefined : String(value);
}

function isElement(node: Node): node is LiteElement {
  return (node as LiteElement).kind !== undefined && (node as LiteElement).kind !== "#text";
}

function collect(
  adaptor: Adaptor,
  node: LiteElement,
  ctm: Affine,
  precision: number,
  out: string[],
): void {
  const kind = adaptor.kind(node);
  if (kind === "title" || kind === "desc" || kind === "defs") return;
  const own = parseTransform(attribute(adaptor, node, "transform"));
  const matrix = multiply(ctm, own);
  if (kind === "path") {
    const d = attribute(adaptor, node, "d");
    if (d) out.push(transformPath(d, matrix, precision));
    return;
  }
  if (kind === "rect") {
    const x = Number(attribute(adaptor, node, "x") ?? 0);
    const y = Number(attribute(adaptor, node, "y") ?? 0);
    const width = Number(attribute(adaptor, node, "width") ?? 0);
    const height = Number(attribute(adaptor, node, "height") ?? 0);
    const corners = [
      apply(matrix, x, y),
      apply(matrix, x + width, y),
      apply(matrix, x + width, y + height),
      apply(matrix, x, y + height),
    ];
    const f = (value: number) => {
      const rounded = Number(value.toFixed(precision));
      return Object.is(rounded, -0) ? "0" : String(rounded);
    };
    out.push(`M${corners.map(([px, py]) => `${f(px)} ${f(py)}`).join(" L")} Z`);
    return;
  }
  for (const child of adaptor.childNodes(node) as Node[]) {
    if (isElement(child)) collect(adaptor, child, matrix, precision, out);
  }
}

function findSvg(adaptor: Adaptor, node: LiteElement): LiteElement | undefined {
  if (adaptor.kind(node) === "svg") return node;
  for (const child of adaptor.childNodes(node) as Node[]) {
    if (!isElement(child)) continue;
    const found = findSvg(adaptor, child);
    if (found) return found;
  }
  return undefined;
}

/**
 * Creates a synchronous TeX renderer. MathJax is loaded with the full TeX package set; the
 * output jax is configured with no font cache so every glyph is an inline outline.
 */
export function createMathRenderer(): MathRenderer {
  const adaptor = liteAdaptor();
  RegisterHTMLHandler(adaptor);
  const document = mathjax.document("", {
    InputJax: new TeX({ packages: AllPackages }),
    OutputJax: new SVG({ fontCache: "none" }),
  }) as MathDocument<LiteElement, LiteText, unknown>;
  const cache = new Map<string, MathGlyph>();

  return {
    tex(source, options = {}) {
      const display = options.display ?? false;
      const precision = options.precision ?? 1;
      const key = `${display ? "D" : "I"}${precision}:${source}`;
      const cached = cache.get(key);
      if (cached) return cached;
      const container = document.convert(source, { display }) as LiteElement;
      const svg = findSvg(adaptor, container);
      if (!svg) throw new Error(`mathjax produced no svg for ${JSON.stringify(source)}`);
      const box = (attribute(adaptor, svg, "viewBox") ?? "0 0 0 0").split(/\s+/).map(Number);
      const [minX = 0, minY = 0, width = 0, height = 0] = box;
      // Shift the box to the origin; MathJax's root group already flips y so glyphs are y-down.
      const root: Affine = [1, 0, 0, 1, -minX, -minY];
      const parts: string[] = [];
      collect(adaptor, svg, multiply(IDENTITY, root), precision, parts);
      const glyph: MathGlyph = {
        tex: source,
        display,
        d: parts.join(" "),
        viewBox: { width, height },
        baseline: -minY,
        em: UNITS_PER_EM,
      };
      cache.set(key, glyph);
      return glyph;
    },
  };
}
