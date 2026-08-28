/**
 * Edge routing and decoration derived purely from typed edge data.
 */
import { CONNECTOR_LABEL_CLEARANCE } from "./connector.js";
import {
  PathGeometry,
  polylineToSegments,
  rectBorderPoint,
  rectCenter,
  rectsIntersect,
  type PathSegment,
} from "./geometry.js";
import type { ResolvedEdge, ResolvedEdgeLabel } from "./resolved.js";
import type { Point, Rect } from "./schema.js";
import type {
  EdgeDefinition,
  EdgeAvoidance,
  EdgeEndpoint,
  EdgeRoute,
  EdgeSide,
  EdgeSpline,
  LabelPlacement,
  LayoutName,
  MarkerKind,
  StrokeStyle,
  Tone,
} from "./scene.js";
import { pick, pickOr, endpointNode } from "./scene.js";
import { measureText, type TextFont, type TextMeasurer } from "./text.js";
import { paintColor, type ThemeTokens } from "./theme.js";

export interface EdgeNodeBox extends Rect {
  readonly id: string;
  readonly kind: "rect" | "circle" | "ellipse" | "group" | "other";
  readonly ports?: Readonly<
    Record<
      string,
      {
        readonly side: Exclude<EdgeSide, "auto">;
        readonly offset: number;
        readonly gap?: number;
      }
    >
  >;
}

export interface EdgePortAssignment {
  readonly side: Exclude<EdgeSide, "auto">;
  readonly offset: number;
  readonly gap?: number;
  /**
   * True when this port sits where something asked it to: an authored `offset`, or a place in the
   * fan of several edges sharing one side. A pinned port never moves to meet its partner — see
   * `anchorFacingPorts`.
   */
  readonly pinned: boolean;
}

export interface EdgeResolveContext {
  readonly layout: LayoutName;
  readonly theme: ThemeTokens;
  readonly boxes: ReadonlyMap<string, EdgeNodeBox>;
  /** Obstacle rectangles used to nudge labels away from nodes. */
  readonly obstacles: readonly Rect[];
  /** Previously resolved connector centre-lines, used as soft routing obstacles. */
  readonly routedEdges?: readonly (readonly Point[])[];
  /** Scene bounds that labels must stay inside. */
  readonly bounds?: Rect;
  readonly labelFont: TextFont;
  readonly textMeasurer?: TextMeasurer;
  readonly labelColor: string;
  readonly precision: number;
  /** Signal-bound overrides already applied by the resolver. */
  readonly overrides?: {
    readonly tone?: string;
    readonly hidden?: boolean;
    readonly label?: string;
    readonly labelHidden?: ReadonlySet<string>;
    readonly labelText?: ReadonlyMap<string, string>;
    readonly signal?: number;
  };
}

export interface ResolvedEdgeGeometry {
  readonly edge: ResolvedEdge;
  readonly geometry: PathGeometry;
  readonly packetCount: number;
  readonly packetPeriod: number;
  /** Labels that still overlap a node after every nudge was tried. */
  readonly collidingLabels: readonly string[];
  /** True when no obstacle-free route could be found and the authored fallback crosses a node. */
  readonly collidingObstacles: boolean;
  /** Unsmooothed centre-line reserved for subsequent edge routing. */
  readonly routePoints?: readonly Point[];
}

type Side = Exclude<EdgeSide, "auto">;

function normalisedEndpoint(end: string | EdgeEndpoint): EdgeEndpoint {
  return typeof end === "string" ? { node: end } : end;
}

/** Chooses attachment sides for endpoints without explicit sides, from relative box positions. */
export function chooseSides(from: Rect, to: Rect, route: EdgeRoute): { from: Side; to: Side } {
  const a = rectCenter(from);
  const b = rectCenter(to);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  // Prefer horizontal attachment unless the boxes are clearly stacked.
  const overlapX = Math.min(from.x + from.width, to.x + to.width) - Math.max(from.x, to.x);
  const stacked = overlapX > Math.min(from.width, to.width) * 0.35 && Math.abs(dy) > 0.5;
  if (route === "straight" && !stacked && Math.abs(dx) < Math.abs(dy) * 0.25)
    return dy >= 0 ? { from: "bottom", to: "top" } : { from: "top", to: "bottom" };
  if (stacked || (Math.abs(dy) > Math.abs(dx) && overlapX > 0))
    return dy >= 0 ? { from: "bottom", to: "top" } : { from: "top", to: "bottom" };
  return dx >= 0 ? { from: "right", to: "left" } : { from: "left", to: "right" };
}

/**
 * Deterministic auto-distribution of ports: edges sharing a node side receive evenly spaced
 * offsets ordered by the position of their opposite endpoint.
 */
