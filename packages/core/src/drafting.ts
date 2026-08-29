/**
 * Drafting sheets: the vocabulary of an engineering drawing as deterministic path data.
 *
 * Every helper works in one fixed *sheet space* — 2880 × 1800 units, the proportions of a 16:10
 * wallpaper — and returns SVG path data. A figure draws those paths as `path` marks with the
 * sheet as their `viewBox`, so the same sheet renders at any width: the renderer scales the
 * geometry uniformly and keeps stroke widths in screen pixels. Text is placed in the same space
 * through `at()`, which converts sheet coordinates to the fractions a `coordinates` group expects.
 *
 * The look comes from the `draftingTheme` preset (graphite paper, white ink, amber/green/violet
 * reserved for annotation). Strokes are crisp by default; the optional `sketch` material displaces
 * them with seeded fractal noise for a hand-drafted feel, at the cost of jagged edges in rasters.
 */

import type { FigureBuilder, FigureTextPosition } from "./figure.js";
import {
  noise,
  shadow,
  sketch as sketchEffect,
  type MaterialEffect,
  type MaterialStyle,
} from "./material.js";
import {
  radialGradient,
  type Anchor,
  type GroupNode,
  type NodeBindings,
  type Paint,
  type PathMark,
  type SceneNode,
  type TextMark,
} from "./scene.js";
import type { SemanticTextStyle } from "./schema.js";

export const SHEET_WIDTH = 2880;
export const SHEET_HEIGHT = 1800;
/** The `viewBox` every sheet layer is authored in. */
export const SHEET_BOX = { width: SHEET_WIDTH, height: SHEET_HEIGHT } as const;

export interface SheetPoint {
  readonly x: number;
  readonly y: number;
}

const n = (value: number): string => {
  const rounded = Math.round(value * 10) / 10;
  return Object.is(rounded, -0) ? "0" : String(rounded);
};
const pt = (x: number, y: number): string => `${n(x)} ${n(y)}`;

/** Sheet coordinates → the fractional position a `coordinates` group places children by. */
export function at(x: number, y: number, anchor: Anchor = "top-left"): FigureTextPosition {
  return { x: x / SHEET_WIDTH, y: y / SHEET_HEIGHT, anchor };
}

export function line(x1: number, y1: number, x2: number, y2: number): string {
  return `M${pt(x1, y1)} L${pt(x2, y2)}`;
}

export function polyline(points: readonly SheetPoint[], close = false): string {
  if (points.length === 0) return "";
  const [first, ...rest] = points as [SheetPoint, ...SheetPoint[]];
  return `M${pt(first.x, first.y)}${rest.map((p) => ` L${pt(p.x, p.y)}`).join("")}${close ? " Z" : ""}`;
}

export function circle(cx: number, cy: number, r: number): string {
  return `M${pt(cx - r, cy)} A${n(r)} ${n(r)} 0 1 0 ${pt(cx + r, cy)} A${n(r)} ${n(r)} 0 1 0 ${pt(cx - r, cy)} Z`;
}

export function rect(x: number, y: number, width: number, height: number): string {
  return `M${pt(x, y)} H${n(x + width)} V${n(y + height)} H${n(x)} Z`;
}

/** A point on an ellipse whose major axis is rotated `rotation` degrees, at parameter `t` degrees. */
export function ellipsePoint(
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  rotation: number,
  t: number,
): SheetPoint {
  const a = (t * Math.PI) / 180;
  const r = (rotation * Math.PI) / 180;
  const x = rx * Math.cos(a);
  const y = ry * Math.sin(a);
  return { x: cx + x * Math.cos(r) - y * Math.sin(r), y: cy + x * Math.sin(r) + y * Math.cos(r) };
}

/** Direction of travel (radians, screen space) along the ellipse at parameter `t` degrees. */
export function ellipseTangent(rx: number, ry: number, rotation: number, t: number): number {
  const a = (t * Math.PI) / 180;
  return Math.atan2(ry * Math.cos(a), -rx * Math.sin(a)) + (rotation * Math.PI) / 180;
}

