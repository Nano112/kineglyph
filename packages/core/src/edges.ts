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
  EdgeEndpoint,
  EdgeRoute,
  EdgeSide,
  LabelPlacement,
  LayoutName,
  MarkerKind,
  StrokeStyle,
  Tone,
} from "./scene.js";
import { pick, pickOr, endpointNode } from "./scene.js";
import { measureText, type TextFont } from "./text.js";
import { paintColor, type ThemeTokens } from "./theme.js";

export interface EdgeNodeBox extends Rect {
  readonly id: string;
  readonly kind: "rect" | "circle" | "ellipse" | "group" | "other";
}

export interface EdgePortAssignment {
  readonly side: Exclude<EdgeSide, "auto">;
  readonly offset: number;
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
  /** Scene bounds that labels must stay inside. */
  readonly bounds?: Rect;
  readonly labelFont: TextFont;
  readonly labelColor: string;
  readonly precision: number;
  /** Signal-bound overrides already applied by the resolver. */
  readonly overrides?: {
    readonly tone?: string;
    readonly hidden?: boolean;
    readonly label?: string;
    readonly labelHidden?: ReadonlySet<string>;
    readonly labelText?: ReadonlyMap<string, string>;
  };
}

export interface ResolvedEdgeGeometry {
  readonly edge: ResolvedEdge;
  readonly geometry: PathGeometry;
  readonly packetCount: number;
  readonly packetPeriod: number;
  /** Labels that still overlap a node after every nudge was tried. */
  readonly collidingLabels: readonly string[];
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
    const fromSide = pickOr<EdgeSide>(from.side, layout, "auto");
    const toSide = pickOr<EdgeSide>(to.side, layout, "auto");
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
      explicitOffset: pick(from.offset, layout),
      otherCenter: rectCenter(toBox),
    });
    pending.push({
      edgeId: edge.id,
      end: "to",
      node: to.node,
      side: chosen.to,
      explicitOffset: pick(to.offset, layout),
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
    const fromOffset = pick(from.offset, layout);
    const toOffset = pick(to.offset, layout);
    result.set(edge.id, {
      from: {
        side: chosen.from,
        offset: fromOffset ?? offsets.get(`${edge.id}::from`) ?? 0.5,
        pinned: fromOffset !== undefined || distributed.has(`${edge.id}::from`),
      },
      to: {
        side: chosen.to,
        offset: toOffset ?? offsets.get(`${edge.id}::to`) ?? 0.5,
        pinned: toOffset !== undefined || distributed.has(`${edge.id}::to`),
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
export function edgeLabelWidth(text: string, font: TextFont): number {
  return measureText(text, font) + LABEL_PADDING_X * 2;
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
  const ports = anchored.kind === "aligned" ? anchored : requested;
  const authored = pickOr(edge.route, context.layout, "straight");
  // Facing sides with no shared axis: a straight line between them can only lean, so it turns.
  const route: EdgeRoute =
    anchored.kind === "traverse" && authored === "straight" ? "orthogonal" : authored;
  const start = portPoint(
    fromBox,
    ports.from.side,
    ports.from.offset,
    fromEnd.gap ?? 0,
    rectCenter(toBox),
  );
  const end = portPoint(toBox, ports.to.side, ports.to.offset, toEnd.gap ?? 0, rectCenter(fromBox));
  const curvature = edge.curvature ?? 0.5;
  let segments: PathSegment[];
  switch (route) {
    case "straight":
      segments = [{ kind: "line", from: start, to: end }];
      break;
    case "orthogonal":
      segments = polylineToSegments(
        orthogonalPoints(start, ports.from.side, end, ports.to.side),
        edge.cornerRadius ?? 8,
      );
      break;
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
  const tone = context.overrides?.tone ?? edge.tone ?? "neutral";
  const stroke = paintColor(
    tone as EdgeDefinition["tone"],
    theme,
    "stroke",
    theme.colors.connector,
  );
  const strokeColor = tone === "neutral" ? theme.colors.connector : stroke;
  const width = edge.width ?? theme.strokes.regular;
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
  const contains = (rect: Rect, point: Point): boolean =>
    point.x >= rect.x - 0.5 &&
    point.x <= rect.x + rect.width + 0.5 &&
    point.y >= rect.y - 0.5 &&
    point.y <= rect.y + rect.height + 0.5;
  const obstacles = context.obstacles.filter(
    (obstacle) => !contains(obstacle, start) && !contains(obstacle, end),
  );
  for (const label of definedLabels) {
    const text = context.overrides?.labelText?.get(label.id) ?? label.text;
    const hidden =
      (context.overrides?.labelHidden?.has(label.id) ?? false) ||
      ("hidden" in label && pickOr(label.hidden, context.layout, false));
    const font = context.labelFont;
    const boxWidth = edgeLabelWidth(text, font);
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
  const packetPeriod = packets?.period ?? 2400;
  // A packet is the line's own ink in motion, so an untoned packet takes the line's colour. It
  // used to resolve "neutral" through the tone table, which answers `border` — leaving flow edges
  // carrying beads two steps paler than the line they ride on.
  const packetTone = packets?.tone ?? (tone === "neutral" ? undefined : (tone as Tone));
  const packetColor = paintColor(packetTone, theme, "stroke", strokeColor);
  const legacyLabel = definedLabels[0]?.text;
  const resolved: ResolvedEdge = {
    id: edge.id,
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
      ...(edge.opacity === undefined ? {} : { opacity: edge.opacity }),
    },
    state: { opacity: 1, progress: 1, highlight: 0, flow: packets === undefined ? 0 : 1 },
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
  return { edge: resolved, geometry, packetCount, packetPeriod, collidingLabels };
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
