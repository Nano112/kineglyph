/**
 * Quantitative marks as semantic data.
 *
 * `@kineglyph/plot` is a pure compiler: a `PlotSpec` (scales, series, axes, legends, annotations)
 * becomes an ordinary core `SceneFragment` — a `coordinates` group with rects, polylines, circles,
 * texts, legends, and callouts placed by fractions and percentages — so the resolver lays it out
 * for any width and every downstream stage (SVG, runtime, PNG/GIF) treats it like authored
 * primitives. No DOM, no chart framework, deterministic for equal input.
 */
import type {
  Easing,
  FillPaint,
  LayoutName,
  Paint,
  Responsive,
  SceneFragment,
} from "@kineglyph/core";

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

/** Signal ids bound to one compiled series. */
export interface SeriesBindings {
  readonly hidden?: string;
  readonly opacity?: string;
  readonly highlight?: string;
}

export interface SeriesSpec {
  readonly id: string;
  readonly label: string;
  readonly mark: SeriesMark;
  readonly data: SeriesData;
  /** Defaults to the chart palette (chart1…chart6) by series index. */
  readonly tone?: Paint;
  /** Fill for bars and areas. Defaults to `tone`; gradients remain ordinary serializable paint. */
  readonly fill?: FillPaint;
  /** Opacity applied to bar/area fill. Areas default to 0.25 for solid fills and 1 for gradients. */
  readonly fillOpacity?: number;
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
  /** Serializable signal bindings applied to the series group and its visual marks. */
  readonly bind?: SeriesBindings;
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
      /** Series id; defaults to the first series. */
      readonly series?: string;
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

interface PlotSpecBase {
  readonly axes?: { readonly x?: AxisSpec | false; readonly y?: AxisSpec | false };
  readonly legend?: false | { readonly position?: "top" | "bottom" };
  /** Sparkline mode: no axes, grid, legend, or labels; minimal padding. */
  readonly minimal?: boolean;
  /** Plot area height (excludes axes and legend). Defaults per layout. */
  readonly height?: Responsive<number>;
  /** Accessible summary; auto-generated from the data when omitted. */
  readonly description?: string;
  /** Title used as the chart's accessible name and inspection heading. */
  readonly title?: string;
}

export interface CartesianPlotSpec extends PlotSpecBase {
  readonly series?: readonly SeriesSpec[];
  readonly heatmap?: never;
  readonly x?: ScaleSpec;
  readonly y?: ScaleSpec;
  /** Stack bar/area series that share x positions (negative values stack downward). */
  readonly stack?: boolean;
  /** Horizontal bars swap the band scale onto y. */
  readonly orientation?: "vertical" | "horizontal";
  readonly grid?: "none" | "x" | "y" | "both";
  readonly annotations?: readonly AnnotationSpec[];
  /** Value labels above bars / beside points: always, never, or when there is room (per layout). */
  readonly valueLabels?: boolean | "auto";
}

export interface HeatmapPlotSpec extends PlotSpecBase {
  readonly heatmap: HeatmapSpec;
  readonly series?: never;
  readonly x?: never;
  readonly y?: never;
  readonly stack?: never;
  readonly orientation?: never;
  readonly grid?: never;
  readonly annotations?: never;
  readonly valueLabels?: never;
}

/** Advanced IR: Cartesian series and heatmaps are intentionally mutually exclusive. */
export type PlotSpec = CartesianPlotSpec | HeatmapPlotSpec;

// ---------------------------------------------------------------------------------------------
// Compiler contract
// ---------------------------------------------------------------------------------------------

export type MotionPreset = "auto" | "none";

/** Options shared by both entry points: id prefix and motion preset. */
export interface CompileOptions {
  /** Stable id prefix for every generated node (default "plot"). */
  readonly id?: string;
  /**
   * "auto" returns mark-appropriate relative tracks (rise, draw, pop, or sweep); "none" returns
   * no tracks.
   */
  readonly motion?: MotionPreset;
  /** Duration of the motion preset in milliseconds (default 900). */
  readonly duration?: number;
  /** Serializable curve used by generated tracks (default "easeOut"). */
  readonly easing?: Easing;
}

// ---------------------------------------------------------------------------------------------
// Generic typed API: rows + field-name channels
// ---------------------------------------------------------------------------------------------

/** A field name of the row type; misspelled names fail to compile. */
export type FieldName<Row> = keyof Row & string;

type Present<T> = Exclude<T, null | undefined>;
type FieldNameFor<Row, Value> = string extends keyof Row
  ? string
  : {
      [Key in keyof Row]-?: [Present<Row[Key]>] extends [never]
        ? never
        : Present<Row[Key]> extends Value
          ? Key
          : never;
    }[keyof Row] &
      string;

/** Fields whose present values are numbers (null/undefined represent missing data). */
export type NumericFieldName<Row> = FieldNameFor<Row, number>;
/** Fields usable as categorical positions. */
export type CategoryFieldName<Row> = FieldNameFor<Row, string | number>;
/** Fields usable to split tidy data into series. */
export type SeriesFieldName<Row> = FieldNameFor<Row, string | number | boolean>;
/** Fields usable as inspection labels. */
export type LabelFieldName<Row> = FieldNameFor<Row, string>;
/** Fields whose values are valid core paint tokens. */
export type ToneFieldName<Row> = FieldNameFor<Row, Paint>;

/** Y channel: one field, or several fields for wide data (one series per field). */
export type YChannel<Row> = NumericFieldName<Row> | readonly NumericFieldName<Row>[];

/** Typed field-name channels of the generic `plot(rows, options)` form. */
export interface Channels<Row extends object = Record<string, unknown>> {
  /** Category (strings → band scale) or numeric position (numbers → linear scale). */
  readonly x?: CategoryFieldName<Row>;
  /** Value field, or several value fields for wide data (one series per field). */
  readonly y?: YChannel<Row>;
  /** Long/tidy data: one series per distinct value, frozen in first-appearance order. */
  readonly series?: SeriesFieldName<Row>;
  /** Per-datum paint (a Paint token per row). */
  readonly tone?: ToneFieldName<Row>;
  /** Per-datum inspection label. */
  readonly label?: LabelFieldName<Row>;
}

export type MarkKind =
  "bar" | "grouped-bar" | "stacked-bar" | "line" | "area" | "dot" | "sparkline" | "heatmap";

/** Style knobs accepted by the cartesian mark helpers. */
export interface MarkStyle {
  readonly tone?: Paint;
  readonly fill?: FillPaint;
  readonly fillOpacity?: number;
  readonly curve?: "linear" | "monotone" | "step";
  readonly dash?: "solid" | "dashed" | "dotted";
  readonly pointRadius?: number;
  readonly interactive?: "marks" | "series" | "none";
  /** Band padding for bar/dot marks (0..0.9). */
  readonly padding?: number;
}

export interface CartesianMark extends MarkStyle {
  readonly kind: Exclude<MarkKind, "heatmap">;
}

/** Heatmap channels: rows × columns from long data. */
export interface HeatmapChannels<
  Row extends string = string,
  Column extends string = string,
  Value extends string = string,
> {
  readonly row: Row;
  readonly column: Column;
  readonly value: Value;
  readonly tone?: Paint;
  readonly negativeTone?: Paint;
  readonly cellLabels?: Responsive<boolean>;
  readonly format?: NumberFormatSpec;
  readonly domain?: readonly [number, number] | "auto";
}

export interface HeatmapMark<
  Row extends string = string,
  Column extends string = string,
  Value extends string = string,
> extends HeatmapChannels<Row, Column, Value> {
  readonly kind: "heatmap";
}

export type MarkSpec<Row extends object = Record<string, unknown>> =
  | CartesianMark
  | HeatmapMark<CategoryFieldName<Row>, CategoryFieldName<Row>, NumericFieldName<Row>>;

/** Axis configuration of the generic form: `AxisSpec` plus the scale knobs. */
export interface AxisOptions extends AxisSpec {
  readonly type?: "linear" | "band";
  readonly domain?: readonly [number, number] | readonly CategoryKey[] | "auto" | "auto-zero";
  readonly nice?: boolean;
  readonly ticks?: Responsive<number> | readonly number[];
  /** Band padding (0..0.9). */
  readonly padding?: number;
}

/** Chart-level options shared by cartesian and heatmap plots. */
export interface ChartOptions {
  readonly title?: string;
  readonly description?: string;
  readonly axes?: { readonly x?: AxisOptions | false; readonly y?: AxisOptions | false };
  readonly legend?: false | { readonly position?: "top" | "bottom" };
  readonly minimal?: boolean;
  readonly height?: Responsive<number>;
}

/**
 * Cartesian options of the generic form: `y` is required (a field or several fields), `x`
 * defaults to the row order when omitted at runtime but is normally given. `marks` accepts one
 * helper or an ordered list of layers (`[area(), line(), dot()]`) that share scales, ticks, and
 * handles; the first layer is drawn underneath.
 */
export interface CartesianPlotOptions<
  Row extends object = Record<string, unknown>,
  Y extends YChannel<Row> = YChannel<Row>,
  S extends SeriesFieldName<Row> | undefined = SeriesFieldName<Row> | undefined,
>
  extends ChartOptions, CompileOptions {
  readonly x?: CategoryFieldName<Row>;
  readonly y: Y;
  readonly series?: S;
  readonly tone?: ToneFieldName<Row>;
  readonly label?: LabelFieldName<Row>;
  /** Per-series signal bindings, keyed by inferred wide-data fields or tidy series values. */
  readonly seriesBindings?: Partial<Record<SeriesKeys<Y, S>, SeriesBindings>>;
  readonly annotations?: readonly AnnotationSpec[];
  readonly grid?: "none" | "x" | "y" | "both";
  readonly valueLabels?: boolean | "auto";
  readonly orientation?: "vertical" | "horizontal";
  /** Stack bar/area series (equivalent to `marks: stackedBar()`). */
  readonly stack?: boolean;
  /** Mark helper(s): `bar()`, `[area(), line(), dot()]`, … (default: bars for band x, line for numeric x). */
  readonly marks?: CartesianMark | readonly CartesianMark[];
}

/** Heatmap options of the generic form: `marks: heatmap({ row, column, value })` is required. */
export interface HeatmapPlotOptions<Row extends object = Record<string, unknown>>
  extends ChartOptions, CompileOptions {
  readonly marks:
    | HeatmapMark<CategoryFieldName<Row>, CategoryFieldName<Row>, NumericFieldName<Row>>
    | readonly [HeatmapMark<CategoryFieldName<Row>, CategoryFieldName<Row>, NumericFieldName<Row>>];
  readonly x?: undefined;
  readonly y?: undefined;
  readonly series?: undefined;
  readonly tone?: undefined;
  readonly label?: undefined;
}

/**
 * Options of the primary generic form `plot(rows, options)`. Channels are typed field names of
 * `Row`; `Y` and `S` capture the literal `y`/`series` channels so `handles.series` is keyed by
 * the inferred series names. Missing required channels are compile-time errors.
 */
export type PlotOptions<
  Row extends object = Record<string, unknown>,
  Y extends YChannel<Row> = YChannel<Row>,
  S extends SeriesFieldName<Row> | undefined = SeriesFieldName<Row> | undefined,
> = CartesianPlotOptions<Row, Y, S> | HeatmapPlotOptions<Row>;

/** Series keys inferred from the `y`/`series` channels of the generic form. */
export type SeriesKeys<Y, S> = S extends string
  ? string
  : Y extends readonly (infer K extends string)[]
    ? K
    : Y extends string
      ? Y
      : string;

// ---------------------------------------------------------------------------------------------
// Handles
// ---------------------------------------------------------------------------------------------

/**
 * Generated ids of one series so authors never spell them by hand. A series may be drawn by
 * several layers (`marks: [bar(), line()]`); every layer kind has its own id namespace:
 * bars `${p}:bar:${s}:${i}`, dots `${p}:point:${s}:${i}`, line `${p}:line:${s}` (further
 * segments `${p}:line:${s}:${k}`), area `${p}:area:${s}`, value labels `${p}:label:${s}:${i}`.
 */
export interface SeriesHandle {
  /** Id-safe series key used inside node ids. */
  readonly id: string;
  /** The focus group `${p}:series:${id}`. */
  readonly group: string;
  /** Datum marks in reading order: bars first, then dots (or heatmap cells). */
  readonly marks: readonly string[];
  /** Bar rect ids in category order. */
  readonly bars: readonly string[];
  /** Point circle ids in data order (dot layers, or line/area vertices). */
  readonly dots: readonly string[];
  /** Value label ids in reading order (empty unless value labels are enabled). */
  readonly labels: readonly string[];
  /** First line polyline (lines, areas, sparklines). */
  readonly line?: string;
  /** Every line segment (nulls split lines into segments). */
  readonly lines?: readonly string[];
  /** Area fill polyline (first segment). */
  readonly area?: string;
  /** Every area segment. */
  readonly areas?: readonly string[];
}

export interface PlotHandles<K extends string = string> {
  readonly root: string;
  readonly area: string;
  readonly series: Readonly<Record<K, SeriesHandle>>;
  /** Only axes emitted in at least one responsive layout are present. */
  readonly axes: { readonly x?: string; readonly y?: string };
  readonly legend?: string;
  readonly title?: string;
  readonly grid?: string;
  /** Successfully emitted annotation ids, preserving their relative spec order. */
  readonly annotations: readonly string[];
  /** Heatmap cell ids as `cells[row][column]`. */
  readonly cells?: readonly (readonly string[])[];
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
export interface PlotResult<K extends string = string> {
  /** Fragment ready for figure()/defineScene: one root group node plus relative motion tracks. */
  readonly fragment: SceneFragment;
  /** Inferred stable ids (root, area, per-series groups/marks/lines, axes, legend, cells). */
  readonly handles: PlotHandles<K>;
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

/** Default plot-area heights for `minimal` (sparkline) plots. */
export const SPARKLINE_HEIGHTS: Readonly<Record<LayoutName, number>> = {
  wide: 48,
  compact: 40,
  narrow: 32,
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
