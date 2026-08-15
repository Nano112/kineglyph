/**
 * Deterministic text metrics.
 *
 * Kineglyph never measures fonts in a browser during layout. Instead it uses explicit per-glyph
 * class widths, biased slightly wide so renderers that honour `textLength` stretch spacing rather
 * than squash glyphs. Equal inputs always produce equal line breaks in every environment.
 */

export interface TextFont {
  readonly family: string;
  readonly size: number;
  readonly weight: number;
  readonly lineHeight: number;
  readonly letterSpacing?: number;
}

export interface TextLine {
  readonly text: string;
  readonly width: number;
}

export interface WrapOptions {
  readonly maxLines?: number;
  /** Replaces the tail of the last line with an ellipsis when lines are dropped. */
  readonly ellipsis?: boolean;
}

const MONO_PATTERN =
  /mono|menlo|consolas|courier|sfmono|jetbrains|fira code|source code|ibm plex mono/i;

function glyphWidth(character: string): number {
  const code = character.codePointAt(0) ?? 32;
  if (character === " ") return 0.28;
  if (/[iljI'|!.,:;`]/.test(character)) return 0.29;
  if (/[ftrJ]/.test(character)) return 0.37;
  if (/[mwMW]/.test(character)) return 0.88;
  if (/[a-z]/.test(character)) return 0.56;
  if (/[A-Z]/.test(character)) return 0.69;
  if (/[0-9]/.test(character)) return 0.58;
  if (/[-()[\]{}/\\"*]/.test(character)) return 0.4;
  if (/[+=<>#$_~^?]/.test(character)) return 0.58;
  if (/[@%&]/.test(character)) return 0.86;
  if (code >= 0x2e80) return 1.0;
  if (code >= 0x80) return 0.7;
  return 0.6;
}

/** True when the font stack resolves to a monospace family. */
export function isMonospace(family: string): boolean {
  return MONO_PATTERN.test(family);
}

/** Estimated advance width of a string in pixels. */
export function measureText(text: string, font: TextFont): number {
  if (text.length === 0) return 0;
  const characters = Array.from(text);
  const mono = isMonospace(font.family);
  const weightFactor = font.weight >= 600 ? 1.045 : 1;
  let em = 0;
  for (const character of characters) em += mono ? 0.61 : glyphWidth(character) * 1.03;
  const spacing = (font.letterSpacing ?? 0) * Math.max(0, characters.length - 1);
  return round(em * font.size * weightFactor + spacing);
}

function round(value: number): number {
  return Math.round((value + Number.EPSILON) * 1000) / 1000;
}

function splitLongWord(word: string, maxWidth: number, font: TextFont): string[] {
  const characters = Array.from(word);
  const chunks: string[] = [];
  let current = "";
  for (const character of characters) {
    const candidate = current + character;
    if (current.length > 0 && measureText(candidate, font) > maxWidth) {
      chunks.push(current);
      current = character;
    } else current = candidate;
  }
  if (current.length > 0) chunks.push(current);
  return chunks;
}

/** Greedy word wrapping with deterministic long-word splitting and optional ellipsis. */
export function wrapText(
  text: string,
  maxWidth: number,
  font: TextFont,
  options: WrapOptions = {},
): readonly TextLine[] {
  const width = Math.max(1, maxWidth);
  const maxLines = Math.max(1, Math.floor(options.maxLines ?? Number.POSITIVE_INFINITY));
  const words = text.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  let truncated = false;

  const commit = (): void => {
    if (current.length > 0) lines.push(current);
    current = "";
  };

  outer: for (const word of words) {
    const pieces = measureText(word, font) > width ? splitLongWord(word, width, font) : [word];
    for (const piece of pieces) {
      const candidate = current.length === 0 ? piece : `${current} ${piece}`;
      if (measureText(candidate, font) <= width) {
        current = candidate;
        continue;
      }
      commit();
      if (lines.length >= maxLines) {
        truncated = true;
        break outer;
      }
      current = piece;
    }
  }
  if (!truncated && current.length > 0) {
    if (lines.length >= maxLines) truncated = true;
    else commit();
  }
  if (lines.length === 0 && words.length === 0) lines.push("");
  if (truncated && options.ellipsis !== false && lines.length > 0) {
    const lastIndex = lines.length - 1;
    let last = lines[lastIndex] ?? "";
    while (last.length > 0 && measureText(`${last}…`, font) > width)
      last = last.slice(0, -1).trimEnd();
    lines[lastIndex] = `${last}…`;
  }
  return lines.map((line) => ({ text: line, width: Math.min(width, measureText(line, font)) }));
}
