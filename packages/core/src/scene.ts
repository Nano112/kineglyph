/**
 * General scene primitives (schema version 2).
 *
 * The hierarchy is small, typed, and serializable. Every node has a stable caller-owned id,
 * layouts are named (`wide`, `compact`, `narrow`) rather than scaled, and appearance uses semantic
 * tokens or tones instead of embedded product colours.
 */
import type { AnimationTimeline } from "./resolved.js";
import type { MaterialRef, MaterialStyle } from "./material.js";
import type { SemanticColorToken, SemanticTextStyle } from "./schema.js";
import type { StateMachineDefinition, Condition, VariableValue } from "./machine.js";

export type LayoutName = "wide" | "compact" | "narrow";
export const LAYOUT_NAMES: readonly LayoutName[] = ["wide", "compact", "narrow"];

/** A value that may vary by named layout. Missing narrower entries fall back to wider ones. */
export type Responsive<T> = T | ResponsiveMap<T>;
export interface ResponsiveMap<T> {
  readonly wide?: T;
  readonly compact?: T;
  readonly narrow?: T;
}

export type Tone = "neutral" | "accent" | "success" | "warning" | "danger" | "info" | "muted";
export type Paint = Tone | SemanticColorToken | "none";

export interface GradientStop {
  /** Position along the gradient, clamped to 0..1 when resolved. */
  readonly at: number;
  readonly color: Paint;
  /** Stop alpha, clamped to 0..1. Defaults to 1. */
  readonly opacity?: number;
}

export interface LinearGradientPaint {
  readonly type: "linear-gradient";
  readonly stops: readonly GradientStop[];
  /** Degrees clockwise: 0 goes left to right, 90 top to bottom. */
  readonly angle?: number;
  readonly spread?: "pad" | "reflect" | "repeat";
}

export interface RadialGradientPaint {
  readonly type: "radial-gradient";
  readonly stops: readonly GradientStop[];
  /** Fractions of the painted box. */
  readonly center?: readonly [x: number, y: number];
  readonly focalPoint?: readonly [x: number, y: number];
  readonly radius?: number;
  readonly spread?: "pad" | "reflect" | "repeat";
}

/** A solid semantic paint or a serializable gradient. */
export type FillPaint = Paint | LinearGradientPaint | RadialGradientPaint;

export function linearGradient(
  stops: readonly GradientStop[],
  options: Omit<LinearGradientPaint, "type" | "stops"> = {},
): LinearGradientPaint {
  return { type: "linear-gradient", stops, ...options };
}

export function radialGradient(
  stops: readonly GradientStop[],
  options: Omit<RadialGradientPaint, "type" | "stops"> = {},
): RadialGradientPaint {
  return { type: "radial-gradient", stops, ...options };
}

/** A two-stop gradient from one alpha to another. */
export function alphaGradient(
  color: Paint,
  options: {
    readonly from?: number;
    readonly to?: number;
    readonly angle?: number;
    readonly spread?: LinearGradientPaint["spread"];
  } = {},
): LinearGradientPaint {
  return linearGradient(
    [
      { at: 0, color, opacity: options.from ?? 1 },
      { at: 1, color, opacity: options.to ?? 0 },
    ],
    {
      angle: options.angle ?? 90,
      ...(options.spread === undefined ? {} : { spread: options.spread }),
    },
  );
}
/** Pixels, share of surplus, content size, or a percentage of the parent content box. */
export type Length = number | "fill" | "hug" | `${number}%`;
export type Insets =
  | number
  | readonly [vertical: number, horizontal: number]
  | readonly [top: number, right: number, bottom: number, left: number];
export type Align = "start" | "center" | "end" | "stretch";
export type Justify = "start" | "center" | "end" | "between" | "around" | "evenly";
/**
 * `coordinates` is a normalised space: children are placed by fractional `position` (0..1 of the
 * content box) and may size themselves with percentages, so the same fragment resolves at any
 * width without scaling glyphs or strokes. Overlaps inside overlay/coordinates groups are intended.
 */