export function assignPorts(
  edges: readonly EdgeDefinition[],
  layout: LayoutName,
  boxes: ReadonlyMap<string, EdgeNodeBox>,
): ReadonlyMap<string, { readonly from: EdgePortAssignment; readonly to: EdgePortAssignment }> {
  interface Pending {
    readonly edgeId: string;
    readonly end: "from" | "to";
    readonly node: string;
    readonly side: Side;
    readonly explicitOffset: number | undefined;
    readonly otherCenter: Point;
  }
  const pending: Pending[] = [];
  const sides = new Map<string, { from: Side; to: Side }>();
  for (const edge of edges) {
    const from = normalisedEndpoint(edge.from);
    const to = normalisedEndpoint(edge.to);
    const fromBox = boxes.get(from.node);
    const toBox = boxes.get(to.node);
    if (fromBox === undefined || toBox === undefined) continue;
    const route = pickOr(edge.route, layout, "straight");
    const auto = chooseSides(fromBox, toBox, route);
    const fromNamed = from.port === undefined ? undefined : fromBox.ports?.[from.port];
    const toNamed = to.port === undefined ? undefined : toBox.ports?.[to.port];
    const fromSide = pick(from.side, layout) ?? fromNamed?.side ?? "auto";
    const toSide = pick(to.side, layout) ?? toNamed?.side ?? "auto";
    const chosen = {
      from: fromSide === "auto" ? auto.from : fromSide,
      to: toSide === "auto" ? auto.to : toSide,
    };
    sides.set(edge.id, chosen);
    pending.push({
      edgeId: edge.id,
      end: "from",
      node: from.node,
      side: chosen.from,
      explicitOffset: pick(from.offset, layout) ?? fromNamed?.offset,
      otherCenter: rectCenter(toBox),
    });
    pending.push({
      edgeId: edge.id,
      end: "to",
      node: to.node,
      side: chosen.to,
      explicitOffset: pick(to.offset, layout) ?? toNamed?.offset,
      otherCenter: rectCenter(fromBox),
    });
  }
  const groups = new Map<string, Pending[]>();
  for (const entry of pending) {
    if (entry.explicitOffset !== undefined) continue;
    const key = `${entry.node}::${entry.side}`;
    const list = groups.get(key) ?? [];
    list.push(entry);
    groups.set(key, list);
  }
  const offsets = new Map<string, number>();
  /** Ports spread across a side they share with other edges: their place in the fan is meant. */
  const distributed = new Set<string>();
  for (const [, list] of groups) {
    const horizontalSide = list[0]?.side === "top" || list[0]?.side === "bottom";
    const sorted = [...list].sort((a, b) => {
      const primary = horizontalSide
        ? a.otherCenter.x - b.otherCenter.x
        : a.otherCenter.y - b.otherCenter.y;
      if (Math.abs(primary) > 1e-6) return primary;
      return a.edgeId < b.edgeId ? -1 : a.edgeId > b.edgeId ? 1 : a.end === "from" ? -1 : 1;
    });
    sorted.forEach((entry, index) => {
      const key = `${entry.edgeId}::${entry.end}`;
      offsets.set(key, (index + 1) / (sorted.length + 1));
      if (sorted.length > 1) distributed.add(key);
    });
  }
  const result = new Map<string, { from: EdgePortAssignment; to: EdgePortAssignment }>();
  for (const edge of edges) {
    const chosen = sides.get(edge.id);
    if (chosen === undefined) continue;
    const from = normalisedEndpoint(edge.from);
    const to = normalisedEndpoint(edge.to);
    const fromNamed =
      from.port === undefined ? undefined : boxes.get(from.node)?.ports?.[from.port];
    const toNamed = to.port === undefined ? undefined : boxes.get(to.node)?.ports?.[to.port];
    const fromOffset = pick(from.offset, layout) ?? fromNamed?.offset;
    const toOffset = pick(to.offset, layout) ?? toNamed?.offset;
    const fromGap = from.gap ?? fromNamed?.gap;
    const toGap = to.gap ?? toNamed?.gap;
    result.set(edge.id, {
      from: {
        side: chosen.from,
        offset: fromOffset ?? offsets.get(`${edge.id}::from`) ?? 0.5,
        ...(fromGap === undefined ? {} : { gap: fromGap }),
        pinned:
          from.port !== undefined ||
          fromOffset !== undefined ||
          distributed.has(`${edge.id}::from`),
      },
      to: {
        side: chosen.to,
        offset: toOffset ?? offsets.get(`${edge.id}::to`) ?? 0.5,
        ...(toGap === undefined ? {} : { gap: toGap }),
        pinned:
          to.port !== undefined || toOffset !== undefined || distributed.has(`${edge.id}::to`),
      },
    });
  }
  return result;
}

/** The side a connector arriving on this side must have left from, for the run to be perpendicular. */
const FACING: Readonly<Record<Side, Side | undefined>> = {
  left: "right",
  right: "left",
  top: "bottom",
  bottom: "top",
  center: undefined,
};

/**
 * A connector between two facing sides is drawn *on an axis*, never leaning a few pixels.
 *
 * Two boxes joined side to side each offer their own middle as the obvious place to attach, and the
 * two middles agree only while the boxes are the same size. One extra line of body copy in one of
 * them and the run acquires an eight-pixel drop over sixty — far too shallow to read as "these are
 * at different heights" and far too visible to read as anything but a rendering mistake. There is no
 * honest size for that lean: either the two boxes face each other, in which case the connector runs
 * straight between them, or they do not, in which case it has to travel and should look like it.
 *
 * So: take the span the two boxes **share** on the cross axis — the stretch of it where each is
 * genuinely opposite the other — and put both ports on its midpoint. That is the one axis on which
 * the run can be perpendicular *and* land inside both boxes. When the boxes are the same size it is
 * both their centres, which is the ordinary case and the one the eye expects; when one is much
 * larger it is the smaller one's centre, so the arrow still points at the middle of what it is
 * pointing at.
 *
 * Two ports are left exactly where they are when either is `pinned` — an authored offset, or one of
 * a fan of edges spread along a side — because those positions are a statement, and a fan of arrows
 * converging on a node is not the defect this is about.
 *
 * Returns `"traverse"` when the sides face but the boxes share none of the axis: nothing is
 * perpendicular there, and the caller routes it as a journey rather than a lean.
 */
export function anchorFacingPorts(
  fromBox: Rect,
  toBox: Rect,
  ports: { readonly from: EdgePortAssignment; readonly to: EdgePortAssignment },
):
  | { readonly kind: "as-authored" }
  | { readonly kind: "traverse" }
  | {
      readonly kind: "aligned";
      readonly from: EdgePortAssignment;
      readonly to: EdgePortAssignment;
    } {
  if (ports.from.pinned || ports.to.pinned) return { kind: "as-authored" };
  if (FACING[ports.from.side] !== ports.to.side) return { kind: "as-authored" };
  const across = ports.from.side === "left" || ports.from.side === "right";
  const start = (box: Rect): number => (across ? box.y : box.x);
  const extent = (box: Rect): number => (across ? box.height : box.width);
  const low = Math.max(start(fromBox), start(toBox));
  const high = Math.min(start(fromBox) + extent(fromBox), start(toBox) + extent(toBox));
  if (high < low) return { kind: "traverse" };
  const axis = (low + high) / 2;
  const at = (box: Rect): number => {
    const size = extent(box);
    return size <= 1e-6 ? 0.5 : Math.min(1, Math.max(0, (axis - start(box)) / size));
  };
  return {
    kind: "aligned",
    from: { ...ports.from, offset: at(fromBox) },
    to: { ...ports.to, offset: at(toBox) },
  };
}

function sideNormal(side: Side): Point {
  switch (side) {
    case "left":
      return { x: -1, y: 0 };
    case "right":
      return { x: 1, y: 0 };
    case "top":
      return { x: 0, y: -1 };
    case "bottom":
      return { x: 0, y: 1 };
    case "center":
      return { x: 0, y: 0 };
  }
}

