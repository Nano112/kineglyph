/**
 * The compiler: `PlotSpec` → `SceneFragment`. Everything is emitted as ordinary core primitives
 * (a stack of title / legend / axis-title, a row of [y-axis column, coordinates area], and a
 * bottom-axis strip); layout differences are expressed with responsive values so one fragment
 * serves every layout and every theme.
 */
import {
  LAYOUT_NAMES,
  defaultTheme,
  measureText,
  pick,
  type Anchor,
  type CalloutMark,
  type Easing,
  type GroupNode,
  type FillPaint,
  type InspectInfo,
  type Insets,
  type LayoutName,
  type LegendItem,
  type NodeBindings,
  type Paint,
  type RectMark,
  type Responsive,
  type SceneNode,
  type SemanticTextStyle,
  type TextFont,
  type TextMark,
  type TimelineKeyframe,
  type TimelineTrack,
} from "@kineglyph/core";
import { normaliseSeriesData, uniqueSlugs, type Point } from "./data.js";
import {
  bandScale,
  clamp,
  formatNumber,
  linearScale,
  niceTicks,
  resolveDomain,
  stackSeries,
  tickStep,
  type LinearScale,
  type StackSegment,
} from "./scales.js";
import {
  PLOT_HEIGHTS,
  PLOT_TONES,
  SPARKLINE_HEIGHTS,
  type AnnotationSpec,
  type AxisSpec,
  type CategoryKey,
  type CompileOptions,
  type HeatmapSpec,
  type MotionPreset,
  type NumberFormatSpec,
  type PlotDiagnostic,
  type PlotHandles,
  type PlotResult,
  type PlotSpec,
  type SeriesHandle,
  type SeriesBindings,
  type SeriesSpec,
  type ValueLabelOptions,
} from "./types.js";

// ---------------------------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------------------------

const DEFAULT_ID = "plot";
const DEFAULT_DURATION = 900;
/** Gap between the plot edge and its tick labels. */
const TICK_GAP = 8;
/** Inset of the plot content box on sides without an axis (point radii, label overhang). */
const INSET = 12;
const RIGHT_INSET = 16;
const LEFT_MIN = 28;
const LEFT_MAX: Readonly<Record<LayoutName, number>> = { wide: 200, compact: 140, narrow: 100 };
/** Safety factor applied to default-theme text estimates (product themes use wider fonts). */
const ESTIMATE = 1.25;
const LINE_HEIGHT = 18;
const AXIS_TITLE_HEIGHT = 20;
/** Conservative plot-area widths per layout used for label thinning decisions. */
const PLOT_WIDTH_ESTIMATE: Readonly<Record<LayoutName, number>> = {
  wide: 800,
  compact: 460,
  narrow: 250,
};
/** Maximum category labels shown per layout before thinning (band axes). */
const LABEL_BUDGET: Readonly<Record<LayoutName, number>> = { wide: 16, compact: 8, narrow: 4 };
/** Above this many marks a series defaults to series-level interaction. */
export const MARK_INTERACTIVE_CAP = 60;
export const CELL_INTERACTIVE_CAP = 144;
/** Above this many marks per series, motion targets the series group instead of every mark. */
const MOTION_MARK_CAP = 200;
const RAMP_STEPS = 8;
const RAMP_MIN_OPACITY = 0.15;
const DEFAULT_POINT_RADIUS = 4;
const DEFAULT_TICKS = 5;

// ---------------------------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------------------------

type ByLayout<T> = Readonly<Record<LayoutName, T>>;

function byLayout<T>(fn: (layout: LayoutName) => T): ByLayout<T> {
  return { wide: fn("wide"), compact: fn("compact"), narrow: fn("narrow") };
}

function anyLayout(values: ByLayout<boolean>): boolean {
  return values.wide || values.compact || values.narrow;
}

/** Collapses a per-layout map into the smallest equivalent responsive value. */
function responsive<T>(values: ByLayout<T>): Responsive<T> {
  const key = (value: T): string => JSON.stringify(value);
  if (key(values.wide) === key(values.compact) && key(values.compact) === key(values.narrow))
    return values.wide;
  const out: { wide?: T; compact?: T; narrow?: T } = { wide: values.wide };
  if (key(values.compact) !== key(values.wide)) out.compact = values.compact;
  if (key(values.narrow) !== key(values.compact)) out.narrow = values.narrow;
  return out;
}

/** Responsive hidden flag; undefined when visible everywhere. */
function hiddenFlag(values: ByLayout<boolean>): Responsive<boolean> | undefined {
  if (!anyLayout(values)) return undefined;
  if (values.wide && values.compact && values.narrow) return true;
  const out: { wide?: boolean; compact?: boolean; narrow?: boolean } = {};
  if (values.wide) out.wide = true;
  if (values.compact !== values.wide) out.compact = values.compact;
  if (values.narrow !== values.compact) out.narrow = values.narrow;
  return out;
}

function hiddenProp(values: ByLayout<boolean>): { hidden?: Responsive<boolean> } {
  const flag = hiddenFlag(values);
  return flag === undefined ? {} : { hidden: flag };
}

function pickOr<T>(value: Responsive<T> | undefined, layout: LayoutName, fallback: T): T {
  return pick(value, layout) ?? fallback;
}

/** Fraction → percent length string, rounded to 4 decimals (deterministic, no exponent). */
export function pct(fraction: number): `${number}%` {
  const value = Math.round(clamp(fraction, 0, 1) * 1e6) / 1e4;
  return `${value}%`;
}

function frac(value: number): number {
  const rounded = Math.round(value * 1e6) / 1e6;
  return Object.is(rounded, -0) ? 0 : rounded;
}

function fontFor(style: SemanticTextStyle): TextFont {
  const token = defaultTheme.typography[style];
  return {
    family: token.family,
    size: token.size,
    weight: token.weight,
    lineHeight: token.lineHeight,
    ...(token.letterSpacing === undefined ? {} : { letterSpacing: token.letterSpacing }),
  };
}

const CAPTION_FONT = fontFor("caption");

/** Conservative width estimate for caption text (default theme × safety factor). */
export function estimateTextWidth(text: string): number {
  return measureText(text, CAPTION_FONT) * ESTIMATE;
}

function toneAt(index: number): Paint {
  return PLOT_TONES[index % PLOT_TONES.length] ?? "chart1";
}

function plural(count: number, noun: string, pluralNoun = `${noun}s`): string {
  return `${count} ${count === 1 ? noun : pluralNoun}`;
}

/** Positive stagger that fits `count` starts inside `window` ms (≤ `max` each). */
function stagger(count: number, window: number, max: number): number {
  if (count <= 1) return 0;
  return Math.min(max, window / (count - 1));
}

function keyframes(
  start: number,
  end: number,
  from: number,
  to: number,
  easing: Easing = "easeOut",
): TimelineKeyframe[] {
  const frames: TimelineKeyframe[] = [];
  const begin = Math.round(start * 1000) / 1000;
  const finish = Math.round(Math.max(end, start + 1) * 1000) / 1000;
  if (begin > 0) frames.push({ time: 0, value: from });
  frames.push({ time: begin, value: from });
  frames.push({ time: finish, value: to, easing });
  return frames;
}

function track(
  target: string,
  property: TimelineTrack["property"],
  frames: TimelineKeyframe[],
): TimelineTrack {
  return { id: `${target}:${property}`, target, property, keyframes: frames };
}

/** Anchor that keeps a 1px line inside the box at the edges. */
function lineAnchor(position: number, along: "horizontal" | "vertical"): Anchor {
  if (along === "horizontal") return position >= 1 - 1e-9 ? "bottom-left" : "top-left";
  return position >= 1 - 1e-9 ? "top-right" : "top-left";
}

function gridLine(
  id: string,
  position: number,
  along: "horizontal" | "vertical",
  hidden: Responsive<boolean> | undefined,
  tone: Paint = "border",
): RectMark {
  return {
    id,
    type: "rect",
    ...(along === "horizontal"
      ? {
          position: { x: 0, y: frac(position), anchor: lineAnchor(position, along) },
          width: "100%",
          height: 1,
        }
      : {
          position: { x: frac(position), y: 0, anchor: lineAnchor(position, along) },
          width: 1,
          height: "100%",
        }),
    fill: tone,
    stroke: "none",
    radius: 0,
    ...(hidden === undefined ? {} : { hidden }),
  };
}

function coordinatesLayer(id: string, children: SceneNode[], allowOverflow = false): GroupNode {
  return {
    id,
    type: "group",
    layout: "coordinates",
    position: { x: 0, y: 0 },
    width: "100%",
    height: "100%",
    ...(allowOverflow ? { allowOverflow: true } : {}),
    children,
  };
}

// ---------------------------------------------------------------------------------------------
// Models
// ---------------------------------------------------------------------------------------------

interface AxisTick {
  /** Position along the axis as a fraction of the plot edge (0 = left / top). */
  readonly position: number;
  readonly text: string;
  readonly value: number | string;
}

interface AxisModel {
  readonly channel: "x" | "y";
  readonly side: "bottom" | "left";
  readonly kind: "linear" | "band";
  readonly title: string | undefined;
  readonly shown: ByLayout<boolean>;
  /** Ticks per layout (label thinning applied later). */
  readonly ticks: ByLayout<readonly AxisTick[]>;
  readonly labelEvery: Responsive<number> | undefined;
  /** Gutter width in px when the axis is on the left. */
  readonly gutter: ByLayout<number>;
}

interface Layer {
  readonly spec: SeriesSpec;
  readonly mark: "bar" | "line" | "area" | "point";
  readonly tone: Paint;
  readonly fill: FillPaint | undefined;
  readonly fillOpacity: number | undefined;
  readonly points: readonly Point[];
  readonly pointRadius: number;
}

interface Series {
  /** Series key as given in the spec (handle key). */
  readonly key: string;
  /** Id-safe key used in node ids. */
  readonly id: string;
  readonly index: number;
  readonly label: string;
  readonly description: string | undefined;
  readonly tone: Paint;
  readonly layers: readonly Layer[];
  /** Points of the first layer (used for summaries and annotations). */
  readonly points: readonly Point[];
  readonly interactive: "marks" | "series" | "none";
  readonly bind: SeriesBindings | undefined;
}

interface Context {
  readonly p: string;
  readonly spec: PlotSpec;
  readonly diagnostics: PlotDiagnostic[];
  readonly minimal: boolean;
  readonly horizontal: boolean;
  /** Plot-area (inner) heights per layout. */
  readonly heights: ByLayout<number>;
  readonly duration: number;
  readonly motion: MotionPreset;
  readonly easing: Easing;
}

// ---------------------------------------------------------------------------------------------
// Entry
// ---------------------------------------------------------------------------------------------

export function compilePlot(spec: PlotSpec, options: CompileOptions = {}): PlotResult {
  const p = options.id === undefined || options.id.length === 0 ? DEFAULT_ID : options.id;
  const diagnostics: PlotDiagnostic[] = [];
  const minimal = spec.minimal === true;
  const heights = byLayout((layout) =>
    Math.max(
      8,
      pick(spec.height, layout) ?? (minimal ? SPARKLINE_HEIGHTS[layout] : PLOT_HEIGHTS[layout]),
    ),
  );
  const context: Context = {
    p,
    spec,
    diagnostics,
    minimal,
    horizontal: spec.orientation === "horizontal",
    heights,
    duration: Math.max(1, options.duration ?? DEFAULT_DURATION),
    motion: options.motion ?? "auto",
    easing: options.easing ?? "easeOut",
  };
  return spec.heatmap !== undefined
    ? compileHeatmap(context, spec.heatmap)
    : compileCartesian(context);
}