export type GroupLayout = "stack" | "row" | "grid" | "overlay" | "absolute" | "coordinates";
export type Anchor =
  | "top-left"
  | "top"
  | "top-right"
  | "left"
  | "center"
  | "right"
  | "bottom-left"
  | "bottom"
  | "bottom-right";

export type SceneMetadata = Readonly<Record<string, string | number | boolean | null>>;

/** Structured inspection copy rendered by runtimes as a generic definition list. */
export interface InspectInfo {
  /** Short role shown as the eyebrow, e.g. "Series", "Stage", "Connector", "Cell". */
  readonly role?: string;
  readonly title?: string;
  readonly summary?: string;
  readonly fields?: readonly { readonly label: string; readonly value: string }[];
}

/** Signal-driven properties. Values are signal or variable ids from the scene's state machine. */
export interface NodeBindings {
  readonly text?: string;
  /** SVG path data for path marks. Non-string signal values leave the authored path unchanged. */
  readonly path?: string;
  readonly hidden?: string;
  readonly tone?: string;
  readonly opacity?: string;
  readonly highlight?: string;
  readonly progress?: string;
  readonly description?: string;
  /** Numeric signal driving the node width in pixels. */
  readonly width?: string;
  /** Numeric signal driving the node height in pixels. */
  readonly height?: string;
}

export interface EdgeBindings {
  readonly hidden?: string;
  readonly tone?: string;
  readonly opacity?: string;
  readonly highlight?: string;
  readonly progress?: string;
  readonly flow?: string;
  readonly label?: string;
}

export interface FrameStyle extends MaterialStyle {
  readonly fill?: FillPaint;
  readonly stroke?: Paint;
  readonly strokeWidth?: number;
  readonly radius?: number;
  readonly dash?: "solid" | "dashed" | "dotted";
  readonly opacity?: number;
}

interface BaseNode {
  readonly id: string;
  /** Explicit paint order. Children inherit their parent's effective z unless they set one. */
  readonly z?: number;
  readonly hidden?: Responsive<boolean>;
  /** Accessible name; also the inspection heading for interactive nodes. */
  readonly label?: string;
  /** Accessible description; also the inspection body for interactive nodes. */
  readonly description?: string;
  readonly interactive?: boolean;
  /** Machine event sent when an interactive node is activated. */
  readonly onActivate?: string;
  /** Semantic pointer/focus gestures. Pointer and drag payloads are normalized `[x, y]` pairs. */
  readonly onHover?: string;
  readonly onLeave?: string;
  readonly onFocus?: string;
  readonly onBlur?: string;
  readonly onPointer?: string;
  readonly onDrag?: string;
  readonly opacity?: number;
  /** Clockwise rotation in degrees around the resolved node centre. */
  readonly rotation?: Responsive<number>;
  readonly metadata?: SceneMetadata;
  readonly bind?: NodeBindings;
  /** Semantic material role or a role with local overrides; shapes keep their explicit paint. */
  readonly material?: MaterialRef;
  /** Position inside an `absolute` parent, relative to the parent's content box. */
  readonly position?: Responsive<{
    readonly x: number;
    readonly y: number;
    readonly anchor?: Anchor;
  }>;
  /** Cross-axis override inside a stack, row, grid, or overlay parent. */
  readonly alignSelf?: Responsive<Align>;
  /** Main-axis override inside an overlay parent. */
  readonly justifySelf?: Responsive<Align>;
  readonly width?: Responsive<Length>;
  readonly height?: Responsive<Length>;
  readonly minWidth?: Responsive<number>;
  readonly maxWidth?: Responsive<number>;
  readonly minHeight?: Responsive<number>;
  /** Share of surplus main-axis space in a row or stack parent. */
  readonly grow?: Responsive<number>;
  /** Structured inspection copy (falls back to label/description). */
  readonly inspect?: InspectInfo;
  /**
   * Makes this group a single tab stop whose interactive descendants are reached with the arrow
   * keys (roving focus), so dense data marks do not add one tab stop per datum.
   */
  readonly focusGroup?: boolean;
  /** Side a revealX/revealY timeline track grows from (default: left / bottom). */
  readonly revealAnchor?: "left" | "right" | "top" | "bottom";
}