function portPoint(
  box: EdgeNodeBox,
  side: Side,
  offset: number,
  gap: number,
  towards: Point,
): Point {
  const t = Math.min(1, Math.max(0, offset));
  if (side === "center") {
    if (box.kind === "circle" || box.kind === "ellipse") {
      const center = rectCenter(box);
      const dx = towards.x - center.x;
      const dy = towards.y - center.y;
      const length = Math.hypot(dx, dy) || 1;
      const rx = box.width / 2 + gap;
      const ry = box.height / 2 + gap;
      return { x: center.x + (dx / length) * rx, y: center.y + (dy / length) * ry };
    }
    const border = rectBorderPoint(box, towards);
    const center = rectCenter(box);
    const dx = border.x - center.x;
    const dy = border.y - center.y;
    const length = Math.hypot(dx, dy) || 1;
    return { x: border.x + (dx / length) * gap, y: border.y + (dy / length) * gap };
  }
  const normal = sideNormal(side);
  switch (side) {
    case "left":
      return { x: box.x - gap, y: box.y + box.height * t };
    case "right":
      return { x: box.x + box.width + gap, y: box.y + box.height * t };
    case "top":
      return { x: box.x + box.width * t, y: box.y - gap };
    case "bottom":
      return { x: box.x + box.width * t, y: box.y + box.height + gap };
    default:
      return { x: box.x + normal.x, y: box.y + normal.y };
  }
}

function orthogonalPoints(a: Point, aSide: Side, b: Point, bSide: Side): Point[] {
  const stub = 14;
  const na = sideNormal(aSide);
  const nb = sideNormal(bSide);
  const horizontalA = na.x !== 0;
  const horizontalB = nb.x !== 0;
  const a1 = { x: a.x + na.x * stub, y: a.y + na.y * stub };
  const b1 = { x: b.x + nb.x * stub, y: b.y + nb.y * stub };
  if (aSide === "center" || bSide === "center") {
    const mid = { x: b.x, y: a.y };
    return [a, mid, b];
  }
  if (horizontalA && horizontalB) {
    if (na.x !== nb.x) {
      // Opposite horizontal sides: single vertical jog at the midpoint when it lies between the stubs.
      const forward = na.x > 0 ? b1.x >= a1.x : b1.x <= a1.x;
      if (forward) {
        const midX = (a1.x + b1.x) / 2;
        return dedupe([a, { x: midX, y: a.y }, { x: midX, y: b.y }, b]);
      }
      const midY = (a.y + b.y) / 2;
      return dedupe([a, a1, { x: a1.x, y: midY }, { x: b1.x, y: midY }, b1, b]);
    }
    // Same horizontal side: U-shape around the outer extent.
    const outerX = na.x > 0 ? Math.max(a1.x, b1.x) : Math.min(a1.x, b1.x);
    return dedupe([a, { x: outerX, y: a.y }, { x: outerX, y: b.y }, b]);
  }
  if (!horizontalA && !horizontalB) {
    if (na.y !== nb.y) {
      const forward = na.y > 0 ? b1.y >= a1.y : b1.y <= a1.y;
      if (forward) {
        const midY = (a1.y + b1.y) / 2;
        return dedupe([a, { x: a.x, y: midY }, { x: b.x, y: midY }, b]);
      }
      const midX = (a.x + b.x) / 2;
      return dedupe([a, a1, { x: midX, y: a1.y }, { x: midX, y: b1.y }, b1, b]);
    }
    const outerY = na.y > 0 ? Math.max(a1.y, b1.y) : Math.min(a1.y, b1.y);
    return dedupe([a, { x: a.x, y: outerY }, { x: b.x, y: outerY }, b]);
  }
  // Perpendicular sides: L-shape when the corner lies outside both stubs, otherwise a Z with stubs.
  if (horizontalA) {
    const corner = { x: b.x, y: a.y };
    const forwardA = na.x > 0 ? corner.x >= a1.x : corner.x <= a1.x;
    const forwardB = nb.y > 0 ? corner.y >= b1.y : corner.y <= b1.y;
    if (forwardA && forwardB) return dedupe([a, corner, b]);
    return dedupe([a, a1, { x: a1.x, y: b1.y }, b1, b]);
  }
  const corner = { x: a.x, y: b.y };
  const forwardA = na.y > 0 ? corner.y >= a1.y : corner.y <= a1.y;
  const forwardB = nb.x > 0 ? corner.x >= b1.x : corner.x <= b1.x;
  if (forwardA && forwardB) return dedupe([a, corner, b]);
  return dedupe([a, a1, { x: b1.x, y: a1.y }, b1, b]);
}

const ROUTE_CLEARANCE = 8;
const ROUTE_BEND_COST = 24;

/**
 * Deterministic rectilinear visibility-graph routing around rectangular node obstacles.
 *
 * The graph is made from endpoint stubs and every inflated obstacle boundary. Dijkstra then
 * chooses the shortest route with a stable bend penalty and coordinate-order tie breaks. This is
 * intentionally a constrained orthogonal router, not an automatic graph layout engine: node
 * placement and port intent remain authored.
 */
