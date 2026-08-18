import type { Easing } from "./easing.js";
import type { BlendMode, ShaderName, ShaderUniform } from "./material.js";
import type { Point, Rect } from "./schema.js";
import type { ThemeTokens } from "./theme.js";
import type { TextLine } from "./text.js";
import type {
  EdgeRoute,
  InspectInfo,
  LayoutName,
  MarkerKind,
  SceneControl,
  SceneDiagnostic,
  StrokeStyle,
} from "./scene.js";
import type { MachineState, StateMachineDefinition, VariableValue } from "./machine.js";

export interface ResolvedGradientStop {
  readonly at: number;
  readonly color: string;
  readonly opacity: number;
}

export interface ResolvedLinearGradientPaint {
  readonly type: "linear-gradient";
  readonly stops: readonly ResolvedGradientStop[];
  readonly angle: number;
  readonly spread: "pad" | "reflect" | "repeat";
}

export interface ResolvedRadialGradientPaint {
  readonly type: "radial-gradient";
  readonly stops: readonly ResolvedGradientStop[];
  readonly center: readonly [x: number, y: number];
  readonly focalPoint: readonly [x: number, y: number];
  readonly radius: number;
  readonly spread: "pad" | "reflect" | "repeat";
}

export type ResolvedFillPaint = string | ResolvedLinearGradientPaint | ResolvedRadialGradientPaint;

export interface ResolvedShadowEffect {
  readonly type: "shadow";
  readonly kind: "outer" | "inner";
  readonly color: string;
  readonly opacity: number;
  readonly blur: number;
  readonly spread: number;
  readonly offset: readonly [x: number, y: number];
}

export interface ResolvedBlurEffect {
  readonly type: "blur";
  readonly radius: number;
}

export interface ResolvedBackdropEffect {
  readonly type: "backdrop";
  readonly blur: number;
  readonly saturation: number;
  readonly brightness: number;
}

export interface ResolvedNoiseEffect {
  readonly type: "noise";
  readonly amount: number;
  readonly scale: number;
  readonly seed: number;
  readonly monochrome: boolean;
}

export type ResolvedPortableMaterialEffect =
  ResolvedShadowEffect | ResolvedBlurEffect | ResolvedBackdropEffect | ResolvedNoiseEffect;

export interface ResolvedShaderEffect {
  readonly type: "shader";
  readonly name: ShaderName;
  readonly uniforms: Readonly<Record<string, ShaderUniform>>;
  readonly fallback: readonly ResolvedPortableMaterialEffect[];
}

export type ResolvedMaterialEffect = ResolvedPortableMaterialEffect | ResolvedShaderEffect;

export interface ResolvedMaterialDefinition {
  readonly fill?: ResolvedFillPaint;
  readonly stroke?: string;
  readonly strokeWidth?: number;
  readonly radius?: number;
  readonly opacity?: number;
  readonly effects?: readonly ResolvedMaterialEffect[];
  readonly blendMode?: BlendMode;
}

export interface ResolvedNodeAppearance {
  readonly fill: ResolvedFillPaint;
  readonly stroke: string;
  readonly strokeWidth: number;
  readonly radius: number;
  readonly opacity?: number;
  readonly dash?: "solid" | "dashed" | "dotted";
  readonly lineCap?: "round" | "square" | "butt";
  readonly effects?: readonly ResolvedMaterialEffect[];
  readonly blendMode?: BlendMode;
}

export interface ResolvedEdgeAppearance {
  readonly stroke: string;
  readonly strokeWidth: number;
  readonly opacity?: number;
}

export interface ResolvedNodeState {
  readonly opacity: number;
  readonly translateX: number;
  readonly translateY: number;
  readonly scale: number;
  readonly progress: number;
  /** Emphasis 0..1 driven by timelines, state machines, or inspection. */
  readonly highlight?: number;
  /** Anchored horizontal reveal 0..1 (clip grows from `revealAnchor`, default left). */
  readonly revealX?: number;
  /** Anchored vertical reveal 0..1 (clip grows from `revealAnchor`, default bottom). */
  readonly revealY?: number;
}

export interface ResolvedEdgeState {
  readonly opacity: number;
  readonly progress: number;
  readonly highlight?: number;
  /** Packet visibility 0..1. */
  readonly flow?: number;
}

export type ResolvedNodeKind =
  | "rect"
  | "circle"
  | "ellipse"
  | "group"
  | "text"
  | "icon"
  | "path"
  | "image"
  | "badge"
  | "legend"
  | "callout";

export interface ResolvedText {
  readonly lines: readonly TextLine[];
  readonly fontFamily: string;
  readonly fontSize: number;
  readonly fontWeight: number;
  readonly lineHeight: number;
  readonly letterSpacing: number;
  readonly color: string;
  readonly align: "start" | "center" | "end";
  readonly transform: "none" | "uppercase";
  /** Text box relative to the scene, where lines are laid out from the top. */
  readonly box: Rect;
}

export interface ResolvedLegendItem {
  readonly id: string;
  readonly label: string;
  readonly swatch: string;
  readonly shape: "square" | "circle" | "line" | "dashed";
  readonly box: Rect;
}