export interface GroupNode extends BaseNode {
  readonly type: "group";
  readonly layout?: Responsive<GroupLayout>;
  /** Optional local breakpoints; responsive values inside this group follow its allocated width. */
  readonly breakpoints?: Partial<LayoutBreakpoints>;
  /** Tight-fit a coordinate space to positioned child bounds instead of using the fallback height. */
  readonly fit?: Responsive<"content" | "none">;
  readonly gap?: Responsive<number>;
  readonly padding?: Responsive<Insets>;
  readonly align?: Responsive<Align>;
  readonly justify?: Responsive<Justify>;
  readonly columns?: Responsive<number>;
  readonly frame?: FrameStyle;
  readonly clip?: boolean;
  /**
   * Escape hatch: children may extend beyond the content box without overflow diagnostics
   * (e.g. tick labels or callouts around a coordinates area).
   */
  readonly allowOverflow?: boolean;
  readonly children: readonly SceneNode[];
}

export interface RectMark extends BaseNode {
  readonly type: "rect";
  readonly fill?: FillPaint;
  readonly stroke?: Paint;
  readonly strokeWidth?: number;
  readonly radius?: number;
  readonly dash?: "solid" | "dashed" | "dotted";
}

export interface CircleMark extends BaseNode {
  readonly type: "circle";
  readonly radius?: Responsive<number>;
  readonly fill?: FillPaint;
  readonly stroke?: Paint;
  readonly strokeWidth?: number;
  readonly dash?: "solid" | "dashed" | "dotted";
}

export interface TextMark extends BaseNode {
  readonly type: "text";
  readonly text: string;
  readonly textStyle?: Responsive<SemanticTextStyle>;
  readonly color?: Paint;
  readonly align?: Responsive<"start" | "center" | "end">;
  readonly maxLines?: Responsive<number>;
  readonly transform?: "none" | "uppercase";
  readonly wrap?: boolean;
  /** How a `progress` track reveals this text. Lines are the backwards-compatible default. */
  readonly reveal?: "lines" | "characters";
}

export interface IconMark extends BaseNode {
  readonly type: "icon";
  /** Semantic motif name resolved by the renderer's motif library. */
  readonly icon: string;
  readonly size?: Responsive<number>;
  readonly tone?: Paint;
  readonly background?: Paint;
}

export interface PathMark extends BaseNode {
  readonly type: "path";
  /** Path data authored in a local box of `viewBox` size and scaled uniformly to fit. */
  readonly d: string;
  readonly viewBox: { readonly width: number; readonly height: number };
  readonly fill?: FillPaint;
  readonly stroke?: Paint;
  readonly strokeWidth?: number;
  readonly dash?: "solid" | "dashed" | "dotted";
}

export interface PolylineMark extends BaseNode {
  readonly type: "polyline";
  /** Points as [x, y]; fractions of the node box when `space` is "fraction" (default), else pixels. */
  readonly points: readonly (readonly [number, number])[];
  readonly space?: "fraction" | "px";
  readonly curve?: "linear" | "monotone" | "step";
  /** Close the shape back to the first point. */
  readonly closed?: boolean;
  /** Close down/up to a horizontal baseline (fraction or px, matching `space`) to make an area. */
  readonly baseline?: number;
  readonly fill?: FillPaint;
  readonly stroke?: Paint;
  readonly strokeWidth?: number;
  readonly dash?: "solid" | "dashed" | "dotted";
  readonly lineCap?: "round" | "square" | "butt";
}

export interface ImageMark extends BaseNode {
  readonly type: "image";
  readonly src: string;
  readonly alt: string;
  readonly fit?: "contain" | "cover" | "fill";
  readonly radius?: number;
  /** Replace this image at runtime; `src` remains the deterministic static/export fallback. */
  readonly live?: boolean;
}

