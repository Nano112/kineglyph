/** Tiny, dependency-free SVG charts for dense tables and status lists. */

export type MicrochartType = "line" | "area" | "bar" | "pie" | "donut";
export type MicrochartInput = string | readonly number[];

export interface MicrochartOptions {
  readonly type?: MicrochartType;
  readonly width?: number;
  readonly height?: number;
  readonly min?: number;
  readonly max?: number;
  readonly stroke?: string;
  readonly strokeWidth?: number;
  readonly fill?: string;
  readonly negativeFill?: string;
  readonly fills?: readonly string[];
  /** Fraction of each bar reserved as a gap (0..0.8). */
  readonly padding?: number;
  /** Smallest rendered bar in SVG units. Defaults to 0.5; use 0 for binary/raster rows. */
  readonly minimumBarSize?: number;
  /** Donut hole as a fraction of the outer radius (0..0.9). */
  readonly innerRadius?: number;
  readonly label?: string;
}

export type MicrochartMarkName = "circle" | "path" | "rect";

export interface ResolvedMicrochartMark {
  readonly name: MicrochartMarkName;
  readonly attributes: Readonly<Record<string, string>>;
}

/** Geometry shared by the string renderer and the browser's persistent-DOM renderer. */
export interface ResolvedMicrochart {
  readonly type: MicrochartType;
  readonly width: number;
  readonly height: number;
  readonly label?: string;
  readonly marks: readonly ResolvedMicrochartMark[];
}

const MICRO_PALETTE = [
  "var(--kg-color-chart1,currentColor)",
  "var(--kg-color-chart2,#2f7bd9)",
  "var(--kg-color-chart3,#b26200)",
  "var(--kg-color-chart4,#16835d)",
  "var(--kg-color-chart5,#c9363e)",
  "var(--kg-color-chart6,#7a8290)",
] as const;

const round = (value: number): string => {
  const result = Math.round(value * 100) / 100;
  return String(Object.is(result, -0) ? 0 : result);
};

const escape = (value: string): string =>
  value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;");

function finite(value: number, name: string): number {
  if (!Number.isFinite(value)) throw new RangeError(`microchart ${name} must be finite`);
  return value;
}

function dimension(value: number | undefined, fallback: number, name: string): number {
  const result = finite(value ?? fallback, name);
  if (result <= 0) throw new RangeError(`microchart ${name} must be positive`);
  return result;
}

/** Parses the terse comma- or slash-delimited form used by table-cell sparklines. */
export function parseMicroValues(input: MicrochartInput): number[] {
  const values =
    typeof input === "string"
      ? input
          .trim()
          .split(input.includes("/") ? "/" : ",")
          .filter((part) => part.trim().length > 0)
          .map((part) => Number(part.trim()))
      : [...input];
  if (values.length === 0) throw new RangeError("microchart needs at least one value");
  values.forEach((value, index) => finite(value, `value ${index}`));
  return values;
}

function bounds(
  values: readonly number[],
  options: MicrochartOptions,
  includeZero: boolean,
): [number, number] {
  let measuredMin = includeZero ? 0 : Number.POSITIVE_INFINITY;
  let measuredMax = includeZero ? 0 : Number.NEGATIVE_INFINITY;
  for (const value of values) {
    if (value < measuredMin) measuredMin = value;
    if (value > measuredMax) measuredMax = value;
  }
  const min = options.min ?? measuredMin;
  const max = options.max ?? measuredMax;
  if (!Number.isFinite(min) || !Number.isFinite(max) || min > max)
    throw new RangeError("microchart min/max are invalid");
  return min === max ? [min - 1, max + 1] : [min, max];
}

interface MicrochartSink {
  circle(
    cx: string,
    cy: string,
    radius: string,
    fill: string,
    stroke?: string,
    strokeWidth?: string,
  ): void;
  path(
    data: string,
    fill: string,
    fillOpacity?: string,
    stroke?: string,
    strokeWidth?: string,
    linecap?: string,
    linejoin?: string,
  ): void;
  rect(x: string, y: string, width: string, height: string, radius: string, fill: string): void;
}

class GeometrySink implements MicrochartSink {
  readonly marks: ResolvedMicrochartMark[] = [];

  circle(
    cx: string,
    cy: string,
    radius: string,
    fill: string,
    stroke?: string,
    strokeWidth?: string,
  ): void {
    this.marks.push({
      name: "circle",
      attributes: {
        cx,
        cy,
        r: radius,
        fill,
        ...(stroke === undefined ? {} : { stroke }),
        ...(strokeWidth === undefined ? {} : { "stroke-width": strokeWidth }),
      },
    });
  }

