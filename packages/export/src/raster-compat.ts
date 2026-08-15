/**
 * Rewrites that make renderer output digestible by resvg, which (unlike browsers) supports
 * neither CSS custom properties nor the `pathLength` attribute. Both passes operate on the
 * serialized SVG text and only rely on standard SVG/CSS syntax, never on Kineglyph markup.
 */

/** Applies every raster compatibility rewrite. */
export function toRasterCompatibleSvg(svg: string): string {
  return normalizePathLength(inlineCssVariables(svg));
}

// ---------------------------------------------------------------------------------------------
// CSS custom properties
// ---------------------------------------------------------------------------------------------

/**
 * Substitutes `var(--name[, fallback])` references with the custom properties declared on the
 * root `<svg style="...">` attribute (and `:root`/`svg` rules inside `<style>` blocks).
 * References that cannot be resolved are left untouched.
 */
export function inlineCssVariables(svg: string): string {
  const variables = collectRootVariables(svg);
  if (!svg.includes("var(")) return svg;
  return substituteVariables(svg, variables, 0);
}

function collectRootVariables(svg: string): Map<string, string> {
  const variables = new Map<string, string>();
  // `declarations` must already be entity-decoded; values are stored re-encoded so they are
  // valid both inside attribute values and inside <style> text content.
  const collect = (declarations: string): void => {
    for (const declaration of splitDeclarations(declarations)) {
      const colon = declaration.indexOf(":");
      if (colon === -1) continue;
      const name = declaration.slice(0, colon).trim();
      const value = declaration.slice(colon + 1).trim();
      if (name.startsWith("--") && value.length > 0) variables.set(name, encodeEntities(value));
    }
  };
  for (const block of svg.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)) {
    const css = decodeEntities(block[1] ?? "");
    for (const rule of css.matchAll(/(?:^|[}\s,])(?::root|svg)\s*\{([^}]*)\}/g)) {
      collect(rule[1] ?? "");
    }
  }
  const root = /<svg(?=[\s/>])[^>]*?\sstyle\s*=\s*(?:"([^"]*)"|'([^']*)')/.exec(svg);
  if (root !== null) collect(decodeEntities(root[1] ?? root[2] ?? ""));
  return variables;
}