export interface BadgeMark extends BaseNode {
  readonly type: "badge";
  readonly text: string;
  readonly tone?: Paint;
  readonly variant?: "solid" | "outline" | "soft";
  readonly textStyle?: Responsive<SemanticTextStyle>;
}

export interface LegendItem {
  readonly id: string;
  readonly label: string;
  readonly swatch: Paint;
  readonly shape?: "square" | "circle" | "line" | "dashed";
}

export interface LegendMark extends BaseNode {
  readonly type: "legend";
  readonly items: readonly LegendItem[];
  readonly direction?: Responsive<"row" | "column">;
  readonly gap?: Responsive<number>;
  readonly textStyle?: Responsive<SemanticTextStyle>;
}

export interface CalloutMark extends BaseNode {
  readonly type: "callout";
  readonly text: string;
  readonly tone?: Paint;
  readonly pointer?: Responsive<"none" | "up" | "down" | "left" | "right">;
  readonly textStyle?: Responsive<SemanticTextStyle>;
  readonly maxLines?: Responsive<number>;
  readonly padding?: Responsive<Insets>;
}

export type SceneNode =
  | GroupNode
  | RectMark
  | CircleMark
  | TextMark
  | IconMark
  | PathMark
  | PolylineMark
  | ImageMark
  | BadgeMark
  | LegendMark
  | CalloutMark;

export type SceneNodeType = SceneNode["type"];

// ---------------------------------------------------------------------------------------------
// Edges
// ---------------------------------------------------------------------------------------------

export type EdgeRoute = "straight" | "orthogonal" | "curve" | "arc";
export type MarkerKind = "none" | "arrow" | "triangle" | "dot" | "diamond" | "bar";
export type StrokeStyle = "solid" | "dashed" | "dotted" | "flow";
export type EdgeSide = "auto" | "left" | "right" | "top" | "bottom" | "center";
export type LabelPlacement = "start" | "middle" | "end";

export interface EdgeEndpoint {
  readonly node: string;
  readonly side?: Responsive<EdgeSide>;
  /** Fraction along the chosen side (0..1). Defaults to auto-distribution. */
  readonly offset?: Responsive<number>;
  /** Extra outward gap in pixels between the node border and the edge end. */
  readonly gap?: number;
}

export interface EdgeLabel {
  readonly id?: string;
  readonly text: string;
  readonly placement?: LabelPlacement;
  /** Perpendicular offset in pixels; positive is to the right of travel direction. */
  readonly offset?: number;
  readonly textStyle?: SemanticTextStyle;
  readonly tone?: Paint;
  readonly hidden?: Responsive<boolean>;
  readonly bind?: { readonly text?: string; readonly hidden?: string };
}

export interface EdgePackets {
  readonly count?: number;
  readonly size?: number;
  readonly tone?: Paint;
  /** Milliseconds for one packet to travel the whole edge. */
  readonly period?: number;
}

export interface EdgeDefinition {
  readonly id: string;
  readonly from: string | EdgeEndpoint;
  readonly to: string | EdgeEndpoint;
  readonly route?: Responsive<EdgeRoute>;
  readonly head?: MarkerKind;
  readonly tail?: MarkerKind;
  readonly stroke?: StrokeStyle;
  readonly width?: number;
  readonly tone?: Paint;
  readonly opacity?: number;
  /** 0..1 curvature for curves and arcs. */
  readonly curvature?: number;
  /** Signed bend in pixels for arcs; overrides curvature when set. */
  readonly bend?: number;
  readonly cornerRadius?: number;
  readonly label?: string;
  readonly labels?: readonly EdgeLabel[];
  readonly packets?: EdgePackets;
  /** Accessible description; edges without one are decorative and hidden from assistive tech. */
  readonly description?: string;
  readonly z?: number;
  readonly hidden?: Responsive<boolean>;
  readonly bind?: EdgeBindings;
  readonly metadata?: SceneMetadata;
}

// ---------------------------------------------------------------------------------------------
// Scene
// ---------------------------------------------------------------------------------------------