  path(
    data: string,
    fill: string,
    fillOpacity?: string,
    stroke?: string,
    strokeWidth?: string,
    linecap?: string,
    linejoin?: string,
  ): void {
    this.marks.push({
      name: "path",
      attributes: {
        d: data,
        fill,
        ...(fillOpacity === undefined ? {} : { "fill-opacity": fillOpacity }),
        ...(stroke === undefined ? {} : { stroke }),
        ...(strokeWidth === undefined ? {} : { "stroke-width": strokeWidth }),
        ...(linecap === undefined ? {} : { "stroke-linecap": linecap }),
        ...(linejoin === undefined ? {} : { "stroke-linejoin": linejoin }),
      },
    });
  }

  rect(x: string, y: string, width: string, height: string, radius: string, fill: string): void {
    this.marks.push({
      name: "rect",
      attributes: { x, y, width, height, rx: radius, fill },
    });
  }
}

class StringSink implements MicrochartSink {
  body = "";

  circle(
    cx: string,
    cy: string,
    radius: string,
    fill: string,
    stroke?: string,
    strokeWidth?: string,
  ): void {
    this.body += `<circle cx="${cx}" cy="${cy}" r="${radius}" fill="${escape(fill)}"${stroke === undefined ? "" : ` stroke="${escape(stroke)}"`}${strokeWidth === undefined ? "" : ` stroke-width="${strokeWidth}"`}/>`;
  }

  path(
    data: string,
    fill: string,
    fillOpacity?: string,
    stroke?: string,
    strokeWidth?: string,
    linecap?: string,
    linejoin?: string,
  ): void {
    this.body += `<path d="${data}" fill="${escape(fill)}"${fillOpacity === undefined ? "" : ` fill-opacity="${fillOpacity}"`}${stroke === undefined ? "" : ` stroke="${escape(stroke)}"`}${strokeWidth === undefined ? "" : ` stroke-width="${strokeWidth}"`}${linecap === undefined ? "" : ` stroke-linecap="${linecap}"`}${linejoin === undefined ? "" : ` stroke-linejoin="${linejoin}"`}/>`;
  }

  rect(x: string, y: string, width: string, height: string, radius: string, fill: string): void {
    this.body += `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${radius}" fill="${escape(fill)}"/>`;
  }
}

function cartesian(
  values: readonly number[],
  options: MicrochartOptions,
  width: number,
  height: number,
  sink: MicrochartSink,
): void {
  const type = options.type ?? "line";
  // A line sparkline should spend its few pixels showing variation. Filled areas and bars need a
  // meaningful zero baseline unless the author explicitly provides another domain.
  const [min, max] = bounds(values, options, type === "bar" || type === "area");
  const y = (value: number): number => ((max - value) / (max - min)) * height;
  const baseline = y(Math.max(min, Math.min(max, 0)));
  const stroke = options.stroke ?? MICRO_PALETTE[0];
  const fill = options.fill ?? MICRO_PALETTE[0];
  if (type === "bar") {
    const padding = Math.max(0, Math.min(0.8, options.padding ?? 0.18));
    const minimumBarSize = Math.max(0, Math.min(height, options.minimumBarSize ?? 0.5));
    const step = width / values.length;
    const barWidth = Math.max(0.5, step * (1 - padding));
    const negative = options.negativeFill ?? "var(--kg-color-chart-negative,#c9363e)";
    values.forEach((value, index) => {
      const valueY = y(value);
      const top = Math.min(valueY, baseline);
      const barHeight = Math.max(minimumBarSize, Math.abs(baseline - valueY));
      const x = index * step + (step - barWidth) / 2;
      sink.rect(
        round(x),
        round(top),
        round(barWidth),
        round(barHeight),
        round(Math.min(1, barWidth / 4)),
        value < 0 ? negative : fill,
      );
    });
    return;
  }

  const points = values.map(
    (value, index) =>
      [values.length === 1 ? width / 2 : (index / (values.length - 1)) * width, y(value)] as const,
  );
  if (points.length === 1) {
    const [cx, cy] = points[0]!;
    sink.circle(round(cx), round(cy), round(options.strokeWidth ?? 1.5), stroke);
    return;
  }
  const line = `M${points.map(([x, pointY]) => `${round(x)} ${round(pointY)}`).join("L")}`;
  const strokeWidth = round(options.strokeWidth ?? 1.5);
  if (type === "area")
    sink.path(`${line}L${round(width)} ${round(baseline)}L0 ${round(baseline)}Z`, fill, ".18");
  sink.path(line, "none", undefined, stroke, strokeWidth, "round", "round");
}