export function routeOrthogonalAvoidingObstacles(
  a: Point,
  aSide: Side,
  b: Point,
  bSide: Side,
  obstacles: readonly Rect[],
  bounds?: Rect,
  clearance = ROUTE_CLEARANCE,
  routedEdges: readonly (readonly Point[])[] = [],
  laneGap = 10,
  crossingCost = 18,
): readonly Point[] | undefined {
  const stub = 14;
  const na = sideNormal(aSide);
  const nb = sideNormal(bSide);
  const start = aSide === "center" ? a : { x: a.x + na.x * stub, y: a.y + na.y * stub };
  const finish = bSide === "center" ? b : { x: b.x + nb.x * stub, y: b.y + nb.y * stub };
  const inflated = obstacles.map((rect) => inflateRect(rect, clearance));
  if (inflated.some((rect) => pointInside(rect, start) || pointInside(rect, finish)))
    return undefined;

  const xs = uniqueSorted([
    start.x,
    finish.x,
    ...inflated.flatMap((rect) => [rect.x, rect.x + rect.width]),
    ...routedEdges.flatMap((route) =>
      route.flatMap((point) => [point.x - laneGap, point.x + laneGap]),
    ),
    ...(bounds === undefined ? [] : [bounds.x + clearance, bounds.x + bounds.width - clearance]),
  ]);
  const ys = uniqueSorted([
    start.y,
    finish.y,
    ...inflated.flatMap((rect) => [rect.y, rect.y + rect.height]),
    ...routedEdges.flatMap((route) =>
      route.flatMap((point) => [point.y - laneGap, point.y + laneGap]),
    ),
    ...(bounds === undefined ? [] : [bounds.y + clearance, bounds.y + bounds.height - clearance]),
  ]);
  const points: Point[] = [];
  for (const y of ys)
    for (const x of xs) {
      const point = { x, y };
      if (outsideBounds(point, bounds) || inflated.some((rect) => pointInside(rect, point)))
        continue;
      points.push(point);
    }
  const startIndex = pointIndex(points, start);
  const finishIndex = pointIndex(points, finish);
  if (startIndex < 0 || finishIndex < 0) return undefined;

  const neighbours: {
    to: number;
    direction: "h" | "v";
    distance: number;
    penalty: number;
  }[][] = points.map(() => []);
  connectVisible(points, neighbours, inflated, "h", routedEdges, laneGap, crossingCost);
  connectVisible(points, neighbours, inflated, "v", routedEdges, laneGap, crossingCost);

  type Direction = "h" | "v" | "start";
  interface State {
    readonly node: number;
    readonly direction: Direction;
    readonly cost: number;
    readonly key: string;
  }
  const initialDirection: Direction = na.x !== 0 ? "h" : na.y !== 0 ? "v" : "start";
  const finalDirection: Direction = nb.x !== 0 ? "h" : nb.y !== 0 ? "v" : "start";
  const initialKey = stateKey(startIndex, initialDirection);
  const distances = new Map<string, number>([[initialKey, 0]]);
  const previous = new Map<string, string>();
  const queue: State[] = [
    { node: startIndex, direction: initialDirection, cost: 0, key: initialKey },
  ];
  let winner: State | undefined;
  while (queue.length > 0) {
    queue.sort((left, right) => left.cost - right.cost || left.key.localeCompare(right.key));
    const current = queue.shift();
    if (current === undefined || current.cost !== distances.get(current.key)) continue;
    if (winner !== undefined && current.cost > winner.cost + 1e-9) break;
    if (current.node === finishIndex) {
      const total =
        current.cost +
        (finalDirection !== "start" && current.direction !== finalDirection ? ROUTE_BEND_COST : 0);
      if (winner === undefined || total < winner.cost - 1e-9) winner = { ...current, cost: total };
      continue;
    }
    for (const edge of neighbours[current.node] ?? []) {
      const bend =
        current.direction === "start" || current.direction === edge.direction ? 0 : ROUTE_BEND_COST;
      const cost = current.cost + edge.distance + edge.penalty + bend;
      const key = stateKey(edge.to, edge.direction);
      const known = distances.get(key);
      if (known !== undefined && known <= cost + 1e-9) continue;
      distances.set(key, cost);
      previous.set(key, current.key);
      queue.push({ node: edge.to, direction: edge.direction, cost, key });
    }
  }
  if (winner === undefined) return undefined;
  const routed: Point[] = [];
  let key: string | undefined = winner.key;
  while (key !== undefined) {
    const node = Number(key.slice(0, key.indexOf("|")));
    const point = points[node];
    if (point !== undefined) routed.push(point);
    key = previous.get(key);
  }
  routed.reverse();
  return dedupe([a, ...routed, b]);
}

function inflateRect(rect: Rect, amount: number): Rect {
  return {
    x: rect.x - amount,
    y: rect.y - amount,
    width: rect.width + amount * 2,
    height: rect.height + amount * 2,
  };
}

function pointInside(rect: Rect, point: Point): boolean {
  const epsilon = 1e-6;
  return (
    point.x > rect.x + epsilon &&
    point.x < rect.x + rect.width - epsilon &&
    point.y > rect.y + epsilon &&
    point.y < rect.y + rect.height - epsilon
  );
}

function outsideBounds(point: Point, bounds: Rect | undefined): boolean {
  if (bounds === undefined) return false;
  const epsilon = 1e-6;
  return (
    point.x < bounds.x - epsilon ||
    point.x > bounds.x + bounds.width + epsilon ||
    point.y < bounds.y - epsilon ||
    point.y > bounds.y + bounds.height + epsilon
  );
}

function uniqueSorted(values: readonly number[]): number[] {
  return [...new Set(values.map((value) => Math.round(value * 1e6) / 1e6))].sort((a, b) => a - b);
}

function pointIndex(points: readonly Point[], point: Point): number {
  return points.findIndex(
    (candidate) => Math.abs(candidate.x - point.x) < 1e-6 && Math.abs(candidate.y - point.y) < 1e-6,
  );
}

function stateKey(node: number, direction: "h" | "v" | "start"): string {
  return `${node}|${direction}`;
}

function connectVisible(
  points: readonly Point[],
  neighbours: { to: number; direction: "h" | "v"; distance: number; penalty: number }[][],
  obstacles: readonly Rect[],
  direction: "h" | "v",
  routedEdges: readonly (readonly Point[])[],
  laneGap: number,
  crossingCost: number,
): void {
  const groups = new Map<number, number[]>();
  points.forEach((point, index) => {
    const key = direction === "h" ? point.y : point.x;
    const group = groups.get(key) ?? [];
    group.push(index);
    groups.set(key, group);
  });
  for (const group of groups.values()) {
    group.sort((left, right) => {
      const a = points[left];
      const b = points[right];
      if (a === undefined || b === undefined) return left - right;
      return direction === "h" ? a.x - b.x : a.y - b.y;
    });
    for (let index = 1; index < group.length; index += 1) {
      const fromIndex = group[index - 1];
      const toIndex = group[index];
      if (fromIndex === undefined || toIndex === undefined) continue;
      const from = points[fromIndex];
      const to = points[toIndex];
      if (from === undefined || to === undefined || segmentBlocked(from, to, obstacles)) continue;
      const distance = Math.abs(to.x - from.x) + Math.abs(to.y - from.y);
      const penalty = routeInteractionPenalty(from, to, routedEdges, laneGap, crossingCost);
      neighbours[fromIndex]?.push({ to: toIndex, direction, distance, penalty });
      neighbours[toIndex]?.push({ to: fromIndex, direction, distance, penalty });
    }
  }
}

function between(value: number, a: number, b: number, epsilon = 1e-6): boolean {
  return value >= Math.min(a, b) - epsilon && value <= Math.max(a, b) + epsilon;
}

