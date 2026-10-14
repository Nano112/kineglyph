import { LIMITS, RequestError, parseRequest, type RenderRequest } from "./schema.js";
export type { RenderRequest, ChartSpec } from "./schema.js";
export type ImageFormat = "svg" | "png" | "gif";
const numeric = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i;
const seriesName = /^[A-Za-z0-9_-]{1,64}$/;
function number(text: string): number {
  if (!numeric.test(text) || !Number.isFinite(Number(text)))
    throw new RequestError("expected finite decimal number");
  return Number(text);
}
export function parseJson(text: string): unknown {
  if (new TextEncoder().encode(text).length > LIMITS.bytes)
    throw new RequestError("input too large", 413);
  try {
    return JSON.parse(text);
  } catch {
    throw new RequestError("invalid JSON");
  }
}
function samples(text: string) {
  return text.split(",").map((v) => (v === "null" ? null : number(v)));
}
/** Duplicate and unknown query keys are errors; spec is exclusive of all shorthand. */
export function parseQuery(params: URLSearchParams) {
  if (new TextEncoder().encode(params.toString()).length > LIMITS.bytes)
    throw new RequestError("input too large", 413);
  const entries = [...params];
  if (new Set(entries.map(([k]) => k)).size !== entries.length)
    throw new RequestError("duplicate query key");
  if (params.has("spec")) {
    if (entries.length !== 1) throw new RequestError("spec cannot be mixed with shorthand");
    return parseRequest(parseJson(params.get("spec")!));
  }
  const allowed = new Set([
    "data",
    "names",
    "x",
    "title",
    "unit",
    "mark",
    "legend",
    "yDomain",
    "xDomain",
    "theme",
    "width",
    "scale",
    "x.min",
    "x.max",
    "y.min",
    "y.max",
    "x.label",
    "y.label",
    "time",
    "fps",
  ]);
  const named = entries.filter(([key]) => key.startsWith("series."));
  for (const [key] of entries)
    if (
      !allowed.has(key) &&
      !(
        key.startsWith("series.") &&
        seriesName.test(key.slice(7)) &&
        !["__proto__", "prototype", "constructor"].includes(key.slice(7))
      )
    )
      throw new RequestError(`unknown query key: ${key}`);
  if (named.length && (params.has("data") || params.has("names")))
    throw new RequestError("named series cannot be mixed with data or names");
  if (!named.length && !params.has("data"))
    throw new RequestError("data or named series is required");
  const sets = named.length
    ? named.map(([, v]) => samples(v))
    : params.get("data")!.split(";").map(samples);
  const names = named.length ? named.map(([k]) => k.slice(7)) : params.get("names")?.split(",");
  if (names && names.length !== sets.length)
    throw new RequestError("names length must match series");
  const chart: Record<string, unknown> = {
    series: sets.map((data, i) => ({
      name: names?.[i] ?? (sets.length === 1 ? "Value" : `Series ${i + 1}`),
      data,
    })),
  };
  for (const key of ["title", "unit", "mark"]) if (params.has(key)) chart[key] = params.get(key);
  if (params.has("legend")) {
    const legend = params.get("legend");
    if (legend !== "true" && legend !== "false")
      throw new RequestError("legend must be true or false");
    chart.legend = legend === "true";
  }
  for (const axis of ["x", "y"]) {
    const key = `${axis}Domain`;
    if (params.has(key)) chart[key] = params.get(key)!.split(",").map(number);
    if (params.has(`${axis}.min`) || params.has(`${axis}.max`)) {
      if (params.has(key) || !params.has(`${axis}.min`) || !params.has(`${axis}.max`))
        throw new RequestError("axis bounds require min and max, without Domain");
      chart[key] = [number(params.get(`${axis}.min`)!), number(params.get(`${axis}.max`)!)];
    }
    if (params.has(`${axis}.label`)) chart[`${axis}Label`] = params.get(`${axis}.label`);
  }
  if (params.has("x")) {
    const x = params.get("x")!.split(",");
    chart.x = x.every((v) => numeric.test(v)) ? x.map(number) : x;
  }
  const input: Record<string, unknown> = { chart };
  for (const key of ["width", "scale", "time", "fps"])
    if (params.has(key)) input[key] = number(params.get(key)!);
  if (params.has("theme")) input.theme = params.get("theme");
  return parseRequest(input);
}
/** Canonical property order, preserving semantically ordered arrays. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(value, (_key: string, v: unknown) => {
    if (!v || typeof v !== "object" || Array.isArray(v)) return v;
    const record = v as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(record)
        .sort()
        .map((key) => [key, record[key]]),
    );
  });
}
export function chartUrl(
  base: string,
  request: RenderRequest,
  format: ImageFormat = "png",
): string {
  if (!["svg", "png", "gif"].includes(format)) throw new RequestError("unsupported format");
  const normalized = parseRequest(request);
  const url = new URL(`chart.${format}`, base.endsWith("/") ? base : `${base}/`);
  const c = normalized.chart;
  // Fall back losslessly for styled series and ambiguous comma-delimited categories.
  const simple =
    c &&
    c.series.every((s) => !s.mark && !s.tone && !s.name.includes(",")) &&
    (!c.x ||
      c.x.every((v) => typeof v === "number") ||
      c.x.every((v) => typeof v === "string" && !v.includes(",") && !numeric.test(v)));
  if (simple && c) {
    url.searchParams.set(
      "data",
      c.series.map((s) => s.data.map((v) => (v === null ? "null" : String(v))).join(",")).join(";"),
    );
    if (c.series.some((s, i) => s.name !== (c.series.length === 1 ? "Value" : `Series ${i + 1}`)))
      url.searchParams.set("names", c.series.map((s) => s.name).join(","));
    if (c.x) url.searchParams.set("x", c.x.join(","));
    if (c.title !== "A closer look") url.searchParams.set("title", c.title);
    if (c.unit) url.searchParams.set("unit", c.unit);
    if (c.mark !== "line") url.searchParams.set("mark", c.mark);
    if (c.legend !== undefined) url.searchParams.set("legend", String(c.legend));
    for (const axis of ["x", "y"] as const) {
      const domain = c[`${axis}Domain`];
      if (domain) {
        url.searchParams.set(`${axis}.min`, String(domain[0]));
        url.searchParams.set(`${axis}.max`, String(domain[1]));
      }
      const label = c[`${axis}Label`];
      if (label) url.searchParams.set(`${axis}.label`, label);
    }
    if (normalized.width !== 960) url.searchParams.set("width", String(normalized.width));
    if (normalized.scale !== 1) url.searchParams.set("scale", String(normalized.scale));
    if (normalized.theme !== "light") url.searchParams.set("theme", normalized.theme);
    if (normalized.time !== undefined) url.searchParams.set("time", String(normalized.time));
    if (normalized.fps !== 8) url.searchParams.set("fps", String(normalized.fps));
  } else url.searchParams.set("spec", canonicalJson(normalized));
  if (new TextEncoder().encode(url.href).length > LIMITS.bytes)
    throw new RequestError("URL too large; use POST", 413);
  return url.href;
}
export const renderUrl = chartUrl;