// ---------------------------------------------------------------------------------------------
// Series preparation (layers merged by series id)
// ---------------------------------------------------------------------------------------------

function markOf(spec: SeriesSpec): Layer["mark"] {
  switch (spec.mark) {
    case "bar":
      return "bar";
    case "line":
      return "line";
    case "area":
      return "area";
    default:
      return "point";
  }
}

function prepareSeries(context: Context): Series[] {
  const specs = context.spec.series ?? [];
  const order: string[] = [];
  const grouped = new Map<string, SeriesSpec[]>();
  for (const spec of specs) {
    const list = grouped.get(spec.id);
    if (list === undefined) {
      grouped.set(spec.id, [spec]);
      order.push(spec.id);
    } else list.push(spec);
  }
  const ids = uniqueSlugs(order);
  return order.map((key, index) => {
    const specsForKey = grouped.get(key) ?? [];
    const layers: Layer[] = [];
    const seenKinds = new Set<Layer["mark"]>();
    const tone = specsForKey[0]?.tone ?? toneAt(index);
    for (const spec of specsForKey) {
      const mark = markOf(spec);
      if (seenKinds.has(mark)) {
        context.diagnostics.push({
          severity: "error",
          code: "duplicate-layer",
          message: `series ${key} declares the ${mark} mark twice; the later layer was skipped`,
        });
        continue;
      }
      seenKinds.add(mark);
      layers.push({
        spec,
        mark,
        tone: spec.tone ?? tone,
        fill: spec.fill,
        fillOpacity: spec.fillOpacity,
        points: normaliseSeriesData(spec.data, spec.id, context.diagnostics),
        pointRadius: Math.max(0, spec.pointRadius ?? (context.minimal ? 0 : DEFAULT_POINT_RADIUS)),
      });
    }
    const first = layers[0];
    const primary =
      layers.find((layer) => layer.mark === "bar") ??
      layers.find((layer) => layer.mark === "point") ??
      first;
    const defaultInteractive: Series["interactive"] =
      primary !== undefined && (primary.mark === "bar" || primary.mark === "point")
        ? "marks"
        : "series";
    const requested =
      specsForKey.find((spec) => spec.interactive !== undefined)?.interactive ?? defaultInteractive;
    const maxMarks = Math.max(0, ...layers.map((layer) => layer.points.length));
    const interactive =
      requested === "marks" && maxMarks > MARK_INTERACTIVE_CAP ? "series" : requested;
    if (requested === "marks" && interactive === "series")
      context.diagnostics.push({
        severity: "warning",
        code: "interactive-cap",
        message: `series ${key} has ${maxMarks} marks; inspecting the series as a whole (cap ${MARK_INTERACTIVE_CAP})`,
      });
    const binding = <Key extends keyof SeriesBindings>(key: Key): string | undefined =>
      specsForKey.find((spec) => spec.bind?.[key] !== undefined)?.bind?.[key];
    const hidden = binding("hidden");
    const opacity = binding("opacity");
    const highlight = binding("highlight");
    const bind: SeriesBindings = {
      ...(hidden === undefined ? {} : { hidden }),
      ...(opacity === undefined ? {} : { opacity }),
      ...(highlight === undefined ? {} : { highlight }),
    };
    return {
      key,
      id: ids[index] ?? `series-${index + 1}`,
      index,
      label: specsForKey[0]?.label ?? key,
      description: specsForKey.find((spec) => spec.description !== undefined)?.description,
      tone,
      layers,
      points: first?.points ?? [],
      interactive,
      bind: Object.keys(bind).length === 0 ? undefined : bind,
    };
  });
}

function categoryOrder(
  series: readonly Series[],
  explicit: readonly CategoryKey[] | undefined,
): string[] {
  if (explicit !== undefined) return explicit.map(String);
  const seen = new Set<string>();
  const order: string[] = [];
  for (const entry of series)
    for (const layer of entry.layers)
      for (const point of layer.points) {
        const key = String(point.x);
        if (seen.has(key)) continue;
        seen.add(key);
        order.push(key);
      }
  return order;
}

// ---------------------------------------------------------------------------------------------
// Linear axis setup
// ---------------------------------------------------------------------------------------------

interface LinearAxisSetup {
  readonly domain: readonly [number, number];
  readonly scale: LinearScale;
  readonly ticks: ByLayout<number[]>;
  readonly step: number;
}

function tickCounts(
  spec: { readonly ticks?: Responsive<number> | readonly number[] } | undefined,
): {
  counts: ByLayout<number>;
  explicit: readonly number[] | undefined;
} {
  const ticks = spec?.ticks;
  if (Array.isArray(ticks))
    return { counts: byLayout(() => DEFAULT_TICKS), explicit: ticks as readonly number[] };
  const value = ticks as Responsive<number> | undefined;
  return {
    counts: byLayout((layout) => Math.max(2, Math.floor(pickOr(value, layout, DEFAULT_TICKS)))),
    explicit: undefined,
  };
}

function setupLinearAxis(
  values: readonly (number | null)[],
  spec: Extract<PlotSpec["x"], { type: "linear" }> | undefined,
  headroom: number,
): LinearAxisSetup {
  const { counts, explicit } = tickCounts(spec);
  const maxCount = Math.max(counts.wide, counts.compact, counts.narrow);
  const domain = resolveDomain(values, {
    domain: spec?.domain,
    nice: spec?.nice ?? true,
    ticks: maxCount,
    headroom,
    ...(explicit === undefined ? {} : { include: explicit }),
  });
  const scale = linearScale(domain, [0, 1]);
  const inRange = (tick: number): boolean => tick >= domain[0] - 1e-9 && tick <= domain[1] + 1e-9;
  const ticks = byLayout((layout) =>
    explicit === undefined
      ? niceTicks(domain[0], domain[1], counts[layout])
      : explicit.filter((tick) => Number.isFinite(tick) && inRange(tick)),
  );
  const step =
    ticks.wide.length >= 2
      ? Math.abs((ticks.wide[1] ?? 0) - (ticks.wide[0] ?? 0))
      : tickStep(domain[0], domain[1], counts.wide);
  return { domain, scale, ticks, step };
}

/** Thinning factor for evenly spaced labels: max(count budget, width rule). */
export function labelEvery(
  count: number,
  maxLabelWidth: number,
  spanPx: number,
  budget: number,
): number {
  if (count <= 1) return 1;
  const byCount = count > budget ? Math.ceil(count / budget) : 1;
  const spacing = spanPx / count;
  const byWidth = Math.max(1, Math.ceil((maxLabelWidth + 6) / Math.max(1, spacing)));
  return Math.max(byCount, byWidth);
}

// ---------------------------------------------------------------------------------------------
// Cartesian charts (bars, lines, areas, points)
// ---------------------------------------------------------------------------------------------

interface Rect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

