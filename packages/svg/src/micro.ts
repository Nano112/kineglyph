/** Tiny, dependency-free SVG charts for dense tables and status lists. */

export type MicrochartType = "line" | "area" | "bar" | "pie" | "donut";

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
  /** Donut hole as a fraction of the outer radius (0..0.9). */
  readonly innerRadius?: number;
  readonly label?: string;
}

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
export function parseMicroValues(input: string | readonly number[]): number[] {
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
  const min = options.min ?? Math.min(...(includeZero ? [0, ...values] : values));
  const max = options.max ?? Math.max(...(includeZero ? [0, ...values] : values));
  if (!Number.isFinite(min) || !Number.isFinite(max) || min > max)
    throw new RangeError("microchart min/max are invalid");
  return min === max ? [min - 1, max + 1] : [min, max];
}

function root(width: number, height: number, label: string | undefined, body: string): string {
  const accessibility =
    label === undefined ? ' aria-hidden="true"' : ` role="img" aria-label="${escape(label)}"`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${round(width)} ${round(height)}" width="${round(width)}" height="${round(height)}"${accessibility}>${body}</svg>`;
}

function cartesian(
  values: readonly number[],
  options: MicrochartOptions,
  width: number,
  height: number,
): string {
  const type = options.type ?? "line";
  // A line sparkline should spend its few pixels showing variation. Filled areas and bars need a
  // meaningful zero baseline unless the author explicitly provides another domain.
  const [min, max] = bounds(values, options, type === "bar" || type === "area");
  const y = (value: number): number => ((max - value) / (max - min)) * height;
  const baseline = y(Math.max(min, Math.min(max, 0)));
  const stroke = escape(options.stroke ?? "currentColor");
  const fill = escape(options.fill ?? "currentColor");
  if (type === "bar") {
    const padding = Math.max(0, Math.min(0.8, options.padding ?? 0.18));
    const step = width / values.length;
    const barWidth = Math.max(0.5, step * (1 - padding));
    const negative = escape(options.negativeFill ?? fill);
    const bars = values
      .map((value, index) => {
        const valueY = y(value);
        const top = Math.min(valueY, baseline);
        const barHeight = Math.max(0.5, Math.abs(baseline - valueY));
        const x = index * step + (step - barWidth) / 2;
        return `<rect x="${round(x)}" y="${round(top)}" width="${round(barWidth)}" height="${round(barHeight)}" rx="${round(Math.min(1, barWidth / 4))}" fill="${value < 0 ? negative : fill}"/>`;
      })
      .join("");
    return root(width, height, options.label, bars);
  }

  const points = values.map(
    (value, index) =>
      [values.length === 1 ? width / 2 : (index / (values.length - 1)) * width, y(value)] as const,
  );
  if (points.length === 1) {
    const [cx, cy] = points[0]!;
    return root(
      width,
      height,
      options.label,
      `<circle cx="${round(cx)}" cy="${round(cy)}" r="${round(options.strokeWidth ?? 1.5)}" fill="${stroke}"/>`,
    );
  }
  const line = `M${points.map(([x, pointY]) => `${round(x)} ${round(pointY)}`).join("L")}`;
  const strokeWidth = round(options.strokeWidth ?? 1.5);
  const area =
    type === "area"
      ? `<path d="${line}L${round(width)} ${round(baseline)}L0 ${round(baseline)}Z" fill="${fill}" fill-opacity=".18"/>`
      : "";
  return root(
    width,
    height,
    options.label,
    `${area}<path d="${line}" fill="none" stroke="${stroke}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round"/>`,
  );
}

function polar(
  values: readonly number[],
  options: MicrochartOptions,
  width: number,
  height: number,
): string {
  const positive = values.map((value) => Math.max(0, value));
  const total = positive.reduce((sum, value) => sum + value, 0);
  const cx = width / 2;
  const cy = height / 2;
  const radius = Math.max(0.5, Math.min(width, height) / 2);
  const fills = options.fills?.length
    ? options.fills
    : ["currentColor", "#cbd5e1", "#94a3b8", "#64748b"];
  const inner =
    (options.type ?? "pie") === "donut"
      ? radius * Math.max(0.05, Math.min(0.9, options.innerRadius ?? 0.55))
      : 0;
  if (total <= 0)
    return root(
      width,
      height,
      options.label,
      `<circle cx="${round(cx)}" cy="${round(cy)}" r="${round((radius + inner) / 2)}" fill="none" stroke="${escape(fills[1] ?? "#cbd5e1")}" stroke-width="${round(Math.max(1, radius - inner))}"/>`,
    );
  if (positive.filter((value) => value > 0).length === 1) {
    const color = escape(
      fills[positive.findIndex((value) => value > 0) % fills.length] ?? "currentColor",
    );
    const body =
      inner > 0
        ? `<circle cx="${round(cx)}" cy="${round(cy)}" r="${round((radius + inner) / 2)}" fill="none" stroke="${color}" stroke-width="${round(radius - inner)}"/>`
        : `<circle cx="${round(cx)}" cy="${round(cy)}" r="${round(radius)}" fill="${color}"/>`;
    return root(width, height, options.label, body);
  }
  let angle = -Math.PI / 2;
  const paths: string[] = [];
  positive.forEach((value, index) => {
    if (value <= 0) return;
    const end = angle + (value / total) * Math.PI * 2;
    const x1 = cx + Math.cos(angle) * radius;
    const y1 = cy + Math.sin(angle) * radius;
    const x2 = cx + Math.cos(end) * radius;
    const y2 = cy + Math.sin(end) * radius;
    const large = end - angle > Math.PI ? 1 : 0;
    const color = escape(fills[index % fills.length] ?? "currentColor");
    if (inner <= 0) {
      paths.push(
        `<path d="M${round(cx)} ${round(cy)}L${round(x1)} ${round(y1)}A${round(radius)} ${round(radius)} 0 ${large} 1 ${round(x2)} ${round(y2)}Z" fill="${color}"/>`,
      );
    } else {
      const ix2 = cx + Math.cos(end) * inner;
      const iy2 = cy + Math.sin(end) * inner;
      const ix1 = cx + Math.cos(angle) * inner;
      const iy1 = cy + Math.sin(angle) * inner;
      paths.push(
        `<path d="M${round(x1)} ${round(y1)}A${round(radius)} ${round(radius)} 0 ${large} 1 ${round(x2)} ${round(y2)}L${round(ix2)} ${round(iy2)}A${round(inner)} ${round(inner)} 0 ${large} 0 ${round(ix1)} ${round(iy1)}Z" fill="${color}"/>`,
      );
    }
    angle = end;
  });
  return root(width, height, options.label, paths.join(""));
}

/** Renders a complete standalone microchart SVG with no runtime or stylesheet. */
export function renderMicroSvg(
  input: string | readonly number[],
  options: MicrochartOptions = {},
): string {
  const values = parseMicroValues(input);
  const type = options.type ?? "line";
  const polarType = type === "pie" || type === "donut";
  const width = dimension(options.width, polarType ? 16 : 64, "width");
  const height = dimension(options.height, 16, "height");
  return polarType
    ? polar(values, options, width, height)
    : cartesian(values, options, width, height);
}