/** Sampled ellipse arc from `t0` to `t1` degrees; sampled so `progress` reveals draw evenly. */
export function ellipseArc(
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  rotation: number,
  t0: number,
  t1: number,
  samples?: number,
): string {
  const count = Math.max(2, samples ?? Math.ceil(Math.abs(t1 - t0) / 3));
  const points: SheetPoint[] = [];
  for (let k = 0; k <= count; k += 1)
    points.push(ellipsePoint(cx, cy, rx, ry, rotation, t0 + ((t1 - t0) * k) / count));
  return polyline(points);
}

export function ellipse(cx: number, cy: number, rx: number, ry: number, rotation = 0): string {
  return `${ellipseArc(cx, cy, rx, ry, rotation, 0, 360, 120)} Z`;
}

/** Sampled circular arc from `a0` to `a1` degrees (clockwise in screen space). */
export function arc(cx: number, cy: number, r: number, a0: number, a1: number): string {
  return ellipseArc(cx, cy, r, r, 0, a0, a1);
}

/** A closed sector: the focus, then the arc between two ellipse parameters. */
export function sector(
  focus: SheetPoint,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  rotation: number,
  t0: number,
  t1: number,
): string {
  const count = Math.max(2, Math.ceil(Math.abs(t1 - t0) / 2));
  const points: SheetPoint[] = [focus];
  for (let k = 0; k <= count; k += 1)
    points.push(ellipsePoint(cx, cy, rx, ry, rotation, t0 + ((t1 - t0) * k) / count));
  return polyline(points, true);
}

/** Shoelace area of a closed polygon, sheet units². */
export function polygonArea(points: readonly SheetPoint[]): number {
  let sum = 0;
  for (let i = 0; i < points.length; i += 1) {
    const p = points[i] as SheetPoint;
    const q = points[(i + 1) % points.length] as SheetPoint;
    sum += p.x * q.y - q.x * p.y;
  }
  return Math.abs(sum) / 2;
}

export function crosshair(x: number, y: number, size = 58): string {
  return `${line(x - size, y, x + size, y)} ${line(x, y - size, x, y + size)}`;
}

/** Spokes from `r0` to `r1` every `360 / count` degrees. */
export function radialTicks(cx: number, cy: number, r0: number, r1: number, count = 24): string {
  const parts: string[] = [];
  for (let k = 0; k < count; k += 1) {
    const a = (k * 2 * Math.PI) / count;
    parts.push(
      line(
        cx + r0 * Math.cos(a),
        cy + r0 * Math.sin(a),
        cx + r1 * Math.cos(a),
        cy + r1 * Math.sin(a),
      ),
    );
  }
  return parts.join(" ");
}

/** Filled triangular head at (x, y) pointing along `angle` radians. */
export function arrowhead(x: number, y: number, angle: number, size = 13): string {
  const tip = { x, y };
  const left = {
    x: x + size * 0.62 * Math.cos(angle + 2.6),
    y: y + size * 0.62 * Math.sin(angle + 2.6),
  };
  const right = {
    x: x + size * 0.62 * Math.cos(angle - 2.6),
    y: y + size * 0.62 * Math.sin(angle - 2.6),
  };
  return polyline([tip, left, right], true);
}

/** A stroked shaft with a filled head — draw it with the same paint for `fill` and `stroke`. */
export function vector(x1: number, y1: number, x2: number, y2: number, head = 13): string {
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const shaft = head * 0.85;
  return `${line(x1, y1, x2 - shaft * Math.cos(angle), y2 - shaft * Math.sin(angle))} ${arrowhead(x2, y2, angle, head)}`;
}

export interface DimensionOptions {
  /** Perpendicular offset of the dimension line from the measured segment. */
  readonly offset?: number;
  readonly head?: number;
}

export interface Dimension {
  /** Extension lines, dimension line, and both heads. */
  readonly d: string;
  /** Where the label sits and how it is rotated (degrees), kept upright. */
  readonly label: SheetPoint & { readonly angle: number };
}