function polar(
  values: readonly number[],
  options: MicrochartOptions,
  width: number,
  height: number,
  sink: MicrochartSink,
): void {
  const positive = values.map((value) => Math.max(0, value));
  const total = positive.reduce((sum, value) => sum + value, 0);
  const cx = width / 2;
  const cy = height / 2;
  const radius = Math.max(0.5, Math.min(width, height) / 2);
  const fills = options.fills?.length ? options.fills : MICRO_PALETTE;
  const inner =
    (options.type ?? "pie") === "donut"
      ? radius * Math.max(0.05, Math.min(0.9, options.innerRadius ?? 0.55))
      : 0;
  if (total <= 0) {
    sink.circle(
      round(cx),
      round(cy),
      round((radius + inner) / 2),
      "none",
      fills[1] ?? MICRO_PALETTE[1],
      round(Math.max(1, radius - inner)),
    );
    return;
  }
  if (positive.filter((value) => value > 0).length === 1) {
    const color =
      fills[positive.findIndex((value) => value > 0) % fills.length] ?? MICRO_PALETTE[0];
    if (inner > 0)
      sink.circle(
        round(cx),
        round(cy),
        round((radius + inner) / 2),
        "none",
        color,
        round(radius - inner),
      );
    else sink.circle(round(cx), round(cy), round(radius), color);
    return;
  }
  let angle = -Math.PI / 2;
  positive.forEach((value, index) => {
    if (value <= 0) return;
    const end = angle + (value / total) * Math.PI * 2;
    const x1 = cx + Math.cos(angle) * radius;
    const y1 = cy + Math.sin(angle) * radius;
    const x2 = cx + Math.cos(end) * radius;
    const y2 = cy + Math.sin(end) * radius;
    const large = end - angle > Math.PI ? 1 : 0;
    const color = fills[index % fills.length] ?? MICRO_PALETTE[0];
    if (inner <= 0) {
      sink.path(
        `M${round(cx)} ${round(cy)}L${round(x1)} ${round(y1)}A${round(radius)} ${round(radius)} 0 ${large} 1 ${round(x2)} ${round(y2)}Z`,
        color,
      );
    } else {
      const ix2 = cx + Math.cos(end) * inner;
      const iy2 = cy + Math.sin(end) * inner;
      const ix1 = cx + Math.cos(angle) * inner;
      const iy1 = cy + Math.sin(angle) * inner;
      sink.path(
        `M${round(x1)} ${round(y1)}A${round(radius)} ${round(radius)} 0 ${large} 1 ${round(x2)} ${round(y2)}L${round(ix2)} ${round(iy2)}A${round(inner)} ${round(inner)} 0 ${large} 0 ${round(ix1)} ${round(iy1)}Z`,
        color,
      );
    }
    angle = end;
  });
}

function drawMicrochart(
  values: readonly number[],
  options: MicrochartOptions,
  type: MicrochartType,
  width: number,
  height: number,
  sink: MicrochartSink,
): void {
  if (type === "pie" || type === "donut") polar(values, options, width, height, sink);
  else cartesian(values, options, width, height, sink);
}

/** Resolves validated microchart input into renderer-neutral SVG geometry. */
export function resolveMicrochart(
  input: MicrochartInput,
  options: MicrochartOptions = {},
): ResolvedMicrochart {
  const values = parseMicroValues(input);
  const type = options.type ?? "line";
  const polarType = type === "pie" || type === "donut";
  const width = dimension(options.width, polarType ? 16 : 64, "width");
  const height = dimension(options.height, 16, "height");
  const sink = new GeometrySink();
  drawMicrochart(values, options, type, width, height, sink);
  return {
    type,
    width,
    height,
    ...(options.label === undefined ? {} : { label: options.label }),
    marks: sink.marks,
  };
}

/** Renders a complete standalone microchart SVG with no runtime or stylesheet. */
export function renderMicroSvg(input: MicrochartInput, options: MicrochartOptions = {}): string {
  const values = parseMicroValues(input);
  const type = options.type ?? "line";
  const polarType = type === "pie" || type === "donut";
  const width = dimension(options.width, polarType ? 16 : 64, "width");
  const height = dimension(options.height, 16, "height");
  const sink = new StringSink();
  drawMicrochart(values, options, type, width, height, sink);
  const accessibility =
    options.label === undefined
      ? ' aria-hidden="true"'
      : ` role="img" aria-label="${escape(options.label)}"`;
  const title = options.label === undefined ? "" : `<title>${escape(options.label)}</title>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${round(width)} ${round(height)}" width="${round(width)}" height="${round(height)}"${accessibility}>${title}${sink.body}</svg>`;
}

/**
 * The concise microchart renderer. Pass a type string for the common case, or an options object
 * when the chart needs dimensions, colours, a fixed domain, or an accessible label.
 */
export function microchart(
  input: MicrochartInput,
  options: MicrochartOptions | MicrochartType = {},
): string {
  return renderMicroSvg(input, typeof options === "string" ? { type: options } : options);
}