export interface ResolvedNode extends Rect {
  readonly id: string;
  readonly kind: ResolvedNodeKind;
  readonly label: string;
  readonly description?: string;
  readonly appearance: ResolvedNodeAppearance;
  readonly state: ResolvedNodeState;
  readonly interactive: boolean;
  readonly focusable: boolean;
  readonly metadata: Readonly<Record<string, string | number | boolean | null>>;
  /** Parent node id inside the resolved hierarchy; absent for the root and legacy pipelines. */
  readonly parent?: string;
  /** Sibling paint order; lower values paint first. */
  readonly z?: number;
  readonly hidden?: boolean;
  readonly clip?: boolean;
  /** Machine event to send when activated. */
  readonly onActivate?: string;
  /** Structured inspection copy. */
  readonly inspect?: InspectInfo;
  /** Single tab stop whose interactive descendants are reached with arrow keys. */
  readonly focusGroup?: boolean;
  readonly revealAnchor?: "left" | "right" | "top" | "bottom";
  readonly text?: ResolvedText;
  readonly icon?: {
    readonly name: string;
    readonly size: number;
    readonly color: string;
    readonly background: string;
  };
  readonly path?: {
    readonly d: string;
    readonly viewBox: { readonly width: number; readonly height: number };
    /** Approximate path length in local units, used to keep dash patterns stable while revealing. */
    readonly length?: number;
  };
  readonly image?: {
    readonly href: string;
    readonly alt: string;
    readonly fit: "contain" | "cover" | "fill";
    readonly live: boolean;
  };
  readonly legend?: {
    readonly items: readonly ResolvedLegendItem[];
    readonly text: Omit<ResolvedText, "lines" | "box">;
  };
  readonly callout?: {
    readonly pointer: "none" | "up" | "down" | "left" | "right";
    readonly tip: Point;
    readonly body: Rect;
  };
}

export interface ResolvedEdgeLabel {
  readonly id: string;
  readonly text: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly anchor: "start" | "middle" | "end";
  readonly fontFamily: string;
  readonly fontSize: number;
  readonly fontWeight: number;
  readonly color: string;
  readonly hidden?: boolean;
  /**
   * Whether this label needs a plate behind it to stay readable.
   *
   * Set only when the resolver could not find a placement clear of every node and every other
   * label, and had to leave the label somewhere it overlaps something. A label with room around
   * it is drawn as plain text: an unconditional plate reads as a chip stuck to the diagram, and
   * it is painted in the canvas colour, which is wrong the moment the label lands on a node.
   */
  readonly halo?: boolean;
}

export interface ResolvedEdge {
  readonly id: string;
  readonly from: string;
  readonly to: string;
  readonly start: Point;
  readonly end: Point;
  readonly path: string;
  readonly directed: boolean;
  readonly label?: string;
  readonly appearance: ResolvedEdgeAppearance;
  readonly state: ResolvedEdgeState;
  readonly route?: EdgeRoute;
  readonly head?: MarkerKind;
  readonly tail?: MarkerKind;
  readonly dash?: StrokeStyle;
  readonly length?: number;
  /** Evenly spaced arc-length samples used to place packets and hit targets without a DOM. */
  readonly samples?: readonly Point[];
  readonly labels?: readonly ResolvedEdgeLabel[];
  readonly packets?: readonly Point[];
  readonly packetSize?: number;
  readonly packetColor?: string;
  readonly description?: string;
  readonly z?: number;
  readonly hidden?: boolean;
  readonly metadata?: Readonly<Record<string, string | number | boolean | null>>;
}

/** Concrete renderer-facing projection of semantic theme tokens. */
export interface ResolvedTheme {
  readonly background: string;
  readonly foreground: string;
  readonly accent: string;
  readonly fontFamily: string;
  readonly semantic: {
    readonly background: string;
    readonly surface: string;
    readonly foreground: string;
    readonly muted: string;
    readonly accent: string;
  };
  readonly node: ResolvedNodeAppearance;
  readonly edge: ResolvedEdgeAppearance;
  readonly text: {
    readonly color: string;
    readonly fontFamily: string;
    readonly fontSize: number;
  };
  /** The complete semantic source is retained for richer renderers. */
  readonly tokens: ThemeTokens;
}

export interface ResolvedScene {
  readonly id: string;
  readonly width: number;
  readonly height: number;
  readonly label: string;
  readonly title: string;
  readonly description?: string;
  readonly layout: "wide" | "stacked";
  readonly theme: ResolvedTheme;
  readonly nodes: readonly ResolvedNode[];
  readonly edges: readonly ResolvedEdge[];
  readonly timeline?: AnimationTimeline;
  /** Named layout that produced this resolution; legacy pipelines report wide or compact. */
  readonly layoutName?: LayoutName;
  readonly background?: string;
  readonly diagnostics?: readonly SceneDiagnostic[];
  readonly machine?: StateMachineDefinition;
  readonly machineState?: MachineState;
  readonly signals?: Readonly<Record<string, VariableValue>>;
  readonly controls?: readonly SceneControl[];
  /** Root node id when the scene was resolved from the general schema. */
  readonly root?: string;
}

export type TimelineProperty =
  | "opacity"
  | "translateX"
  | "translateY"
  | "scale"
  | "progress"
  | "edgeReveal"
  | "highlight"
  | "flow"
  | "revealX"
  | "revealY";

export interface TimelineKeyframe {
  readonly time: number;
  readonly value: number;
  readonly easing?: Easing;
}

export interface TimelineTrack {
  readonly id: string;
  /** Stable node or edge id. */
  readonly target: string;
  readonly property: TimelineProperty;
  readonly keyframes: readonly TimelineKeyframe[];
}

export interface AnimationTimeline {
  readonly duration: number;
  readonly tracks: readonly TimelineTrack[];
}

export interface ResolvedFrame extends Omit<ResolvedScene, "nodes" | "edges"> {
  readonly time: number;
  readonly progress: number;
  readonly nodes: readonly ResolvedNode[];
  readonly edges: readonly ResolvedEdge[];
}