/** A dimension line: extension lines out to `offset`, a line between them, heads pointing outward. */
export function dimension(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  options: DimensionOptions = {},
): Dimension {
  const offset = options.offset ?? 0;
  const head = options.head ?? 10;
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const nx = -Math.sin(angle) * offset;
  const ny = Math.cos(angle) * offset;
  const ax1 = x1 + nx;
  const ay1 = y1 + ny;
  const ax2 = x2 + nx;
  const ay2 = y2 + ny;
  const parts: string[] = [];
  if (offset !== 0) parts.push(line(x1, y1, ax1, ay1), line(x2, y2, ax2, ay2));
  parts.push(line(ax1, ay1, ax2, ay2));
  parts.push(arrowhead(ax1, ay1, angle + Math.PI, head), arrowhead(ax2, ay2, angle, head));
  let deg = (angle * 180) / Math.PI;
  if (deg > 90) deg -= 180;
  else if (deg < -90) deg += 180;
  return {
    d: parts.join(" "),
    label: { x: (ax1 + ax2) / 2, y: (ay1 + ay2) / 2, angle: deg },
  };
}

export interface LeaderOptions {
  /** Horizontal stub after the leader reaches the annotation; negative points left. */
  readonly stub?: number;
  /** Radius of the dot on the drawing; 0 omits it. */
  readonly dot?: number;
}

/**
 * Leader line from a point on the drawing to an annotation, ending in a horizontal stub. Draw it
 * stroke-only (`fill: "none"`): a filled open path would paint the leader as a sliver polygon.
 */
export function leader(
  px: number,
  py: number,
  tx: number,
  ty: number,
  options: LeaderOptions = {},
): string {
  const stub = options.stub ?? 34;
  const dot = options.dot ?? 3.6;
  const parts = [`M${pt(px, py)} L${pt(tx, ty)} h${n(stub)}`];
  if (dot > 0) parts.push(circle(px, py, dot));
  return parts.join(" ");
}

export interface FrameOptions {
  readonly margin?: number;
  readonly inner?: number;
  readonly columns?: number;
  readonly rows?: number;
  readonly tick?: number;
}

export interface Frame {
  /** The outer border. */
  readonly border: string;
  /** The inner rule. */
  readonly inner: string;
  /** Edge-zone index ticks, the way a real sheet is indexed. */
  readonly ticks: string;
  readonly margin: number;
}

export function frame(options: FrameOptions = {}): Frame {
  const m = options.margin ?? 90;
  const o = options.inner ?? 118;
  const columns = options.columns ?? 8;
  const rows = options.rows ?? 5;
  const tick = options.tick ?? 28;
  const ticks: string[] = [];
  for (let i = 1; i < columns; i += 1) {
    const x = m + ((SHEET_WIDTH - 2 * m) * i) / columns;
    ticks.push(line(x, m, x, m + tick), line(x, SHEET_HEIGHT - m, x, SHEET_HEIGHT - m - tick));
  }
  for (let i = 1; i < rows; i += 1) {
    const y = m + ((SHEET_HEIGHT - 2 * m) * i) / rows;
    ticks.push(line(m, y, m + tick, y), line(SHEET_WIDTH - m, y, SHEET_WIDTH - m - tick, y));
  }
  return {
    border: rect(m, m, SHEET_WIDTH - 2 * m, SHEET_HEIGHT - 2 * m),
    inner: rect(o, o, SHEET_WIDTH - 2 * o, SHEET_HEIGHT - 2 * o),
    ticks: ticks.join(" "),
    margin: m,
  };
}

/** Grid lines every `step` units across the whole sheet. */
export function grid(step: number): string {
  const parts: string[] = [];
  for (let x = 0; x <= SHEET_WIDTH; x += step) parts.push(`M${pt(x, 0)} V${n(SHEET_HEIGHT)}`);
  for (let y = 0; y <= SHEET_HEIGHT; y += step) parts.push(`M${pt(0, y)} H${n(SHEET_WIDTH)}`);
  return parts.join(" ");
}