function compileCartesian(context: Context): PlotResult {
  const { p, spec, diagnostics, horizontal } = context;
  const series = prepareSeries(context);
  const allLayers = series.flatMap((entry) => entry.layers);
  const xSpec = spec.x;
  const ySpec = spec.y;
  const anyStringX = allLayers.some((layer) =>
    layer.points.some((point) => typeof point.x === "string"),
  );
  const anyBars = allLayers.some((layer) => layer.mark === "bar");
  const xKind: "linear" | "band" = xSpec?.type ?? (anyStringX || anyBars ? "band" : "linear");
  const stacked = spec.stack === true;
  const valueLabelOptions: ValueLabelOptions | undefined =
    typeof spec.valueLabels === "object" ? spec.valueLabels : undefined;
  const valueLabelsAt = (layout: LayoutName): boolean | "auto" =>
    context.minimal
      ? false
      : valueLabelOptions === undefined
        ? typeof spec.valueLabels === "object"
          ? false
          : (spec.valueLabels ?? false)
        : pickOr(valueLabelOptions.show, layout, true);
  const anyPoints = allLayers.some((layer) => layer.mark === "point" || layer.pointRadius > 0);
  const maxRadius = Math.max(0, ...allLayers.map((layer) => layer.pointRadius));

  // ---- categories (band x) ------------------------------------------------------------------
  const categories =
    xKind === "band"
      ? categoryOrder(series, xSpec?.type === "band" ? xSpec.domain : undefined)
      : [];
  const bandPadding = xSpec?.type === "band" ? clamp(xSpec.padding ?? 0.25, 0, 0.9) : 0.25;
  const xBand = xKind === "band" ? bandScale(categories, [0, 1], bandPadding) : undefined;
  if (xKind === "band")
    for (const layer of allLayers) {
      const seen = new Set<string>();
      let duplicates = 0;
      for (const point of layer.points) {
        const key = String(point.x);
        if (seen.has(key)) duplicates += 1;
        seen.add(key);
      }
      if (duplicates > 0)
        diagnostics.push({
          severity: "warning",
          code: "duplicate-category",
          message: `series ${layer.spec.id} repeats ${plural(duplicates, "category", "categories")}; the last value wins`,
        });
    }

  // ---- stacking ---------------------------------------------------------------------------------
  const valuesByCategory = (layer: Layer): (number | null)[] => {
    const map = new Map<string, number | null>();
    for (const point of layer.points) map.set(String(point.x), point.y);
    return categories.map((category) => map.get(category) ?? null);
  };
  const stackable =
    stacked && xKind === "band"
      ? allLayers.filter((layer) => layer.mark === "bar" || layer.mark === "area")
      : [];
  const stackSegments = new Map<Layer, readonly (StackSegment | null)[]>();
  if (stackable.length > 0) {
    const segments = stackSeries(stackable.map(valuesByCategory));
    stackable.forEach((layer, index) => stackSegments.set(layer, segments[index] ?? []));
  }

  // ---- value (y) axis -----------------------------------------------------------------------------
  const yLinearSpec = ySpec?.type === "linear" ? ySpec : undefined;
  const yValues: (number | null)[] = [];
  for (const layer of allLayers) {
    const segments = stackSegments.get(layer);
    if (segments !== undefined) {
      for (const segment of segments)
        if (segment !== null) yValues.push(segment.start, segment.end);
    } else for (const point of layer.points) yValues.push(point.y);
  }
  const labelsOnNarrow = valueLabelsAt("narrow") !== false;
  const headroomHeight = context.heights[labelsOnNarrow ? "narrow" : "compact"];
  const headroom = !anyLayout(byLayout((layout) => valueLabelsAt(layout) !== false))
    ? 0
    : horizontal
      ? Math.min(
          0.4,
          (Math.max(
            0,
            ...yValues.map((value) => (value === null ? 0 : estimateTextWidth(String(value)))),
          ) +
            12) /
            PLOT_WIDTH_ESTIMATE[labelsOnNarrow ? "narrow" : "compact"],
        )
      : Math.min(0.4, (LINE_HEIGHT + (anyPoints ? maxRadius + 4 : 4)) / headroomHeight);
  const yAxis = setupLinearAxis(yValues, yLinearSpec, headroom);
  const yFormatSpec: NumberFormatSpec = {
    ...(yLinearSpec?.format ?? {}),
    ...(spec.axes?.y !== false ? (spec.axes?.y?.format ?? {}) : {}),
  };
  const yTickFormat = (value: number): string =>
    formatNumber(value, { ...yFormatSpec, step: yAxis.step });
  const valueFormatSpec: NumberFormatSpec = {
    ...yFormatSpec,
    ...(valueLabelOptions?.format ?? {}),
  };
  const valueFormat = (value: number): string =>
    value === 0 && valueLabelOptions?.zero !== undefined
      ? valueLabelOptions.zero
      : formatNumber(value, valueFormatSpec);

  // ---- position (x) axis when linear -----------------------------------------------------------
  const xLinearSpec = xSpec?.type === "linear" ? xSpec : undefined;
  const xValues: number[] = [];
  if (xKind === "linear")
    for (const layer of allLayers)
      for (const point of layer.points) if (typeof point.x === "number") xValues.push(point.x);
  const xAxisLinear =
    xKind === "linear"
      ? setupLinearAxis(
          xValues,
          { ...(xLinearSpec ?? { type: "linear" }), domain: xLinearSpec?.domain ?? "auto" },
          0,
        )
      : undefined;
  const xFormatSpec: NumberFormatSpec = {
    ...(xLinearSpec?.format ?? {}),
    ...(spec.axes?.x !== false ? (spec.axes?.x?.format ?? {}) : {}),
  };
  const xTickFormat = (value: number): string =>
    formatNumber(value, { ...xFormatSpec, step: xAxisLinear?.step ?? 1 });
  const xDomain: readonly CategoryKey[] | readonly [number, number] =
    xKind === "band" ? categories : (xAxisLinear?.domain ?? [0, 1]);

  // ---- channel → screen mapping ---------------------------------------------------------------
  const u = (x: CategoryKey | number): number | undefined => {
    if (xBand !== undefined) return xBand.band(String(x))?.center;
    return typeof x === "number" ? xAxisLinear?.scale.map(x) : undefined;
  };
  const v = (y: number): number => yAxis.scale.map(y);
  const toPoint = (uu: number, vv: number): { x: number; y: number } =>
    horizontal ? { x: vv, y: xKind === "band" ? uu : 1 - uu } : { x: uu, y: 1 - vv };
  const toRect = (u0: number, u1: number, v0: number, v1: number): Rect => {
    const uMin = Math.min(u0, u1);
    const uMax = Math.max(u0, u1);
    const vMin = Math.min(v0, v1);
    const vMax = Math.max(v0, v1);
    if (horizontal) {
      const top = xKind === "band" ? uMin : 1 - uMax;
      return { x: vMin, y: top, w: vMax - vMin, h: uMax - uMin };
    }
    return { x: uMin, y: 1 - vMax, w: uMax - uMin, h: vMax - vMin };
  };
  const baselineValue = clamp(0, yAxis.domain[0], yAxis.domain[1]);

  // ---- axis models -----------------------------------------------------------------------------
  const axesSpec = spec.axes ?? {};
  const xAxisSpec: AxisSpec | false = context.minimal ? false : (axesSpec.x ?? {});
  const yAxisSpec: AxisSpec | false = context.minimal ? false : (axesSpec.y ?? {});
  const bandTicks: AxisTick[] =
    xBand === undefined
      ? []
      : categories.map((category) => ({
          position: xBand.band(category)?.center ?? 0,
          text: category,
          value: category,
        }));
  const xTicks: ByLayout<readonly AxisTick[]> =
    xKind === "band"
      ? byLayout(() => bandTicks)
      : byLayout((layout) =>
          (xAxisLinear?.ticks[layout] ?? []).map((tick) => ({
            position: xAxisLinear?.scale.map(tick) ?? 0,
            text: xTickFormat(tick),
            value: tick,
          })),
        );
  const yTicks: ByLayout<readonly AxisTick[]> = byLayout((layout) =>
    yAxis.ticks[layout].map((tick) => ({
      position: yAxis.scale.map(tick),
      text: yTickFormat(tick),
      value: tick,
    })),
  );
  const shownFlags = (axis: AxisSpec | false): ByLayout<boolean> =>
    byLayout((layout) => axis !== false && !pickOr(axis.hidden, layout, false));
  const gutterFor = (ticks: ByLayout<readonly AxisTick[]>, band: boolean): ByLayout<number> =>
    byLayout((layout) => {
      const widest = Math.max(0, ...ticks[layout].map((tick) => estimateTextWidth(tick.text)));
      return Math.ceil(clamp(widest + TICK_GAP + 4, LEFT_MIN, band ? LEFT_MAX[layout] : 96));
    });
  const xAxisModel: AxisModel = {
    channel: "x",
    side: horizontal ? "left" : "bottom",
    kind: xKind,
    title: (xAxisSpec === false ? undefined : xAxisSpec.label) ?? xSpec?.label,
    shown: shownFlags(xAxisSpec),
    ticks: xTicks,
    labelEvery: xAxisSpec === false ? undefined : xAxisSpec.labelEvery,
    gutter: gutterFor(xTicks, xKind === "band"),
  };
  const yAxisModel: AxisModel = {
    channel: "y",
    side: horizontal ? "bottom" : "left",
    kind: "linear",
    title: (yAxisSpec === false ? undefined : yAxisSpec.label) ?? ySpec?.label,
    shown: shownFlags(yAxisSpec),
    ticks: yTicks,
    labelEvery: yAxisSpec === false ? undefined : yAxisSpec.labelEvery,
    gutter: gutterFor(yTicks, false),
  };
  const leftAxis = horizontal ? xAxisModel : yAxisModel;
  const bottomAxis = horizontal ? yAxisModel : xAxisModel;
  const axisIds = { x: `${p}:axis:x`, y: `${p}:axis:y` };

  // ---- plot content box insets ----------------------------------------------------------------
  const inset = context.minimal ? Math.max(3, maxRadius + 1) : Math.max(INSET, maxRadius + 2);
  const padTop = inset;
  const padRight = context.minimal ? inset : Math.max(RIGHT_INSET, maxRadius + 2);
  const padBottom = byLayout((layout) => (bottomAxis.shown[layout] ? 0 : inset));
  const padLeft = byLayout((layout) => (leftAxis.shown[layout] ? 0 : inset));
  const gutter = byLayout((layout) => (leftAxis.shown[layout] ? leftAxis.gutter[layout] : 0));
  const areaHeight = byLayout((layout) => context.heights[layout] + padTop + padBottom[layout]);

  // ---- layers inside the area ---------------------------------------------------------------------
  const areaChildren: SceneNode[] = [];
  const handlesSeries: Record<string, SeriesHandle> = {};
  const markIds = new Map<string, readonly string[]>();
  const grid = spec.grid ?? (context.minimal ? "none" : "auto");
  const gridForY = grid === "both" || grid === "y" || grid === "auto";
  const gridForX = grid === "both" || grid === "x";
  const gridNodes: SceneNode[] = [];
  const unionTicks = (ticks: ByLayout<number[]>): number[] =>
    [...new Set([...ticks.wide, ...ticks.compact, ...ticks.narrow])].sort((a, b) => a - b);
  if (grid !== "none") {
    if (gridForY) {
      unionTicks(yAxis.ticks).forEach((tick, index) => {
        const hidden = hiddenFlag(byLayout((layout) => !yAxis.ticks[layout].includes(tick)));
        gridNodes.push(
          gridLine(
            `${p}:grid:${index}`,
            horizontal ? v(tick) : 1 - v(tick),
            horizontal ? "vertical" : "horizontal",
            hidden,
          ),
        );
      });
    }
    if (gridForX && xAxisLinear !== undefined) {
      unionTicks(xAxisLinear.ticks).forEach((tick, index) => {
        const hidden = hiddenFlag(byLayout((layout) => !xAxisLinear.ticks[layout].includes(tick)));
        gridNodes.push(
          gridLine(
            `${p}:grid:x:${index}`,
            horizontal ? 1 - xAxisLinear.scale.map(tick) : xAxisLinear.scale.map(tick),
            horizontal ? "horizontal" : "vertical",
            hidden,
          ),
        );
      });
    }
    if (yAxis.domain[0] < 0 && yAxis.domain[1] > 0)
      gridNodes.push(
        gridLine(
          `${p}:grid:zero`,
          horizontal ? v(0) : 1 - v(0),
          horizontal ? "vertical" : "horizontal",
          undefined,
          "textMuted",
        ),
      );
  }
  if (gridNodes.length > 0) areaChildren.push(coordinatesLayer(`${p}:grid`, gridNodes));

  // annotations
  const annotationIds: string[] = [];
  const seriesByKey = new Map(series.map((entry) => [entry.key, entry] as const));
  const annotationNodes = compileAnnotations(context, {
    annotations: spec.annotations ?? [],
    positionOfX: u,
    bandRangeOfX: (value) => {
      if (xBand !== undefined) {
        const band = xBand.band(String(value));
        return band === undefined ? undefined : { start: band.start, end: band.end };
      }
      const at = u(value);
      return at === undefined ? undefined : { start: at, end: at };
    },
    valueToV: (value) => (Number.isFinite(value) ? v(value) : undefined),
    toPoint,
    toRect,
    seriesByKey,
    pointOf: (entry, index) => {
      const layer = entry.layers[0];
      const point = layer?.points[index];
      if (layer === undefined || point === undefined || point.y === null) return undefined;
      const uu = u(point.x);
      if (uu === undefined) return undefined;
      const segment = stackSegments.get(layer)?.[categories.indexOf(String(point.x))];
      const vv = segment !== undefined && segment !== null ? v(segment.end) : v(point.y);
      return { ...toPoint(uu, vv), radius: layer.pointRadius };
    },
    ids: annotationIds,
  });
  areaChildren.push(...annotationNodes.under);

  // series
  const barLayerCount = allLayers.filter((layer) => layer.mark === "bar").length;
  const barSubScale =
    xBand !== undefined && barLayerCount > 1 && !stacked
      ? bandScale(
          series
            .filter((entry) => entry.layers.some((layer) => layer.mark === "bar"))
            .map((entry) => entry.id),
          [0, 1],
          0.1,
        )
      : undefined;
  const totalBars = barLayerCount * categories.length;
  const labelVisible = (marks: number, layout: LayoutName): boolean => {
    const mode = valueLabelsAt(layout);
    if (mode === true) return true;
    if (mode !== "auto") return false;
    if (layout === "narrow") return false;
    const budget = layout === "wide" ? 12 : 8;
    const total = layout === "wide" ? 24 : 12;
    return marks <= budget && Math.max(totalBars, marks) <= total;
  };
  const inspectCategoryLabel = xKind === "band" ? "Category" : "X";
  const valueLabelIds: string[] = [];
  const unit = yAxisModel.title === undefined ? "" : ` ${yAxisModel.title}`;

  for (const entry of series) {
    const children: SceneNode[] = [];
    const barIds: string[] = [];
    const dotIds: string[] = [];
    const labelIds: string[] = [];
    const lineIds: string[] = [];
    const areaIds: string[] = [];
    const marksInteractive = entry.interactive === "marks";
    const finite = entry.points.filter((point): point is Point & { y: number } => point.y !== null);
    const values = finite.map((point) => point.y);
    const min = values.length > 0 ? Math.min(...values) : undefined;
    const max = values.length > 0 ? Math.max(...values) : undefined;
    const seriesSummary =
      values.length === 0
        ? `${entry.label}: no data`
        : `${entry.label}: ${plural(values.length, "point")}, from ${valueFormat(min ?? 0)} to ${valueFormat(max ?? 0)}${unit}`;
    const seriesInspect: InspectInfo = {
      role: "Series",
      title: entry.label,
      summary: seriesSummary,
      fields: [
        { label: "Series", value: entry.label },
        { label: "Points", value: String(values.length) },
        ...(min === undefined || max === undefined
          ? []
          : [
              { label: "Min", value: valueFormat(min) },
              { label: "Max", value: valueFormat(max) },
            ]),
      ],
    };
    const datumLabel = (point: Point, valueText: string): string =>
      point.label ?? `${entry.label} · ${String(point.x)}: ${valueText}`;
    const datumInspect = (role: string, point: Point, valueText: string): InspectInfo => ({
      role,
      title: `${entry.label} · ${String(point.x)}`,
      fields: [
        { label: "Series", value: entry.label },
        { label: inspectCategoryLabel, value: String(point.x) },
        { label: "Value", value: valueText },
      ],
    });
    const interactiveProps = (
      point: Point,
      valueText: string,
      role: string,
      interactive: boolean,
    ): {
      readonly inspect: InspectInfo;
      readonly interactive?: boolean;
      readonly label?: string;
      readonly description?: string;
    } => ({
      inspect: datumInspect(role, point, valueText),
      ...(interactive
        ? {
            interactive: true,
            label: datumLabel(point, valueText),
            ...(point.description === undefined ? {} : { description: point.description }),
          }
        : {}),
    });
    const hasDotLayer = entry.layers.some((layer) => layer.mark === "point");
    const hasLineLayer = entry.layers.some((layer) => layer.mark === "line");
    let seriesInteractivePlaced = false;

    for (const layer of entry.layers) {
      const visualBind: NodeBindings | undefined =
        layer.spec.bind?.highlight === undefined
          ? undefined
          : { highlight: layer.spec.bind.highlight };
      const markCount =
        layer.mark === "bar" && xKind === "band" ? categories.length : layer.points.length;
      const labelsShown = byLayout((layout) => labelVisible(markCount, layout));
      const labelsHidden = hiddenFlag(byLayout((layout) => !labelsShown[layout]));
      const anyLabels = anyLayout(labelsShown);

      if (layer.mark === "bar" && xBand !== undefined) {
        const segments = stackSegments.get(layer);
        const byCategory = new Map<string, Point>();
        for (const point of layer.points) byCategory.set(String(point.x), point);
        categories.forEach((category, categoryIndex) => {
          const point = byCategory.get(category);
          if (point === undefined || point.y === null) return;
          const band = xBand.band(category);
          if (band === undefined) return;
          const segment = segments?.[categoryIndex] ?? null;
          const start = segment === null ? baselineValue : segment.start;
          const end = segment === null ? point.y : segment.end;
          let u0 = band.start;
          let u1 = band.end;
          const sub = barSubScale?.band(entry.id);
          if (sub !== undefined) {
            u0 = band.start + sub.start * band.width;
            u1 = band.start + sub.end * band.width;
          }
          const rect = toRect(u0, u1, v(start), v(end));
          const negative = end < start;
          const id = `${p}:bar:${entry.id}:${categoryIndex}`;
          const valueText = valueFormat(point.y);
          children.push({
            id,
            type: "rect",
            position: { x: frac(rect.x), y: frac(rect.y), anchor: "top-left" },
            width: pct(rect.w),
            height: pct(rect.h),
            fill: point.tone ?? layer.fill ?? layer.tone,
            stroke: "none",
            radius: layer.spec.radius ?? 2,
            ...(layer.spec.material === undefined ? {} : { material: layer.spec.material }),
            ...(layer.fillOpacity === undefined ? {} : { opacity: layer.fillOpacity }),
            revealAnchor: horizontal ? (negative ? "right" : "left") : negative ? "top" : "bottom",
            ...(visualBind === undefined ? {} : { bind: visualBind }),
            ...interactiveProps(point, valueText, "Bar", marksInteractive),
          });
          barIds.push(id);
          if (anyLabels && !stacked) {
            const labelId = `${p}:label:${entry.id}:${categoryIndex}`;
            children.push(
              valueLabelNode(
                labelId,
                valueText,
                rect,
                negative,
                horizontal,
                labelsHidden,
                valueLabelOptions,
              ),
            );
            labelIds.push(labelId);
          }
        });
      } else if (layer.mark === "bar") {
        // Bars on a linear x axis: thin bars centred on x.
        const width = Math.max(0.002, 0.6 / Math.max(1, layer.points.length));
        layer.points.forEach((point, index) => {
          if (point.y === null) return;
          const uu = u(point.x);
          if (uu === undefined) return;
          const rect = toRect(uu - width / 2, uu + width / 2, v(baselineValue), v(point.y));
          const negative = point.y < baselineValue;
          const id = `${p}:bar:${entry.id}:${index}`;
          const valueText = valueFormat(point.y);
          children.push({
            id,
            type: "rect",
            position: { x: frac(rect.x), y: frac(rect.y), anchor: "top-left" },
            width: pct(rect.w),
            height: pct(rect.h),
            fill: point.tone ?? layer.fill ?? layer.tone,
            stroke: "none",
            radius: layer.spec.radius ?? 2,
            ...(layer.spec.material === undefined ? {} : { material: layer.spec.material }),
            ...(layer.fillOpacity === undefined ? {} : { opacity: layer.fillOpacity }),
            revealAnchor: horizontal ? (negative ? "right" : "left") : negative ? "top" : "bottom",
            ...(visualBind === undefined ? {} : { bind: visualBind }),
            ...interactiveProps(point, valueText, "Bar", marksInteractive),
          });
          barIds.push(id);
          if (anyLabels) {
            const labelId = `${p}:label:${entry.id}:${index}`;
            children.push(
              valueLabelNode(
                labelId,
                valueText,
                rect,
                negative,
                horizontal,
                labelsHidden,
                valueLabelOptions,
              ),
            );
            labelIds.push(labelId);
          }
        });
      } else {
        // Lines, areas, and points share vertex geometry (data order is preserved).
        interface Vertex {
          readonly index: number;
          readonly point: Point & { y: number };
          readonly uu: number;
          readonly vv: number;
          readonly v0: number;
        }
        const segments = stackSegments.get(layer);
        const vertices: (Vertex | null)[] = layer.points.map((point, index) => {
          if (point.y === null) return null;
          const uu = u(point.x);
          if (uu === undefined) return null;
          const segment = segments?.[categories.indexOf(String(point.x))] ?? null;
          return {
            index,
            point: point as Point & { y: number },
            uu,
            vv: segment === null ? v(point.y) : v(segment.end),
            v0: segment === null ? v(baselineValue) : v(segment.start),
          };
        });
        const runs: Vertex[][] = [];
        let current: Vertex[] = [];
        for (const vertex of vertices) {
          if (vertex === null) {
            if (current.length > 0) runs.push(current);
            current = [];
          } else current.push(vertex);
        }
        if (current.length > 0) runs.push(current);
        const curve = layer.spec.curve ?? "linear";
        const dash = layer.spec.dash;
        const drawsLine = layer.mark === "line" || (layer.mark === "area" && !hasLineLayer);
        runs.forEach((run, runIndex) => {
          if (run.length < 2) return;
          if (layer.mark === "area") {
            const id =
              runIndex === 0 ? `${p}:area:${entry.id}` : `${p}:area:${entry.id}:${runIndex}`;
            const top = run.map((vertex) => toPoint(vertex.uu, vertex.vv));
            const bottom = run.map((vertex) => toPoint(vertex.uu, vertex.v0)).reverse();
            const closedPolygon = horizontal || segments !== undefined;
            children.push({
              id,
              type: "polyline",
              position: { x: 0, y: 0 },
              width: "100%",
              height: "100%",
              points: (closedPolygon ? [...top, ...bottom] : top).map(
                (pt) => [frac(pt.x), frac(pt.y)] as const,
              ),
              ...(closedPolygon ? { closed: true } : { baseline: frac(1 - (run[0]?.v0 ?? 0)) }),
              curve,
              fill: layer.fill ?? layer.tone,
              stroke: "none",
              opacity: layer.fillOpacity ?? (layer.fill === undefined ? 0.25 : 1),
              revealAnchor: horizontal ? "bottom" : "left",
              ...(visualBind === undefined ? {} : { bind: visualBind }),
            });
            areaIds.push(id);
          }
          if (drawsLine) {
            const id =
              runIndex === 0 ? `${p}:line:${entry.id}` : `${p}:line:${entry.id}:${runIndex}`;
            const seriesInteractive = entry.interactive === "series" && !seriesInteractivePlaced;
            children.push({
              id,
              type: "polyline",
              position: { x: 0, y: 0 },
              width: "100%",
              height: "100%",
              points: run.map((vertex) => {
                const pt = toPoint(vertex.uu, vertex.vv);
                return [frac(pt.x), frac(pt.y)] as const;
              }),
              curve,
              stroke: layer.tone,
              strokeWidth: 2,
              fill: "none",
              lineCap: "round",
              ...(dash === undefined ? {} : { dash }),
              ...(visualBind === undefined ? {} : { bind: visualBind }),
              inspect: seriesInspect,
              ...(seriesInteractive
                ? {
                    interactive: true,
                    label: entry.label,
                    description: entry.description ?? seriesSummary,
                  }
                : {}),
            });
            lineIds.push(id);
            if (seriesInteractive) seriesInteractivePlaced = true;
          }
        });
        // Points: dot layers draw every vertex; line/area vertices only when no dot layer exists.
        const drawsPoints =
          layer.mark === "point" || (!hasDotLayer && (layer.mark === "line" || !hasLineLayer));
        if (drawsPoints) {
          const runLength = new Map<Vertex, number>();
          for (const run of runs) for (const vertex of run) runLength.set(vertex, run.length);
          for (const vertex of vertices) {
            if (vertex === null) continue;
            const isolated = layer.mark !== "point" && (runLength.get(vertex) ?? 1) < 2;
            const radius =
              layer.mark === "point"
                ? Math.max(layer.pointRadius, 1)
                : isolated
                  ? Math.max(layer.pointRadius, 2)
                  : layer.pointRadius;
            if (radius <= 0) continue;
            const pt = toPoint(vertex.uu, vertex.vv);
            const id = `${p}:point:${entry.id}:${vertex.index}`;
            const valueText = valueFormat(vertex.point.y);
            children.push({
              id,
              type: "circle",
              position: { x: frac(pt.x), y: frac(pt.y), anchor: "center" },
              radius,
              fill: vertex.point.tone ?? layer.tone,
              stroke: "none",
              ...(visualBind === undefined ? {} : { bind: visualBind }),
              ...interactiveProps(vertex.point, valueText, "Point", marksInteractive),
            });
            dotIds.push(id);
            if (anyLabels) {
              const labelId = `${p}:label:${entry.id}:${vertex.index}`;
              children.push(
                valueLabelNode(
                  labelId,
                  valueText,
                  { x: pt.x, y: pt.y, w: 0, h: 0 },
                  false,
                  false,
                  labelsHidden,
                  valueLabelOptions,
                  radius + 2,
                ),
              );
              labelIds.push(labelId);
            }
          }
        }
      }
    }

    const groupInteractive =
      entry.interactive === "series" && !seriesInteractivePlaced && children.length > 0;
    const focusable = entry.interactive !== "none" && children.length > 0;
    const groupBind: NodeBindings | undefined =
      entry.bind?.hidden === undefined && entry.bind?.opacity === undefined
        ? undefined
        : {
            ...(entry.bind.hidden === undefined ? {} : { hidden: entry.bind.hidden }),
            ...(entry.bind.opacity === undefined ? {} : { opacity: entry.bind.opacity }),
          };
    const group: GroupNode = {
      id: `${p}:series:${entry.id}`,
      type: "group",
      layout: "coordinates",
      position: { x: 0, y: 0 },
      width: "100%",
      height: "100%",
      ...(focusable ? { focusGroup: true } : {}),
      label: entry.label,
      description: entry.description ?? seriesSummary,
      inspect: seriesInspect,
      ...(groupBind === undefined ? {} : { bind: groupBind }),
      ...(groupInteractive ? { interactive: true } : {}),
      // Points at the domain edges spill by their radius; that is intentional.
      ...(dotIds.length > 0 ? { allowOverflow: true } : {}),
      children,
    };
    areaChildren.push(group);
    const marks = [...barIds, ...dotIds];
    markIds.set(entry.key, marks);
    valueLabelIds.push(...labelIds);
    handlesSeries[entry.key] = {
      id: entry.id,
      group: group.id,
      marks,
      bars: barIds,
      dots: dotIds,
      labels: labelIds,
      ...(lineIds.length === 0 ? {} : { line: lineIds[0] ?? "", lines: lineIds }),
      ...(areaIds.length === 0 ? {} : { area: areaIds[0] ?? "", areas: areaIds }),
    };
  }

  // stacked totals as value labels
  if (
    stacked &&
    anyLayout(byLayout((layout) => valueLabelsAt(layout) !== false)) &&
    xBand !== undefined &&
    barLayerCount > 0
  ) {
    const labelsShown = byLayout((layout) => labelVisible(categories.length, layout));
    if (anyLayout(labelsShown)) {
      const labelsHidden = hiddenFlag(byLayout((layout) => !labelsShown[layout]));
      const totals: SceneNode[] = [];
      const barLayers = allLayers.filter((layer) => layer.mark === "bar");
      categories.forEach((category, categoryIndex) => {
        const band = xBand.band(category);
        if (band === undefined) return;
        let positive = 0;
        let negative = 0;
        let count = 0;
        for (const layer of barLayers) {
          const segment = stackSegments.get(layer)?.[categoryIndex];
          if (segment === undefined || segment === null) continue;
          count += 1;
          if (segment.end >= segment.start) positive = Math.max(positive, segment.end);
          else negative = Math.min(negative, segment.end);
        }
        if (count === 0) return;
        const negativeOnly = positive === 0 && negative < 0;
        const rect = negativeOnly
          ? toRect(band.start, band.end, v(negative), v(0))
          : toRect(band.start, band.end, v(0), v(positive));
        const labelId = `${p}:label:stack:${categoryIndex}`;
        totals.push(
          valueLabelNode(
            labelId,
            valueFormat(positive + negative),
            rect,
            negativeOnly,
            horizontal,
            labelsHidden,
            valueLabelOptions,
          ),
        );
        valueLabelIds.push(labelId);
      });
      if (totals.length > 0) areaChildren.push(coordinatesLayer(`${p}:labels`, totals));
    }
  }
  areaChildren.push(...annotationNodes.over);

  // axis line along the plot's bottom edge (inside the content box, above the marks)
  if (anyLayout(bottomAxis.shown))
    areaChildren.push({
      id: `${axisIds[bottomAxis.channel]}:line`,
      type: "rect",
      position: { x: 0, y: 1, anchor: "bottom-left" },
      width: "100%",
      height: 1,
      fill: "border",
      stroke: "none",
      radius: 0,
      ...hiddenProp(byLayout((layout) => !bottomAxis.shown[layout])),
    });

  // empty state
  const anyData = allLayers.some((layer) => layer.points.some((point) => point.y !== null));
  if (!anyData) {
    diagnostics.push({
      severity: "warning",
      code: "empty-data",
      message: series.length === 0 ? "plot has no series" : "plot has no data points",
    });
    areaChildren.push({
      id: `${p}:empty`,
      type: "text",
      text: "No data",
      textStyle: "caption",
      align: "center",
      position: { x: 0.5, y: 0.5, anchor: "center" },
    });
  }

  const areaGroup: GroupNode = {
    id: `${p}:area`,
    type: "group",
    layout: "coordinates",
    width: "fill",
    height: responsive(areaHeight),
    padding: responsive(
      byLayout((layout): Insets => [padTop, padRight, padBottom[layout], padLeft[layout]]),
    ),
    children: areaChildren,
  };

  // ---- axes ------------------------------------------------------------------------------------
  const tickVisibility = (axis: AxisModel): ByLayout<Set<string>> =>
    byLayout((layout) => {
      const ticks = axis.ticks[layout];
      const spanPx = axis.side === "bottom" ? PLOT_WIDTH_ESTIMATE[layout] : context.heights[layout];
      const widths = ticks.map((tick) =>
        axis.side === "bottom" ? estimateTextWidth(tick.text) : LINE_HEIGHT,
      );
      const budget =
        axis.side === "bottom"
          ? LABEL_BUDGET[layout]
          : Math.max(2, Math.floor(spanPx / LINE_HEIGHT));
      const explicitEvery = pick(axis.labelEvery, layout);
      const every =
        explicitEvery !== undefined && explicitEvery >= 1
          ? Math.floor(explicitEvery)
          : labelEvery(ticks.length, Math.max(0, ...widths), spanPx, budget);
      const shown = new Set<string>();
      ticks.forEach((tick, index) => {
        if (index % every === 0) shown.add(String(tick.value));
      });
      return shown;
    });
  const tickUnion = (axis: AxisModel): AxisTick[] => {
    const union = new Map<string, AxisTick>();
    for (const layout of LAYOUT_NAMES)
      for (const tick of axis.ticks[layout]) union.set(String(tick.value), tick);
    return [...union.values()];
  };

  let leftAxisNode: GroupNode | undefined;
  if (anyLayout(leftAxis.shown)) {
    const visible = tickVisibility(leftAxis);
    const children: SceneNode[] = tickUnion(leftAxis).map((tick, index) => ({
      id: `${p}:tick:${leftAxis.channel}:${index}`,
      type: "text",
      text: tick.text,
      textStyle: "caption",
      align: "end",
      // Cartesian geometry maps larger values upward (`1 - scale(value)`); the left axis must
      // use the same screen-space transform. Keeping raw scale positions here reverses the labels
      // while the bars/lines themselves remain correct.
      position: { x: 1, y: frac(1 - tick.position), anchor: "right" },
      ...hiddenProp(
        byLayout((layout) => !leftAxis.shown[layout] || !visible[layout].has(String(tick.value))),
      ),
    }));
    leftAxisNode = {
      id: axisIds[leftAxis.channel],
      type: "group",
      layout: "coordinates",
      width: responsive(gutter),
      height: responsive(areaHeight),
      padding: responsive(byLayout((layout): Insets => [padTop, TICK_GAP, padBottom[layout], 0])),
      // Tick labels are centred on their ticks, so the first and last overhang the box.
      allowOverflow: true,
      ...hiddenProp(byLayout((layout) => !leftAxis.shown[layout])),
      children,
    };
  }
  let bottomAxisNode: GroupNode | undefined;
  if (anyLayout(bottomAxis.shown)) {
    const visible = tickVisibility(bottomAxis);
    const children: SceneNode[] = [];
    tickUnion(bottomAxis).forEach((tick, index) => {
      const hidden = hiddenProp(
        byLayout((layout) => !bottomAxis.shown[layout] || !visible[layout].has(String(tick.value))),
      );
      const half = estimateTextWidth(tick.text) / 2;
      const anchor = byLayout((layout): Anchor => {
        const px = tick.position * PLOT_WIDTH_ESTIMATE[layout];
        if (px + half - PLOT_WIDTH_ESTIMATE[layout] > padRight - 2) return "top-right";
        if (half - px > gutter[layout] + padLeft[layout] - 2) return "top-left";
        return "top";
      });
      const tickId = `${p}:tick:${bottomAxis.channel}:${index}`;
      children.push({
        id: tickId,
        type: "text",
        text: tick.text,
        textStyle: "caption",
        position: responsive(
          byLayout((layout) => ({ x: frac(tick.position), y: 0, anchor: anchor[layout] })),
        ),
        ...hidden,
      });
      if (bottomAxis.kind === "linear")
        children.push({
          id: `${tickId}:mark`,
          type: "rect",
          position: { x: frac(tick.position), y: 0, anchor: "bottom" },
          width: 1,
          height: TICK_GAP,
          fill: "border",
          stroke: "none",
          radius: 0,
          ...hidden,
        });
    });
    if (bottomAxis.title !== undefined)
      children.push({
        id: `${axisIds[bottomAxis.channel]}:title`,
        type: "text",
        text: bottomAxis.title,
        textStyle: "label",
        position: { x: 0.5, y: 1, anchor: "bottom" },
      });
    bottomAxisNode = {
      id: axisIds[bottomAxis.channel],
      type: "group",
      layout: "coordinates",
      width: "fill",
      height: LINE_HEIGHT + TICK_GAP + (bottomAxis.title === undefined ? 0 : AXIS_TITLE_HEIGHT),
      padding: responsive(
        byLayout((layout): Insets => [TICK_GAP, padRight, 0, gutter[layout] + padLeft[layout]]),
      ),
      // Tick labels are centred on their ticks (first/last overhang) and tick marks rise into the gap.
      allowOverflow: true,
      ...hiddenProp(byLayout((layout) => !bottomAxis.shown[layout])),
      children,
    };
  }

  // ---- description ---------------------------------------------------------------------------
  const kinds = new Set(allLayers.map((layer) => layer.mark));
  const kindName = context.minimal
    ? "Sparkline"
    : kinds.size === 0
      ? "Chart"
      : kinds.size > 1
        ? "Combined chart"
        : kinds.has("bar")
          ? "Bar chart"
          : kinds.has("line")
            ? "Line chart"
            : kinds.has("area")
              ? "Area chart"
              : "Scatter chart";
  const xSummary =
    xKind === "band"
      ? `over ${plural(categories.length, "category", "categories")}`
      : `over x from ${xTickFormat(xDomain[0] as number)} to ${xTickFormat(xDomain[1] as number)}${xAxisModel.title === undefined ? "" : ` ${xAxisModel.title}`}`;
  const description =
    spec.description ??
    (anyData
      ? `${kindName} of ${plural(series.length, "series", "series")} ${xSummary}; y from ${yTickFormat(yAxis.domain[0])} to ${yTickFormat(yAxis.domain[1])}${unit}.`
      : `${kindName} with no data.`);

  // ---- root --------------------------------------------------------------------------------
  const rootChildren: SceneNode[] = [];
  let titleId: string | undefined;
  if (spec.title !== undefined && !context.minimal) {
    titleId = `${p}:title`;
    rootChildren.push({
      id: titleId,
      type: "text",
      text: spec.title,
      textStyle: spec.titleStyle ?? "bodyStrong",
      ...(spec.headingAlign === undefined
        ? {}
        : { align: spec.headingAlign, width: "fill" as const }),
    });
  }
  if (spec.subtitle !== undefined && !context.minimal) {
    rootChildren.push({
      id: `${p}:subtitle`,
      type: "text",
      text: spec.subtitle,
      textStyle: spec.subtitleStyle ?? "caption",
      color: "textMuted",
      maxLines: 3,
      ...(spec.headingAlign === undefined
        ? {}
        : { align: spec.headingAlign, width: "fill" as const }),
    });
  }
  const legendItems: LegendItem[] = series.map((entry) => {
    const primary = entry.layers.find((layer) => layer.mark === "bar") ?? entry.layers[0];
    const shape: LegendItem["shape"] =
      primary === undefined || primary.mark === "bar" || primary.mark === "area"
        ? "square"
        : primary.mark === "point"
          ? "circle"
          : primary.spec.dash === "dashed" || primary.spec.dash === "dotted"
            ? "dashed"
            : "line";
    return { id: entry.id, label: entry.label, swatch: entry.tone, shape };
  });
  const wantLegend =
    !context.minimal && spec.legend !== false && (series.length > 1 || spec.legend !== undefined);
  const legendPosition = spec.legend === false ? "top" : (spec.legend?.position ?? "top");
  const legendNode: SceneNode | undefined =
    wantLegend && legendItems.length > 0
      ? { id: `${p}:legend`, type: "legend", items: legendItems, direction: "row" }
      : undefined;
  if (legendNode !== undefined && legendPosition === "top") rootChildren.push(legendNode);
  if (leftAxis.title !== undefined && anyLayout(leftAxis.shown))
    rootChildren.push({
      id: `${axisIds[leftAxis.channel]}:title`,
      type: "text",
      text: leftAxis.title,
      textStyle: "label",
      ...hiddenProp(byLayout((layout) => !leftAxis.shown[layout])),
    });
  if (leftAxisNode === undefined) rootChildren.push(areaGroup);
  else
    rootChildren.push({
      id: `${p}:body`,
      type: "group",
      layout: "row",
      gap: 0,
      width: "fill",
      children: [leftAxisNode, areaGroup],
    });
  if (bottomAxisNode !== undefined) rootChildren.push(bottomAxisNode);
  if (legendNode !== undefined && legendPosition === "bottom") rootChildren.push(legendNode);

  const root: GroupNode = {
    id: p,
    type: "group",
    layout: "stack",
    gap: context.minimal ? 0 : 8,
    width: "fill",
    label: spec.title ?? kindName,
    description,
    children: rootChildren,
  };

  const tracks = cartesianMotion(context, series, handlesSeries, valueLabelIds);
  const handles: PlotHandles = {
    root: p,
    area: areaGroup.id,
    series: handlesSeries,
    axes: {
      ...(anyLayout(xAxisModel.shown) ? { x: axisIds.x } : {}),
      ...(anyLayout(yAxisModel.shown) ? { y: axisIds.y } : {}),
    },
    ...(legendNode === undefined ? {} : { legend: legendNode.id }),
    ...(titleId === undefined ? {} : { title: titleId }),
    ...(gridNodes.length > 0 ? { grid: `${p}:grid` } : {}),
    annotations: annotationIds,
  };
  return {
    fragment: { nodes: [root], tracks, summary: description, diagnostics: [...diagnostics] },
    handles,
    domains: { x: xDomain, y: yAxis.domain },
    ticks: {
      x: xKind === "band" ? categories : (xAxisLinear?.ticks.wide ?? []),
      y: yAxis.ticks.wide,
    },
    description,
    diagnostics,
    markIds,
  };
}

