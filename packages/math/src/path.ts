/**
 * Affine transforms for SVG path data.
 *
 * MathJax positions every glyph with nested `translate`/`scale` groups. To fold a whole formula
 * into one path the commands have to be rewritten in the root coordinate system, which means
 * resolving relative commands, expanding the shorthand forms (`H`, `V`, `S`, `T`) whose meaning
 * depends on the axes, and applying the matrix to every point.
 */

/** Row-major 2D affine matrix `[a, b, c, d, e, f]` as in SVG `matrix(a b c d e f)`. */
export type Affine = readonly [number, number, number, number, number, number];

export const IDENTITY: Affine = [1, 0, 0, 1, 0, 0];

export function multiply(m: Affine, n: Affine): Affine {
  return [
    m[0] * n[0] + m[2] * n[1],
    m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3],
    m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4],
    m[1] * n[4] + m[3] * n[5] + m[5],
  ];
}

export function apply(m: Affine, x: number, y: number): readonly [number, number] {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}

/** Parses an SVG `transform` attribute (translate, scale, matrix, rotate, skewX, skewY). */
export function parseTransform(value: string | null | undefined): Affine {
  let result: Affine = IDENTITY;
  if (!value) return result;
  const pattern = /(\w+)\s*\(([^)]*)\)/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(value)) !== null) {
    const name = match[1] ?? "";
    const args = (match[2] ?? "")
      .trim()
      .split(/[\s,]+/)
      .filter((part) => part.length > 0)
      .map(Number);
    const [a = 0, b = 0, c = 0, d = 0, e = 0, f = 0] = args;
    let next: Affine;
    switch (name) {
      case "translate":
        next = [1, 0, 0, 1, a, args.length > 1 ? b : 0];
        break;
      case "scale":
        next = [a, 0, 0, args.length > 1 ? b : a, 0, 0];
        break;
      case "matrix":
        next = [a, b, c, d, e, f];
        break;
      case "rotate": {
        const angle = (a * Math.PI) / 180;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        next = [cos, sin, -sin, cos, 0, 0];
        if (args.length > 2) {
          next = multiply(multiply([1, 0, 0, 1, b, c], next), [1, 0, 0, 1, -b, -c]);
        }
        break;
      }
      case "skewX":
        next = [1, 0, Math.tan((a * Math.PI) / 180), 1, 0, 0];
        break;
      case "skewY":
        next = [1, Math.tan((a * Math.PI) / 180), 0, 1, 0, 0];
        break;
      default:
        continue;
    }
    result = multiply(result, next);
  }
  return result;
}

const NUMBER = /[-+]?(?:\d*\.\d+|\d+\.?)(?:e[-+]?\d+)?/gi;

function tokens(d: string): (string | number)[] {
  const out: (string | number)[] = [];
  const pattern = /([MmLlHhVvCcSsQqTtAaZz])|([-+]?(?:\d*\.\d+|\d+\.?)(?:e[-+]?\d+)?)/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(d)) !== null) {
    if (match[1] !== undefined) out.push(match[1]);
    else out.push(Number(match[2]));
  }
  return out;
}

function fmt(value: number, precision: number): string {
  const rounded = Number(value.toFixed(precision));
  return Object.is(rounded, -0) ? "0" : String(rounded);
}

/**
 * Rewrites path data through `m`, emitting only absolute `M L C Q Z` commands. Arcs are
 * approximated by a straight segment to their end point (they do not occur in glyph outlines).
 */
export function transformPath(d: string, m: Affine, precision = 1): string {
  const list = tokens(d);
  const out: string[] = [];
  let command = "";
  let x = 0;
  let y = 0;
  let startX = 0;
  let startY = 0;
  let lastControlX = 0;
  let lastControlY = 0;
  let lastCommand = "";
  let index = 0;
  const pt = (px: number, py: number): string => {
    const [tx, ty] = apply(m, px, py);
    return `${fmt(tx, precision)} ${fmt(ty, precision)}`;
  };
  const next = (): number => {
    const value = list[index];
    index += 1;
    return typeof value === "number" ? value : 0;
  };
  const peekNumber = (): boolean => typeof list[index] === "number";

  while (index < list.length) {
    const token = list[index];
    if (typeof token === "string") {
      command = token;
      index += 1;
      if (command === "Z" || command === "z") {
        out.push("Z");
        x = startX;
        y = startY;
        lastCommand = "Z";
        continue;
      }
    } else if (command === "M") command = "L";
    else if (command === "m") command = "l";
    const relative = command === command.toLowerCase();
    const dx = relative ? x : 0;
    const dy = relative ? y : 0;
    switch (command.toUpperCase()) {
      case "M": {
        x = dx + next();
        y = dy + next();
        startX = x;
        startY = y;
        out.push(`M${pt(x, y)}`);
        break;
      }
      case "L": {
        x = dx + next();
        y = dy + next();
        out.push(`L${pt(x, y)}`);
        break;
      }
      case "H": {
        x = dx + next();
        out.push(`L${pt(x, y)}`);
        break;
      }
      case "V": {
        y = dy + next();
        out.push(`L${pt(x, y)}`);
        break;
      }
      case "C": {
        const x1 = dx + next();
        const y1 = dy + next();
        const x2 = dx + next();
        const y2 = dy + next();
        x = dx + next();
        y = dy + next();
        lastControlX = x2;
        lastControlY = y2;
        out.push(`C${pt(x1, y1)} ${pt(x2, y2)} ${pt(x, y)}`);
        break;
      }
      case "S": {
        const reflect = lastCommand === "C" || lastCommand === "S";
        const x1 = reflect ? 2 * x - lastControlX : x;
        const y1 = reflect ? 2 * y - lastControlY : y;
        const x2 = dx + next();
        const y2 = dy + next();
        x = dx + next();
        y = dy + next();
        lastControlX = x2;
        lastControlY = y2;
        out.push(`C${pt(x1, y1)} ${pt(x2, y2)} ${pt(x, y)}`);
        break;
      }
      case "Q": {
        const x1 = dx + next();
        const y1 = dy + next();
        x = dx + next();
        y = dy + next();
        lastControlX = x1;
        lastControlY = y1;
        out.push(`Q${pt(x1, y1)} ${pt(x, y)}`);
        break;
      }
      case "T": {
        const reflect = lastCommand === "Q" || lastCommand === "T";
        const x1 = reflect ? 2 * x - lastControlX : x;
        const y1 = reflect ? 2 * y - lastControlY : y;
        x = dx + next();
        y = dy + next();
        lastControlX = x1;
        lastControlY = y1;
        out.push(`Q${pt(x1, y1)} ${pt(x, y)}`);
        break;
      }
      case "A": {
        next();
        next();
        next();
        next();
        next();
        x = dx + next();
        y = dy + next();
        out.push(`L${pt(x, y)}`);
        break;
      }
      default:
        // Unknown command: skip its numbers.
        while (peekNumber()) index += 1;
        break;
    }
    lastCommand = command.toUpperCase();
  }
  return out.join(" ");
}

export { NUMBER as PATH_NUMBER };
