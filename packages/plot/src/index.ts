import { compilePlot } from "./compile.js";
import { inferSpec } from "./data.js";
import type {
  CartesianPlotOptions,
  CompileOptions,
  HeatmapPlotOptions,
  PlotOptions,
  PlotResult,
  PlotSpec,
  SeriesHandle,
  SeriesFieldName,
  SeriesKeys,
  YChannel,
} from "./types.js";

export * from "./marks.js";
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
