/**
 * Data normalisation shared by both entry points: `Datum[]` / `DataChannels` → plain data
 * points, and the generic rows + channels form → an equivalent `PlotSpec`.
 */
import type { Paint } from "@kineglyph/core";
import type {
  AxisOptions,
  AxisSpec,
  CartesianPlotOptions,
  CartesianMark,
  CategoryKey,
  DataChannels,
  Datum,
  HeatmapMark,
  HeatmapSpec,
  MarkSpec,
  PlotDiagnostic,
  PlotOptions,
  PlotSpec,
  ScaleSpec,
  SeriesData,
  SeriesMark,
  SeriesSpec,
} from "./types.js";

/** A normalised data point: category or numeric x, finite y or null. */
export interface Point {
  readonly x: CategoryKey | number;
  readonly y: number | null;
  readonly tone?: Paint;
  readonly label?: string;
  readonly description?: string;
}

/** Id-safe slug: keeps letters, digits, "_", "." and "-", collapses everything else to "-". */
export function slugify(value: string, fallback = "item"): string {
  const slug = value
    .trim()
    .replace(/[^A-Za-z0-9_.-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug.length > 0 ? slug : fallback;
}

/** Deterministic unique slugs: repeated slugs get "-2", "-3", … suffixes. */
export function uniqueSlugs(values: readonly string[], fallbackPrefix = "series"): string[] {
  const seen = new Map<string, number>();
  return values.map((value, index) => {
    const base = slugify(value, `${fallbackPrefix}-${index + 1}`);
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    return count === 0 ? base : `${base}-${count + 1}`;
  });
}

function finiteOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function keyOf(value: unknown): CategoryKey | number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") return value;
  if (typeof value === "boolean") return String(value);
  return undefined;
}

function text(value: unknown): string {
  return typeof value === "string"
    ? value
    : typeof value === "number" || typeof value === "boolean"
      ? String(value)
      : "";
}

export function isDataChannels(data: SeriesData): data is DataChannels {
  return !Array.isArray(data);
}

/** Normalises `Datum[]` or `DataChannels` into points, reporting non-numeric values. */
export function normaliseSeriesData(
  data: SeriesData,
  seriesId: string,
  diagnostics: PlotDiagnostic[],
): Point[] {
  const points: Point[] = [];
  let dropped = 0;
  let coerced = 0;
  const push = (
    x: unknown,
    y: unknown,
    tone: unknown,
    label: unknown,
    description: unknown,
  ): void => {
    const key = keyOf(x);
    if (key === undefined) {
      dropped += 1;
      return;
    }
    const value = finiteOrNull(y);
    if (value === null && y !== null && y !== undefined) coerced += 1;
    points.push({
      x: key,
      y: value,
      ...(typeof tone === "string" && tone.length > 0 ? { tone: tone as Paint } : {}),
      ...(typeof label === "string" && label.length > 0 ? { label } : {}),
      ...(typeof description === "string" && description.length > 0 ? { description } : {}),
    });
  };
  if (isDataChannels(data)) {
    for (const row of data.rows) {
      push(
        row[data.x],
        row[data.y],
        data.tone === undefined ? undefined : row[data.tone],
        data.label === undefined ? undefined : row[data.label],
        data.description === undefined ? undefined : row[data.description],
      );
    }
  } else {
    for (const datum of data) push(datum.x, datum.y, datum.tone, datum.label, datum.description);
  }
  if (dropped > 0)
    diagnostics.push({
      severity: "warning",
      code: "invalid-x",
      message: `series ${seriesId}: ${dropped} data point(s) without a usable x value were skipped`,
    });
  if (coerced > 0)
    diagnostics.push({
      severity: "warning",
      code: "non-numeric-value",
      message: `series ${seriesId}: ${coerced} non-numeric y value(s) were treated as missing`,
    });
  return points;
}

// ---------------------------------------------------------------------------------------------
// Generic rows + channels → PlotSpec
// ---------------------------------------------------------------------------------------------

export interface InferredSpec {
  readonly spec: PlotSpec;
  /** Handle keys (raw field names or distinct series values) → series ids in the spec. */
  readonly seriesKeys: readonly { readonly key: string; readonly id: string }[];
  readonly diagnostics: readonly PlotDiagnostic[];
}

function distinct(values: readonly unknown[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    if (value === null || value === undefined) continue;
    const key = text(value);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(key);
  }
  return out;
}

function axisToScale(
  axis: AxisOptions | false | undefined,
  inferredType: "linear" | "band",
): ScaleSpec {
  const options = axis === false || axis === undefined ? {} : axis;
  const type = options.type ?? inferredType;
  if (type === "band") {
    const domain = Array.isArray(options.domain)
      ? (options.domain as readonly (string | number)[]).map(String)
      : undefined;
    return {
      type: "band",
      ...(domain === undefined ? {} : { domain }),
      ...(options.padding === undefined ? {} : { padding: options.padding }),
      ...(options.label === undefined ? {} : { label: options.label }),
    };
  }
  const domain = options.domain;
  const numericDomain =
    Array.isArray(domain) &&
    domain.length === 2 &&
    typeof domain[0] === "number" &&
    typeof domain[1] === "number"
      ? ([domain[0], domain[1]] as const)
      : domain === "auto" || domain === "auto-zero"
        ? domain
        : undefined;
  return {
    type: "linear",
    ...(numericDomain === undefined ? {} : { domain: numericDomain }),
    ...(options.nice === undefined ? {} : { nice: options.nice }),
    ...(options.ticks === undefined ? {} : { ticks: options.ticks }),
    ...(options.format === undefined ? {} : { format: options.format }),
    ...(options.label === undefined ? {} : { label: options.label }),
  };
}

function axisToAxisSpec(axis: AxisOptions | false | undefined): AxisSpec | false | undefined {
  if (axis === false || axis === undefined) return axis;
  return {
    ...(axis.label === undefined ? {} : { label: axis.label }),
    ...(axis.hidden === undefined ? {} : { hidden: axis.hidden }),
    ...(axis.labelEvery === undefined ? {} : { labelEvery: axis.labelEvery }),
    ...(axis.format === undefined ? {} : { format: axis.format }),
  };
}

function markToSeriesMark(kind: CartesianMark["kind"]): SeriesMark {
  switch (kind) {
    case "bar":
    case "grouped-bar":
    case "stacked-bar":
      return "bar";
    case "line":
    case "sparkline":
      return "line";
    case "area":
      return "area";
    case "dot":
      return "scatter";
  }
}

function heatmapFromRows(
  rows: readonly object[],
  mark: HeatmapMark,
  diagnostics: PlotDiagnostic[],
): HeatmapSpec {
  const records = rows as readonly Record<string, unknown>[];
  const rowKeys = distinct(records.map((row) => row[mark.row]));
  const columnKeys = distinct(records.map((row) => row[mark.column]));
  const rowIndex = new Map(rowKeys.map((key, index) => [key, index] as const));
  const columnIndex = new Map(columnKeys.map((key, index) => [key, index] as const));
  const values: (number | null)[][] = rowKeys.map(() => columnKeys.map(() => null));
  const filled = new Set<string>();
  let duplicates = 0;
  for (const row of records) {
    const r = row[mark.row];
    const c = row[mark.column];
    if (r === null || r === undefined || c === null || c === undefined) continue;
    const ri = rowIndex.get(text(r));
    const ci = columnIndex.get(text(c));
    if (ri === undefined || ci === undefined) continue;
    const cellKey = `${ri}:${ci}`;
    if (filled.has(cellKey)) duplicates += 1;
    filled.add(cellKey);
    const line = values[ri];
    if (line !== undefined) line[ci] = finiteOrNull(row[mark.value]);
  }
  if (duplicates > 0)
    diagnostics.push({
      severity: "warning",
      code: "duplicate-cell",
      message: `heatmap: ${duplicates} duplicate row/column pair(s); the last value wins`,
    });
  return {
    rows: rowKeys,
    columns: columnKeys,
    values,
    ...(mark.domain === undefined ? {} : { domain: mark.domain }),
    ...(mark.tone === undefined ? {} : { tone: mark.tone }),
    ...(mark.negativeTone === undefined ? {} : { negativeTone: mark.negativeTone }),
    ...(mark.cellLabels === undefined ? {} : { cellLabels: mark.cellLabels }),
    ...(mark.format === undefined ? {} : { format: mark.format }),
    rowLabel: mark.row,
    columnLabel: mark.column,
  };
}

/** Normalises the `marks` option (single or array) into an ordered list of layers. */
export function markLayers(marks: MarkSpec | readonly MarkSpec[] | undefined): MarkSpec[] {
  if (marks === undefined) return [];
  return Array.isArray(marks) ? [...(marks as readonly MarkSpec[])] : [marks as MarkSpec];
}

/** Compiles the generic rows + typed channels form into the declarative `PlotSpec` IR. */
export function inferSpec(rows: readonly object[], options: PlotOptions): InferredSpec {
  const diagnostics: PlotDiagnostic[] = [];
  const records = rows as readonly Record<string, unknown>[];
  const cartesianOptions = options as CartesianPlotOptions;
  const shared = {
    ...(options.title === undefined ? {} : { title: options.title }),
    ...(options.subtitle === undefined ? {} : { subtitle: options.subtitle }),
    ...(options.titleStyle === undefined ? {} : { titleStyle: options.titleStyle }),
    ...(options.subtitleStyle === undefined ? {} : { subtitleStyle: options.subtitleStyle }),
    ...(options.headingAlign === undefined ? {} : { headingAlign: options.headingAlign }),
    ...(options.description === undefined ? {} : { description: options.description }),
    ...(options.legend === undefined ? {} : { legend: options.legend }),
    ...(options.minimal === undefined ? {} : { minimal: options.minimal }),
    ...(options.height === undefined ? {} : { height: options.height }),
  };
  const cartesianShared = {
    ...shared,
    ...(cartesianOptions.grid === undefined ? {} : { grid: cartesianOptions.grid }),
    ...(cartesianOptions.annotations === undefined
      ? {}
      : { annotations: cartesianOptions.annotations }),
    ...(cartesianOptions.valueLabels === undefined
      ? {}
      : { valueLabels: cartesianOptions.valueLabels }),
    ...(cartesianOptions.orientation === undefined
      ? {}
      : { orientation: cartesianOptions.orientation }),
    ...(cartesianOptions.stack === undefined ? {} : { stack: cartesianOptions.stack }),
  };
  const xAxis = axisToAxisSpec(options.axes?.x);
  const yAxis = axisToAxisSpec(options.axes?.y);
  const axesSpec: NonNullable<PlotSpec["axes"]> = {
    ...(xAxis === undefined ? {} : { x: xAxis }),
    ...(yAxis === undefined ? {} : { y: yAxis }),
  };
  const withAxes = (spec: PlotSpec): PlotSpec =>
    Object.keys(axesSpec).length === 0 ? spec : { ...spec, axes: axesSpec };

  const layers = markLayers(options.marks);
  const heat = layers.find((layer): layer is HeatmapMark => layer.kind === "heatmap");
  if (heat !== undefined) {
    if (layers.length > 1)
      diagnostics.push({
        severity: "warning",
        code: "heatmap-layers",
        message: "heatmaps cannot be layered with other marks; extra layers were ignored",
      });
    return {
      spec: withAxes({ ...shared, heatmap: heatmapFromRows(rows, heat, diagnostics) }),
      seriesKeys: [{ key: "heatmap", id: "heatmap" }],
      diagnostics,
    };
  }

  const cartesianLayers = layers.filter(
    (layer): layer is CartesianMark => layer.kind !== "heatmap",
  );
  const xField = options.x;
  const yFields =
    options.y === undefined ? [] : typeof options.y === "string" ? [options.y] : [...options.y];
  if (yFields.length === 0) {
    diagnostics.push({
      severity: "error",
      code: "missing-channel",
      message: 'plot(rows, options) needs a "y" channel',
    });
    return { spec: withAxes({ ...cartesianShared, series: [] }), seriesKeys: [], diagnostics };
  }
  const xValues =
    xField === undefined
      ? records.map((_, index) => index)
      : records.map((row) => row[xField]).filter((value) => value !== null && value !== undefined);
  const xIsNumeric = xValues.length > 0 && xValues.every((value) => typeof value === "number");
  const effectiveLayers: CartesianMark[] =
    cartesianLayers.length > 0 ? cartesianLayers : [{ kind: xIsNumeric ? "line" : "bar" }];
  const stack =
    cartesianOptions.stack ?? effectiveLayers.some((layer) => layer.kind === "stacked-bar");
  const minimal = options.minimal ?? effectiveLayers.every((layer) => layer.kind === "sparkline");
  const bandPadding = effectiveLayers.find((layer) => layer.padding !== undefined)?.padding;

  const datum = (row: Record<string, unknown>, yField: string, index: number): Datum => {
    const x = xField === undefined ? index : row[xField];
    const tone = options.tone === undefined ? undefined : row[options.tone];
    const label = options.label === undefined ? undefined : row[options.label];
    return {
      x: typeof x === "number" && Number.isFinite(x) ? x : text(x),
      y: finiteOrNull(row[yField]),
      ...(typeof tone === "string" ? { tone: tone as Paint } : {}),
      ...(typeof label === "string" ? { label } : {}),
    };
  };

  const entries: { key: string; label: string; data: Datum[] }[] = [];
  const seriesField = options.series;
  if (seriesField !== undefined) {
    const values = distinct(records.map((row) => row[seriesField]));
    for (const value of values) {
      const subset = records.filter((row) => {
        const raw = row[seriesField];
        return raw !== null && raw !== undefined && text(raw) === value;
      });
      for (const yField of yFields) {
        const key = yFields.length === 1 ? value : `${value} ${yField}`;
        entries.push({
          key,
          label: key,
          data: subset.map((row, index) => datum(row, yField, index)),
        });
      }
    }
  } else {
    for (const yField of yFields)
      entries.push({
        key: yField,
        label: yField,
        data: records.map((row, index) => datum(row, yField, index)),
      });
  }
  const ids = uniqueSlugs(entries.map((entry) => entry.key));
  const series: SeriesSpec[] = [];
  for (const layer of effectiveLayers) {
    const styleFields: Partial<SeriesSpec> = {
      ...(layer.tone === undefined ? {} : { tone: layer.tone }),
      ...(layer.fill === undefined ? {} : { fill: layer.fill }),
      ...(layer.fillOpacity === undefined ? {} : { fillOpacity: layer.fillOpacity }),
      ...(layer.radius === undefined ? {} : { radius: layer.radius }),
      ...(layer.material === undefined ? {} : { material: layer.material }),
      ...(layer.curve === undefined ? {} : { curve: layer.curve }),
      ...(layer.dash === undefined ? {} : { dash: layer.dash }),
      ...(layer.pointRadius === undefined ? {} : { pointRadius: layer.pointRadius }),
      ...(layer.interactive === undefined ? {} : { interactive: layer.interactive }),
    };
    entries.forEach((entry, index) => {
      const bind = cartesianOptions.seriesBindings?.[entry.key];
      series.push({
        id: ids[index] ?? `series-${index + 1}`,
        label: entry.label,
        mark: markToSeriesMark(layer.kind),
        data: entry.data,
        ...(bind === undefined ? {} : { bind }),
        ...styleFields,
      });
    });
  }
  const xScale = axisToScale(options.axes?.x, xIsNumeric ? "linear" : "band");
  const spec: PlotSpec = withAxes({
    ...cartesianShared,
    ...(stack ? { stack: true } : {}),
    ...(minimal ? { minimal: true } : {}),
    series,
    x:
      xScale.type === "band" && bandPadding !== undefined && xScale.padding === undefined
        ? { ...xScale, padding: bandPadding }
        : xScale,
    y: axisToScale(options.axes?.y, "linear"),
  });
  return {
    spec,
    seriesKeys: entries.map((entry, index) => ({ key: entry.key, id: ids[index] ?? "" })),
    diagnostics,
  };
}
