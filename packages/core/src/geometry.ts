/**
 * Deterministic path geometry: segments, arc-length sampling, and SVG path emission.
 * Curves are sampled with a fixed subdivision count so equal inputs give equal results.
 */
import type { Point, Rect } from "./schema.js";

export type PathSegment =
  | { readonly kind: "line"; readonly from: Point; readonly to: Point }
  | { readonly kind: "quad"; readonly from: Point; readonly control: Point; readonly to: Point }
  | {
      readonly kind: "cubic";
      readonly from: Point;
      readonly control1: Point;
      readonly control2: Point;
      readonly to: Point;
    }
  | {
      readonly kind: "arc";
      readonly from: Point;
      readonly to: Point;
      readonly radius: number;
      /** SVG sweep flag: 1 draws clockwise in screen space. */
      readonly sweep: 0 | 1;
      readonly largeArc: 0 | 1;
    };

export interface PathPoint extends Point {
  /** Tangent angle in radians, screen space (y down). */
  readonly angle: number;
}

const CURVE_SAMPLES = 24;

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function distance(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function quadPoint(segment: Extract<PathSegment, { kind: "quad" }>, t: number): Point {
  const u = 1 - t;
  return {
    x: u * u * segment.from.x + 2 * u * t * segment.control.x + t * t * segment.to.x,
    y: u * u * segment.from.y + 2 * u * t * segment.control.y + t * t * segment.to.y,
  };
}

function cubicPoint(segment: Extract<PathSegment, { kind: "cubic" }>, t: number): Point {
  const u = 1 - t;
  return {
    x:
      u * u * u * segment.from.x +
      3 * u * u * t * segment.control1.x +
      3 * u * t * t * segment.control2.x +
      t * t * t * segment.to.x,
    y:
      u * u * u * segment.from.y +
      3 * u * u * t * segment.control1.y +
      3 * u * t * t * segment.control2.y +
      t * t * t * segment.to.y,
  };
}

interface ArcParameters {
  readonly center: Point;
  readonly startAngle: number;
  readonly sweepAngle: number;
}

/**
 * Converts SVG endpoint arc parameters (circular, no rotation) to a centre parameterisation
 * following the SVG implementation notes (F.6.5), so sampled points sit exactly on the arc a
 * renderer draws for the emitted `A` command.
 */
function arcParameters(segment: Extract<PathSegment, { kind: "arc" }>): ArcParameters | undefined {
  const chord = distance(segment.from, segment.to);
  if (chord === 0) return undefined;
  const radius = Math.max(segment.radius, chord / 2);
  const x1p = (segment.from.x - segment.to.x) / 2;
  const y1p = (segment.from.y - segment.to.y) / 2;
  const rr = radius * radius;
  const numerator = rr * rr - rr * y1p * y1p - rr * x1p * x1p;
  const denominator = rr * y1p * y1p + rr * x1p * x1p;
  const coefficient =
    (segment.largeArc === segment.sweep ? -1 : 1) *
    Math.sqrt(Math.max(0, denominator === 0 ? 0 : numerator / denominator));
  const cxp = coefficient * ((radius * y1p) / radius);
  const cyp = coefficient * -((radius * x1p) / radius);
  const center = {
    x: cxp + (segment.from.x + segment.to.x) / 2,
    y: cyp + (segment.from.y + segment.to.y) / 2,
  };
  const startAngle = Math.atan2((y1p - cyp) / radius, (x1p - cxp) / radius);
  const endAngle = Math.atan2((-y1p - cyp) / radius, (-x1p - cxp) / radius);
  let sweepAngle = endAngle - startAngle;
  if (segment.sweep === 0 && sweepAngle > 0) sweepAngle -= Math.PI * 2;
  else if (segment.sweep === 1 && sweepAngle < 0) sweepAngle += Math.PI * 2;
  return { center, startAngle, sweepAngle };
}

function arcPoint(
  segment: Extract<PathSegment, { kind: "arc" }>,
  parameters: ArcParameters | undefined,
  t: number,
): Point {
  if (parameters === undefined)
    return { x: lerp(segment.from.x, segment.to.x, t), y: lerp(segment.from.y, segment.to.y, t) };
  const radius = Math.max(segment.radius, distance(segment.from, segment.to) / 2);
  const angle = parameters.startAngle + parameters.sweepAngle * t;
  return {
    x: parameters.center.x + Math.cos(angle) * radius,
    y: parameters.center.y + Math.sin(angle) * radius,
  };
}

function segmentPoint(segment: PathSegment, t: number, arc?: ArcParameters): Point {
  switch (segment.kind) {
    case "line":
      return { x: lerp(segment.from.x, segment.to.x, t), y: lerp(segment.from.y, segment.to.y, t) };
    case "quad":
      return quadPoint(segment, t);
    case "cubic":
      return cubicPoint(segment, t);
    case "arc":
      return arcPoint(segment, arc, t);
  }
}

interface SampledSegment {
  readonly segment: PathSegment;
  readonly points: readonly Point[];
  readonly cumulative: readonly number[];
  readonly length: number;
}

/** Arc-length parameterised path built from typed segments. */
export class PathGeometry {
  readonly segments: readonly PathSegment[];
  readonly length: number;
  readonly #sampled: readonly SampledSegment[];

  constructor(segments: readonly PathSegment[]) {
    this.segments = segments;
    this.#sampled = segments.map((segment) => {
      const samples = segment.kind === "line" ? 1 : CURVE_SAMPLES;
      const arc = segment.kind === "arc" ? arcParameters(segment) : undefined;
      const points: Point[] = [];
      const cumulative: number[] = [0];
      let length = 0;
      for (let index = 0; index <= samples; index += 1) {
        const point = segmentPoint(segment, index / samples, arc);
        if (index > 0) {
          const previous = points[index - 1];
          if (previous !== undefined) length += distance(previous, point);
          cumulative.push(length);
        }
        points.push(point);
      }
      return { segment, points, cumulative, length };
    });
    this.length = this.#sampled.reduce((sum, entry) => sum + entry.length, 0);
  }

  get start(): Point {
    const first = this.segments[0];
    return first === undefined ? { x: 0, y: 0 } : first.from;
  }

  get end(): Point {
    const last = this.segments[this.segments.length - 1];
    return last === undefined ? { x: 0, y: 0 } : last.to;
  }

  /** Point and tangent at a normalised distance along the path (0..1). */
  pointAt(t: number): PathPoint {
    const target = Math.min(1, Math.max(0, Number.isFinite(t) ? t : 0)) * this.length;
    let travelled = 0;
    for (const entry of this.#sampled) {
      if (
        target <= travelled + entry.length + 1e-9 ||
        entry === this.#sampled[this.#sampled.length - 1]
      ) {
        const local = Math.min(entry.length, Math.max(0, target - travelled));
        return pointOnSampled(entry, local);
      }
      travelled += entry.length;
    }
    const end = this.end;
    return { x: end.x, y: end.y, angle: 0 };
  }

  /** Axis-aligned bounds of the sampled path. */
  bounds(): Rect {
    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    for (const entry of this.#sampled)
      for (const point of entry.points) {
        minX = Math.min(minX, point.x);
        minY = Math.min(minY, point.y);
        maxX = Math.max(maxX, point.x);
        maxY = Math.max(maxY, point.y);
      }
    if (!Number.isFinite(minX)) return { x: 0, y: 0, width: 0, height: 0 };
    return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
  }

  /** SVG path data with the given decimal precision. */
  toSvg(precision = 3): string {
    const n = (value: number): string => formatNumber(value, precision);
    const parts: string[] = [];
    let cursor: Point | undefined;
    for (const segment of this.segments) {
      if (cursor === undefined || distance(cursor, segment.from) > 1e-6)
        parts.push(`M ${n(segment.from.x)} ${n(segment.from.y)}`);
      switch (segment.kind) {
        case "line":
          parts.push(`L ${n(segment.to.x)} ${n(segment.to.y)}`);
          break;
        case "quad":
          parts.push(
            `Q ${n(segment.control.x)} ${n(segment.control.y)} ${n(segment.to.x)} ${n(segment.to.y)}`,
          );
          break;
        case "cubic":
          parts.push(
            `C ${n(segment.control1.x)} ${n(segment.control1.y)} ${n(segment.control2.x)} ${n(segment.control2.y)} ${n(segment.to.x)} ${n(segment.to.y)}`,
          );
          break;
        case "arc": {
          const radius = Math.max(segment.radius, distance(segment.from, segment.to) / 2);
          parts.push(
            `A ${n(radius)} ${n(radius)} 0 ${segment.largeArc} ${segment.sweep} ${n(segment.to.x)} ${n(segment.to.y)}`,
          );
          break;
        }
      }
      cursor = segment.to;
    }
    return parts.join(" ");
  }
}