function splitDeclarations(value: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  for (const char of value) {
    if (char === "(") depth += 1;
    else if (char === ")") depth = Math.max(0, depth - 1);
    if (char === ";" && depth === 0) {
      parts.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  parts.push(current);
  return parts;
}

function substituteVariables(
  text: string,
  variables: ReadonlyMap<string, string>,
  depth: number,
): string {
  if (depth > 8) return text;
  let output = "";
  let cursor = 0;
  for (;;) {
    const start = text.indexOf("var(", cursor);
    if (start === -1) break;
    const close = matchingParenthesis(text, start + 3);
    if (close === -1) break;
    const inner = text.slice(start + 4, close);
    const comma = topLevelComma(inner);
    const name = (comma === -1 ? inner : inner.slice(0, comma)).trim();
    const fallback = comma === -1 ? undefined : inner.slice(comma + 1).trim();
    let value = variables.get(name);
    if (value === undefined && fallback !== undefined) {
      value = substituteVariables(fallback, variables, depth + 1);
    } else if (value !== undefined && value.includes("var(")) {
      value = substituteVariables(value, variables, depth + 1);
    }
    output += text.slice(cursor, start);
    output += value ?? text.slice(start, close + 1);
    cursor = close + 1;
  }
  return output + text.slice(cursor);
}

function matchingParenthesis(text: string, open: number): number {
  let depth = 0;
  for (let index = open; index < text.length; index += 1) {
    const char = text[index];
    if (char === "(") depth += 1;
    else if (char === ")") {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

function topLevelComma(text: string): number {
  let depth = 0;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === "(") depth += 1;
    else if (char === ")") depth -= 1;
    else if (char === "," && depth === 0) return index;
  }
  return -1;
}

function decodeEntities(value: string): string {
  return value.replace(/&(quot|apos|lt|gt|amp|#x[0-9a-fA-F]+|#\d+);/g, (entity, body: string) => {
    switch (body) {
      case "quot":
        return '"';
      case "apos":
        return "'";
      case "lt":
        return "<";
      case "gt":
        return ">";
      case "amp":
        return "&";
      default: {
        const code = body.startsWith("#x")
          ? Number.parseInt(body.slice(2), 16)
          : Number(body.slice(1));
        return Number.isFinite(code) && code >= 0 && code <= 0x10ffff
          ? String.fromCodePoint(code)
          : entity;
      }
    }
  });
}

function encodeEntities(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ---------------------------------------------------------------------------------------------
// pathLength normalisation
// ---------------------------------------------------------------------------------------------

const PATH_LENGTH_ELEMENTS = new Set([
  "path",
  "line",
  "rect",
  "circle",
  "ellipse",
  "polyline",
  "polygon",
]);

/**
 * Converts `pathLength`-relative dash values into user-space lengths so that renderers without
 * `pathLength` support draw the same partial strokes as browsers do.
 */
export function normalizePathLength(svg: string): string {
  if (!svg.includes("pathLength")) return svg;
  return svg.replace(
    /<([a-zA-Z][\w:-]*)((?:\s+[^\s=/>]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'>]+))?)*)\s*(\/?)>/g,
    (tag, name: string, rawAttributes: string, slash: string) => {
      if (!PATH_LENGTH_ELEMENTS.has(name)) return tag;
      const attributes = parseAttributes(rawAttributes);
      const declared = attributes.get("pathLength");
      if (declared === undefined) return tag;
      const authored = Number(declared);
      const actual = geometricLength(name, attributes);
      if (!Number.isFinite(authored) || authored <= 0 || actual === undefined) return tag;
      const ratio = actual / authored;
      attributes.delete("pathLength");
      for (const key of ["stroke-dasharray", "stroke-dashoffset"]) {
        const value = attributes.get(key);
        if (value !== undefined) attributes.set(key, scaleLengthList(value, ratio));
      }
      const serialized = [...attributes].map(([key, value]) => ` ${key}="${value}"`).join("");
      return `<${name}${serialized}${slash === "/" ? "/" : ""}>`;
    },
  );
}

function parseAttributes(raw: string): Map<string, string> {
  const attributes = new Map<string, string>();
  const pattern = /\s+([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;
  for (const match of raw.matchAll(pattern)) {
    const name = match[1];
    if (name === undefined) continue;
    // Single-quoted values are re-serialised with double quotes, so escape any literal quote.
    const value = match[2] ?? match[3]?.replace(/"/g, "&quot;") ?? match[4] ?? "";
    attributes.set(name, value);
  }
  return attributes;
}

function scaleLengthList(value: string, ratio: number): string {
  const trimmed = value.trim();
  if (trimmed === "" || trimmed === "none") return value;
  return trimmed
    .split(/[\s,]+/)
    .map((part) => {
      if (part.endsWith("%")) return part;
      const parsed = Number(part);
      return Number.isFinite(parsed) ? formatLength(parsed * ratio) : part;
    })
    .join(" ");
}

function formatLength(value: number): string {
  const rounded = Number(value.toFixed(4));
  return Object.is(rounded, -0) ? "0" : String(rounded);
}

function geometricLength(
  name: string,
  attributes: ReadonlyMap<string, string>,
): number | undefined {
  const read = (key: string, fallback = 0): number => {
    const raw = attributes.get(key);
    if (raw === undefined) return fallback;
    const parsed = Number.parseFloat(raw);
    return Number.isFinite(parsed) ? parsed : fallback;
  };
  switch (name) {
    case "line":
      return Math.hypot(read("x2") - read("x1"), read("y2") - read("y1"));
    case "circle":
      return 2 * Math.PI * Math.max(0, read("r"));
    case "ellipse":
      return ellipsePerimeter(Math.max(0, read("rx")), Math.max(0, read("ry")));
    case "rect": {
      const width = Math.max(0, read("width"));
      const height = Math.max(0, read("height"));
      const rxRaw = attributes.get("rx");
      const ryRaw = attributes.get("ry");
      let rx = rxRaw === undefined ? (ryRaw === undefined ? 0 : read("ry")) : read("rx");
      let ry = ryRaw === undefined ? rx : read("ry");
      rx = Math.min(Math.max(0, rx), width / 2);
      ry = Math.min(Math.max(0, ry), height / 2);
      return 2 * (width - 2 * rx) + 2 * (height - 2 * ry) + ellipsePerimeter(rx, ry);
    }
    case "polyline":
    case "polygon":
      return polyLength(attributes.get("points") ?? "", name === "polygon");
    case "path":
      return pathLength(attributes.get("d") ?? "");
    default:
      return undefined;
  }
}

function ellipsePerimeter(rx: number, ry: number): number {
  if (rx === 0 && ry === 0) return 0;
  const h = ((rx - ry) / (rx + ry)) ** 2;
  return Math.PI * (rx + ry) * (1 + (3 * h) / (10 + Math.sqrt(4 - 3 * h)));
}

function polyLength(points: string, closed: boolean): number | undefined {
  const numbers = points
    .trim()
    .split(/[\s,]+/)
    .filter((part) => part.length > 0)
    .map(Number);
  if (numbers.length < 4 || numbers.some((value) => !Number.isFinite(value))) return undefined;
  let length = 0;
  for (let index = 2; index + 1 < numbers.length; index += 2) {
    length += Math.hypot(
      (numbers[index] ?? 0) - (numbers[index - 2] ?? 0),
      (numbers[index + 1] ?? 0) - (numbers[index - 1] ?? 0),
    );
  }
  if (closed) {
    const last = numbers.length - (numbers.length % 2 === 0 ? 2 : 3);
    length += Math.hypot(
      (numbers[0] ?? 0) - (numbers[last] ?? 0),
      (numbers[1] ?? 0) - (numbers[last + 1] ?? 0),
    );
  }
  return length;
}

// --- path data -------------------------------------------------------------------------------

type Point = readonly [number, number];

const CURVE_SAMPLES = 48;

/** Total length of SVG path data. Curves and arcs are flattened with fixed sampling. */
export function pathLength(d: string): number | undefined {
  const tokens = tokenizePath(d);
  if (tokens === undefined) return undefined;
  let length = 0;
  let current: Point = [0, 0];
  let start: Point = [0, 0];
  let previousControl: Point | undefined;
  let previousCommand = "";
  const advance = (target: Point): void => {
    length += Math.hypot(target[0] - current[0], target[1] - current[1]);
    current = target;
  };
  for (const segment of tokens) {
    const relative = segment.command === segment.command.toLowerCase();
    const command = segment.command.toUpperCase();
    const args = segment.args;
    const abs = (x: number, y: number): Point =>
      relative ? [current[0] + x, current[1] + y] : [x, y];
    let control: Point | undefined;
    switch (command) {
      case "M": {
        const [x = 0, y = 0] = args;
        current = abs(x, y);
        start = current;
        break;
      }
      case "L": {
        const [x = 0, y = 0] = args;
        advance(abs(x, y));
        break;
      }
      case "H": {
        const [x = 0] = args;
        advance([relative ? current[0] + x : x, current[1]]);
        break;
      }
      case "V": {
        const [y = 0] = args;
        advance([current[0], relative ? current[1] + y : y]);
        break;
      }
      case "Z":
        advance(start);
        break;
      case "C": {
        const [x1 = 0, y1 = 0, x2 = 0, y2 = 0, x = 0, y = 0] = args;
        const c1 = abs(x1, y1);
        const c2 = abs(x2, y2);
        const end = abs(x, y);
        length += cubicLength(current, c1, c2, end);
        control = c2;
        current = end;
        break;
      }
      case "S": {
        const [x2 = 0, y2 = 0, x = 0, y = 0] = args;
        const c1: Point =
          previousControl !== undefined && (previousCommand === "C" || previousCommand === "S")
            ? [2 * current[0] - previousControl[0], 2 * current[1] - previousControl[1]]
            : current;
        const c2 = abs(x2, y2);
        const end = abs(x, y);
        length += cubicLength(current, c1, c2, end);
        control = c2;
        current = end;
        break;
      }
      case "Q": {
        const [x1 = 0, y1 = 0, x = 0, y = 0] = args;
        const c1 = abs(x1, y1);
        const end = abs(x, y);
        length += quadraticLength(current, c1, end);
        control = c1;
        current = end;
        break;
      }
      case "T": {
        const [x = 0, y = 0] = args;
        const c1: Point =
          previousControl !== undefined && (previousCommand === "Q" || previousCommand === "T")
            ? [2 * current[0] - previousControl[0], 2 * current[1] - previousControl[1]]
            : current;
        const end = abs(x, y);
        length += quadraticLength(current, c1, end);
        control = c1;
        current = end;
        break;
      }
      case "A": {
        const [rx = 0, ry = 0, rotation = 0, largeArc = 0, sweep = 0, x = 0, y = 0] = args;
        const end = abs(x, y);
        length += arcLength(current, rx, ry, rotation, largeArc !== 0, sweep !== 0, end);
        current = end;
        break;
      }
      default:
        return undefined;
    }
    previousControl = control;
    previousCommand = command;
  }
  return length;
}

interface PathSegment {
  readonly command: string;
  readonly args: readonly number[];
}

const ARGUMENT_COUNT: Readonly<Record<string, number>> = {
  M: 2,
  L: 2,
  H: 1,
  V: 1,
  Z: 0,
  C: 6,
  S: 4,
  Q: 4,
  T: 2,
  A: 7,
};

const NUMBER_PATTERN = /[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/y;
const FLAG_PATTERN = /[01]/y;
const SEPARATOR_PATTERN = /[\s,]*/y;

function tokenizePath(d: string): PathSegment[] | undefined {
  const segments: PathSegment[] = [];
  let cursor = 0;
  let command = "";
  const skipSeparators = (): void => {
    SEPARATOR_PATTERN.lastIndex = cursor;
    SEPARATOR_PATTERN.exec(d);
    cursor = SEPARATOR_PATTERN.lastIndex;
  };
  const readNumber = (index: number): number | undefined => {
    skipSeparators();
    const pattern =
      command.toUpperCase() === "A" && (index === 3 || index === 4) ? FLAG_PATTERN : NUMBER_PATTERN;
    pattern.lastIndex = cursor;
    const match = pattern.exec(d);
    if (match === null) return undefined;
    cursor = pattern.lastIndex;
    return Number(match[0]);
  };
  while (cursor < d.length) {
    skipSeparators();
    if (cursor >= d.length) break;
    const char = d[cursor] ?? "";
    if (/[a-zA-Z]/.test(char)) {
      command = char;
      cursor += 1;
    } else if (command === "") {
      return undefined;
    } else if (command === "M") command = "L";
    else if (command === "m") command = "l";
    const upper = command.toUpperCase();
    const count = ARGUMENT_COUNT[upper];
    if (count === undefined) return undefined;
    if (count === 0) {
      segments.push({ command, args: [] });
      continue;
    }
    const args: number[] = [];
    for (let index = 0; index < count; index += 1) {
      const value = readNumber(index);
      if (value === undefined) return segments.length > 0 ? segments : undefined;
      args.push(value);
    }
    segments.push({ command, args });
  }
  return segments;
}

function cubicLength(p0: Point, p1: Point, p2: Point, p3: Point): number {
  let length = 0;
  let previous = p0;
  for (let step = 1; step <= CURVE_SAMPLES; step += 1) {
    const t = step / CURVE_SAMPLES;
    const mt = 1 - t;
    const point: Point = [
      mt ** 3 * p0[0] + 3 * mt ** 2 * t * p1[0] + 3 * mt * t ** 2 * p2[0] + t ** 3 * p3[0],
      mt ** 3 * p0[1] + 3 * mt ** 2 * t * p1[1] + 3 * mt * t ** 2 * p2[1] + t ** 3 * p3[1],
    ];
    length += Math.hypot(point[0] - previous[0], point[1] - previous[1]);
    previous = point;
  }
  return length;
}

function quadraticLength(p0: Point, p1: Point, p2: Point): number {
  let length = 0;
  let previous = p0;
  for (let step = 1; step <= CURVE_SAMPLES; step += 1) {
    const t = step / CURVE_SAMPLES;
    const mt = 1 - t;
    const point: Point = [
      mt ** 2 * p0[0] + 2 * mt * t * p1[0] + t ** 2 * p2[0],
      mt ** 2 * p0[1] + 2 * mt * t * p1[1] + t ** 2 * p2[1],
    ];
    length += Math.hypot(point[0] - previous[0], point[1] - previous[1]);
    previous = point;
  }
  return length;
}

/** Elliptical arc length via the SVG endpoint-to-centre conversion (spec appendix B.2.4). */
function arcLength(
  from: Point,
  radiusX: number,
  radiusY: number,
  rotationDegrees: number,
  largeArc: boolean,
  sweep: boolean,
  to: Point,
): number {
  let rx = Math.abs(radiusX);
  let ry = Math.abs(radiusY);
  if (rx === 0 || ry === 0 || (from[0] === to[0] && from[1] === to[1])) {
    return Math.hypot(to[0] - from[0], to[1] - from[1]);
  }
  const phi = (rotationDegrees * Math.PI) / 180;
  const cosPhi = Math.cos(phi);
  const sinPhi = Math.sin(phi);
  const dx = (from[0] - to[0]) / 2;
  const dy = (from[1] - to[1]) / 2;
  const x1 = cosPhi * dx + sinPhi * dy;
  const y1 = -sinPhi * dx + cosPhi * dy;
  const lambda = (x1 * x1) / (rx * rx) + (y1 * y1) / (ry * ry);
  if (lambda > 1) {
    const scale = Math.sqrt(lambda);
    rx *= scale;
    ry *= scale;
  }
  const numerator = rx * rx * ry * ry - rx * rx * y1 * y1 - ry * ry * x1 * x1;
  const denominator = rx * rx * y1 * y1 + ry * ry * x1 * x1;
  let coefficient = Math.sqrt(Math.max(0, numerator / denominator));
  if (largeArc === sweep) coefficient = -coefficient;
  const cx1 = (coefficient * rx * y1) / ry;
  const cy1 = (-coefficient * ry * x1) / rx;
  const cx = cosPhi * cx1 - sinPhi * cy1 + (from[0] + to[0]) / 2;
  const cy = sinPhi * cx1 + cosPhi * cy1 + (from[1] + to[1]) / 2;
  const angle = (ux: number, uy: number, vx: number, vy: number): number => {
    const dot = ux * vx + uy * vy;
    const magnitude = Math.hypot(ux, uy) * Math.hypot(vx, vy);
    let value = Math.acos(Math.min(1, Math.max(-1, dot / magnitude)));
    if (ux * vy - uy * vx < 0) value = -value;
    return value;
  };
  const theta1 = angle(1, 0, (x1 - cx1) / rx, (y1 - cy1) / ry);
  let delta = angle((x1 - cx1) / rx, (y1 - cy1) / ry, (-x1 - cx1) / rx, (-y1 - cy1) / ry);
  if (!sweep && delta > 0) delta -= 2 * Math.PI;
  else if (sweep && delta < 0) delta += 2 * Math.PI;
  const samples = Math.max(
    CURVE_SAMPLES,
    Math.ceil((Math.abs(delta) / (Math.PI / 2)) * CURVE_SAMPLES),
  );
  let length = 0;
  let previous = from;
  for (let step = 1; step <= samples; step += 1) {
    const theta = theta1 + (delta * step) / samples;
    const point: Point = [
      cx + rx * Math.cos(theta) * cosPhi - ry * Math.sin(theta) * sinPhi,
      cy + rx * Math.cos(theta) * sinPhi + ry * Math.sin(theta) * cosPhi,
    ];
    length += Math.hypot(point[0] - previous[0], point[1] - previous[1]);
    previous = point;
  }
  return length;
}