export interface LayoutBreakpoints {
  /** Minimum container width for the wide layout. */
  readonly wide: number;
  /** Minimum container width for the compact layout; below it the narrow layout is used. */
  readonly compact: number;
}

export interface SceneControl {
  readonly id: string;
  /** Visual/interaction grammar. `event` is the backwards-compatible push button. */
  readonly kind?: "event" | "reset" | "toggle" | "range" | "select" | "radio" | "transport";
  readonly label: string;
  readonly event?: string;
  readonly description?: string;
  readonly group?: string;
  readonly activeWhen?: Condition;
  /** Variable or signal reflected by value controls after every deterministic machine step. */
  readonly bind?: string;
  /** Initial/fallback value when `bind` has not resolved yet. */
  readonly value?: VariableValue;
  readonly min?: number;
  readonly max?: number;
  readonly step?: number;
  /** Milliseconds advanced by the transport's Step control. Defaults to 100. */
  readonly transportStep?: number;
  readonly options?: readonly {
    readonly label: string;
    readonly value: VariableValue;
    readonly description?: string;
  }[];
}

export interface SceneDefinition {
  readonly schemaVersion: 2;
  readonly id: string;
  readonly title: string;
  readonly description?: string;
  /** Layout breakpoints keyed by container width. Defaults to wide ≥ 900, compact ≥ 560. */
  readonly breakpoints?: Partial<LayoutBreakpoints>;
  /** Preferred aspect guidance per layout; the resolver reports actual size. */
  readonly padding?: Responsive<Insets>;
  readonly background?: SemanticColorToken | "transparent";
  readonly root: GroupNode;
  readonly edges?: readonly EdgeDefinition[];
  readonly timeline?: AnimationTimeline;
  readonly machine?: StateMachineDefinition;
  /** Default externally-driven signals. Runtimes may override them without replacing the scene. */
  readonly signals?: Readonly<Record<string, VariableValue>>;
  readonly controls?: readonly SceneControl[];
  readonly metadata?: SceneMetadata;
}

export interface SceneDiagnostic {
  readonly severity: "error" | "warning";
  readonly code: string;
  readonly message: string;
  readonly path?: string;
}

export interface SceneValidationResult {
  readonly ok: boolean;
  readonly diagnostics: readonly SceneDiagnostic[];
}

// ---------------------------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------------------------

const RESPONSIVE_KEYS: ReadonlySet<string> = new Set(LAYOUT_NAMES);

export function isResponsiveMap<T>(value: Responsive<T>): value is ResponsiveMap<T> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const keys = Object.keys(value);
  return keys.length > 0 && keys.every((key) => RESPONSIVE_KEYS.has(key));
}

/**
 * Resolves a responsive value for a layout. The cascade is desktop-first: narrower layouts fall
 * back to wider definitions (`compact` → `wide`, `narrow` → `compact` → `wide`), while a value
 * declared only for a narrower layout never leaks into a wider one.
 */
export function pick<T>(value: Responsive<T> | undefined, layout: LayoutName): T | undefined {
  if (value === undefined) return undefined;
  if (!isResponsiveMap(value)) return value;
  const order: readonly LayoutName[] =
    layout === "narrow"
      ? ["narrow", "compact", "wide"]
      : layout === "compact"
        ? ["compact", "wide"]
        : ["wide"];
  for (const name of order) {
    const candidate = value[name];
    if (candidate !== undefined) return candidate;
  }
  return undefined;
}

export function pickOr<T>(value: Responsive<T> | undefined, layout: LayoutName, fallback: T): T {
  return pick(value, layout) ?? fallback;
}

/** Depth-first document-order traversal of scene nodes with their parents. */
export function walkScene(
  root: GroupNode,
  visit: (node: SceneNode, parent: GroupNode | undefined, depth: number) => void,
): void {
  const walk = (node: SceneNode, parent: GroupNode | undefined, depth: number): void => {
    visit(node, parent, depth);
    if (node.type === "group") for (const child of node.children) walk(child, node, depth + 1);
  };
  walk(root, undefined, 0);
}

export function endpointNode(end: string | EdgeEndpoint): string {
  return typeof end === "string" ? end : end.node;
}

