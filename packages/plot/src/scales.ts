/**
 * Pure, deterministic scale and formatting helpers. No Intl, no locale, no Date.
 */
import type { CategoryKey, NumberFormatSpec, PlotValue } from "./types.js";

// ---------------------------------------------------------------------------------------------
// Linear scale
// ---------------------------------------------------------------------------------------------

export interface LinearScale {
  readonly domain: readonly [number, number];
  readonly range: readonly [number, number];
  /** Maps a domain value to the range (not clamped). */
  readonly map: (value: number) => number;
  /** Inverse mapping from the range back to the domain. */
  readonly invert: (position: number) => number;
}

export function linearScale(
  domain: readonly [number, number],
  range: readonly [number, number] = [0, 1],
): LinearScale {
  const [d0, d1] = domain;
  const [r0, r1] = range;
  const span = d1 - d0;
  return {
    domain: [d0, d1],
    range: [r0, r1],
    map: (value) => (span === 0 ? (r0 + r1) / 2 : r0 + ((value - d0) / span) * (r1 - r0)),
    invert: (position) => (r1 - r0 === 0 ? d0 : d0 + ((position - r0) / (r1 - r0)) * span),
  };
}

// ---------------------------------------------------------------------------------------------
// Band scale
// ---------------------------------------------------------------------------------------------

export interface Band {
  readonly start: number;
  readonly end: number;
  readonly width: number;
  readonly center: number;
}

export interface BandScale {
  readonly domain: readonly CategoryKey[];
  readonly range: readonly [number, number];
  readonly padding: number;
  /** Distance between the starts of adjacent slots. */
  readonly step: number;
  /** Width of one band (slot minus padding). */
  readonly bandwidth: number;
  /** Band geometry by category or index; undefined for unknown categories. */
  readonly band: (key: CategoryKey | number) => Band | undefined;
  readonly index: (key: CategoryKey) => number;
}

/**
 * Bands split the range into `n` equal slots; each band keeps `1 - padding` of its slot, centred,
 * so the outer padding is half the inner padding (like d3 with `paddingOuter = padding / 2`).
 */
export function bandScale(
  domain: readonly CategoryKey[],
  range: readonly [number, number] = [0, 1],
  padding = 0.25,
): BandScale {
  const [r0, r1] = range;
  const n = domain.length;
  const pad = clamp(padding, 0, 0.9);
  const step = n === 0 ? 0 : (r1 - r0) / n;
  const bandwidth = step * (1 - pad);
  const indices = new Map<CategoryKey, number>();
  domain.forEach((key, index) => {
    if (!indices.has(key)) indices.set(key, index);
  });
  const band = (key: CategoryKey | number): Band | undefined => {
    const index = typeof key === "number" ? key : indices.get(key);
    if (index === undefined || index < 0 || index >= n) return undefined;
    const start = r0 + index * step + (step * pad) / 2;
    return { start, end: start + bandwidth, width: bandwidth, center: start + bandwidth / 2 };
  };
  return {
    domain,
    range: [r0, r1],
    padding: pad,
    step,
    bandwidth,
    band,
    index: (key) => indices.get(key) ?? -1,
  };
}

// ---------------------------------------------------------------------------------------------
// Ticks
// ---------------------------------------------------------------------------------------------

/**
 * Tick increment for roughly `count` ticks between `min` and `max`, using 1-2-5 stepping.
 * Returns the step (≥ 1) or, for fractional steps, `-1 / step` so callers can divide by an
 * integer and avoid floating-point drift (the d3 convention).
 */
function tickIncrement(min: number, max: number, count: number): number {
  const step = (max - min) / Math.max(1, count);
  const power = Math.floor(Math.log10(step));
  const error = step / 10 ** power;
  const factor =
    error >= Math.sqrt(50) ? 10 : error >= Math.sqrt(10) ? 5 : error >= Math.SQRT2 ? 2 : 1;
  return power >= 0 ? factor * 10 ** power : -(10 ** -power) / factor;
}