/** Value label text placed just outside a bar end or above a point. */
function valueLabelNode(
  id: string,
  text: string,
  rect: Rect,
  negative: boolean,
  horizontal: boolean,
  hidden: Responsive<boolean> | undefined,
  options?: ValueLabelOptions,
  gapPx = options?.gap ?? 0,
): SceneNode {
  const wrapped = gapPx > 0 || horizontal;
  const textNode: TextMark = {
    id: wrapped ? `${id}:text` : id,
    type: "text",
    text,
    textStyle: options?.textStyle ?? "caption",
    ...(options?.tone === undefined ? {} : { color: options.tone }),
    align: "center",
  };
  if (horizontal) {
    const anchor: Anchor = negative ? "right" : "left";
    return {
      id,
      type: "group",
      layout: "stack",
      padding: negative ? [0, 4, 0, 0] : [0, 0, 0, 4],
      position: {
        x: frac(negative ? rect.x : rect.x + rect.w),
        y: frac(rect.y + rect.h / 2),
        anchor,
      },
      ...(hidden === undefined ? {} : { hidden }),
      children: [textNode],
    };
  }
  const anchor: Anchor = negative ? "top" : "bottom";
  const x = rect.x + rect.w / 2;
  const y = negative ? rect.y + rect.h : rect.y;
  if (gapPx > 0)
    return {
      id,
      type: "group",
      layout: "stack",
      padding: negative ? [gapPx, 0, 0, 0] : [0, 0, gapPx, 0],
      position: { x: frac(x), y: frac(y), anchor },
      ...(hidden === undefined ? {} : { hidden }),
      children: [textNode],
    };
  return {
    ...textNode,
    position: { x: frac(x), y: frac(y), anchor },
    ...(hidden === undefined ? {} : { hidden }),
  };
}

