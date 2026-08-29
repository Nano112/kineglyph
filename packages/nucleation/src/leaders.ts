/**
 * Leader geometry shared by the frame signals (SVG, sheet space) and the surface (WebGL, in the
 * view): where a callout's leader turns and ends, which anchors count as placed, and how to clip
 * a leader to the outside of the view when the surface draws the inside part itself.
 */
import type { Frame, AnchorSample } from "./frame-source.js";

export type Point = readonly [number, number];

export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** The constants of `drafting.calloutLeader` / `drafting.leader` — kept in step by a test. */
const GAP = 8;
const STUB = 34;
const DROP = 34;

/** The leader's polyline for a note: anchor → turn → stub end, in sheet units. */
export function leaderPolyline(
  note: { readonly x: number; readonly y: number; readonly side?: "top-left" | "top-right" },
  anchor: Point,
): readonly Point[] {
  const fromRight = note.side === "top-right";
  const tx = fromRight ? note.x + GAP + STUB : note.x - GAP - STUB;
  const ty = note.y + DROP;
  return [anchor, [tx, ty], [fromRight ? tx - STUB : tx + STUB, ty]];
}

/** The anchor's sample when its group is present enough to point at, else undefined. */
export function placedAnchor(
  frame: Frame,
  name: string,
  threshold: number,
): AnchorSample | undefined {
  const sample = frame.anchors.find((anchor) => anchor.name === name);
  if (sample === undefined || sample.opacity < threshold) return undefined;
  const pose = frame.poses.get(sample.group);
  if (pose === undefined) return undefined;
  const scale = Math.min(Math.abs(pose.scale[0]), Math.abs(pose.scale[1]), Math.abs(pose.scale[2]));
  return scale >= threshold ? sample : undefined;
}

/** Groups whose pose is fully there (opacity and scale at 1). */
export function placedCount(frame: Frame): number {
  let placed = 0;
  for (const pose of frame.poses.values()) {
    const scale = Math.min(
      Math.abs(pose.scale[0]),
      Math.abs(pose.scale[1]),
      Math.abs(pose.scale[2]),
    );
    if (pose.opacity >= 0.99 && scale >= 0.99) placed += 1;
  }
  return placed;
}

/** Liang–Barsky: the parameter interval of a segment that lies inside a rectangle. */
function insideInterval(a: Point, b: Point, rect: Rect): readonly [number, number] | undefined {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  let t0 = 0;
  let t1 = 1;
  const edges: readonly (readonly [number, number])[] = [
    [-dx, a[0] - rect.x],
    [dx, rect.x + rect.width - a[0]],
    [-dy, a[1] - rect.y],
    [dy, rect.y + rect.height - a[1]],
  ];
  for (const [p, q] of edges) {
    if (p === 0) {
      if (q < 0) return undefined;
      continue;
    }
    const r = q / p;
    if (p < 0) {
      if (r > t1) return undefined;
      if (r > t0) t0 = r;
    } else {
      if (r < t0) return undefined;
      if (r < t1) t1 = r;
    }
  }
  return [t0, t1];
}

const fmt = (value: number): string => String(Math.round(value * 100) / 100);

/**
 * Path data for the parts of a polyline outside `rect` — the leader as the sheet draws it when
 * the surface renders the part inside the view. Returns undefined when nothing remains.
 */
export function clipOutside(points: readonly Point[], rect: Rect): string | undefined {
  const parts: string[] = [];
  let open = false;
  const moveTo = (p: Point): void => {
    parts.push(`M${fmt(p[0])} ${fmt(p[1])}`);
    open = true;
  };
  const lineTo = (p: Point): void => {
    parts.push(`L${fmt(p[0])} ${fmt(p[1])}`);
  };
  const at = (a: Point, b: Point, t: number): Point => [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
  ];
  for (let i = 0; i + 1 < points.length; i += 1) {
    const a = points[i]!;
    const b = points[i + 1]!;
    const inside = insideInterval(a, b, rect);
    if (inside === undefined) {
      if (!open) moveTo(a);
      lineTo(b);
      continue;
    }
    const [t0, t1] = inside;
    if (t0 > 0) {
      if (!open) moveTo(a);
      lineTo(at(a, b, t0));
    }
    open = false;
    if (t1 < 1) {
      moveTo(at(a, b, t1));
      lineTo(b);
    }
  }
  return parts.length === 0 ? undefined : parts.join(" ");
}