/** Nice step size for roughly `count` intervals (always positive). */
export function tickStep(min: number, max: number, count = 5): number {
  if (!(max > min)) return 1;
  const increment = tickIncrement(min, max, count);
  return increment < 0 ? 1 / -increment : increment;
}

/**
 * Nice tick values inside [min, max] using 1-2-5 stepping (about `count` ticks). Multiples of the
 * step always include 0 when the domain crosses it. Deterministic and free of float drift.
 */
export function niceTicks(min: number, max: number, count = 5): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [];
  if (min === max) return [min];
  const reverse = max < min;
  const lo = reverse ? max : min;
  const hi = reverse ? min : max;
  const increment = tickIncrement(lo, hi, Math.max(1, Math.floor(count)));
  if (!Number.isFinite(increment) || increment === 0) return [];
  const ticks: number[] = [];
  if (increment > 0) {
    const first = Math.ceil(lo / increment);
    const last = Math.floor(hi / increment);
    for (let index = first; index <= last; index += 1) ticks.push(index * increment);
  } else {
    const inverse = -increment;
    const first = Math.ceil(lo * inverse);
    const last = Math.floor(hi * inverse);
    for (let index = first; index <= last; index += 1) ticks.push(index / inverse);
  }
  const clean = ticks.map((tick) => (Object.is(tick, -0) ? 0 : tick));
  return reverse ? clean.reverse() : clean;
}

/** Extends a domain outward to multiples of the nice tick step (two passes, like d3's nice). */
export function niceDomain(min: number, max: number, count = 5): readonly [number, number] {
  let lo = min;
  let hi = max;
  if (!(hi > lo)) return [lo, hi];
  for (let pass = 0; pass < 2; pass += 1) {
    const increment = tickIncrement(lo, hi, Math.max(1, Math.floor(count)));
    if (!Number.isFinite(increment) || increment === 0) break;
    if (increment > 0) {
      lo = Math.floor(lo / increment) * increment;
      hi = Math.ceil(hi / increment) * increment;
    } else {
      const inverse = -increment;
      lo = Math.floor(lo * inverse) / inverse;
      hi = Math.ceil(hi * inverse) / inverse;
    }
  }
  return [Object.is(lo, -0) ? 0 : lo, Object.is(hi, -0) ? 0 : hi];
}

// ---------------------------------------------------------------------------------------------
// Number formatting
// ---------------------------------------------------------------------------------------------

/** Decimal places needed to print `step` exactly (capped at 6). */
export function decimalsFor(step: number): number {
  if (!Number.isFinite(step) || step === 0) return 0;
  for (let digits = 0; digits <= 6; digits += 1) {
    if (Math.abs(Math.round(step * 10 ** digits) / 10 ** digits - step) < 1e-9) return digits;
  }
  return 6;
}

function groupThousands(integer: string): string {
  let out = "";
  for (let index = 0; index < integer.length; index += 1) {
    const fromEnd = integer.length - index;
    out += integer[index] ?? "";
    if (fromEnd > 1 && fromEnd % 3 === 1) out += ",";
  }
  return out;
}

function trimZeros(text: string): string {
  if (!text.includes(".")) return text;
  return text.replace(/0+$/, "").replace(/\.$/, "");
}

/**
 * Deterministic number formatting: fixed digits (explicit, derived from a tick `step`, or the
 * minimal decimals up to 3), plain "," thousands separators (default for |v| ≥ 10 000), optional
 * k/M/B compaction, and prefix/suffix. Never uses Intl.
 */