/** Soft cost for crossings, shared tracks, and visually merged parallel tracks. */
function routeInteractionPenalty(
  a: Point,
  b: Point,
  routedEdges: readonly (readonly Point[])[],
  laneGap: number,
  crossingCost: number,
): number {
  const horizontal = Math.abs(a.y - b.y) <= 1e-6;
  let cost = 0;
  for (const route of routedEdges)
    for (let index = 1; index < route.length; index += 1) {
      const c = route[index - 1];
      const d = route[index];
      if (c === undefined || d === undefined) continue;
      const otherHorizontal = Math.abs(c.y - d.y) <= 1e-6;
      if (horizontal !== otherHorizontal) {
        const x = horizontal ? c.x : a.x;
        const y = horizontal ? a.y : c.y;
        if (
          between(x, a.x, b.x) &&
          between(y, a.y, b.y) &&
          between(x, c.x, d.x) &&
          between(y, c.y, d.y)
        )
          cost += crossingCost;
        continue;
      }
      if (horizontal) {
        const overlap =
          Math.min(Math.max(a.x, b.x), Math.max(c.x, d.x)) -
          Math.max(Math.min(a.x, b.x), Math.min(c.x, d.x));
        if (overlap <= 0) continue;
        const separation = Math.abs(a.y - c.y);
        if (separation <= 1e-6) cost += Math.max(144, crossingCost * 3) + overlap * 0.25;
        else if (separation < laneGap) cost += crossingCost * 0.25;
      } else {
        const overlap =
          Math.min(Math.max(a.y, b.y), Math.max(c.y, d.y)) -
          Math.max(Math.min(a.y, b.y), Math.min(c.y, d.y));
        if (overlap <= 0) continue;
        const separation = Math.abs(a.x - c.x);
        if (separation <= 1e-6) cost += Math.max(144, crossingCost * 3) + overlap * 0.25;
        else if (separation < laneGap) cost += crossingCost * 0.25;
      }
    }
  return cost;
}

function segmentBlocked(a: Point, b: Point, obstacles: readonly Rect[]): boolean {
  const epsilon = 1e-6;
  if (Math.abs(a.y - b.y) < epsilon) {
    const low = Math.min(a.x, b.x);
    const high = Math.max(a.x, b.x);
    return obstacles.some(
      (rect) =>
        a.y > rect.y + epsilon &&
        a.y < rect.y + rect.height - epsilon &&
        high > rect.x + epsilon &&
        low < rect.x + rect.width - epsilon,
    );
  }
  if (Math.abs(a.x - b.x) < epsilon) {
    const low = Math.min(a.y, b.y);
    const high = Math.max(a.y, b.y);
    return obstacles.some(
      (rect) =>
        a.x > rect.x + epsilon &&
        a.x < rect.x + rect.width - epsilon &&
        high > rect.y + epsilon &&
        low < rect.y + rect.height - epsilon,
    );
  }
  return true;
}

function dedupe(points: readonly Point[]): Point[] {
  const out: Point[] = [];
  for (const point of points) {
    const previous = out[out.length - 1];
    if (
      previous === undefined ||
      Math.abs(previous.x - point.x) > 1e-6 ||
      Math.abs(previous.y - point.y) > 1e-6
    )
      out.push(point);
  }

  // A visibility graph quite reasonably walks along every obstacle coordinate it encounters.
  // Those intermediate vertices carry no geometry once the route has been chosen, though, and
  // rounding every one of them produces tiny hooks and backwards-looking quadratic segments.
  // Collapse each straight run to its endpoints before corner radii are applied. This also removes
  // collinear backtracking because the direct A-C segment is contained by A-B plus B-C.
  for (let index = 1; index < out.length - 1;) {
    const before = out[index - 1];
    const current = out[index];
    const after = out[index + 1];
    if (before === undefined || current === undefined || after === undefined) break;
    const vertical =
      Math.abs(before.x - current.x) <= 1e-6 && Math.abs(current.x - after.x) <= 1e-6;
    const horizontal =
      Math.abs(before.y - current.y) <= 1e-6 && Math.abs(current.y - after.y) <= 1e-6;
    if (vertical || horizontal) {
      out.splice(index, 1);
      if (index > 1) index -= 1;
    } else {
      index += 1;
    }
  }
  return out;
}

function curveSegments(
  a: Point,
  aSide: Side,
  b: Point,
  bSide: Side,
  curvature: number,
): PathSegment[] {
  const na = sideNormal(aSide);
  const nb = sideNormal(bSide);
  const dist = Math.hypot(b.x - a.x, b.y - a.y);
  const handle = Math.min(260, Math.max(12, dist * (0.2 + curvature * 0.6)));
  const fallbackA = { x: Math.sign(b.x - a.x) || 1, y: 0 };
  const fallbackB = { x: -(Math.sign(b.x - a.x) || 1), y: 0 };
  const ta = aSide === "center" ? fallbackA : na;
  const tb = bSide === "center" ? fallbackB : nb;
  return [
    {
      kind: "cubic",
      from: a,
      control1: { x: a.x + ta.x * handle, y: a.y + ta.y * handle },
      control2: { x: b.x + tb.x * handle, y: b.y + tb.y * handle },
      to: b,
    },
  ];
}

/** Smooths an obstacle-safe orthogonal centre-line without moving it outside its routing lanes. */
function splineSegments(points: readonly Point[], radius: number, mode: EdgeSpline): PathSegment[] {
  if (mode === "rounded") return polylineToSegments(points, radius);
  if (points.length < 3) return polylineToSegments(points, 0);
  const segments: PathSegment[] = [];
  let cursor = points[0];
  if (cursor === undefined) return segments;
  for (let index = 1; index < points.length - 1; index += 1) {
    const before = points[index - 1];
    const corner = points[index];
    const after = points[index + 1];
    if (before === undefined || corner === undefined || after === undefined) continue;
    const incoming = Math.hypot(corner.x - before.x, corner.y - before.y);
    const outgoing = Math.hypot(after.x - corner.x, after.y - corner.y);
    const run = Math.min(Math.max(0, radius), incoming / 2, outgoing / 2);
    if (run <= 0.5) {
      segments.push({ kind: "line", from: cursor, to: corner });
      cursor = corner;
      continue;
    }
    const entry = {
      x: corner.x - ((corner.x - before.x) / incoming) * run,
      y: corner.y - ((corner.y - before.y) / incoming) * run,
    };
    const exit = {
      x: corner.x + ((after.x - corner.x) / outgoing) * run,
      y: corner.y + ((after.y - corner.y) / outgoing) * run,
    };
    if (Math.hypot(entry.x - cursor.x, entry.y - cursor.y) > 1e-6)
      segments.push({ kind: "line", from: cursor, to: entry });
    const handle = run * 0.58;
    segments.push({
      kind: "cubic",
      from: entry,
      control1: {
        x: entry.x + ((corner.x - before.x) / incoming) * handle,
        y: entry.y + ((corner.y - before.y) / incoming) * handle,
      },
      control2: {
        x: exit.x - ((after.x - corner.x) / outgoing) * handle,
        y: exit.y - ((after.y - corner.y) / outgoing) * handle,
      },
      to: exit,
    });
    cursor = exit;
  }
  const end = points.at(-1);
  if (end !== undefined) segments.push({ kind: "line", from: cursor, to: end });
  return segments;
}