export interface TitleBlockOptions {
  readonly x?: number;
  readonly y?: number;
  readonly width?: number;
  readonly header?: number;
  readonly row?: number;
  /** Fraction of the width given to the key column. */
  readonly split?: number;
}

export interface TitleBlock {
  readonly d: string;
  readonly rules: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly title: FigureTextPosition;
  readonly cells: readonly {
    readonly key: FigureTextPosition;
    readonly value: FigureTextPosition;
  }[];
}

/** Bottom-corner sheet identification block; defaults sit it inside the frame's lower right. */
export function titleBlock(rowCount: number, options: TitleBlockOptions = {}): TitleBlock {
  const width = options.width ?? 900;
  const header = options.header ?? 90;
  const row = options.row ?? 60;
  const split = options.split ?? 0.36;
  const height = header + row * rowCount;
  const x = options.x ?? SHEET_WIDTH - 90 - 20 - width;
  const y = options.y ?? SHEET_HEIGHT - 90 - 20 - height;
  const rules = [line(x, y + header, x + width, y + header)];
  for (let i = 1; i < rowCount; i += 1)
    rules.push(line(x, y + header + row * i, x + width, y + header + row * i));
  rules.push(line(x + width * split, y + header, x + width * split, y + height));
  const cells = [];
  for (let i = 0; i < rowCount; i += 1) {
    const cy = y + header + row * i + row / 2;
    cells.push({ key: at(x + 24, cy, "left"), value: at(x + width * split + 24, cy, "left") });
  }
  return {
    d: rect(x, y, width, height),
    rules: rules.join(" "),
    x,
    y,
    width,
    height,
    title: at(x + 24, y + header / 2, "left"),
    cells,
  };
}

export interface SketchOptions {
  readonly seed?: number;
  readonly strength?: number;
  readonly frequency?: number;
}

/** The hand-drawn material, for `material:` on any mark. Strength is in sheet units. */
export function sketchMaterial(options: SketchOptions = {}): MaterialStyle {
  return { effects: [sketchEffect(options)] };
}

export interface LayerOptions {
  readonly id?: string;
  readonly label?: string;
  readonly stroke?: Paint;
  readonly fill?: PathMark["fill"];
  readonly strokeWidth?: number;
  readonly opacity?: number;
  readonly dash?: PathMark["dash"];
  /** Stroke cap; defaults to `butt` (drafting pens), `round` for dotted strokes so dots stay visible. */
  readonly lineCap?: PathMark["lineCap"];
  readonly bind?: NodeBindings;
  /** Apply the hand-drawn material; a number is the noise seed. */
  readonly sketch?: boolean | SketchOptions;
  /** Extra material effects (grain, shadows) applied with the sketch displacement. */
  readonly effects?: readonly MaterialEffect[];
  readonly hidden?: boolean;
  readonly z?: number;
}

/** One geometry layer: a full-sheet `path` mark placed at the sheet origin. */
export function layer(f: FigureBuilder, d: string, options: LayerOptions = {}): PathMark {
  const { sketch, label, effects: extra = [], ...rest } = options;
  const effects: MaterialEffect[] = [
    ...(sketch === undefined || sketch === false
      ? []
      : [sketchEffect(sketch === true ? {} : sketch)]),
    ...extra,
  ];
  const material = effects.length === 0 ? {} : { material: { effects } };
  const node = f.path(d, SHEET_BOX, {
    width: "fill",
    fill: rest.fill ?? "none",
    stroke: rest.stroke ?? "text",
    strokeWidth: rest.strokeWidth ?? 1,
    ...(rest.opacity === undefined ? {} : { opacity: rest.opacity }),
    ...(rest.dash === undefined ? {} : { dash: rest.dash }),
    lineCap: rest.lineCap ?? (rest.dash === "dotted" ? "round" : "butt"),
    ...(rest.bind === undefined ? {} : { bind: rest.bind }),
    ...(rest.hidden === undefined ? {} : { hidden: rest.hidden }),
    ...(rest.z === undefined ? {} : { z: rest.z }),
    ...(rest.id === undefined ? {} : { id: rest.id }),
    ...(label === undefined ? {} : { label }),
    ...material,
  });
  return f.place(node, at(0, 0));
}