function id(value: string, label: string, diagnostics: SceneDiagnostic[]): void {
  if (value.length === 0)
    diagnostics.push({
      severity: "error",
      code: "empty-id",
      message: `${label} id must not be empty`,
    });
  else if (!/^[A-Za-z0-9_.:-]+$/.test(value))
    diagnostics.push({
      severity: "error",
      code: "invalid-id",
      message: `${label} id "${value}" may only contain letters, digits, "_", ".", ":" and "-"`,
    });
}

/** Structural validation independent of layout width. Returns every problem found. */
export function validateScene(scene: SceneDefinition): SceneValidationResult {
  const diagnostics: SceneDiagnostic[] = [];
  const nodeIds = new Set<string>();
  if (scene.schemaVersion !== 2)
    diagnostics.push({ severity: "error", code: "schema", message: "schemaVersion must be 2" });
  id(scene.id, "scene", diagnostics);
  if (scene.title.length === 0)
    diagnostics.push({
      severity: "error",
      code: "empty-title",
      message: "scene title must not be empty",
    });
  if (scene.root.type !== "group")
    diagnostics.push({ severity: "error", code: "root", message: "scene root must be a group" });

  walkScene(scene.root, (node) => {
    id(node.id, "node", diagnostics);
    if (nodeIds.has(node.id))
      diagnostics.push({
        severity: "error",
        code: "duplicate-id",
        message: `duplicate node id: ${node.id}`,
        path: node.id,
      });
    nodeIds.add(node.id);
    if (node.type === "path" && (node.viewBox.width <= 0 || node.viewBox.height <= 0))
      diagnostics.push({
        severity: "error",
        code: "path-viewbox",
        message: `path ${node.id} needs a positive viewBox`,
        path: node.id,
      });
    if (node.type === "legend") {
      const seen = new Set<string>();
      for (const item of node.items) {
        if (seen.has(item.id))
          diagnostics.push({
            severity: "error",
            code: "duplicate-id",
            message: `legend ${node.id} repeats item id ${item.id}`,
            path: node.id,
          });
        seen.add(item.id);
      }
    }
    if (node.interactive && !node.label && !node.description)
      diagnostics.push({
        severity: "warning",
        code: "unlabelled-interactive",
        message: `interactive node ${node.id} has no label or description`,
        path: node.id,
      });
  });

  const edgeIds = new Set<string>();
  for (const edge of scene.edges ?? []) {
    id(edge.id, "edge", diagnostics);
    if (edgeIds.has(edge.id) || nodeIds.has(edge.id))
      diagnostics.push({
        severity: "error",
        code: "duplicate-id",
        message: `duplicate scene id: ${edge.id}`,
        path: edge.id,
      });
    edgeIds.add(edge.id);
    for (const [role, end] of [
      ["source", edge.from],
      ["target", edge.to],
    ] as const) {
      const target = endpointNode(end);
      if (!nodeIds.has(target))
        diagnostics.push({
          severity: "error",
          code: "missing-node",
          message: `edge ${edge.id} refers to missing ${role} node ${target}`,
          path: edge.id,
        });
    }
    if (edge.curvature !== undefined && (edge.curvature < 0 || edge.curvature > 1))
      diagnostics.push({
        severity: "error",
        code: "curvature",
        message: `edge ${edge.id} curvature must be between 0 and 1`,
        path: edge.id,
      });
    if (edge.width !== undefined && !(edge.width > 0))
      diagnostics.push({
        severity: "error",
        code: "edge-width",
        message: `edge ${edge.id} width must be positive`,
        path: edge.id,
      });
  }

  const controlIds = new Set<string>();
  const controlBindings = new Set([
    ...Object.keys(scene.signals ?? {}),
    ...Object.keys(scene.machine?.variables ?? {}),
    ...Object.keys(scene.machine?.signals ?? {}),
    ...(scene.machine === undefined ? [] : ["$state", "$selection"]),
  ]);
  for (const control of scene.controls ?? []) {
    id(control.id, "control", diagnostics);
    if (controlIds.has(control.id))
      diagnostics.push({
        severity: "error",
        code: "duplicate-id",
        message: `duplicate control id: ${control.id}`,
        path: control.id,
      });
    controlIds.add(control.id);
    const kind = control.kind ?? "event";
    if (kind !== "reset" && kind !== "transport" && !control.event)
      diagnostics.push({
        severity: "error",
        code: "control-event",
        message: `control ${control.id} must name an event`,
        path: control.id,
      });
    if (
      (kind === "toggle" || kind === "range" || kind === "select" || kind === "radio") &&
      !control.bind
    )
      diagnostics.push({
        severity: "error",
        code: "control-bind",
        message: `control ${control.id} (${kind}) must bind a variable or signal`,
        path: control.id,
      });
    else if (control.bind !== undefined && !controlBindings.has(control.bind))
      diagnostics.push({
        severity: "error",
        code: "control-bind",
        message: `control ${control.id} binds unknown variable or signal ${control.bind}`,
        path: control.id,
      });
    if (kind === "range") {
      const min = control.min ?? 0;
      const max = control.max ?? 100;
      const step = control.step ?? 1;
      if (![min, max, step].every(Number.isFinite) || min > max || step <= 0)
        diagnostics.push({
          severity: "error",
          code: "control-range",
          message: `control ${control.id} range needs finite min/max, min <= max, and step > 0`,
          path: control.id,
        });
    }
    if ((kind === "select" || kind === "radio") && (control.options?.length ?? 0) === 0)
      diagnostics.push({
        severity: "error",
        code: "control-options",
        message: `control ${control.id} (${kind}) needs at least one option`,
        path: control.id,
      });
    if (kind === "select" || kind === "radio") {
      const values = control.options?.map((option) => option.value) ?? [];
      if (
        values.some((value, index) => values.slice(0, index).some((seen) => Object.is(seen, value)))
      )
        diagnostics.push({
          severity: "error",
          code: "control-options",
          message: `control ${control.id} (${kind}) option values must be unique`,
          path: control.id,
        });
    }
    if (scene.machine === undefined && kind !== "transport")
      diagnostics.push({
        severity: "error",
        code: "control-machine",
        message: `control ${control.id} requires a scene state machine`,
        path: control.id,
      });
    if (
      kind === "transport" &&
      control.transportStep !== undefined &&
      (!Number.isFinite(control.transportStep) || control.transportStep <= 0)
    )
      diagnostics.push({
        severity: "error",
        code: "control-transport",
        message: `control ${control.id} transportStep must be finite and positive`,
        path: control.id,
      });
  }

  const timeline = scene.timeline;
  if (timeline !== undefined) {
    if (!Number.isFinite(timeline.duration) || timeline.duration < 0)
      diagnostics.push({
        severity: "error",
        code: "timeline-duration",
        message: "timeline duration must be finite and non-negative",
      });
    const trackIds = new Set<string>();
    for (const track of timeline.tracks) {
      if (trackIds.has(track.id))
        diagnostics.push({
          severity: "error",
          code: "duplicate-id",
          message: `duplicate timeline track id: ${track.id}`,
          path: track.id,
        });
      trackIds.add(track.id);
      if (!nodeIds.has(track.target) && !edgeIds.has(track.target))
        diagnostics.push({
          severity: "error",
          code: "missing-target",
          message: `timeline track ${track.id} targets missing scene id ${track.target}`,
          path: track.id,
        });
    }
  }

  return { ok: diagnostics.every((entry) => entry.severity !== "error"), diagnostics };
}

/** Validates and returns the definition; throws with every error message when invalid. */
export function defineScene(scene: SceneDefinition): SceneDefinition {
  const result = validateScene(scene);
  const errors = result.diagnostics.filter((entry) => entry.severity === "error");
  if (errors.length > 0)
    throw new Error(
      `invalid scene ${scene.id || "(unnamed)"}:\n${errors.map((entry) => `- ${entry.message}`).join("\n")}`,
    );
  return scene;
}

export type { VariableValue };