// ---------------------------------------------------------------------------------------------
// Annotations
// ---------------------------------------------------------------------------------------------

interface AnnotationModel {
  readonly annotations: readonly AnnotationSpec[];
  readonly positionOfX: (value: number | CategoryKey) => number | undefined;
  readonly bandRangeOfX: (
    value: number | CategoryKey,
  ) => { start: number; end: number } | undefined;
  readonly valueToV: (value: number) => number | undefined;
  readonly toPoint: (u: number, v: number) => { x: number; y: number };
  readonly toRect: (u0: number, u1: number, v0: number, v1: number) => Rect;
  readonly seriesByKey: ReadonlyMap<string, Series>;
  readonly pointOf: (
    series: Series,
    index: number,
  ) => { x: number; y: number; radius: number } | undefined;
  readonly ids: string[];
}

function compileAnnotations(
  context: Context,
  model: AnnotationModel,
): { under: SceneNode[]; over: SceneNode[] } {
  const { p, diagnostics, horizontal } = context;
  const under: SceneNode[] = [];
  const over: SceneNode[] = [];
  model.annotations.forEach((annotation, index) => {
    const id = `${p}:annotation:${index}`;
    const skip = (message: string): void => {
      diagnostics.push({
        severity: "warning",
        code: "annotation-skipped",
        message: `annotation ${index}: ${message}`,
      });
    };
    switch (annotation.type) {
      case "reference-line": {
        const tone = annotation.tone ?? "textMuted";
        let a: { x: number; y: number };
        let b: { x: number; y: number };
        if (annotation.axis === "y") {
          if (typeof annotation.value !== "number")
            return skip("reference-line on the y axis needs a numeric value");
          const vv = model.valueToV(annotation.value);
          if (vv === undefined) return skip("reference-line value is not finite");
          a = model.toPoint(0, clamp(vv, 0, 1));
          b = model.toPoint(1, clamp(vv, 0, 1));
        } else {
          const uu = model.positionOfX(annotation.value);
          if (uu === undefined)
            return skip(`reference-line x value ${String(annotation.value)} is not on the x scale`);
          a = model.toPoint(uu, 0);
          b = model.toPoint(uu, 1);
        }
        under.push({
          id,
          type: "polyline",
          position: { x: 0, y: 0 },
          width: "100%",
          height: "100%",
          points: [
            [frac(a.x), frac(a.y)],
            [frac(b.x), frac(b.y)],
          ],
          stroke: tone,
          strokeWidth: 1,
          fill: "none",
          dash: annotation.dash ?? "dashed",
          ...(annotation.label === undefined
            ? {}
            : {
                label: annotation.label,
                description: `Reference line at ${String(annotation.value)}`,
              }),
        });
        if (annotation.label !== undefined) {
          const horizontalLine = (annotation.axis === "y") !== horizontal;
          over.push({
            id: `${id}:label`,
            type: "text",
            text: annotation.label,
            textStyle: "caption",
            color: tone,
            position: horizontalLine
              ? { x: 1, y: frac(Math.min(a.y, b.y)), anchor: "bottom-right" }
              : { x: frac(Math.min(a.x, b.x)), y: 0, anchor: "top-left" },
          });
        }
        model.ids.push(id);
        break;
      }
      case "reference-band": {
        let rect: Rect;
        if (annotation.axis === "y") {
          if (typeof annotation.from !== "number" || typeof annotation.to !== "number")
            return skip("reference-band on the y axis needs numeric bounds");
          const v0 = model.valueToV(annotation.from);
          const v1 = model.valueToV(annotation.to);
          if (v0 === undefined || v1 === undefined)
            return skip("reference-band bounds are not finite");
          rect = model.toRect(0, 1, clamp(v0, 0, 1), clamp(v1, 0, 1));
        } else {
          const r0 = model.bandRangeOfX(annotation.from);
          const r1 = model.bandRangeOfX(annotation.to);
          if (r0 === undefined || r1 === undefined)
            return skip("reference-band x bounds are not on the x scale");
          rect = model.toRect(Math.min(r0.start, r1.start), Math.max(r0.end, r1.end), 0, 1);
        }
        under.push({
          id,
          type: "rect",
          position: { x: frac(rect.x), y: frac(rect.y), anchor: "top-left" },
          width: pct(rect.w),
          height: pct(rect.h),
          fill: annotation.tone ?? "surfaceMuted",
          stroke: "none",
          radius: 0,
          opacity: annotation.tone === undefined ? 0.6 : 0.16,
          ...(annotation.label === undefined ? {} : { label: annotation.label }),
        });
        if (annotation.label !== undefined)
          over.push({
            id: `${id}:label`,
            type: "text",
            text: annotation.label,
            textStyle: "caption",
            color: annotation.tone ?? "textMuted",
            position: { x: frac(rect.x + rect.w), y: frac(rect.y), anchor: "top-right" },
          });
        model.ids.push(id);
        break;
      }
      case "point-label": {
        const target =
          annotation.series === undefined
            ? [...model.seriesByKey.values()][0]
            : model.seriesByKey.get(annotation.series);
        if (target === undefined) return skip(`unknown series ${String(annotation.series)}`);
        const point = model.pointOf(target, annotation.index);
        if (point === undefined)
          return skip(`series ${target.key} has no datum at index ${annotation.index}`);
        const placement = annotation.placement ?? "above";
        const anchor: Anchor =
          placement === "above"
            ? "bottom"
            : placement === "below"
              ? "top"
              : placement === "left"
                ? "right"
                : "left";
        const gap = point.radius + 3;
        const padding: [number, number, number, number] =
          placement === "above"
            ? [0, 0, gap, 0]
            : placement === "below"
              ? [gap, 0, 0, 0]
              : placement === "left"
                ? [0, gap, 0, 0]
                : [0, 0, 0, gap];
        over.push({
          id,
          type: "group",
          layout: "stack",
          padding,
          position: { x: frac(point.x), y: frac(point.y), anchor },
          children: [
            {
              id: `${id}:text`,
              type: "text",
              text: annotation.text,
              textStyle: "caption",
              align: placement === "left" ? "end" : placement === "right" ? "start" : "center",
              ...(annotation.tone === undefined ? {} : { color: annotation.tone }),
            },
          ],
        });
        model.ids.push(id);
        break;
      }
      case "callout": {
        const uu = model.positionOfX(annotation.x);
        const vv = model.valueToV(annotation.y);
        if (uu === undefined || vv === undefined)
          return skip("callout position is not on the scales");
        const at = model.toPoint(uu, clamp(vv, 0, 1));
        const pointer = annotation.pointer ?? "up";
        const width = Math.max(
          48,
          Math.min(annotation.maxWidth ?? 220, Math.ceil(estimateTextWidth(annotation.text) + 32)),
        );
        const callout: CalloutMark = {
          id: `${id}:callout`,
          type: "callout",
          text: annotation.text,
          pointer,
          width,
          maxLines: 6,
          ...(annotation.tone === undefined ? {} : { tone: annotation.tone }),
        };
        // The pointer tip sits 24px from the left edge (centred for narrow callouts); left padding on
        // the wrapper shifts the box so the tip lands on the data position.
        const shift = pointer === "up" || pointer === "down" ? Math.max(0, width - 48) : 0;
        const gap = 4;
        const anchor: Anchor =
          pointer === "up"
            ? "top"
            : pointer === "down"
              ? "bottom"
              : pointer === "left"
                ? "left"
                : pointer === "right"
                  ? "right"
                  : "top-left";
        const padding: [number, number, number, number] =
          pointer === "up"
            ? [gap, 0, 0, shift]
            : pointer === "down"
              ? [0, 0, gap, shift]
              : pointer === "left"
                ? [0, 0, 0, gap]
                : pointer === "right"
                  ? [0, gap, 0, 0]
                  : [0, 0, 0, 0];
        over.push({
          id,
          type: "group",
          layout: "stack",
          padding,
          position: { x: frac(at.x), y: frac(at.y), anchor },
          children: [callout],
        });
        model.ids.push(id);
        break;
      }
    }
  });
  // Annotation layers may legitimately spill (callouts near edges); keep them in one layer.
  return {
    under: under.length === 0 ? [] : [coordinatesLayer(`${p}:annotations:under`, under, true)],
    over: over.length === 0 ? [] : [coordinatesLayer(`${p}:annotations:over`, over, true)],
  };
}

