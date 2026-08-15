/**
 * Quantitative marks as semantic data.
 *
 * `@kineglyph/plot` is a pure compiler: a `PlotSpec` (scales, series, axes, legends, annotations)
 * becomes an ordinary core `SceneFragment` — a `coordinates` group with rects, polylines, circles,
 * texts, legends, and callouts placed by fractions and percentages — so the resolver lays it out
 * for any width and every downstream stage (SVG, runtime, PNG/GIF) treats it like authored
 * primitives. No DOM, no chart framework, deterministic for equal input.
 */
import type { LayoutName, Paint, Responsive } from "@kineglyph/core";

// ---------------------------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------------------------

export type PlotValue = number | null;
export type CategoryKey = string;

export interface Datum {
  /** Category (band scale) or numeric position (linear scale). */
  readonly x: CategoryKey | number;
  readonly y: PlotValue;
  readonly tone?: Paint;
  /** Optional inspection copy; defaults to "<series> · <x>: <formatted y>". */
  readonly label?: string;
  readonly description?: string;
}

/**
 * Field-name data channels keep scenes serializable: rows are plain records and the mapping names
 * the fields, so a scene (and therefore an export) never depends on callbacks.
 */
export interface DataChannels {
  readonly rows: readonly Readonly<Record<string, string | number | boolean | null>>[];
  readonly x: string;
  readonly y: string;
  readonly tone?: string;
  readonly label?: string;
  readonly description?: string;
}

export type SeriesData = readonly Datum[] | DataChannels;

export interface NumberFormatSpec {
  /** Fixed decimals; defaults to a value derived from the tick step. */
  readonly digits?: number;
  readonly prefix?: string;
  readonly suffix?: string;
  /** Insert thousands separators (default true for |value| ≥ 10 000). */
  readonly thousands?: boolean;
  /** Abbreviate with k / M / B suffixes. */
  readonly compact?: boolean;
}

// ---------------------------------------------------------------------------------------------
// Scales
// ---------------------------------------------------------------------------------------------

export interface LinearScaleSpec {
  readonly type: "linear";
  /** Explicit domain, "auto" (data extent), or "auto-zero" (extent extended to include 0; default). */
  readonly domain?: readonly [number, number] | "auto" | "auto-zero";
  /** Round the domain outward to nice tick boundaries (default true). */
  readonly nice?: boolean;
  /** Target tick count per layout, or explicit tick values. */
  readonly ticks?: Responsive<number> | readonly number[];
  readonly format?: NumberFormatSpec;
  readonly label?: string;
}

export interface BandScaleSpec {
  readonly type: "band";
  /** Category order; defaults to first appearance across series (frozen at compile time). */
  readonly domain?: readonly CategoryKey[];
  /** Fraction of each band left as gutter (0..0.9, default 0.25). */
  readonly padding?: number;
  readonly label?: string;
}

export type ScaleSpec = LinearScaleSpec | BandScaleSpec;

// ---------------------------------------------------------------------------------------------
// Series, axes, annotations
// ---------------------------------------------------------------------------------------------

export type SeriesMark = "bar" | "line" | "area" | "scatter" | "dot";

export interface SeriesSpec {
  readonly id: string;
  readonly label: string;
  readonly mark: SeriesMark;
  readonly data: SeriesData;
  /** Defaults to the chart palette (chart1…chart6) by series index. */
  readonly tone?: Paint;
  /** Line/area interpolation (default "linear"). */
  readonly curve?: "linear" | "monotone" | "step";
  readonly dash?: "solid" | "dashed" | "dotted";
  /** Point radius for scatter/dot marks and line vertices (default 4; 0 hides vertices). */
  readonly pointRadius?: number;
  /**
   * Keyboard/pointer inspection granularity. "marks" makes every datum inspectable inside one
   * roving focus group per series; "series" exposes the series as a whole; "none" is decorative.
   * Defaults: bar/dot/scatter → "marks", line/area → "series".
   */
  readonly interactive?: "marks" | "series" | "none";
  readonly description?: string;
}

export interface AxisSpec {
  readonly label?: string;
  readonly hidden?: Responsive<boolean>;
  /** Show every n-th category label on band axes when space is tight (auto by default). */
  readonly labelEvery?: Responsive<number>;
  readonly format?: NumberFormatSpec;
}

export type AnnotationSpec =
  | {
      readonly type: "reference-line";
      readonly axis: "x" | "y";
      readonly value: number | CategoryKey;
      readonly label?: string;
      readonly tone?: Paint;
      readonly dash?: "solid" | "dashed" | "dotted";
    }
  | {
      readonly type: "reference-band";
      readonly axis: "x" | "y";
      readonly from: number | CategoryKey;
      readonly to: number | CategoryKey;
      readonly label?: string;
      readonly tone?: Paint;
    }
  | {
      readonly type: "point-label";
      readonly series: string;
      readonly index: number;
      readonly text: string;
      readonly placement?: "above" | "below" | "left" | "right";
      readonly tone?: Paint;
    }
  | {
      readonly type: "callout";
      readonly x: number | CategoryKey;
      readonly y: number;
      readonly text: string;
      readonly pointer?: "up" | "down" | "left" | "right" | "none";
      readonly tone?: Paint;
      readonly maxWidth?: number;
    };