function pointOnSampled(entry: SampledSegment, local: number): PathPoint {
  const points = entry.points;
  const cumulative = entry.cumulative;
  for (let index = 1; index < points.length; index += 1) {
    const end = cumulative[index] ?? 0;
    const start = cumulative[index - 1] ?? 0;
    const a = points[index - 1];
    const b = points[index];
    if (a === undefined || b === undefined) continue;
    if (local <= end || index === points.length - 1) {
      const span = end - start;
      const t = span <= 1e-9 ? 0 : Math.min(1, Math.max(0, (local - start) / span));
      return {
        x: lerp(a.x, b.x, t),
        y: lerp(a.y, b.y, t),
        angle: Math.atan2(b.y - a.y, b.x - a.x),
      };
    }
  }
  const only = points[0] ?? { x: 0, y: 0 };
  return { x: only.x, y: only.y, angle: 0 };
}

export function formatNumber(value: number, precision: number): string {
  const rounded = Number(value.toFixed(precision));
  return Object.is(rounded, -0) ? "0" : String(rounded);
}

/** Rounds polyline corners with quadratic curves, clamping the radius to half of each leg. */
export function polylineToSegments(points: readonly Point[], cornerRadius: number): PathSegment[] {
  const segments: PathSegment[] = [];
  if (points.length < 2) return segments;
  if (cornerRadius <= 0 || points.length === 2) {
    for (let index = 1; index < points.length; index += 1) {
      const from = points[index - 1];
      const to = points[index];
      if (from !== undefined && to !== undefined && distance(from, to) > 1e-9)
        segments.push({ kind: "line", from, to });
    }
    return segments;
  }
  let cursor = points[0];
  if (cursor === undefined) return segments;
  for (let index = 1; index < points.length - 1; index += 1) {
    const corner = points[index];
    const next = points[index + 1];
    if (corner === undefined || next === undefined) continue;
    const inLength = distance(cursor, corner);
    const outLength = distance(corner, next);
    const radius = Math.min(cornerRadius, inLength / 2, outLength / 2);
    if (radius <= 1e-6) {
      if (inLength > 1e-9) segments.push({ kind: "line", from: cursor, to: corner });
      cursor = corner;
      continue;
    }
    const entry = {
      x: corner.x + ((cursor.x - corner.x) / inLength) * radius,
      y: corner.y + ((cursor.y - corner.y) / inLength) * radius,
    };
    const exit = {
      x: corner.x + ((next.x - corner.x) / outLength) * radius,
      y: corner.y + ((next.y - corner.y) / outLength) * radius,
    };
    if (distance(cursor, entry) > 1e-9) segments.push({ kind: "line", from: cursor, to: entry });
    segments.push({ kind: "quad", from: entry, control: corner, to: exit });
    cursor = exit;
  }
  const last = points[points.length - 1];
  if (last !== undefined && distance(cursor, last) > 1e-9)
    segments.push({ kind: "line", from: cursor, to: last });
  return segments;
}

export function rectCenter(rect: Rect): Point {
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
}

export function rectsIntersect(a: Rect, b: Rect, tolerance = 0): boolean {
  return (
    a.x + a.width > b.x + tolerance &&
    b.x + b.width > a.x + tolerance &&
    a.y + a.height > b.y + tolerance &&
    b.y + b.height > a.y + tolerance
  );
}

/** Intersection of a ray from the rectangle centre towards `target` with the rectangle border. */
export function rectBorderPoint(rect: Rect, target: Point): Point {
  const center = rectCenter(rect);
  const dx = target.x - center.x;
  const dy = target.y - center.y;
  if (Math.abs(dx) < 1e-9 && Math.abs(dy) < 1e-9) return center;
  const halfW = rect.width / 2;
  const halfH = rect.height / 2;
  const scaleX = Math.abs(dx) < 1e-9 ? Number.POSITIVE_INFINITY : halfW / Math.abs(dx);
  const scaleY = Math.abs(dy) < 1e-9 ? Number.POSITIVE_INFINITY : halfH / Math.abs(dy);
  const scale = Math.min(scaleX, scaleY);
  return { x: center.x + dx * scale, y: center.y + dy * scale };
}
