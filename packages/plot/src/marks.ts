/**
 * Mark and annotation helpers for the generic form. They return plain data (`MarkSpec`,
 * `AnnotationSpec`) so options stay serialisable.
 */
import type { Paint } from "@kineglyph/core";
import type {
  AnnotationSpec,
  CartesianMark,
  CategoryKey,
  HeatmapChannels,
  HeatmapMark,
  MarkStyle,
} from "./types.js";

function cartesian(kind: CartesianMark["kind"], style: MarkStyle = {}): CartesianMark {
  return { kind, ...style };
}

/** Grouped bars (one bar per series inside each band). */
export function bar(style: MarkStyle = {}): CartesianMark {
  return cartesian("bar", style);
}

/** Alias of `bar()`: grouped bars. */
export function groupedBar(style: MarkStyle = {}): CartesianMark {
  return cartesian("grouped-bar", style);
}

/** Stacked bars: positives accumulate upward, negatives diverge below the baseline. */
export function stackedBar(style: MarkStyle = {}): CartesianMark {
  return cartesian("stacked-bar", style);
}

export function line(style: MarkStyle = {}): CartesianMark {
  return cartesian("line", style);
}

export function area(style: MarkStyle = {}): CartesianMark {
  return cartesian("area", style);
}

/** Points (scatter on linear x, dot plot on band x). */
export function dot(style: MarkStyle = {}): CartesianMark {
  return cartesian("dot", style);
}

/** A minimal line: no axes, grid, legend, or labels and tight padding. */
export function sparkline(style: MarkStyle = {}): CartesianMark {
  return cartesian("sparkline", style);
}

/** Heatmap from long data: `row` × `column` cells coloured by `value`. */
export function heatmap<
  const Row extends string,
  const Column extends string,
  const Value extends string,
>(channels: HeatmapChannels<Row, Column, Value>): HeatmapMark<Row, Column, Value> {
  return { kind: "heatmap", ...channels };
}

// ---------------------------------------------------------------------------------------------
// Annotations
// ---------------------------------------------------------------------------------------------

interface RuleStyleOptions {
  readonly label?: string;
  readonly tone?: Paint;
  readonly dash?: "solid" | "dashed" | "dotted";
}

export type RuleOptions = RuleStyleOptions &
  (
    | { readonly x: number | CategoryKey; readonly y?: never }
    | { readonly y: number; readonly x?: never }
  );

/** Reference line at `y` (horizontal) or `x` (vertical). */
export function rule(options: RuleOptions): AnnotationSpec {
  const axis: "x" | "y" = options.y !== undefined ? "y" : "x";
  return {
    type: "reference-line",
    axis,
    value: axis === "y" ? (options.y ?? 0) : (options.x ?? 0),
    ...(options.label === undefined ? {} : { label: options.label }),
    ...(options.tone === undefined ? {} : { tone: options.tone }),
    ...(options.dash === undefined ? {} : { dash: options.dash }),
  };
}

interface RangeStyleOptions {
  readonly label?: string;
  readonly tone?: Paint;
}

export type RangeOptions = RangeStyleOptions &
  (
    | {
        readonly x: readonly [number | CategoryKey, number | CategoryKey];
        readonly y?: never;
      }
    | { readonly y: readonly [number, number]; readonly x?: never }
  );

/** Reference band between two values on one axis. */
export function range(options: RangeOptions): AnnotationSpec {
  const axis: "x" | "y" = options.y !== undefined ? "y" : "x";
  const [from, to] = axis === "y" ? (options.y ?? [0, 0]) : (options.x ?? [0, 0]);
  return {
    type: "reference-band",
    axis,
    from,
    to,
    ...(options.label === undefined ? {} : { label: options.label }),
    ...(options.tone === undefined ? {} : { tone: options.tone }),
  };
}

export interface CalloutAtOptions {
  readonly x: number | CategoryKey;
  readonly y: number;
  readonly text: string;
  readonly pointer?: "up" | "down" | "left" | "right" | "none";
  readonly tone?: Paint;
  readonly maxWidth?: number;
}

/** Callout anchored at a data position. */
export function calloutAt(options: CalloutAtOptions): AnnotationSpec {
  return { type: "callout", ...options };
}

export interface PointLabelOptions {
  /** Series id (defaults to the first series). */
  readonly series?: string;
  readonly index: number;
  readonly text: string;
  readonly placement?: "above" | "below" | "left" | "right";
  readonly tone?: Paint;
}

/** Text placed next to one datum of a series. */
export function pointLabel(options: PointLabelOptions): AnnotationSpec {
  return { type: "point-label", ...options };
}