function arcSegments(a: Point, b: Point, bend: number): PathSegment[] {
  const chord = Math.hypot(b.x - a.x, b.y - a.y);
  const sagitta = Math.min(Math.abs(bend), chord / 2);
  if (chord < 1e-6 || sagitta < 0.5) return [{ kind: "line", from: a, to: b }];
  const radius = (chord * chord) / (8 * sagitta) + sagitta / 2;
  // Positive bend bows to the right of travel. In screen space (y down) that is the
  // counter-clockwise SVG sweep (flag 0); negative bend uses the positive-angle sweep (flag 1).
  const sweep: 0 | 1 = bend >= 0 ? 0 : 1;
  return [{ kind: "arc", from: a, to: b, radius, sweep, largeArc: 0 }];
}

const PLACEMENT_T: Readonly<Record<LabelPlacement, number>> = {
  start: 0.14,
  middle: 0.5,
  end: 0.86,
};

/** Breathing room inside an edge label's own box, each side. The renderer's `textLength` matches. */
const LABEL_PADDING_X = 5;

/**
 * The width an edge label will occupy, box and all.
 *
 * Exported because a layout that wants its labelled connectors to clear the nodes has to know how
 * much room a label asks for *before* it decides how far apart to put them — see
 * `sceneFromSpec`.
 */
export function edgeLabelWidth(text: string, font: TextFont, measurer?: TextMeasurer): number {
  return measureText(text, font, measurer) + LABEL_PADDING_X * 2;
}

/** The height an edge label will occupy, box and all. */
export function edgeLabelHeight(font: TextFont): number {
  return font.lineHeight + 4;
}

function labelBox(
  anchor: Point,
  angle: number,
  offset: number,
  width: number,
  height: number,
): Rect {
  const nx = -Math.sin(angle);
  const ny = Math.cos(angle);
  const cx = anchor.x + nx * offset;
  const cy = anchor.y + ny * offset;
  return { x: cx - width / 2, y: cy - height / 2, width, height };
}