// ---------------------------------------------------------------------------------------------
// Motion
// ---------------------------------------------------------------------------------------------

function cartesianMotion(
  context: Context,
  series: readonly Series[],
  handles: Readonly<Record<string, SeriesHandle>>,
  valueLabelIds: readonly string[],
): TimelineTrack[] {
  if (context.motion === "none") return [];
  const duration = context.duration;
  const tracks: TimelineTrack[] = [];
  const reveal: TimelineTrack["property"] = context.horizontal ? "revealX" : "revealY";
  for (const entry of series) {
    const handle = handles[entry.key];
    if (handle === undefined) continue;
    if (handle.bars.length > 0) {
      if (handle.bars.length > MOTION_MARK_CAP)
        tracks.push(
          track(handle.group, reveal, keyframes(0, duration * 0.8, 0, 1, context.easing)),
        );
      else {
        const step = stagger(handle.bars.length, duration * 0.4, 40);
        const each = (duration - step * (handle.bars.length - 1)) * 0.85;
        handle.bars.forEach((id, index) => {
          const start = step * index;
          tracks.push(track(id, reveal, keyframes(start, start + each, 0, 1, context.easing)));
        });
      }
    }
    const drawEnd = duration * 0.75;
    for (const id of handle.lines ?? [])
      tracks.push(track(id, "progress", keyframes(0, drawEnd, 0, 1, context.easing)));
    for (const id of handle.areas ?? [])
      tracks.push(
        track(
          id,
          context.horizontal ? "revealY" : "revealX",
          keyframes(0, drawEnd, 0, 1, context.easing),
        ),
      );
    const dots = handle.dots;
    if (dots.length > 0) {
      const hasLine = (handle.lines?.length ?? 0) > 0 || (handle.areas?.length ?? 0) > 0;
      if (dots.length > MOTION_MARK_CAP)
        tracks.push(
          track(
            handle.group,
            "opacity",
            keyframes(0, duration * 0.8, hasLine ? 0.4 : 0, 1, context.easing),
          ),
        );
      else if (hasLine) {
        // Points appear after the line has drawn.
        const step = stagger(dots.length, duration * 0.3, 40);
        dots.forEach((id, index) => {
          const start = duration * 0.6 + step * index;
          tracks.push(
            track(
              id,
              "opacity",
              keyframes(start, Math.min(duration, start + 160), 0, 1, context.easing),
            ),
          );
        });
      } else {
        const step = stagger(dots.length, duration * 0.5, 40);
        const each = Math.max(120, (duration - step * (dots.length - 1)) * 0.6);
        dots.forEach((id, index) => {
          const start = step * index;
          const end = Math.min(duration, start + each);
          tracks.push(track(id, "opacity", keyframes(start, end, 0, 1, context.easing)));
          tracks.push(track(id, "scale", keyframes(start, end, 0.6, 1, context.easing)));
        });
      }
    }
  }
  for (const id of valueLabelIds)
    tracks.push(track(id, "opacity", keyframes(duration * 0.7, duration, 0, 1, context.easing)));
  return tracks;
}

