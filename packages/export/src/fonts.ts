/** Standalone SVG font embedding from caller-owned bytes. */

export type SvgFontBytes = Uint8Array | ArrayBuffer;
export type SvgFontFormat = "woff2" | "woff" | "truetype" | "opentype";

export interface SvgEmbeddedFont {
  readonly family: string;
  readonly data: SvgFontBytes;
  readonly format?: SvgFontFormat;
  readonly mimeType?: string;
  readonly weight?: number | string;
  readonly style?: string;
  readonly display?: "auto" | "block" | "swap" | "fallback" | "optional";
  readonly unicodeRange?: string;
}

export interface SvgFontSubsetContext {
  /** Unique Unicode characters found inside SVG text elements, in first-use order. */
  readonly text: string;
  readonly svg: string;
}

export type SvgFontSubsetResult =
  | SvgFontBytes
  | {
      readonly data: SvgFontBytes;
      readonly format?: SvgFontFormat;
      readonly mimeType?: string;
    };

/**
 * Caller-owned font subsetter. Kineglyph intentionally does not pretend to ship an OpenType
 * subsetter; adapters can invoke fonttools, HarfBuzz, or a service appropriate to their runtime.
 */
export type SvgFontSubsetter = (
  font: SvgEmbeddedFont,
  context: SvgFontSubsetContext,
) => SvgFontSubsetResult | Promise<SvgFontSubsetResult>;

export interface EmbedSvgFontsOptions {
  readonly subset?: SvgFontSubsetter;
  /** Overrides automatic text extraction, for example to include runtime-bound labels. */
  readonly text?: string;
}

const FORMAT_MIME: Readonly<Record<SvgFontFormat, string>> = {
  woff2: "font/woff2",
  woff: "font/woff",
  truetype: "font/ttf",
  opentype: "font/otf",
};

function bytes(value: SvgFontBytes): Uint8Array {
  return value instanceof Uint8Array ? value.slice() : new Uint8Array(value.slice(0));
}

function cssString(value: string): string {
  return `"${value
    .replaceAll("\\", "\\\\")
    .replaceAll('"', '\\"')
    .replace(/[\r\n\f]/g, " ")}"`;
}

function cssDescriptor(value: string | number, label: string): string {
  const serialized = String(value);
  if (/[;{}\r\n]/.test(serialized))
    throw new TypeError(`embedSvgFonts: invalid ${label} ${JSON.stringify(serialized)}`);
  return serialized;
}

