import { readFile } from "node:fs/promises";
import { Blob, Buffer, Face, Font, Variation, shape } from "harfbuzzjs";
import { measureText as estimateText, type TextMeasurer } from "@kineglyph/core";

/** A concrete font face used for both layout shaping and raster export. */
export interface EmbeddedFontSource {
  readonly file: string;
  /** CSS family name. Inferred from the font's OpenType names when omitted. */
  readonly family?: string;
  /** Static face weight. Variable `wght` fonts cover their declared range automatically. */
  readonly weight?: number;
  /** Face index inside a TTC/OTC collection. */
  readonly index?: number;
  /** Use this face when no family in the authored CSS stack matches. */
  readonly fallback?: boolean;
}

/**
 * Loaded HarfBuzz faces. Pass this object to `resolveScene({ textMeasurer: fonts })` and pass its
 * `files` to PNG/GIF font options with system fonts disabled. Both layout and pixels then derive
 * from the same bytes, independent of fonts installed on the machine.
 */
export interface EmbeddedFontMeasurer extends TextMeasurer {
  readonly files: readonly string[];
  readonly families: readonly string[];
}

interface LoadedFace {
  readonly id: number;
  readonly source: EmbeddedFontSource;
  readonly family: string;
  readonly normalizedFamily: string;
  readonly face: Face;
  readonly base: Font;
  readonly minWeight: number;
  readonly maxWeight: number;
  readonly fonts: Map<number, Font>;
}

/** Load explicit font files and build a synchronous HarfBuzz text measurer. */
export async function createEmbeddedFontMeasurer(
  sources: readonly EmbeddedFontSource[],
): Promise<EmbeddedFontMeasurer> {
  if (sources.length === 0) throw new TypeError("at least one embedded font source is required");
  const loaded = await Promise.all(sources.map((source, index) => loadFace(source, index)));
  const fallback = loaded.find((entry) => entry.source.fallback === true);
  const advances = new Map<string, number>();
  return {
    files: sources.map((source) => source.file),
    families: loaded.map((entry) => entry.family),
    measureText(text, font) {
      if (text.length === 0) return 0;
      const stack = fontFamilies(font.family);
      const candidates = loaded.filter((entry) => stack.includes(entry.normalizedFamily));
      const selected = nearestFace(candidates, font.weight) ?? fallback;
      if (selected === undefined) return estimateText(text, font);
      const weight = Math.min(selected.maxWeight, Math.max(selected.minWeight, font.weight));
      const key = `${selected.id}\u0000${weight}\u0000${text}`;
      let advance = advances.get(key);
      if (advance === undefined) {
        const shaped = fontAtWeight(selected, weight);
        const buffer = new Buffer();
        buffer.addText(text);
        buffer.guessSegmentProperties();
        shape(shaped, buffer);
        advance = buffer.getGlyphPositions().reduce((sum, position) => sum + position.xAdvance, 0);
        advances.set(key, advance);
      }
      const spacing = (font.letterSpacing ?? 0) * Math.max(0, Array.from(text).length - 1);
      return (advance / selected.face.upem) * font.size + spacing;
    },
  };
}

async function loadFace(source: EmbeddedFontSource, id: number): Promise<LoadedFace> {
  const bytes = await readFile(source.file);
  const blob = new Blob(bytes);
  const face = new Face(blob, source.index ?? 0);
  const family = source.family ?? fontFamily(face);
  if (family.trim().length === 0)
    throw new TypeError(`font ${source.file} has no usable family name; pass source.family`);
  const axis = face.getAxisInfos().wght;
  const base = new Font(face);
  base.setScale(face.upem, face.upem);
  return {
    id,
    source,
    family,
    normalizedFamily: normalizeFamily(family),
    face,
    base,
    minWeight: axis?.min ?? source.weight ?? 400,
    maxWeight: axis?.max ?? source.weight ?? 400,
    fonts: new Map([[axis?.default ?? source.weight ?? 400, base]]),
  };
}

function fontFamily(face: Face): string {
  const names = face.listNames();
  const preferred =
    names.find((entry) => entry.nameId === 16) ?? names.find((entry) => entry.nameId === 1);
  return preferred === undefined ? "" : face.getName(preferred.nameId, preferred.language);
}

function fontFamilies(stack: string): readonly string[] {
  return stack.split(",").map(normalizeFamily).filter(Boolean);
}

function normalizeFamily(family: string): string {
  return family
    .trim()
    .replace(/^(?:["'])(.*)(?:["'])$/, "$1")
    .toLocaleLowerCase("en-US");
}

function nearestFace(faces: readonly LoadedFace[], weight: number): LoadedFace | undefined {
  let best: LoadedFace | undefined;
  let distance = Number.POSITIVE_INFINITY;
  for (const face of faces) {
    const next =
      weight < face.minWeight
        ? face.minWeight - weight
        : weight > face.maxWeight
          ? weight - face.maxWeight
          : 0;
    if (next < distance) {
      best = face;
      distance = next;
    }
  }
  return best;
}

function fontAtWeight(entry: LoadedFace, requested: number): Font {
  const weight = Math.min(entry.maxWeight, Math.max(entry.minWeight, requested));
  const cached = entry.fonts.get(weight);
  if (cached !== undefined) return cached;
  const font = entry.base.subFont();
  font.setScale(entry.face.upem, entry.face.upem);
  if (entry.minWeight !== entry.maxWeight) font.setVariations([new Variation("wght", weight)]);
  entry.fonts.set(weight, font);
  return font;
}