// ---------------------------------------------------------------------------------------------
// Heatmap
// ---------------------------------------------------------------------------------------------

function compileHeatmap(context: Context, heat: HeatmapSpec): PlotResult {
  const { p, spec, diagnostics } = context;
  const rows = heat.rows.map(String);
  const columns = heat.columns.map(String);
  const values: (number | null)[][] = rows.map((_, r) =>
    columns.map((__, c) => {
      const value = heat.values[r]?.[c];
      return typeof value === "number" && Number.isFinite(value) ? value : null;
    }),
  );
  if (
    heat.values.length !== rows.length ||
    heat.values.some((line) => line.length !== columns.length)
  )
    diagnostics.push({
      severity: "warning",
      code: "ragged-heatmap",
      message:
        "heatmap values do not match rows × columns; missing cells are empty and extras are ignored",
    });
  const flat = values.flat().filter((value): value is number => value !== null);
  const diverging = heat.negativeTone !== undefined;
  const explicit: readonly [number, number] | undefined =
    heat.domain === undefined || heat.domain === "auto" ? undefined : heat.domain;
  let min = explicit?.[0] ?? (flat.length > 0 ? Math.min(...flat) : 0);
  let max = explicit?.[1] ?? (flat.length > 0 ? Math.max(...flat) : 1);
  if (min === max) {
    if (min === 0) max = 1;
    else {
      min = Math.min(min, 0);
      max = Math.max(max, 0);
      if (min === max) max = min + 1;
    }
  }
  const magnitude = Math.max(Math.abs(min), Math.abs(max)) || 1;
  const format = heat.format ?? {};
  const cellFormat = (value: number): string => formatNumber(value, format);
  const positiveTone: Paint = heat.tone ?? (diverging ? "chartPositive" : "chart1");
  const negativeTone: Paint = heat.negativeTone ?? "chartNegative";
  const rampOpacity = (t: number): number => {
    const step = Math.round(clamp(t, 0, 1) * (RAMP_STEPS - 1)) / (RAMP_STEPS - 1);
    return Math.round((RAMP_MIN_OPACITY + step * (1 - RAMP_MIN_OPACITY)) * 1000) / 1000;
  };
  const cellPaint = (value: number): { fill: Paint; opacity: number } =>
    diverging
      ? {
          fill: value < 0 ? negativeTone : positiveTone,
          opacity: rampOpacity(Math.abs(value) / magnitude),
        }
      : { fill: positiveTone, opacity: rampOpacity((value - min) / (max - min)) };

  const rowScale = bandScale(rows, [0, 1], 0.08);
  const columnScale = bandScale(columns, [0, 1], 0.08);
  const cellCount = rows.length * columns.length;
  const cellsInteractive = cellCount <= CELL_INTERACTIVE_CAP;
  const cellLabels = context.minimal ? undefined : heat.cellLabels;
  const cellIds: string[][] = [];
  const cells: SceneNode[] = [];
  const allCellIds: string[] = [];
  const labelIds: string[] = [];
  rows.forEach((row, r) => {
    const ids: string[] = [];
    const rowBand = rowScale.band(r);
    columns.forEach((column, c) => {
      const columnBand = columnScale.band(c);
      if (rowBand === undefined || columnBand === undefined) return;
      const value = values[r]?.[c] ?? null;
      const id = `${p}:cell:${r}:${c}`;
      const paint =
        value === null ? { fill: "surfaceMuted" as Paint, opacity: 1 } : cellPaint(value);
      const valueText = value === null ? "–" : cellFormat(value);
      cells.push({
        id,
        type: "rect",
        position: { x: frac(columnBand.start), y: frac(rowBand.start), anchor: "top-left" },
        width: pct(columnBand.width),
        height: pct(rowBand.width),
        fill: paint.fill,
        stroke: "none",
        radius: 2,
        ...(paint.opacity === 1 ? {} : { opacity: paint.opacity }),
        inspect: {
          role: "Cell",
          title: `${row} · ${column}`,
          fields: [
            { label: heat.rowLabel ?? "Row", value: row },
            { label: heat.columnLabel ?? "Column", value: column },
            { label: "Value", value: valueText },
          ],
        },
        ...(cellsInteractive
          ? { interactive: true, label: `${row} · ${column}: ${valueText}` }
          : {}),
      });
      ids.push(id);
      allCellIds.push(id);
      if (cellLabels !== undefined && value !== null) {
        const hidden = hiddenFlag(byLayout((layout) => !pickOr(cellLabels, layout, false)));
        if (hidden !== true) {
          const labelId = `${id}:label`;
          cells.push({
            id: labelId,
            type: "text",
            text: valueText,
            textStyle: "caption",
            align: "center",
            position: { x: frac(columnBand.center), y: frac(rowBand.center), anchor: "center" },
            ...(hidden === undefined ? {} : { hidden }),
          });
          labelIds.push(labelId);
        }
      }
    });
    cellIds.push(ids);
  });
  const rangeText = `values from ${cellFormat(min)} to ${cellFormat(max)}`;
  const seriesGroup: GroupNode = {
    id: `${p}:series:heatmap`,
    type: "group",
    layout: "coordinates",
    position: { x: 0, y: 0 },
    width: "100%",
    height: "100%",
    focusGroup: true,
    label: spec.title ?? "Heatmap",
    description: `${plural(rows.length, "row")} by ${plural(columns.length, "column")}, ${rangeText}`,
    inspect: {
      role: "Series",
      title: spec.title ?? "Heatmap",
      fields: [
        { label: "Rows", value: String(rows.length) },
        { label: "Columns", value: String(columns.length) },
        { label: "Min", value: cellFormat(min) },
        { label: "Max", value: cellFormat(max) },
      ],
    },
    ...(cellsInteractive ? {} : { interactive: true }),
    children: cells,
  };

  // axes: columns along the bottom (x channel), rows on the left (y channel)
  const columnTicks: AxisTick[] = columns.map((column, c) => ({
    position: columnScale.band(c)?.center ?? 0,
    text: column,
    value: column,
  }));
  const rowTicks: AxisTick[] = rows.map((row, r) => ({
    position: rowScale.band(r)?.center ?? 0,
    text: row,
    value: row,
  }));
  const axesSpec = spec.axes ?? {};
  const xAxisSpec: AxisSpec | false = context.minimal ? false : (axesSpec.x ?? {});
  const yAxisSpec: AxisSpec | false = context.minimal ? false : (axesSpec.y ?? {});
  const xShown = byLayout(
    (layout) => xAxisSpec !== false && !pickOr(xAxisSpec.hidden, layout, false),
  );
  const yShown = byLayout(
    (layout) => yAxisSpec !== false && !pickOr(yAxisSpec.hidden, layout, false),
  );
  const gutter = byLayout((layout) => {
    if (!yShown[layout]) return 0;
    const widest = Math.max(0, ...rowTicks.map((tick) => estimateTextWidth(tick.text)));
    return Math.ceil(clamp(widest + TICK_GAP + 4, LEFT_MIN, LEFT_MAX[layout]));
  });
  const xTitle = (xAxisSpec === false ? undefined : xAxisSpec.label) ?? heat.columnLabel;
  const yTitle = (yAxisSpec === false ? undefined : yAxisSpec.label) ?? heat.rowLabel;
  const inset = context.minimal ? 3 : INSET;
  const padRight = context.minimal ? inset : RIGHT_INSET;
  const padBottom = byLayout((layout) => (xShown[layout] ? 0 : inset));
  const padLeft = byLayout((layout) => (yShown[layout] ? 0 : inset));
  const areaHeight = byLayout((layout) => context.heights[layout] + inset + padBottom[layout]);
  const axisIds = { x: `${p}:axis:x`, y: `${p}:axis:y` };
  const areaChildren: SceneNode[] = [seriesGroup];
  if (cellCount === 0) {
    diagnostics.push({ severity: "warning", code: "empty-data", message: "heatmap has no cells" });
    areaChildren.push({
      id: `${p}:empty`,
      type: "text",
      text: "No data",
      textStyle: "caption",
      align: "center",
      position: { x: 0.5, y: 0.5, anchor: "center" },
    });
  }
  const areaGroup: GroupNode = {
    id: `${p}:area`,
    type: "group",
    layout: "coordinates",
    width: "fill",
    height: responsive(areaHeight),
    padding: responsive(
      byLayout((layout): Insets => [inset, padRight, padBottom[layout], padLeft[layout]]),
    ),
    children: areaChildren,
  };
  let leftAxisNode: GroupNode | undefined;
  if (anyLayout(yShown)) {
    const every = byLayout((layout) => {
      const explicitEvery = yAxisSpec === false ? undefined : pick(yAxisSpec.labelEvery, layout);
      if (explicitEvery !== undefined && explicitEvery >= 1) return Math.floor(explicitEvery);
      return labelEvery(
        rows.length,
        LINE_HEIGHT,
        context.heights[layout],
        Math.max(2, Math.floor(context.heights[layout] / LINE_HEIGHT)),
      );
    });
    leftAxisNode = {
      id: axisIds.y,
      type: "group",
      layout: "coordinates",
      width: responsive(gutter),
      height: responsive(areaHeight),
      padding: responsive(byLayout((layout): Insets => [inset, TICK_GAP, padBottom[layout], 0])),
      allowOverflow: true,
      ...hiddenProp(byLayout((layout) => !yShown[layout])),
      children: rowTicks.map((tick, index) => ({
        id: `${p}:tick:y:${index}`,
        type: "text",
        text: tick.text,
        textStyle: "caption",
        align: "end",
        position: { x: 1, y: frac(tick.position), anchor: "right" },
        ...hiddenProp(byLayout((layout) => !yShown[layout] || index % every[layout] !== 0)),
      })),
    };
  }
  let bottomAxisNode: GroupNode | undefined;
  if (anyLayout(xShown)) {
    const every = byLayout((layout) => {
      const explicitEvery = xAxisSpec === false ? undefined : pick(xAxisSpec.labelEvery, layout);
      if (explicitEvery !== undefined && explicitEvery >= 1) return Math.floor(explicitEvery);
      return labelEvery(
        columns.length,
        Math.max(0, ...columnTicks.map((tick) => estimateTextWidth(tick.text))),
        PLOT_WIDTH_ESTIMATE[layout],
        LABEL_BUDGET[layout],
      );
    });
    const children: SceneNode[] = columnTicks.map((tick, index) => ({
      id: `${p}:tick:x:${index}`,
      type: "text",
      text: tick.text,
      textStyle: "caption",
      position: { x: frac(tick.position), y: 0, anchor: "top" },
      ...hiddenProp(byLayout((layout) => !xShown[layout] || index % every[layout] !== 0)),
    }));
    if (xTitle !== undefined)
      children.push({
        id: `${axisIds.x}:title`,
        type: "text",
        text: xTitle,
        textStyle: "label",
        position: { x: 0.5, y: 1, anchor: "bottom" },
      });
    bottomAxisNode = {
      id: axisIds.x,
      type: "group",
      layout: "coordinates",
      width: "fill",
      height: LINE_HEIGHT + TICK_GAP + (xTitle === undefined ? 0 : AXIS_TITLE_HEIGHT),
      padding: responsive(
        byLayout((layout): Insets => [TICK_GAP, padRight, 0, gutter[layout] + padLeft[layout]]),
      ),
      allowOverflow: true,
      ...hiddenProp(byLayout((layout) => !xShown[layout])),
      children,
    };
  }

  // legend: ramp swatches
  const rootChildren: SceneNode[] = [];
  let titleId: string | undefined;
  if (spec.title !== undefined && !context.minimal) {
    titleId = `${p}:title`;
    rootChildren.push({ id: titleId, type: "text", text: spec.title, textStyle: "bodyStrong" });
  }
  let legendNode: GroupNode | undefined;
  if (!context.minimal && spec.legend !== false && cellCount > 0) {
    const swatch = (id: string, fill: Paint, opacity: number): RectMark => ({
      id,
      type: "rect",
      width: 14,
      height: 10,
      fill,
      stroke: "none",
      radius: 1,
      ...(opacity === 1 ? {} : { opacity }),
    });
    const swatches: SceneNode[] = [];
    if (diverging) {
      for (let step = RAMP_STEPS - 1; step >= 0; step -= 1)
        swatches.push(
          swatch(`${p}:legend:neg:${step}`, negativeTone, rampOpacity(step / (RAMP_STEPS - 1))),
        );
      for (let step = 0; step < RAMP_STEPS; step += 1)
        swatches.push(
          swatch(`${p}:legend:pos:${step}`, positiveTone, rampOpacity(step / (RAMP_STEPS - 1))),
        );
    } else
      for (let step = 0; step < RAMP_STEPS; step += 1)
        swatches.push(
          swatch(`${p}:legend:step:${step}`, positiveTone, rampOpacity(step / (RAMP_STEPS - 1))),
        );
    legendNode = {
      id: `${p}:legend`,
      type: "group",
      layout: "row",
      gap: 6,
      align: "center",
      children: [
        {
          id: `${p}:legend:min`,
          type: "text",
          text: cellFormat(diverging ? -magnitude : min),
          textStyle: "caption",
        },
        {
          id: `${p}:legend:ramp`,
          type: "group",
          layout: "row",
          gap: 2,
          align: "center",
          children: swatches,
        },
        {
          id: `${p}:legend:max`,
          type: "text",
          text: cellFormat(diverging ? magnitude : max),
          textStyle: "caption",
        },
      ],
    };
  }
  const legendPosition = spec.legend === false ? "top" : (spec.legend?.position ?? "top");
  if (legendNode !== undefined && legendPosition === "top") rootChildren.push(legendNode);
  if (yTitle !== undefined && anyLayout(yShown))
    rootChildren.push({
      id: `${axisIds.y}:title`,
      type: "text",
      text: yTitle,
      textStyle: "label",
      ...hiddenProp(byLayout((layout) => !yShown[layout])),
    });
  if (leftAxisNode === undefined) rootChildren.push(areaGroup);
  else
    rootChildren.push({
      id: `${p}:body`,
      type: "group",
      layout: "row",
      gap: 0,
      width: "fill",
      children: [leftAxisNode, areaGroup],
    });
  if (bottomAxisNode !== undefined) rootChildren.push(bottomAxisNode);
  if (legendNode !== undefined && legendPosition === "bottom") rootChildren.push(legendNode);

  const description =
    spec.description ??
    (cellCount > 0
      ? `Heatmap of ${plural(rows.length, "row")} by ${plural(columns.length, "column")}; ${rangeText}.`
      : "Heatmap with no data.");
  const root: GroupNode = {
    id: p,
    type: "group",
    layout: "stack",
    gap: context.minimal ? 0 : 8,
    width: "fill",
    label: spec.title ?? "Heatmap",
    description,
    children: rootChildren,
  };

  // motion: sweep by row
  const tracks: TimelineTrack[] = [];
  if (context.motion !== "none" && cellCount > 0) {
    const duration = context.duration;
    if (cellCount > MOTION_MARK_CAP)
      tracks.push(
        track(seriesGroup.id, "opacity", keyframes(0, duration * 0.8, 0, 1, context.easing)),
      );
    else {
      const rowStep = stagger(rows.length, duration * 0.5, 120);
      const each = (duration - rowStep * Math.max(0, rows.length - 1)) * 0.7;
      cellIds.forEach((ids, r) => {
        const start = rowStep * r;
        for (const id of ids)
          tracks.push(track(id, "opacity", keyframes(start, start + each, 0, 1, context.easing)));
      });
    }
    for (const id of labelIds)
      tracks.push(track(id, "opacity", keyframes(duration * 0.7, duration, 0, 1, context.easing)));
  }

  const handle: SeriesHandle = {
    id: "heatmap",
    group: seriesGroup.id,
    marks: allCellIds,
    bars: [],
    dots: [],
    labels: labelIds,
  };
  const handles: PlotHandles = {
    root: p,
    area: areaGroup.id,
    series: { heatmap: handle },
    axes: {
      ...(anyLayout(xShown) ? { x: axisIds.x } : {}),
      ...(anyLayout(yShown) ? { y: axisIds.y } : {}),
    },
    ...(legendNode === undefined ? {} : { legend: legendNode.id }),
    ...(titleId === undefined ? {} : { title: titleId }),
    annotations: [],
    cells: cellIds,
  };
  return {
    fragment: { nodes: [root], tracks, summary: description, diagnostics: [...diagnostics] },
    handles,
    domains: { x: columns, y: rows },
    ticks: { x: columns, y: rows },
    description,
    diagnostics,
    markIds: new Map([["heatmap", allCellIds]]),
  };
}