export function formatNumber(
  value: number,
  spec: NumberFormatSpec & { readonly step?: number } = {},
): string {
  if (!Number.isFinite(value)) return "–";
  const negative = value < 0;
  let magnitude = Math.abs(value);
  let unit = "";
  if (spec.compact === true) {
    if (magnitude >= 1e9) {
      magnitude /= 1e9;
      unit = "B";
    } else if (magnitude >= 1e6) {
      magnitude /= 1e6;
      unit = "M";
    } else if (magnitude >= 1e3) {
      magnitude /= 1e3;
      unit = "k";
    }
  }
  let body: string;
  if (spec.digits !== undefined) body = magnitude.toFixed(Math.max(0, Math.min(6, spec.digits)));
  else if (unit !== "") body = trimZeros(magnitude.toFixed(1));
  else if (spec.step !== undefined) body = magnitude.toFixed(decimalsFor(spec.step));
  else body = trimZeros(magnitude.toFixed(3));
  const [integer = "0", fraction] = body.split(".");
  const useThousands =
    spec.thousands === true || (spec.thousands === undefined && unit === "" && magnitude >= 10_000);
  const grouped = useThousands ? groupThousands(integer) : integer;
  const digits = fraction === undefined ? grouped : `${grouped}.${fraction}`;
  const zero = /^[0.]*$/.test(digits.replace(/,/g, ""));
  const sign = negative && !zero ? "-" : "";
  return `${sign}${spec.prefix ?? ""}${digits}${unit}${spec.suffix ?? ""}`;
}

// ---------------------------------------------------------------------------------------------
// Domains and stacking
// ---------------------------------------------------------------------------------------------

export interface ResolveDomainOptions {
  readonly domain?: readonly [number, number] | "auto" | "auto-zero" | undefined;
  /** Round outward to nice tick boundaries (default true). */
  readonly nice?: boolean;
  /** Tick count used for nicing (default 5). */
  readonly ticks?: number;
  /** Extra headroom (fraction of the span) added above the maximum before nicing. */
  readonly headroom?: number;
  /** Explicit tick values the domain must cover. */
  readonly include?: readonly number[];
}

/**
 * Numeric domain from data values: explicit, data extent ("auto"), or extent extended to include
 * zero ("auto-zero", default), degenerate extents widened, then niced. Never returns NaN.
 */
export function resolveDomain(
  values: readonly PlotValue[],
  options: ResolveDomainOptions = {},
): readonly [number, number] {
  const domain = options.domain;
  if (Array.isArray(domain)) {
    const [a, b] = domain as readonly [number, number];
    if (Number.isFinite(a) && Number.isFinite(b) && a !== b) return a < b ? [a, b] : [b, a];
  }
  const finite: number[] = [];
  for (const value of values)
    if (typeof value === "number" && Number.isFinite(value)) finite.push(value);
  for (const value of options.include ?? []) if (Number.isFinite(value)) finite.push(value);
  if (finite.length === 0) return [0, 1];
  let min = Math.min(...finite);
  let max = Math.max(...finite);
  if (domain !== "auto") {
    min = Math.min(min, 0);
    max = Math.max(max, 0);
  }
  if (min === max) {
    if (min === 0) max = 1;
    else {
      const half = Math.abs(min);
      min -= half;
      max += half;
    }
  }
  const headroom = options.headroom ?? 0;
  if (headroom > 0) {
    const span = max - min;
    if (max > 0) max += span * headroom;
    if (min < 0) min -= span * headroom;
  }
  if (options.nice === false) return [min, max];
  return niceDomain(min, max, options.ticks ?? 5);
}

export interface StackSegment {
  readonly start: number;
  readonly end: number;
}

/**
 * Stacks series values per category: positives accumulate upward from 0 and negatives downward
 * (diverging). Missing (`null`) values produce `null` segments and do not move the cursor.
 * `values[seriesIndex][categoryIndex]` → `segments[seriesIndex][categoryIndex]`.
 */
export function stackSeries(
  values: readonly (readonly PlotValue[])[],
): readonly (readonly (StackSegment | null)[])[] {
  const categories = Math.max(0, ...values.map((row) => row.length));
  const positive = new Array<number>(categories).fill(0);
  const negative = new Array<number>(categories).fill(0);
  return values.map((row) => {
    const segments: (StackSegment | null)[] = [];
    for (let index = 0; index < categories; index += 1) {
      const value = row[index];
      if (typeof value !== "number" || !Number.isFinite(value)) {
        segments.push(null);
        continue;
      }
      if (value >= 0) {
        const start = positive[index] ?? 0;
        positive[index] = start + value;
        segments.push({ start, end: start + value });
      } else {
        const start = negative[index] ?? 0;
        negative[index] = start + value;
        segments.push({ start, end: start + value });
      }
    }
    return segments;
  });
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