export interface SheetTextOptions {
  readonly id?: string;
  readonly style?: SemanticTextStyle;
  readonly tone?: Paint;
  readonly opacity?: number;
  readonly bind?: NodeBindings;
  readonly transform?: TextMark["transform"];
  readonly hidden?: boolean;
}

/** Text at sheet coordinates. */
export function text(
  f: FigureBuilder,
  value: string,
  x: number,
  y: number,
  anchor: Anchor = "top-left",
  options: SheetTextOptions = {},
): TextMark {
  return f.textAt(value, at(x, y, anchor), {
    textStyle: options.style ?? "caption",
    ...(options.tone === undefined ? {} : { tone: options.tone }),
    ...(options.opacity === undefined ? {} : { opacity: options.opacity }),
    ...(options.bind === undefined ? {} : { bind: options.bind }),
    ...(options.transform === undefined ? {} : { transform: options.transform }),
    ...(options.hidden === undefined ? {} : { hidden: options.hidden }),
    ...(options.id === undefined ? {} : { id: options.id }),
  });
}

/** A pre-rendered formula: path data in its own box with 1000 units per em (see `@kineglyph/math`). */
export interface MathGlyphLike {
  readonly d: string;
  readonly viewBox: { readonly width: number; readonly height: number };
  readonly baseline: number;
  readonly em: number;
  readonly tex?: string;
}

export interface SheetMathOptions {
  readonly id?: string;
  /** Font size in pixels (one em of the formula). */
  readonly size?: number;
  readonly tone?: Paint;
  readonly opacity?: number;
  readonly hidden?: boolean;
}

/**
 * A formula at sheet coordinates. The glyph is sized like text — in pixels, not sheet units —
 * and anchored the way `text()` is, so a formula and a label sit on the same line.
 */
export function math(
  f: FigureBuilder,
  glyph: MathGlyphLike,
  x: number,
  y: number,
  anchor: Anchor = "top-left",
  options: SheetMathOptions = {},
): PathMark {
  const size = options.size ?? 12;
  const scale = size / glyph.em;
  const node = f.path(glyph.d, glyph.viewBox, {
    width: glyph.viewBox.width * scale,
    height: glyph.viewBox.height * scale,
    fill: options.tone ?? "text",
    stroke: "none",
    strokeWidth: 0,
    ...(options.opacity === undefined ? {} : { opacity: options.opacity }),
    ...(options.hidden === undefined ? {} : { hidden: options.hidden }),
    ...(options.id === undefined ? {} : { id: options.id }),
    label: glyph.tex ?? "formula",
  });
  return f.place(node, at(x, y, anchor));
}

export type AnnotationLine = string | { readonly text: string; readonly bind?: string };

export interface AnnotationOptions {
  readonly id?: string;
  readonly tone?: Paint;
  readonly anchor?: Anchor;
  readonly opacity?: number;
  /** Text style of the first line; the rest are `code`. */
  readonly headStyle?: SemanticTextStyle;
  readonly gap?: number;
}

/** A stacked annotation block: an uppercase head line, then monospaced detail lines. */
export function annotation(
  f: FigureBuilder,
  x: number,
  y: number,
  lines: readonly AnnotationLine[],
  options: AnnotationOptions = {},
): GroupNode {
  const tone = options.tone ?? "text";
  const anchor = options.anchor ?? "top-left";
  const align =
    anchor.endsWith("right") || anchor === "right"
      ? "end"
      : anchor === "top" || anchor === "center" || anchor === "bottom"
        ? "center"
        : "start";
  const children: SceneNode[] = lines.map((entry, index) => {
    const value = typeof entry === "string" ? entry : entry.text;
    const bind = typeof entry === "string" ? undefined : entry.bind;
    return f.text(value, {
      textStyle: index === 0 ? (options.headStyle ?? "label") : "code",
      tone: index === 0 ? tone : tone,
      opacity: index === 0 ? (options.opacity ?? 0.92) : (options.opacity ?? 0.92) * 0.8,
      align,
      ...(bind === undefined ? {} : { bind: { text: bind } }),
    });
  });
  const block = f.stack(children, {
    gap: options.gap ?? 3,
    align: align === "end" ? "end" : align === "center" ? "center" : "start",
    ...(options.id === undefined ? {} : { id: options.id }),
  });
  return f.place(block, at(x, y, anchor));
}

