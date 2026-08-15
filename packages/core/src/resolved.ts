import type { Point, Rect } from "./schema.js";
import type { ThemeTokens } from "./theme.js";

export interface ResolvedNodeAppearance {
  readonly fill: string;
  readonly stroke: string;
  readonly strokeWidth: number;
  readonly radius: number;
}

export interface ResolvedEdgeAppearance {
  readonly stroke: string;
  readonly strokeWidth: number;
}

export interface ResolvedNodeState {
  readonly opacity: number;
  readonly translateX: number;
  readonly translateY: number;
  readonly scale: number;
  readonly progress: number;
}

export interface ResolvedEdgeState {
  readonly opacity: number;
  readonly progress: number;
}

export interface ResolvedNode extends Rect {
  readonly id: string;
  readonly kind: "rect" | "circle" | "ellipse";
  readonly label: string;
  readonly description?: string;
  readonly appearance: ResolvedNodeAppearance;
  readonly state: ResolvedNodeState;
  readonly interactive: boolean;
  readonly focusable: boolean;
  readonly metadata: Readonly<Record<string, string | number | boolean | null>>;
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
}

export type TimelineProperty =
  "opacity" | "translateX" | "translateY" | "scale" | "progress" | "edgeReveal";

export interface TimelineKeyframe {
  readonly time: number;
  readonly value: number;
  readonly easing?: "linear" | "easeIn" | "easeOut" | "easeInOut";
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
