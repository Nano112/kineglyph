import type {
  EdgeDefinition,
  GroupNode,
  Paint,
  PathMark,
  SceneFragment,
  SceneNode,
  TimelineTrack,
} from "@kineglyph/core";
import { slugify, uniqueSlugs } from "./data.js";
import { clamp } from "./scales.js";

type Field<Row> = keyof Row & string;

export interface FamilyPlotOptions {
  readonly id?: string;
  readonly title?: string;
  readonly description?: string;
  readonly height?: number;
  readonly motion?: "auto" | "none";
  readonly duration?: number;
}

export interface FamilyPlotResult {
  readonly fragment: SceneFragment;
  readonly handles: {
    readonly root: string;
    readonly area: string;
    readonly marks: readonly string[];
    readonly labels: readonly string[];
  };
  readonly description: string;
}

export interface CategoricalValueOptions<Row> extends FamilyPlotOptions {
  readonly category: Field<Row>;
  readonly value: Field<Row>;
  readonly innerRadius?: number;
  readonly tones?: readonly Paint[];
}

const TONES: readonly Paint[] = ["chart1", "chart2", "chart3", "chart4", "chart5", "chart6"];

function finite(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function label(value: unknown, fallback: string): string {
  return typeof value === "string" || typeof value === "number" ? String(value) : fallback;
}

function pct(value: number): `${number}%` {
  return `${Math.round(clamp(value, 0, 1) * 100_000) / 1_000}%`;
}

function polar(radius: number, degrees: number): readonly [number, number] {
  const radians = ((degrees - 90) * Math.PI) / 180;
  return [50 + Math.cos(radians) * radius, 50 + Math.sin(radians) * radius];
}

function n(value: number): number {
  return Math.round(value * 1_000) / 1_000;
}

function arcPath(start: number, end: number, outer: number, inner = 0): string {
  const safeEnd = end - start >= 360 ? start + 359.999 : end;
  const [ox0, oy0] = polar(outer, start);
  const [ox1, oy1] = polar(outer, safeEnd);
  const large = safeEnd - start > 180 ? 1 : 0;
  if (inner <= 0)
    return `M 50 50 L ${n(ox0)} ${n(oy0)} A ${outer} ${outer} 0 ${large} 1 ${n(ox1)} ${n(oy1)} Z`;
  const [ix1, iy1] = polar(inner, safeEnd);
  const [ix0, iy0] = polar(inner, start);
  return `M ${n(ox0)} ${n(oy0)} A ${outer} ${outer} 0 ${large} 1 ${n(ox1)} ${n(oy1)} L ${n(ix1)} ${n(iy1)} A ${inner} ${inner} 0 ${large} 0 ${n(ix0)} ${n(iy0)} Z`;
}

function tracks(
  ids: readonly string[],
  duration: number,
  motion: "auto" | "none",
): TimelineTrack[] {
  if (motion === "none") return [];
  const stagger = ids.length <= 1 ? 0 : Math.min(55, (duration * 0.35) / (ids.length - 1));
  return ids.flatMap((target, index) => {
    const start = Math.round(index * stagger);
    const end = Math.max(start + 1, Math.round(duration * 0.65 + index * stagger));
    return [
      {
        id: `${target}:opacity`,
        target,
        property: "opacity",
        keyframes: [
          ...(start > 0 ? [{ time: 0, value: 0 }] : []),
          { time: start, value: 0 },
          { time: end, value: 1, easing: "easeOut" },
        ],
      },
      {
        id: `${target}:scale`,
        target,
        property: "scale",
        keyframes: [
          ...(start > 0 ? [{ time: 0, value: 0.94 }] : []),
          { time: start, value: 0.94 },
          { time: end, value: 1, easing: "easeOut" },
        ],
      },
    ] satisfies TimelineTrack[];
  });
}

function finish(
  options: FamilyPlotOptions,
  children: SceneNode[],
  markIds: string[],
  labelIds: string[] = [],
  edges: EdgeDefinition[] = [],
  fallbackDescription: string,
): FamilyPlotResult {
  const id = options.id?.trim() || "plot";
  const area = `${id}:area`;
  const content: SceneNode[] = [];
  if (options.title !== undefined)
    content.push({
      id: `${id}:title`,
      type: "text",
      text: options.title,
      textStyle: "title",
      width: "fill",
      maxLines: 2,
    });
  content.push({
    id: area,
    type: "group",
    layout: "coordinates",
    width: "fill",
    height: Math.max(80, options.height ?? 280),
    allowOverflow: true,
    children,
  });
  const root: GroupNode = { id, type: "group", layout: "stack", gap: 12, children: content };
  const description = options.description ?? fallbackDescription;
  const motionTracks = tracks(
    markIds,
    Math.max(1, options.duration ?? 900),
    options.motion ?? "auto",
  );
  return {
    fragment: {
      nodes: [root],
      ...(edges.length === 0 ? {} : { edges }),
      ...(motionTracks.length === 0 ? {} : { tracks: motionTracks }),
      summary: description,
    },
    handles: { root: id, area, marks: markIds, labels: labelIds },
    description,
  };
}

function categoricalRows<Row extends object>(
  rows: readonly Row[],
  category: Field<Row>,
  value: Field<Row>,
): { names: string[]; ids: string[]; values: number[] } {
  const names = rows.map((row, index) => label(row[category], `Item ${index + 1}`));
  return {
    names,
    ids: uniqueSlugs(names, "slice"),
    values: rows.map((row) => Math.max(0, finite(row[value]))),
  };
}

function radialFamily<Row extends object>(
  rows: readonly Row[],
  options: CategoricalValueOptions<Row>,
  mode: "pie" | "donut" | "radial",
): FamilyPlotResult {
  const id = options.id?.trim() || mode;
  const { names, ids, values } = categoricalRows(rows, options.category, options.value);
  const total = values.reduce((sum, value) => sum + value, 0);
  const max = Math.max(1, ...values);
  const marks: SceneNode[] = [];
  const markIds: string[] = [];
  let angle = 0;
  values.forEach((value, index) => {
    const name = names[index] ?? `Item ${index + 1}`;
    const start = mode === "radial" ? (index / Math.max(1, values.length)) * 360 + 2 : angle;
    const sweep =
      mode === "radial"
        ? 360 / Math.max(1, values.length) - 4
        : total > 0
          ? (value / total) * 360
          : 0;
    const end = start + Math.max(0, sweep);
    angle = end;
    const markId = `${id}:${mode}:${ids[index]}`;
    markIds.push(markId);
    const outer = mode === "radial" ? 22 + (value / max) * 26 : 47;
    const inner =
      mode === "pie"
        ? 0
        : mode === "donut"
          ? clamp(options.innerRadius ?? 0.56, 0.08, 0.9) * 47
          : 18;
    const tone =
      options.tones?.[index % Math.max(1, options.tones.length)] ??
      TONES[index % TONES.length] ??
      "chart1";
    const percent = total > 0 ? (value / total) * 100 : 0;
    const path: PathMark = {
      id: markId,
      type: "path",
      position: { x: 0.5, y: 0.5, anchor: "center" },
      width: "78%",
      height: "78%",
      d: arcPath(start, end, outer, inner),
      viewBox: { width: 100, height: 100 },
      fill: tone,
      stroke: "canvas",
      strokeWidth: 1.5,
      label: name,
      description: `${name}: ${value}${mode === "radial" ? "" : ` (${n(percent)}%)`}`,
      interactive: true,
      inspect: {
        role: mode === "radial" ? "Radial value" : "Slice",
        title: name,
        fields: [
          { label: "Value", value: String(value) },
          ...(mode === "radial" ? [] : [{ label: "Share", value: `${n(percent)}%` }]),
        ],
      },
    };
    marks.push(path);
  });
  if (mode === "donut")
    marks.push({
      id: `${id}:total`,
      type: "text",
      text: String(total),
      textStyle: "display",
      position: { x: 0.5, y: 0.5, anchor: "center" },
      align: "center",
      width: 120,
      maxLines: 1,
    });
  return finish(
    options,
    marks,
    markIds,
    mode === "pie" ? [] : [`${id}:total`],
    [],
    `${mode} chart of ${names.length} categories${total > 0 ? ` totalling ${total}` : ""}.`,
  );
}

export function pieChart<Row extends object>(
  rows: readonly Row[],
  options: CategoricalValueOptions<Row>,
): FamilyPlotResult {
  return radialFamily(rows, options, "pie");
}

export function donutChart<Row extends object>(
  rows: readonly Row[],
  options: CategoricalValueOptions<Row>,
): FamilyPlotResult {
  return radialFamily(rows, options, "donut");
}

export function radialChart<Row extends object>(
  rows: readonly Row[],
  options: CategoricalValueOptions<Row>,
): FamilyPlotResult {
  return radialFamily(rows, options, "radial");
}

export interface GaugeThreshold {
  /** Inclusive upper bound for this operating band. */
  readonly value: number;
  readonly tone: Paint;
  readonly label?: string;
}

export interface GaugeChartOptions extends FamilyPlotOptions {
  readonly value: number;
  readonly min?: number;
  readonly max?: number;
  readonly label?: string;
  readonly unit?: string;
  readonly precision?: number;
  readonly tone?: Paint;
  /** Ordered upper bounds, for example 70/success, 85/warning, 100/danger. */
  readonly thresholds?: readonly GaugeThreshold[];
}

/**
 * A compact operational gauge compiled to ordinary paths and text. Thresholds define both the
 * quiet operating bands and the active value tone, so the same definition works in SVG, Canvas,
 * PNG/GIF export, and live scene replacement.
 */
export function gaugeChart(options: GaugeChartOptions): FamilyPlotResult {
  const id = options.id?.trim() || "gauge";
  const minimum = finite(options.min, 0);
  const requestedMaximum = finite(options.max, 100);
  const maximum = requestedMaximum > minimum ? requestedMaximum : minimum + 1;
  const value = clamp(finite(options.value, minimum), minimum, maximum);
  const progress = (value - minimum) / (maximum - minimum);
  const thresholds = [...(options.thresholds ?? [])]
    .map((entry) => ({ ...entry, value: clamp(finite(entry.value, maximum), minimum, maximum) }))
    .sort((a, b) => a.value - b.value);
  const activeTone =
    options.tone ?? thresholds.find((entry) => value <= entry.value)?.tone ?? "chart1";
  const angle = 270 + progress * 180;
  const [needleX, needleY] = polar(30, angle);
  const markIds = [`${id}:value`];
  const nodes: SceneNode[] = [
    {
      id: `${id}:track`,
      type: "path",
      position: { x: 0.5, y: 0.43, anchor: "center" },
      width: "88%",
      height: "72%",
      d: arcPath(270, 450, 47, 37),
      viewBox: { width: 100, height: 58 },
      fill: "surfaceMuted",
      stroke: "none",
      label: "Gauge range",
    },
  ];
  let bandStart = minimum;
  thresholds.forEach((entry, index) => {
    const bandEnd = Math.max(bandStart, entry.value);
    if (bandEnd > bandStart) {
      const bandId = `${id}:band:${index}`;
      const start = 270 + ((bandStart - minimum) / (maximum - minimum)) * 180;
      const end = 270 + ((bandEnd - minimum) / (maximum - minimum)) * 180;
      markIds.push(bandId);
      nodes.push({
        id: bandId,
        type: "path",
        position: { x: 0.5, y: 0.43, anchor: "center" },
        width: "88%",
        height: "72%",
        d: arcPath(start, end, 47, 41),
        viewBox: { width: 100, height: 58 },
        fill: entry.tone,
        opacity: 0.38,
        stroke: "none",
        label: entry.label ?? `Up to ${entry.value}`,
        description: `${bandStart} to ${bandEnd}`,
        interactive: true,
      });
    }
    bandStart = bandEnd;
  });
  nodes.push(
    {
      id: `${id}:value`,
      type: "path",
      position: { x: 0.5, y: 0.43, anchor: "center" },
      width: "88%",
      height: "72%",
      d: arcPath(270, Math.max(270.001, angle), 47, 37),
      viewBox: { width: 100, height: 58 },
      fill: activeTone,
      stroke: "none",
      label: options.label ?? "Current value",
      description: `${value}${options.unit ?? ""} of ${maximum}${options.unit ?? ""}`,
      interactive: true,
      inspect: {
        role: "Gauge value",
        title: options.label ?? "Current value",
        fields: [
          { label: "Value", value: `${value}${options.unit ?? ""}` },
          { label: "Range", value: `${minimum}–${maximum}${options.unit ?? ""}` },
        ],
      },
    },
    {
      id: `${id}:needle`,
      type: "path",
      position: { x: 0.5, y: 0.43, anchor: "center" },
      width: "88%",
      height: "72%",
      d: `M 50 50 L ${n(needleX)} ${n(needleY)}`,
      viewBox: { width: 100, height: 58 },
      fill: "none",
      stroke: "text",
      strokeWidth: 1.8,
    },
    {
      id: `${id}:reading`,
      type: "text",
      text: `${value.toFixed(Math.max(0, Math.floor(options.precision ?? 0)))}${options.unit ?? ""}`,
      textStyle: "title",
      color: activeTone,
      position: { x: 0.5, y: 0.68, anchor: "center" },
      align: "center",
      width: "80%",
      maxLines: 1,
    },
    {
      id: `${id}:label`,
      type: "text",
      text: options.label ?? "Current value",
      textStyle: "caption",
      color: "textMuted",
      position: { x: 0.5, y: 0.84, anchor: "center" },
      align: "center",
      width: "80%",
      maxLines: 1,
    },
  );
  return finish(
    { ...options, id },
    nodes,
    markIds,
    [`${id}:reading`, `${id}:label`],
    [],
    `${options.label ?? "Gauge"}: ${value}${options.unit ?? ""} on a ${minimum} to ${maximum}${options.unit ?? ""} range.`,
  );
}

export interface HistogramOptions<Row> extends FamilyPlotOptions {
  readonly value: Field<Row>;
  readonly bins?: number;
  readonly tone?: Paint;
}

interface Bin {
  readonly from: number;
  readonly to: number;
  readonly count: number;
}

function bins(values: readonly number[], count: number): Bin[] {
  if (values.length === 0) return [];
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  const span = Math.max(1e-9, maximum - minimum);
  const size = span / count;
  const out = Array.from({ length: count }, (_, index) => ({
    from: minimum + index * size,
    to: index === count - 1 ? maximum : minimum + (index + 1) * size,
    count: 0,
  }));
  for (const value of values) {
    const index = Math.min(count - 1, Math.floor((value - minimum) / size));
    const current = out[index];
    if (current !== undefined) out[index] = { ...current, count: current.count + 1 };
  }
  return out;
}

function histogramNodes(
  id: string,
  values: readonly number[],
  count: number,
  tone: Paint,
): {
  nodes: SceneNode[];
  ids: string[];
  bins: Bin[];
} {
  const grouped = bins(values, count);
  const max = Math.max(1, ...grouped.map((entry) => entry.count));
  const width = 0.88 / Math.max(1, grouped.length);
  const nodes: SceneNode[] = [];
  const ids: string[] = [];
  grouped.forEach((entry, index) => {
    const markId = `${id}:bin:${index}`;
    ids.push(markId);
    nodes.push({
      id: markId,
      type: "rect",
      position: { x: 0.06 + index * width, y: 0.9, anchor: "bottom-left" },
      width: pct(width * 0.94),
      height: pct((entry.count / max) * 0.76),
      fill: tone,
      stroke: "canvas",
      radius: 3,
      revealAnchor: "bottom",
      label: `${n(entry.from)} to ${n(entry.to)}`,
      description: `${entry.count} observations`,
      interactive: true,
      inspect: { role: "Histogram bin", fields: [{ label: "Count", value: String(entry.count) }] },
    });
  });
  return { nodes, ids, bins: grouped };
}

export function histogram<Row extends object>(
  rows: readonly Row[],
  options: HistogramOptions<Row>,
): FamilyPlotResult {
  const id = options.id?.trim() || "histogram";
  const values = rows.map((row) => finite(row[options.value], Number.NaN)).filter(Number.isFinite);
  const compiled = histogramNodes(
    id,
    values,
    Math.max(1, Math.floor((options.bins ?? Math.sqrt(values.length)) || 1)),
    options.tone ?? "chart1",
  );
  return finish(
    options,
    compiled.nodes,
    compiled.ids,
    [],
    [],
    `Histogram of ${values.length} observations in ${compiled.bins.length} bins.`,
  );
}

export function distributionPlot<Row extends object>(
  rows: readonly Row[],
  options: HistogramOptions<Row>,
): FamilyPlotResult {
  const id = options.id?.trim() || "distribution";
  const values = rows.map((row) => finite(row[options.value], Number.NaN)).filter(Number.isFinite);
  const compiled = histogramNodes(
    id,
    values,
    Math.max(3, Math.floor((options.bins ?? Math.sqrt(values.length)) || 3)),
    "surfaceMuted",
  );
  const maximum = Math.max(1, ...compiled.bins.map((entry) => entry.count));
  const lineId = `${id}:density`;
  const points = compiled.bins.map(
    (entry, index) =>
      [
        0.06 + (index + 0.5) * (0.88 / compiled.bins.length),
        0.9 - (entry.count / maximum) * 0.76,
      ] as const,
  );
  const nodes: SceneNode[] = [
    ...compiled.nodes,
    {
      id: lineId,
      type: "polyline",
      position: { x: 0, y: 0 },
      width: "100%",
      height: "100%",
      points,
      curve: "monotone",
      fill: "none",
      stroke: options.tone ?? "chart2",
      strokeWidth: 3,
      lineCap: "round",
      label: "Smoothed distribution profile",
    },
  ];
  return finish(
    options,
    nodes,
    [...compiled.ids, lineId],
    [],
    [],
    `Distribution of ${values.length} observations.`,
  );
}

export interface RangeChartOptions<Row> extends FamilyPlotOptions {
  readonly category: Field<Row>;
  readonly low: Field<Row>;
  readonly high: Field<Row>;
  readonly value?: Field<Row>;
  readonly tone?: Paint;
}

export function rangeChart<Row extends object>(
  rows: readonly Row[],
  options: RangeChartOptions<Row>,
): FamilyPlotResult {
  const id = options.id?.trim() || "range";
  const lows = rows.map((row) => finite(row[options.low]));
  const highs = rows.map((row) => finite(row[options.high]));
  const minimum = Math.min(0, ...lows);
  const maximum = Math.max(1, ...highs);
  const scale = (value: number): number =>
    0.12 + ((value - minimum) / Math.max(1e-9, maximum - minimum)) * 0.8;
  const nodes: SceneNode[] = [];
  const markIds: string[] = [];
  const labelIds: string[] = [];
  rows.forEach((row, index) => {
    const name = label(row[options.category], `Item ${index + 1}`);
    const low = lows[index] ?? 0;
    const high = highs[index] ?? low;
    const y = (index + 0.5) / Math.max(1, rows.length);
    const markId = `${id}:range:${slugify(name)}:${index}`;
    const labelId = `${markId}:label`;
    markIds.push(markId);
    labelIds.push(labelId);
    nodes.push(
      {
        id: labelId,
        type: "text",
        text: name,
        textStyle: "caption",
        position: { x: 0.01, y, anchor: "left" },
        width: "10%",
        maxLines: 1,
      },
      {
        id: markId,
        type: "rect",
        position: { x: scale(Math.min(low, high)), y, anchor: "left" },
        width: pct(Math.abs(scale(high) - scale(low))),
        height: 4,
        radius: 2,
        fill: options.tone ?? "chart1",
        label: name,
        description: `${low} to ${high}`,
        interactive: true,
      },
      {
        id: `${markId}:low`,
        type: "circle",
        position: { x: scale(low), y, anchor: "center" },
        radius: 6,
        fill: "canvas",
        stroke: options.tone ?? "chart1",
        strokeWidth: 3,
      },
      {
        id: `${markId}:high`,
        type: "circle",
        position: { x: scale(high), y, anchor: "center" },
        radius: 6,
        fill: options.tone ?? "chart1",
        stroke: "canvas",
        strokeWidth: 2,
      },
    );
    if (options.value !== undefined) {
      const value = finite(row[options.value]);
      nodes.push({
        id: `${markId}:value`,
        type: "circle",
        position: { x: scale(value), y, anchor: "center" },
        radius: 4,
        fill: "text",
      });
    }
  });
  return finish(options, nodes, markIds, labelIds, [], `Ranges for ${rows.length} categories.`);
}

function quantile(sorted: readonly number[], amount: number): number {
  if (sorted.length === 0) return 0;
  const index = (sorted.length - 1) * amount;
  const left = Math.floor(index);
  const right = Math.ceil(index);
  const a = sorted[left] ?? 0;
  const b = sorted[right] ?? a;
  return a + (b - a) * (index - left);
}

export interface BoxPlotOptions<Row> extends FamilyPlotOptions {
  readonly category: Field<Row>;
  readonly value: Field<Row>;
  readonly tone?: Paint;
}

export function boxPlot<Row extends object>(
  rows: readonly Row[],
  options: BoxPlotOptions<Row>,
): FamilyPlotResult {
  const id = options.id?.trim() || "box";
  const grouped = new Map<string, number[]>();
  for (const row of rows) {
    const category = label(row[options.category], "Other");
    const value = finite(row[options.value], Number.NaN);
    if (!Number.isFinite(value)) continue;
    const values = grouped.get(category) ?? [];
    values.push(value);
    grouped.set(category, values);
  }
  const all = [...grouped.values()].flat();
  const minimum = Math.min(0, ...all);
  const maximum = Math.max(1, ...all);
  const yOf = (value: number): number =>
    0.9 - ((value - minimum) / Math.max(1e-9, maximum - minimum)) * 0.78;
  const nodes: SceneNode[] = [];
  const markIds: string[] = [];
  [...grouped].forEach(([name, raw], index) => {
    const values = [...raw].sort((a, b) => a - b);
    const low = values[0] ?? 0;
    const high = values.at(-1) ?? low;
    const q1 = quantile(values, 0.25);
    const median = quantile(values, 0.5);
    const q3 = quantile(values, 0.75);
    const x = 0.12 + ((index + 0.5) / Math.max(1, grouped.size)) * 0.82;
    const width = Math.min(0.14, 0.6 / Math.max(1, grouped.size));
    const markId = `${id}:box:${slugify(name)}:${index}`;
    markIds.push(markId);
    nodes.push(
      {
        id: `${markId}:whisker`,
        type: "rect",
        position: { x, y: yOf(high), anchor: "top" },
        width: 2,
        height: pct(Math.max(0.004, yOf(low) - yOf(high))),
        fill: options.tone ?? "chart1",
      },
      {
        id: markId,
        type: "rect",
        position: { x, y: yOf(q3), anchor: "top" },
        width: pct(width),
        height: pct(Math.max(0.006, yOf(q1) - yOf(q3))),
        fill: "surfaceRaised",
        stroke: options.tone ?? "chart1",
        strokeWidth: 2,
        radius: 4,
        label: name,
        description: `Median ${n(median)}; middle half ${n(q1)} to ${n(q3)}; range ${n(low)} to ${n(high)}`,
        interactive: true,
      },
      {
        id: `${markId}:median`,
        type: "rect",
        position: { x, y: yOf(median), anchor: "center" },
        width: pct(width),
        height: 3,
        fill: options.tone ?? "chart1",
      },
      {
        id: `${markId}:label`,
        type: "text",
        text: name,
        textStyle: "caption",
        position: { x, y: 0.96, anchor: "top" },
        align: "center",
        width: pct(Math.max(width, 0.16)),
        maxLines: 1,
      },
    );
  });
  return finish(
    options,
    nodes,
    markIds,
    [],
    [],
    `Box plot comparing ${grouped.size} distributions.`,
  );
}

export interface ConfidenceBandOptions<Row> extends FamilyPlotOptions {
  readonly x: Field<Row>;
  readonly low: Field<Row>;
  readonly high: Field<Row>;
  readonly value?: Field<Row>;
  readonly tone?: Paint;
}

export function confidenceBand<Row extends object>(
  rows: readonly Row[],
  options: ConfidenceBandOptions<Row>,
): FamilyPlotResult {
  const id = options.id?.trim() || "confidence";
  const sorted = [...rows].sort((a, b) => finite(a[options.x]) - finite(b[options.x]));
  const xs = sorted.map((row) => finite(row[options.x]));
  const lows = sorted.map((row) => finite(row[options.low]));
  const highs = sorted.map((row) => finite(row[options.high]));
  const xMin = Math.min(0, ...xs);
  const xMax = Math.max(1, ...xs);
  const yMin = Math.min(0, ...lows);
  const yMax = Math.max(1, ...highs);
  const xOf = (value: number): number =>
    0.06 + ((value - xMin) / Math.max(1e-9, xMax - xMin)) * 0.9;
  const yOf = (value: number): number =>
    0.92 - ((value - yMin) / Math.max(1e-9, yMax - yMin)) * 0.84;
  const bandId = `${id}:band`;
  const lineId = `${id}:estimate`;
  const upper = sorted.map((_, index) => [xOf(xs[index] ?? 0), yOf(highs[index] ?? 0)] as const);
  const lower = sorted
    .map((_, index) => [xOf(xs[index] ?? 0), yOf(lows[index] ?? 0)] as const)
    .reverse();
  const estimate = sorted.map(
    (row, index) =>
      [
        xOf(xs[index] ?? 0),
        yOf(
          options.value === undefined
            ? ((lows[index] ?? 0) + (highs[index] ?? 0)) / 2
            : finite(row[options.value]),
        ),
      ] as const,
  );
  const nodes: SceneNode[] = [
    {
      id: bandId,
      type: "polyline",
      position: { x: 0, y: 0 },
      width: "100%",
      height: "100%",
      points: [...upper, ...lower],
      closed: true,
      fill: options.tone ?? "chart1",
      opacity: 0.2,
      stroke: "none",
      label: "Confidence interval",
    },
    {
      id: lineId,
      type: "polyline",
      position: { x: 0, y: 0 },
      width: "100%",
      height: "100%",
      points: estimate,
      curve: "monotone",
      fill: "none",
      stroke: options.tone ?? "chart1",
      strokeWidth: 3,
      lineCap: "round",
      label: "Estimate",
    },
  ];
  return finish(
    options,
    nodes,
    [bandId, lineId],
    [],
    [],
    `Estimate with a confidence band across ${rows.length} observations.`,
  );
}

export interface GanttChartOptions<Row> extends FamilyPlotOptions {
  readonly label: Field<Row>;
  readonly start: Field<Row>;
  readonly end: Field<Row>;
  readonly tone?: Field<Row> | Paint;
}

export function ganttChart<Row extends object>(
  rows: readonly Row[],
  options: GanttChartOptions<Row>,
): FamilyPlotResult {
  const id = options.id?.trim() || "gantt";
  const starts = rows.map((row) => finite(row[options.start]));
  const ends = rows.map((row) => finite(row[options.end]));
  const minimum = Math.min(0, ...starts);
  const maximum = Math.max(1, ...ends);
  const xOf = (value: number): number =>
    0.2 + ((value - minimum) / Math.max(1e-9, maximum - minimum)) * 0.75;
  const nodes: SceneNode[] = [];
  const ids: string[] = [];
  rows.forEach((row, index) => {
    const name = label(row[options.label], `Task ${index + 1}`);
    const start = starts[index] ?? 0;
    const end = ends[index] ?? start;
    const y = (index + 0.5) / Math.max(1, rows.length);
    const markId = `${id}:task:${slugify(name)}:${index}`;
    const rowTone =
      typeof options.tone === "string" && options.tone in row
        ? (row[options.tone as Field<Row>] as Paint)
        : ((options.tone as Paint | undefined) ?? TONES[index % TONES.length] ?? "chart1");
    ids.push(markId);
    nodes.push(
      {
        id: `${markId}:label`,
        type: "text",
        text: name,
        textStyle: "caption",
        position: { x: 0.01, y, anchor: "left" },
        width: "18%",
        maxLines: 1,
      },
      {
        id: markId,
        type: "rect",
        position: { x: xOf(start), y, anchor: "left" },
        width: pct(Math.max(0.006, xOf(end) - xOf(start))),
        height: Math.max(
          10,
          Math.min(28, ((options.height ?? 280) / Math.max(2, rows.length)) * 0.48),
        ),
        fill: rowTone,
        radius: 5,
        revealAnchor: "left",
        label: name,
        description: `${start} to ${end}`,
        interactive: true,
      },
    );
  });
  return finish(
    options,
    nodes,
    ids,
    [],
    [],
    `Timeline of ${rows.length} tasks from ${minimum} to ${maximum}.`,
  );
}

export const timelineChart = ganttChart;

export interface TreemapOptions<Row> extends FamilyPlotOptions {
  readonly label: Field<Row>;
  readonly value: Field<Row>;
  readonly tone?: Field<Row>;
}

interface Tile {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

function tile(values: readonly number[], box: Tile, vertical: boolean): Tile[] {
  if (values.length <= 1) return values.length === 0 ? [] : [box];
  const weighted = values.map((value) => Math.max(0, value));
  const total = Math.max(
    1e-9,
    weighted.reduce((sum, value) => sum + value, 0),
  );
  let split = 1;
  let firstTotal = weighted[0] ?? 0;
  while (
    split < weighted.length - 1 &&
    Math.abs(total / 2 - (firstTotal + (weighted[split] ?? 0))) < Math.abs(total / 2 - firstTotal)
  ) {
    firstTotal += weighted[split] ?? 0;
    split += 1;
  }
  const share = clamp(firstTotal / total, 0.04, 0.96);
  const first: Tile = vertical
    ? { x: box.x, y: box.y, width: box.width * share, height: box.height }
    : { x: box.x, y: box.y, width: box.width, height: box.height * share };
  const second: Tile = vertical
    ? {
        x: box.x + first.width,
        y: box.y,
        width: box.width - first.width,
        height: box.height,
      }
    : {
        x: box.x,
        y: box.y + first.height,
        width: box.width,
        height: box.height - first.height,
      };
  return [
    ...tile(values.slice(0, split), first, !vertical),
    ...tile(values.slice(split), second, !vertical),
  ];
}

export function treemap<Row extends object>(
  rows: readonly Row[],
  options: TreemapOptions<Row>,
): FamilyPlotResult {
  const id = options.id?.trim() || "treemap";
  const values = rows.map((row) => Math.max(0, finite(row[options.value])));
  const tiles = tile(values, { x: 0.02, y: 0.04, width: 0.96, height: 0.92 }, true);
  const nodes: SceneNode[] = [];
  const ids: string[] = [];
  rows.forEach((row, index) => {
    const name = label(row[options.label], `Item ${index + 1}`);
    const box = tiles[index] ?? { x: 0, y: 0, width: 0, height: 0 };
    const markId = `${id}:tile:${slugify(name)}:${index}`;
    const rowTone = options.tone === undefined ? undefined : row[options.tone];
    ids.push(markId);
    nodes.push({
      id: markId,
      type: "rect",
      position: { x: box.x, y: box.y, anchor: "top-left" },
      width: pct(Math.max(0.004, box.width)),
      height: pct(Math.max(0.004, box.height)),
      fill:
        typeof rowTone === "string"
          ? (rowTone as Paint)
          : (TONES[index % TONES.length] ?? "chart1"),
      stroke: "canvas",
      strokeWidth: 3,
      radius: 6,
      label: name,
      description: `${values[index] ?? 0}`,
      interactive: true,
      inspect: {
        role: "Treemap tile",
        title: name,
        fields: [{ label: "Value", value: String(values[index] ?? 0) }],
      },
    });
    if (box.width >= 0.12)
      nodes.push({
        id: `${markId}:label`,
        type: "text",
        text: name,
        textStyle: "bodyStrong",
        color: "canvas",
        position: { x: box.x + box.width / 2, y: box.y + box.height / 2, anchor: "center" },
        width: pct(Math.max(0.08, box.width * 0.8)),
        align: "center",
        maxLines: 2,
      });
  });
  return finish(options, nodes, ids, [], [], `Treemap of ${rows.length} weighted items.`);
}

export interface SankeyNode {
  readonly id: string;
  readonly label: string;
  readonly tone?: Paint;
  readonly stage?: number;
}

export interface SankeyLink {
  readonly source: string;
  readonly target: string;
  readonly value: number;
  readonly label?: string;
  readonly tone?: Paint;
}

export interface SankeyOptions extends FamilyPlotOptions {
  readonly nodes: readonly SankeyNode[];
  readonly links: readonly SankeyLink[];
}

function depths(nodes: readonly SankeyNode[], links: readonly SankeyLink[]): Map<string, number> {
  const result = new Map(nodes.map((node) => [node.id, Math.max(0, Math.floor(node.stage ?? 0))]));
  for (let pass = 0; pass < nodes.length; pass += 1)
    for (const link of links) {
      const next = Math.max(result.get(link.target) ?? 0, (result.get(link.source) ?? 0) + 1);
      result.set(link.target, next);
    }
  return result;
}

export function sankey(options: SankeyOptions): FamilyPlotResult {
  const id = options.id?.trim() || "sankey";
  const depth = depths(options.nodes, options.links);
  const maxDepth = Math.max(1, ...depth.values());
  const grouped = new Map<number, SankeyNode[]>();
  for (const node of options.nodes) {
    const level = depth.get(node.id) ?? 0;
    const entries = grouped.get(level) ?? [];
    entries.push(node);
    grouped.set(level, entries);
  }
  const children: SceneNode[] = [];
  const ids: string[] = [];
  for (const [level, entries] of grouped)
    entries.forEach((node, index) => {
      const nodeId = `${id}:node:${slugify(node.id)}`;
      ids.push(nodeId);
      children.push({
        id: nodeId,
        type: "rect",
        position: {
          x: 0.08 + (level / maxDepth) * 0.84,
          y: (index + 0.5) / Math.max(1, entries.length),
          anchor: "center",
        },
        width: "13%",
        height: Math.max(
          26,
          Math.min(58, ((options.height ?? 300) / Math.max(2, entries.length)) * 0.42),
        ),
        fill: node.tone ?? TONES[level % TONES.length] ?? "chart1",
        radius: 6,
        label: node.label,
        interactive: true,
      });
    });
  const maximum = Math.max(1, ...options.links.map((link) => Math.max(0, link.value)));
  const edges: EdgeDefinition[] = options.links.map((link, index) => ({
    id: `${id}:flow:${index}`,
    from: `${id}:node:${slugify(link.source)}`,
    to: `${id}:node:${slugify(link.target)}`,
    route: "curve",
    head: "none",
    width: 2 + (Math.max(0, link.value) / maximum) * 14,
    tone: link.tone ?? "connector",
    opacity: 0.62,
    ...(link.label === undefined ? {} : { label: link.label }),
    description: `${link.source} to ${link.target}: ${link.value}`,
  }));
  return finish(
    options,
    children,
    ids,
    [],
    edges,
    `Sankey flow with ${options.nodes.length} nodes and ${options.links.length} links.`,
  );
}

export interface TopologyNode {
  readonly id: string;
  readonly label: string;
  readonly x?: number;
  readonly y?: number;
  readonly tone?: Paint;
}

export interface TopologyLink {
  readonly source: string;
  readonly target: string;
  readonly label?: string;
  readonly tone?: Paint;
  readonly directed?: boolean;
}

export interface TopologyOptions extends FamilyPlotOptions {
  readonly nodes: readonly TopologyNode[];
  readonly links: readonly TopologyLink[];
}

export function topology(options: TopologyOptions): FamilyPlotResult {
  const id = options.id?.trim() || "topology";
  const children: SceneNode[] = options.nodes.map((node, index) => {
    const angle = (index / Math.max(1, options.nodes.length)) * Math.PI * 2 - Math.PI / 2;
    return {
      id: `${id}:node:${slugify(node.id)}`,
      type: "circle",
      position: {
        x: node.x ?? 0.5 + Math.cos(angle) * 0.36,
        y: node.y ?? 0.5 + Math.sin(angle) * 0.36,
        anchor: "center",
      },
      radius: 24,
      fill: node.tone ?? TONES[index % TONES.length] ?? "chart1",
      stroke: "canvas",
      strokeWidth: 3,
      label: node.label,
      interactive: true,
      inspect: { role: "Topology node", title: node.label },
    };
  });
  const edges: EdgeDefinition[] = options.links.map((link, index) => ({
    id: `${id}:link:${index}`,
    from: `${id}:node:${slugify(link.source)}`,
    to: `${id}:node:${slugify(link.target)}`,
    route: "straight",
    head: link.directed === true ? "arrow" : "none",
    tone: link.tone ?? "connector",
    ...(link.label === undefined ? {} : { label: link.label }),
  }));
  return finish(
    options,
    children,
    children.map((node) => node.id),
    [],
    edges,
    `Topology with ${options.nodes.length} nodes and ${options.links.length} links.`,
  );
}