/**
 * Two grains make paper: a coarse, low-amplitude mottle (the pulp) and a fine, sharper tooth
 * (the surface). One octave of noise reads as static; the pair reads as stock.
 */
function paperGrain(
  options: { readonly amount?: number; readonly scale?: number },
  seed: number,
): MaterialEffect[] {
  const amount = options.amount ?? 0.18;
  const scale = options.scale ?? 8;
  return [
    noise({ amount: amount * 0.5, scale: 0.3, seed }),
    noise({ amount, scale, seed: seed + 1 }),
  ];
}

export interface PlateOptions {
  readonly id?: string;
  readonly label?: string;
  /** Paper colour of the raised sheet. */
  readonly fill?: Paint;
  readonly stroke?: Paint;
  readonly strokeOpacity?: number;
  /** Drop shadow beneath the sheet; blur and offset are in sheet units. */
  readonly shadow?:
    | boolean
    | {
        readonly blur?: number;
        readonly offset?: readonly [number, number];
        readonly opacity?: number;
      };
  readonly grain?: boolean;
  readonly seed?: number;
  readonly sketch?: boolean | SketchOptions;
}

/**
 * A raised second sheet — a cartouche, a data plate — lying physically on the drawing: paper fill
 * with a drop shadow and its own grain, then an outline. Returns the two layers in paint
 * order; spread them into a sheet's layers before the text that sits on the plate.
 */
export function plate(
  f: FigureBuilder,
  x: number,
  y: number,
  width: number,
  height: number,
  options: PlateOptions = {},
): PathMark[] {
  const seed = options.seed ?? 7;
  const drop = options.shadow ?? true;
  const dropOptions = typeof drop === "object" ? drop : {};
  const effects: MaterialEffect[] = [];
  if (drop !== false)
    effects.push(
      shadow({
        color: "canvas",
        opacity: dropOptions.opacity ?? 0.9,
        blur: dropOptions.blur ?? 30,
        offset: dropOptions.offset ?? [14, 20],
      }),
    );
  if (options.grain !== false) effects.push(...paperGrain({ amount: 0.14, scale: 8 }, seed + 2));
  const d = rect(x, y, width, height);
  const label = options.label ?? "plate";
  return [
    layer(f, d, {
      ...(options.id === undefined ? {} : { id: `${options.id}-paper` }),
      label: `${label} paper`,
      fill: options.fill ?? "surfaceRaised",
      stroke: "none",
      strokeWidth: 0,
      effects,
    }),
    layer(f, d, {
      ...(options.id === undefined ? {} : { id: options.id }),
      label,
      stroke: options.stroke ?? "text",
      strokeWidth: 0.9,
      opacity: options.strokeOpacity ?? 0.36,
      ...(options.sketch === undefined || options.sketch === false
        ? {}
        : { sketch: options.sketch }),
    }),
  ];
}

export interface CalloutOptions extends AnnotationOptions {
  /** Length of the horizontal stub between the leader and the text (sheet units). */
  readonly stub?: number;
}

export interface Callout {
  /** The annotation block, already placed. */
  readonly node: GroupNode;
  /**
   * Leader path data from a point on the drawing to the block's head line. Call it inside the
   * model so the leader follows the point; draw the result as a stroke-only layer.
   */
  leader(px: number, py: number): string;
}

/**
 * The leader for a callout placed at (x, y) with `anchor`, as a function of the point on the
 * drawing. Pure geometry, so a model can call it before the figure exists.
 */