/** Resolves geometry, markers, labels, and packet metadata for one edge definition. */
export function resolveEdge(
  edge: EdgeDefinition,
  requested: { readonly from: EdgePortAssignment; readonly to: EdgePortAssignment },
  context: EdgeResolveContext,
): ResolvedEdgeGeometry | undefined {
  const fromEnd = normalisedEndpoint(edge.from);
  const toEnd = normalisedEndpoint(edge.to);
  const fromBox = context.boxes.get(fromEnd.node);
  const toBox = context.boxes.get(toEnd.node);
  if (fromBox === undefined || toBox === undefined) return undefined;
  const anchored = anchorFacingPorts(fromBox, toBox, requested);
  let ports = anchored.kind === "aligned" ? anchored : requested;
  const authored = pickOr(edge.route, context.layout, "straight");
  // Facing sides with no shared axis: a straight line between them can only lean, so it turns.
  const route: EdgeRoute =
    anchored.kind === "traverse" && authored === "straight" ? "orthogonal" : authored;
  let start = portPoint(
    fromBox,
    ports.from.side,
    ports.from.offset,
    fromEnd.gap ?? ports.from.gap ?? 0,
    rectCenter(toBox),
  );
  let end = portPoint(
    toBox,
    ports.to.side,
    ports.to.offset,
    toEnd.gap ?? ports.to.gap ?? 0,
    rectCenter(fromBox),
  );
  // Endpoint boxes and framed ancestors contain a port by definition; every other surface is an
  // obstacle the connector should travel around.
  const contains = (rect: Rect, point: Point): boolean =>
    point.x >= rect.x - 0.5 &&
    point.x <= rect.x + rect.width + 0.5 &&
    point.y >= rect.y - 0.5 &&
    point.y <= rect.y + rect.height + 0.5;
  const obstaclesFor = (from: Point, to: Point): readonly Rect[] =>
    context.obstacles.filter((obstacle) => !contains(obstacle, from) && !contains(obstacle, to));
  let obstacles = obstaclesFor(start, end);
  const curvature = edge.curvature ?? 0.5;
  const avoidance: EdgeAvoidance = pickOr(
    edge.avoid,
    context.layout,
    route === "orthogonal" || route === "spline" ? "nodes" : "none",
  );
  const clearance = Math.max(0, edge.clearance ?? ROUTE_CLEARANCE);
  const routedEdges = avoidance === "nodes-and-edges" ? (context.routedEdges ?? []) : [];
  const laneGap = Math.max(2, edge.laneGap ?? 10);
  const crossingCost = Math.max(0, edge.crossingCost ?? 18);
  let segments: PathSegment[];
  let routePoints: readonly Point[] | undefined;
  let collidingObstacles = false;
  switch (route) {
    case "straight":
      segments = [{ kind: "line", from: start, to: end }];
      break;
    case "orthogonal":
    case "spline": {
      const routingObstacles = avoidance === "none" ? [] : obstacles;
      let routed = routeOrthogonalAvoidingObstacles(
        start,
        ports.from.side,
        end,
        ports.to.side,
        routingObstacles,
        context.bounds,
        clearance,
        routedEdges,
        laneGap,
        crossingCost,
      );
      const fromAuthored = pickOr<EdgeSide>(fromEnd.side, context.layout, "auto") !== "auto";
      const toAuthored = pickOr<EdgeSide>(toEnd.side, context.layout, "auto") !== "auto";
      if (routed === undefined && (!fromAuthored || !toAuthored)) {
        const sideOrder = (preferred: Side): readonly Side[] => [
          preferred,
          ...(["right", "bottom", "left", "top"] as const).filter(
            (candidate) => candidate !== preferred,
          ),
        ];
        const fromSides = fromAuthored ? [ports.from.side] : sideOrder(ports.from.side);
        const toSides = toAuthored ? [ports.to.side] : sideOrder(ports.to.side);
        let best:
          | {
              readonly ports: typeof ports;
              readonly start: Point;
              readonly end: Point;
              readonly obstacles: readonly Rect[];
              readonly points: readonly Point[];
              readonly score: number;
            }
          | undefined;
        for (const fromSide of fromSides)
          for (const toSide of toSides) {
            if (fromSide === "center" || toSide === "center") continue;
            const candidatePorts = {
              from: { ...ports.from, side: fromSide },
              to: { ...ports.to, side: toSide },
            };
            const candidateStart = portPoint(
              fromBox,
              fromSide,
              candidatePorts.from.offset,
              fromEnd.gap ?? candidatePorts.from.gap ?? 0,
              rectCenter(toBox),
            );
            const candidateEnd = portPoint(
              toBox,
              toSide,
              candidatePorts.to.offset,
              toEnd.gap ?? candidatePorts.to.gap ?? 0,
              rectCenter(fromBox),
            );
            const candidateObstacles = obstaclesFor(candidateStart, candidateEnd);
            const candidateRoutingObstacles = avoidance === "none" ? [] : candidateObstacles;
            const points = routeOrthogonalAvoidingObstacles(
              candidateStart,
              fromSide,
              candidateEnd,
              toSide,
              candidateRoutingObstacles,
              context.bounds,
              clearance,
              routedEdges,
              laneGap,
              crossingCost,
            );
            if (points === undefined) continue;
            const distance = points.slice(1).reduce((total, point, index) => {
              const previous = points[index];
              return (
                total +
                (previous === undefined
                  ? 0
                  : Math.abs(point.x - previous.x) + Math.abs(point.y - previous.y))
              );
            }, 0);
            const bends = Math.max(0, points.length - 2);
            const score = distance + bends * ROUTE_BEND_COST;
            if (best === undefined || score < best.score - 1e-6)
              best = {
                ports: candidatePorts,
                start: candidateStart,
                end: candidateEnd,
                obstacles: candidateObstacles,
                points,
                score,
              };
          }
        if (best !== undefined) {
          ports = best.ports;
          start = best.start;
          end = best.end;
          obstacles = best.obstacles;
          routed = best.points;
        }
      }
      const fallback = orthogonalPoints(start, ports.from.side, end, ports.to.side);
      const points = routed ?? fallback;
      routePoints = points;
      collidingObstacles = points.some(
        (point, index) => index > 0 && segmentBlocked(points[index - 1] ?? point, point, obstacles),
      );
      segments =
        route === "spline"
          ? splineSegments(points, edge.cornerRadius ?? 18, edge.spline ?? "fluid")
          : polylineToSegments(points, edge.cornerRadius ?? 8);
      break;
    }
    case "curve":
      segments = curveSegments(start, ports.from.side, end, ports.to.side, curvature);
      break;
    case "arc": {
      const chord = Math.hypot(end.x - start.x, end.y - start.y);
      const bend = edge.bend ?? -chord * 0.22 * (curvature / 0.5);
      segments = arcSegments(start, end, bend);
      break;
    }
  }
  const geometry = new PathGeometry(segments);
  const theme = context.theme;
  const signalStyle = edge.signal;
  const hasSignal = signalStyle !== undefined || context.overrides?.signal !== undefined;
  const signal = hasSignal
    ? Math.min(
        1,
        Math.max(
          0,
          context.overrides?.signal ?? (pickOr(signalStyle?.value, context.layout, false) ? 1 : 0),
        ),
      )
    : undefined;
  const active = (signal ?? 0) > 0.5;
  const signalTone = active
    ? (signalStyle?.onTone ?? edge.tone ?? "accent")
    : (signalStyle?.offTone ?? "connector");
  const tone = context.overrides?.tone ?? (hasSignal ? signalTone : edge.tone) ?? "neutral";
  const stroke = paintColor(
    tone as EdgeDefinition["tone"],
    theme,
    "stroke",
    theme.colors.connector,
  );
  const strokeColor = tone === "neutral" ? theme.colors.connector : stroke;
  const width =
    (active ? signalStyle?.onWidth : signalStyle?.offWidth) ?? edge.width ?? theme.strokes.regular;
  const signalOpacity =
    (active ? signalStyle?.onOpacity : signalStyle?.offOpacity) ?? edge.opacity ?? 1;
  const head: MarkerKind = edge.head ?? "arrow";
  const tail: MarkerKind = edge.tail ?? "none";
  const dash: StrokeStyle = edge.stroke ?? "solid";
  const definedLabels = [
    ...(edge.label === undefined
      ? []
      : [{ id: `${edge.id}-label`, text: edge.label, placement: "middle" as const }]),
    ...(edge.labels ?? []).map((label, index) => ({
      ...label,
      id: label.id ?? `${edge.id}-label-${index + 1}`,
    })),
  ];
  const labels: ResolvedEdgeLabel[] = [];
  const claimed: Rect[] = [];
  const collidingLabels: string[] = [];
  // A box this edge comes out of, or goes into, cannot push its label away — the label has to sit
  // near the run, and the run starts on that box's border. Every other box can.
  for (const label of definedLabels) {
    const text = context.overrides?.labelText?.get(label.id) ?? label.text;
    const hidden =
      (context.overrides?.labelHidden?.has(label.id) ?? false) ||
      ("hidden" in label && pickOr(label.hidden, context.layout, false));
    const font = context.labelFont;
    const boxWidth = edgeLabelWidth(text, font, context.textMeasurer);
    const boxHeight = edgeLabelHeight(font);
    const placement =
      "placement" in label && label.placement !== undefined ? label.placement : "middle";
    const anchor = geometry.pointAt(PLACEMENT_T[placement]);
    // A label sits *beside* the run, never on it, and how far beside is its own half-extent in
    // the direction it is being pushed — width for a vertical run, height for a horizontal one,
    // and the blend of the two for a diagonal. Measuring only the height (which is what this did)
    // is correct for a horizontal edge and puts a vertical edge's label straight through the line.
    const labelOffset =
      (boxWidth * Math.abs(Math.sin(anchor.angle)) + boxHeight * Math.abs(Math.cos(anchor.angle))) /
        2 +
      CONNECTOR_LABEL_CLEARANCE;
    const baseOffset =
      "offset" in label && label.offset !== undefined ? label.offset : -labelOffset;
    const candidates: number[] = [];
    for (let step = 1; step <= 6; step += 1) candidates.push(baseOffset * step, -baseOffset * step);
    const bounds = context.bounds;
    const inside = (rect: Rect): boolean =>
      bounds === undefined ||
      (rect.x >= bounds.x - 0.5 &&
        rect.y >= bounds.y - 0.5 &&
        rect.x + rect.width <= bounds.x + bounds.width + 0.5 &&
        rect.y + rect.height <= bounds.y + bounds.height + 0.5);
    // A label must clear a node's *corner*, not just its edge, or it reads as a tooltip stuck to
    // the box. The clearance is the margin a rounded corner needs before the two look separate.
    let box = labelBox(anchor, anchor.angle, baseOffset, boxWidth, boxHeight);
    let clear = false;
    for (const candidate of candidates) {
      const trial = labelBox(anchor, anchor.angle, candidate, boxWidth, boxHeight);
      const collides =
        obstacles.some((obstacle) => rectsIntersect(trial, obstacle, CONNECTOR_LABEL_CLEARANCE)) ||
        claimed.some((other) => rectsIntersect(trial, other, 1));
      if (!collides && inside(trial)) {
        box = trial;
        clear = true;
        break;
      }
    }
    if (bounds !== undefined && !inside(box)) {
      const x = Math.min(Math.max(box.x, bounds.x), bounds.x + bounds.width - box.width);
      const y = Math.min(Math.max(box.y, bounds.y), bounds.y + bounds.height - box.height);
      box = { ...box, x, y };
      clear = false;
    }
    if (!hidden && obstacles.some((obstacle) => rectsIntersect(box, obstacle, 1)))
      collidingLabels.push(label.id);
    claimed.push(box);
    const color =
      "tone" in label && label.tone !== undefined
        ? paintColor(label.tone, theme, "text", context.labelColor)
        : context.labelColor;
    labels.push({
      id: label.id,
      text,
      x: round(box.x + box.width / 2, context.precision),
      y: round(box.y + box.height / 2, context.precision),
      width: round(box.width, context.precision),
      height: round(box.height, context.precision),
      anchor: "middle",
      fontFamily: font.family,
      fontSize: font.size,
      fontWeight: font.weight,
      color,
      ...(hidden ? { hidden: true } : {}),
      ...(clear ? {} : { halo: true }),
    });
  }
  const packets = edge.packets;
  // Beads need room the same way an arrowhead does. Three packets asked for on a 40px run land
  // 13px apart and read as a dotted line, not as things travelling along one — so the requested
  // count is capped by what the run can space out, and never falls below one.
  const packetSpacing = 24;
  const packetCount =
    packets === undefined
      ? 0
      : Math.max(
          1,
          Math.min(
            Math.floor(packets.count ?? 2),
            Math.floor(geometry.length / packetSpacing) || 1,
          ),
        );
  // A speed is stable across differently sized routes. A fixed period is still available for
  // deliberately synchronised loops and takes precedence for backwards compatibility.
  const packetPeriod =
    packets?.period ??
    (packets?.speed === undefined ? 2400 : Math.max(1, (geometry.length / packets.speed) * 1000));
  // A packet is the line's own ink in motion, so an untoned packet takes the line's colour. It
  // used to resolve "neutral" through the tone table, which answers `border` — leaving flow edges
  // carrying beads two steps paler than the line they ride on.
  const packetTone = packets?.tone ?? (tone === "neutral" ? undefined : (tone as Tone));
  const packetColor = paintColor(packetTone, theme, "stroke", strokeColor);
  const legacyLabel = definedLabels[0]?.text;
  const resolved: ResolvedEdge = {
    id: edge.id,
    ...(edge.interactionGroup === undefined ? {} : { interactionGroup: edge.interactionGroup }),
    from: fromEnd.node,
    to: toEnd.node,
    start: roundPoint(start, context.precision),
    end: roundPoint(end, context.precision),
    path: geometry.toSvg(context.precision),
    directed: head !== "none",
    ...(legacyLabel === undefined ? {} : { label: context.overrides?.label ?? legacyLabel }),
    appearance: {
      stroke: strokeColor,
      strokeWidth: width,
      ...(signalOpacity === 1 ? {} : { opacity: signalOpacity }),
    },
    ...(edge.casing === undefined
      ? {}
      : {
          casing: {
            stroke: paintColor(edge.casing.tone, theme, "stroke", theme.colors.canvas),
            strokeWidth: edge.casing.width,
            ...(edge.casing.opacity === undefined || edge.casing.opacity === 1
              ? {}
              : { opacity: edge.casing.opacity }),
          },
        }),
    state: {
      opacity: signalOpacity,
      progress: 1,
      highlight: 0,
      flow:
        packets === undefined
          ? 0
          : hasSignal && signalStyle?.packetsOnlyWhenOn !== false
            ? (signal ?? 0)
            : 1,
      ...(signal === undefined ? {} : { signal }),
    },
    route,
    head,
    tail,
    dash,
    length: round(geometry.length, context.precision),
    samples: sampleGeometry(geometry, context.precision),
    labels,
    packets: [],
    ...(packets === undefined
      ? {}
      : { packetSize: packets.size ?? Math.max(3, width * 1.5), packetColor }),
    ...(edge.description === undefined ? {} : { description: edge.description }),
    ...(edge.z === undefined ? {} : { z: edge.z }),
    ...(context.overrides?.hidden === true || pick(edge.hidden, context.layout) === true
      ? { hidden: true }
      : {}),
    ...(edge.metadata === undefined ? {} : { metadata: edge.metadata }),
  };
  return {
    edge: resolved,
    geometry,
    packetCount,
    packetPeriod,
    collidingLabels,
    collidingObstacles,
    ...(routePoints === undefined ? {} : { routePoints }),
  };
}