export interface HeatmapSpec {
  readonly rows: readonly CategoryKey[];
  readonly columns: readonly CategoryKey[];
  /** values[rowIndex][columnIndex]; null renders an empty cell. */
  readonly values: readonly (readonly PlotValue[])[];
  readonly domain?: readonly [number, number] | "auto";
  /** Sequential ramp end tone (default chart1); the start is the theme's muted surface. */
  readonly tone?: Paint;
  /** Diverging ramp: negative → `negativeTone`, positive → `tone`, centred on 0. */
  readonly negativeTone?: Paint;
  readonly cellLabels?: Responsive<boolean>;
  readonly format?: NumberFormatSpec;
  readonly rowLabel?: string;
  readonly columnLabel?: string;
}

// ---------------------------------------------------------------------------------------------
// The spec
// ---------------------------------------------------------------------------------------------

export interface PlotSpec {
  /** Bars, lines, areas, points, and mixtures share x/y scales; heatmaps use `heatmap` instead. */
  readonly series?: readonly SeriesSpec[];
  readonly heatmap?: HeatmapSpec;
  readonly x?: ScaleSpec;
  readonly y?: ScaleSpec;
  /** Stack bar/area series that share x positions (negative values stack downward). */
  readonly stack?: boolean;
  /** Horizontal bars swap the band scale onto y. */
  readonly orientation?: "vertical" | "horizontal";
  readonly axes?: { readonly x?: AxisSpec | false; readonly y?: AxisSpec | false };
  readonly grid?: "none" | "x" | "y" | "both";
  readonly legend?: false | { readonly position?: "top" | "bottom" };
  readonly annotations?: readonly AnnotationSpec[];
  /** Value labels above bars / beside points: always, never, or when there is room (per layout). */
  readonly valueLabels?: boolean | "auto";
  /** Sparkline mode: no axes, grid, legend, or labels; minimal padding. */
  readonly minimal?: boolean;
  /** Plot area height (excludes axes and legend). Defaults per layout. */
  readonly height?: Responsive<number>;
  /** Accessible summary; auto-generated from the data when omitted. */
  readonly description?: string;
  /** Title used as the chart's accessible name and inspection heading. */
  readonly title?: string;
}

// ---------------------------------------------------------------------------------------------
// Compiler contract
// ---------------------------------------------------------------------------------------------

export interface PlotOptions {
  /** Stable id prefix for every generated node (default "plot"). */
  readonly id?: string;
  /**
   * Motion preset returned as relative tracks in the fragment: bars rise from their baseline,
   * lines/areas draw, points pop, heatmap cells sweep; "none" returns no tracks.
   */
  readonly motion?: "rise" | "draw" | "sweep" | "auto" | "none";
  /** Duration of the motion preset in milliseconds (default 900). */
  readonly duration?: number;
}

/** Diagnostics specific to plots (unknown series in annotations, ragged heatmaps, …). */
export interface PlotDiagnostic {
  readonly severity: "error" | "warning";
  readonly code: string;
  readonly message: string;
}

/**
 * Stable ids inside a compiled plot (prefix = options.id):
 * - `${p}` (root group), `${p}:area` (coordinates group), `${p}:series:${s}` (focus group)
 * - `${p}:bar:${s}:${i}`, `${p}:point:${s}:${i}`, `${p}:line:${s}`, `${p}:area:${s}`
 * - `${p}:cell:${r}:${c}` (heatmap), `${p}:axis:x`, `${p}:axis:y`, `${p}:tick:x:${i}`,
 *   `${p}:tick:y:${i}`, `${p}:grid:${i}`, `${p}:label:${s}:${i}`, `${p}:legend`,
 *   `${p}:annotation:${i}`
 */
export interface PlotResult {
  /** Fragment ready for figure()/defineScene: one root group node plus relative motion tracks. */
  readonly fragment: import("@kineglyph/core").SceneFragment;
  /** Frozen category order and numeric domains used for the compile (for tests and legends). */
  readonly domains: {
    readonly x: readonly CategoryKey[] | readonly [number, number];
    readonly y: readonly CategoryKey[] | readonly [number, number];
  };
  readonly ticks: {
    readonly x: readonly (number | string)[];
    readonly y: readonly (number | string)[];
  };
  readonly description: string;
  readonly diagnostics: readonly PlotDiagnostic[];
  /** Ordered generated mark ids per series (reading order), for motion and tests. */
  readonly markIds: ReadonlyMap<string, readonly string[]>;
}

/** Default plot-area heights per named layout. */
export const PLOT_HEIGHTS: Readonly<Record<LayoutName, number>> = {
  wide: 240,
  compact: 200,
  narrow: 160,
};

/** Series palette cycle used when a series declares no tone. */
export const PLOT_TONES: readonly Paint[] = [
  "chart1",
  "chart2",
  "chart3",
  "chart4",
  "chart5",
  "chart6",
];
