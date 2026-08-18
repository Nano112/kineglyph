import { linearGradient, material, shadow } from "@kineglyph/core";
import { compilePlot } from "./compile.js";
import { inferSpec } from "./data.js";
import { bar } from "./marks.js";
import type {
  CategoryFieldName,
  CartesianPlotOptions,
  CompileOptions,
  EditorialBarChartOptions,
  HeatmapPlotOptions,
  NumericFieldName,
  PlotOptions,
  PlotResult,
  PlotSpec,
  SeriesHandle,
  SeriesFieldName,
  SeriesKeys,
  YChannel,
} from "./types.js";

export * from "./marks.js";
export * from "./editorial.js";
export * from "./scales.js";
export * from "./types.js";
export { compilePlot } from "./compile.js";

/**
 * Compile typed rows and field-name channels into an ordinary core scene fragment. The return
 * type preserves wide-data y field names as stable `handles.series` keys.
 */
export function plot<
  Row extends object,
  const Y extends YChannel<Row>,
  const Series extends SeriesFieldName<Row> | undefined = undefined,
>(
  rows: readonly Row[],
  options: CartesianPlotOptions<Row, Y, Series>,
): PlotResult<SeriesKeys<Y, Series>>;

/** Compile a long-data heatmap. Row, column, and value field names are checked against `Row`. */
export function plot<Row extends object>(
  rows: readonly Row[],
  options: HeatmapPlotOptions<Row>,
): PlotResult<"heatmap">;

/** Advanced declarative IR entry point. */
export function plot(spec: PlotSpec, options?: CompileOptions): PlotResult;

export function plot(
  input: PlotSpec | readonly object[],
  options: CompileOptions | PlotOptions = {},
): PlotResult {
  if (!Array.isArray(input)) return compilePlot(input as PlotSpec, options);
  const inferred = inferSpec(input, options as PlotOptions);
  const compiled = compilePlot(inferred.spec, options);
  const series: Record<string, SeriesHandle> = {};
  const markIds = new Map<string, readonly string[]>();
  for (const entry of inferred.seriesKeys) {
    const handle = compiled.handles.series[entry.id];
    if (handle !== undefined) series[entry.key] = handle;
    const ids = compiled.markIds.get(entry.id);
    if (ids !== undefined) markIds.set(entry.key, ids);
  }
  const keyed: PlotResult = {
    ...compiled,
    handles: { ...compiled.handles, series },
    markIds,
  };
  if (inferred.diagnostics.length === 0) return keyed;
  const diagnostics = [...inferred.diagnostics, ...compiled.diagnostics];
  return {
    ...keyed,
    fragment: {
      ...keyed.fragment,
      diagnostics: [...inferred.diagnostics, ...(keyed.fragment.diagnostics ?? [])],
    },
    diagnostics,
  };
}

/**
 * A polished, responsive single-series bar chart in one call. Defaults are editorial rather than
 * dashboard-like: display heading, optional subtitle, no y axis/grid/legend, prominent values,
 * generous band spacing, gradient bars, a soft glow, and automatic rise motion. Every default can
 * still be overridden through the ordinary plot options or the explicit visual knobs below.
 */
export function editorialBarChart<
  Row extends object,
  const X extends CategoryFieldName<Row>,
  const Y extends NumericFieldName<Row>,
>(
  rows: readonly Row[],
  options: EditorialBarChartOptions<Row, X, Y>,
): PlotResult<SeriesKeys<Y, undefined>> {
  const {
    x,
    y,
    axisLabel,
    zeroLabel = "never",
    fill = linearGradient(
      [
        { at: 0, color: "chart1" },
        { at: 0.55, color: "chart2" },
        { at: 1, color: "chart3" },
      ],
      { angle: 90 },
    ),
    tone = "chart1",
    radius = 8,
    material: barMaterial = material("flat", {
      effects: [shadow({ color: "chart1", opacity: 0.32, blur: 16, spread: 1 })],
    }),
    barPadding = 0.38,
    axes,
    valueLabels,
    ...rest
  } = options;
  const xAxis =
    axes?.x === false
      ? false
      : {
          ...(axes?.x ?? {}),
          padding: axes?.x?.padding ?? barPadding,
          ...(axisLabel === undefined ? {} : { label: axisLabel }),
        };
  const defaultLabels = {
    show: { wide: true, compact: true, narrow: "auto" as const },
    ...(zeroLabel === false ? {} : { zero: zeroLabel }),
    format: { thousands: true },
    textStyle: "bodyStrong" as const,
    gap: 8,
  };
  const labels =
    valueLabels === undefined
      ? defaultLabels
      : typeof valueLabels === "object"
        ? { ...defaultLabels, ...valueLabels }
        : valueLabels;
  return plot<Row, Y, undefined>(rows, {
    ...rest,
    x,
    y,
    marks: bar({ tone, fill, radius, material: barMaterial, padding: barPadding }),
    axes: { x: xAxis, y: axes?.y ?? false },
    grid: rest.grid ?? "none",
    legend: rest.legend ?? false,
    height: rest.height ?? { wide: 520, compact: 390, narrow: 280 },
    titleStyle: rest.titleStyle ?? "display",
    subtitleStyle: rest.subtitleStyle ?? "title",
    headingAlign: rest.headingAlign ?? "center",
    valueLabels: labels,
    motion: rest.motion ?? "auto",
    duration: rest.duration ?? 1_100,
  });
}