export const EDGE_SAMPLE_COUNT = 32;

/** Evenly spaced arc-length samples (inclusive of both ends). */
export function sampleGeometry(geometry: PathGeometry, precision: number): readonly Point[] {
  const points: Point[] = [];
  for (let index = 0; index <= EDGE_SAMPLE_COUNT; index += 1)
    points.push(roundPoint(geometry.pointAt(index / EDGE_SAMPLE_COUNT), precision));
  return points;
}

/** Interpolates a point at normalised distance `t` along evenly spaced samples. */
export function pointAlongSamples(samples: readonly Point[], t: number): Point {
  if (samples.length === 0) return { x: 0, y: 0 };
  const clamped = Math.min(1, Math.max(0, Number.isFinite(t) ? t : 0));
  const scaled = clamped * (samples.length - 1);
  const index = Math.min(samples.length - 2, Math.floor(scaled));
  const a = samples[Math.max(0, index)];
  const b = samples[Math.min(samples.length - 1, index + 1)];
  if (a === undefined) return { x: 0, y: 0 };
  if (b === undefined) return a;
  const local = scaled - index;
  return { x: a.x + (b.x - a.x) * local, y: a.y + (b.y - a.y) * local };
}

/** Packet positions along sampled edge geometry at an absolute time in milliseconds. */
export function packetPositions(
  samples: readonly Point[],
  count: number,
  period: number,
  time: number,
  precision = 3,
): readonly Point[] {
  if (count <= 0 || period <= 0 || samples.length === 0) return [];
  const phase = (((time % period) + period) % period) / period;
  const points: Point[] = [];
  for (let index = 0; index < count; index += 1) {
    const t = (phase + index / count) % 1;
    points.push(roundPoint(pointAlongSamples(samples, t), precision));
  }
  return points;
}

export function edgeEndpointIds(edge: EdgeDefinition): { from: string; to: string } {
  return { from: endpointNode(edge.from), to: endpointNode(edge.to) };
}

function round(value: number, precision: number): number {
  const scale = 10 ** precision;
  return Math.round((value + Number.EPSILON) * scale) / scale;
}

function roundPoint(point: Point, precision: number): Point {
  return { x: round(point.x, precision), y: round(point.y, precision) };
}