export function calloutLeader(
  x: number,
  y: number,
  anchor: Anchor = "top-left",
  stub = 34,
): (px: number, py: number) => string {
  const fromRight = anchor.endsWith("right") || anchor === "right";
  const gap = 8;
  const tx = fromRight ? x + gap + stub : x - gap - stub;
  const ty = y + 34;
  return (px, py) => leader(px, py, tx, ty, { stub: fromRight ? -stub : stub });
}

export interface BoundHelpers {
  /** A full-sheet layer whose path is bound to `signals[key]`; other bindings (tone, …) merge. */
  layer(key: string, options?: LayerOptions): PathMark;
  /** Text bound to `signals[key]`, in `code` style by default. */
  text(key: string, x: number, y: number, anchor?: Anchor, options?: SheetTextOptions): TextMark;
}

/**
 * Helpers for the common case of one signal per layer: the node id, the initial value, and the
 * binding all come from the same key.
 */
export function bound(f: FigureBuilder, signals: Readonly<Record<string, unknown>>): BoundHelpers {
  const initial = (key: string): string => {
    const value = signals[key];
    if (typeof value !== "string") throw new Error(`bound signal "${key}" is not a string`);
    return value;
  };
  return {
    layer: (key, options = {}) =>
      layer(f, initial(key), { id: key, ...options, bind: { path: key } }),
    text: (key, x, y, anchor = "top-left", options = {}) =>
      text(f, initial(key), x, y, anchor, {
        id: key,
        style: "code",
        tone: "textMuted",
        ...options,
        bind: { text: key },
      }),
  };
}

/**
 * An annotation with its leader convention baked in: the block is anchored at (x, y) and the
 * leader lands on the head line's near end, coming from the drawing side of the text.
 */
export function callout(
  f: FigureBuilder,
  x: number,
  y: number,
  lines: readonly AnnotationLine[],
  options: CalloutOptions = {},
): Callout {
  const { stub = 34, ...rest } = options;
  const anchor = rest.anchor ?? "top-left";
  return {
    node: annotation(f, x, y, lines, { ...rest, anchor }),
    leader: calloutLeader(x, y, anchor, stub),
  };
}

export interface SheetOptions {
  readonly id?: string;
  readonly title: string;
  readonly subtitle?: string;
  /** Top-right identification, e.g. `SHEET 1 OF 5 · REV C`. */
  readonly ident?: string;
  readonly titleBlock?: {
    readonly title: string;
    readonly rows: readonly (readonly [string, string])[];
    readonly options?: TitleBlockOptions;
    /** Draw the block as a raised plate (default) or as plain lines on the sheet. */
    readonly plate?: boolean | PlateOptions;
  };
  /** Noise seed for the paper grain (and for `sketch`, where a caller opts in). */
  readonly seed?: number;
  readonly paper?: boolean;
  /** Paper grain on the sheet background; `false` for a flat vignette. */
  readonly grain?: boolean | { readonly amount?: number; readonly scale?: number };
  readonly grid?: boolean;
  readonly frame?: boolean;
  /** Nodes drawn between the chrome and the header; geometry layers and annotations. */
  readonly layers: readonly SceneNode[];
}

/**
 * Assembles a complete sheet: paper vignette, fine and coarse grids, indexed frame, header, the
 * caller's layers, and the title block — as one `coordinates` group whose height follows the
 * sheet aspect at any width (text near the edges may spill; it never stretches the sheet).
 */