function decodeXmlText(value: string): string {
  return value.replace(
    /&(?:#(\d+)|#x([\da-f]+)|amp|lt|gt|quot|apos);/gi,
    (entity, decimal: string | undefined, hexadecimal: string | undefined) => {
      if (decimal !== undefined) return String.fromCodePoint(Number.parseInt(decimal, 10));
      if (hexadecimal !== undefined) return String.fromCodePoint(Number.parseInt(hexadecimal, 16));
      if (entity === "&amp;") return "&";
      if (entity === "&lt;") return "<";
      if (entity === "&gt;") return ">";
      if (entity === "&quot;") return '"';
      return "'";
    },
  );
}

/** Extracts the glyph-bearing text from SVG text/tspan content without requiring a DOM. */
export function svgTextCharacters(svg: string): string {
  const content = Array.from(svg.matchAll(/<text\b[^>]*>([\s\S]*?)<\/text>/gi), (match) =>
    decodeXmlText((match[1] ?? "").replace(/<[^>]*>/g, "")),
  ).join("");
  const seen = new Set<string>();
  let unique = "";
  for (const character of Array.from(content)) {
    if (seen.has(character)) continue;
    seen.add(character);
    unique += character;
  }
  return unique;
}

function normalizeSubsetResult(
  result: SvgFontSubsetResult,
  fallback: SvgEmbeddedFont,
): { readonly data: Uint8Array; readonly format: SvgFontFormat; readonly mimeType: string } {
  const wrapped =
    result instanceof Uint8Array || result instanceof ArrayBuffer ? { data: result } : result;
  const format = wrapped.format ?? fallback.format ?? "woff2";
  if (!Object.hasOwn(FORMAT_MIME, format))
    throw new TypeError(`embedSvgFonts: unsupported font format ${JSON.stringify(format)}`);
  const mimeType = wrapped.mimeType ?? fallback.mimeType ?? FORMAT_MIME[format];
  if (!/^[\w.+-]+\/[\w.+-]+$/.test(mimeType))
    throw new TypeError(`embedSvgFonts: invalid font MIME type ${JSON.stringify(mimeType)}`);
  return {
    data: bytes(wrapped.data),
    format,
    mimeType,
  };
}

function fontRule(
  font: SvgEmbeddedFont,
  encoded: { readonly data: Uint8Array; readonly format: SvgFontFormat; readonly mimeType: string },
): string {
  const data = Buffer.from(encoded.data).toString("base64");
  const declarations = [
    `font-family:${cssString(font.family)}`,
    `src:url("data:${encoded.mimeType};base64,${data}") format("${encoded.format}")`,
    `font-weight:${cssDescriptor(font.weight ?? "normal", "font weight")}`,
    `font-style:${cssDescriptor(font.style ?? "normal", "font style")}`,
    `font-display:${font.display ?? "block"}`,
    ...(font.unicodeRange === undefined
      ? []
      : [`unicode-range:${cssDescriptor(font.unicodeRange, "unicode range")}`]),
  ];
  return `@font-face{${declarations.join(";")}}`;
}

/**
 * Embeds caller-provided fonts into a standalone SVG document as data-URL `@font-face` rules.
 *
 * Full bytes are embedded by default. When `subset` is supplied it receives the unique characters
 * used by SVG text and must return real font bytes; Kineglyph performs no fake byte slicing.
 * Callers remain responsible for the font's embedding licence.
 */
export async function embedSvgFonts(
  svg: string,
  fonts: readonly SvgEmbeddedFont[],
  options: EmbedSvgFontsOptions = {},
): Promise<string> {
  if (!/<svg\b[^>]*>/i.test(svg))
    throw new TypeError("embedSvgFonts: input is not an SVG document");
  if (fonts.length === 0) return svg;
  const text = options.text ?? svgTextCharacters(svg);
  const identities = new Set<string>();
  const rules: string[] = [];
  for (const font of fonts) {
    if (font.family.trim().length === 0)
      throw new TypeError("embedSvgFonts: font family must not be empty");
    if (bytes(font.data).length === 0)
      throw new TypeError(`embedSvgFonts: font ${JSON.stringify(font.family)} has no bytes`);
    const identity = `${font.family}\u0000${font.weight ?? "normal"}\u0000${font.style ?? "normal"}`;
    if (identities.has(identity))
      throw new TypeError(
        `embedSvgFonts: duplicate face ${JSON.stringify(font.family)} ${String(font.weight ?? "normal")} ${font.style ?? "normal"}`,
      );
    identities.add(identity);
    const result =
      options.subset === undefined
        ? normalizeSubsetResult(font.data, font)
        : normalizeSubsetResult(await options.subset(font, { text, svg }), font);
    if (result.data.length === 0)
      throw new TypeError(
        `embedSvgFonts: subsetter returned no bytes for ${JSON.stringify(font.family)}`,
      );
    rules.push(fontRule(font, result));
  }
  const style = `<style data-kineglyph-fonts="true">${rules.join("")}</style>`;
  const defs = /<defs\b[^>]*>/i.exec(svg);
  if (defs !== null) {
    const at = (defs.index ?? 0) + defs[0].length;
    return `${svg.slice(0, at)}${style}${svg.slice(at)}`;
  }
  const root = /<svg\b[^>]*>/i.exec(svg);
  if (root === null) throw new TypeError("embedSvgFonts: input is not an SVG document");
  if (/\/>$/.test(root[0])) {
    const open = root[0].replace(/\/>$/, ">");
    const at = (root.index ?? 0) + root[0].length;
    return `${svg.slice(0, root.index)}${open}<defs>${style}</defs></svg>${svg.slice(at)}`;
  }
  const at = (root.index ?? 0) + root[0].length;
  return `${svg.slice(0, at)}<defs>${style}</defs>${svg.slice(at)}`;
}