export function sheet(f: FigureBuilder, options: SheetOptions): GroupNode {
  const children: SceneNode[] = [];
  const seed = options.seed ?? 7;
  if (options.paper !== false)
    children.push(
      layer(f, rect(0, 0, SHEET_WIDTH, SHEET_HEIGHT), {
        label: "paper",
        stroke: "none",
        strokeWidth: 0,
        ...(options.grain === false
          ? {}
          : {
              effects: paperGrain(typeof options.grain === "object" ? options.grain : {}, seed),
            }),
        fill: radialGradient(
          [
            { at: 0, color: "surface" },
            { at: 1, color: "canvas" },
          ],
          { center: [0.46, 0.44], radius: 0.78 },
        ),
      }),
    );
  if (options.grid !== false) {
    children.push(
      layer(f, grid(40), { label: "fine grid", strokeWidth: 0.5, opacity: 0.07 }),
      layer(f, grid(200), { label: "coarse grid", strokeWidth: 0.7, opacity: 0.12 }),
    );
  }
  // The vignette sits above the grids so the ruling fades toward the edges the way ink on a
  // curved sheet does, instead of staying uniformly bright out to the border.
  if (options.paper !== false)
    children.push(
      layer(f, rect(0, 0, SHEET_WIDTH, SHEET_HEIGHT), {
        label: "vignette",
        stroke: "none",
        strokeWidth: 0,
        fill: radialGradient(
          [
            { at: 0, color: "canvas", opacity: 0 },
            { at: 0.45, color: "canvas", opacity: 0.08 },
            { at: 1, color: "canvas", opacity: 0.72 },
          ],
          { center: [0.46, 0.44], radius: 0.78 },
        ),
      }),
    );
  if (options.frame !== false) {
    const border = frame();
    children.push(
      layer(f, border.border, {
        label: "frame",
        strokeWidth: 0.9,
        opacity: 0.28,
      }),
      layer(f, border.inner, { label: "frame inner", strokeWidth: 0.7, opacity: 0.16 }),
      layer(f, border.ticks, { label: "frame ticks", strokeWidth: 0.8, opacity: 0.24 }),
    );
  }
  children.push(...options.layers);
  children.push(
    text(f, options.title, 150, 214, "bottom-left", { style: "title", transform: "uppercase" }),
    layer(f, line(150, 232, 150 + options.title.length * 52, 232), {
      label: "title rule",
      strokeWidth: 1,
      opacity: 0.4,
    }),
  );
  if (options.subtitle !== undefined)
    children.push(
      text(f, options.subtitle, 150, 262, "top-left", {
        style: "label",
        tone: "textMuted",
        transform: "uppercase",
      }),
    );
  if (options.ident !== undefined)
    children.push(
      text(f, options.ident, SHEET_WIDTH - 150, 214, "bottom-right", {
        style: "label",
        tone: "textMuted",
        transform: "uppercase",
      }),
    );
  if (options.titleBlock !== undefined) {
    const block = titleBlock(options.titleBlock.rows.length, options.titleBlock.options);
    children.push(
      ...(options.titleBlock.plate === false
        ? [
            layer(f, block.d, {
              label: "title block",
              strokeWidth: 0.9,
              opacity: 0.32,
            }),
          ]
        : plate(f, block.x, block.y, block.width, block.height, {
            label: "title block",
            seed,
            ...(typeof options.titleBlock.plate === "object" ? options.titleBlock.plate : {}),
          })),
      layer(f, block.rules, { label: "title block rules", strokeWidth: 0.7, opacity: 0.18 }),
      f.textAt(options.titleBlock.title, block.title, {
        textStyle: "label",
        transform: "uppercase",
      }),
    );
    options.titleBlock.rows.forEach(([key, value], index) => {
      const cell = block.cells[index];
      if (cell === undefined) return;
      children.push(
        f.textAt(key, cell.key, { textStyle: "code", tone: "textMuted", transform: "uppercase" }),
        f.textAt(value, cell.value, { textStyle: "code" }),
      );
    });
  }
  return f.coordinates(children, {
    ...(options.id === undefined ? {} : { id: options.id }),
    width: "fill",
    aspect: SHEET_HEIGHT / SHEET_WIDTH,
    allowOverflow: true,
  });
}

export const drafting = {
  SHEET_WIDTH,
  SHEET_HEIGHT,
  SHEET_BOX,
  at,
  line,
  polyline,
  circle,
  rect,
  ellipsePoint,
  ellipseTangent,
  ellipseArc,
  ellipse,
  arc,
  sector,
  polygonArea,
  crosshair,
  radialTicks,
  arrowhead,
  vector,
  dimension,
  leader,
  frame,
  grid,
  titleBlock,
  sketchMaterial,
  layer,
  plate,
  text,
  math,
  annotation,
  callout,
  calloutLeader,
  bound,
  sheet,
} as const;
