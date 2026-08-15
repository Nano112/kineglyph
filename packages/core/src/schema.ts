/** A stable identifier within a scene. */
export type SceneNodeId = string;

export interface Size {
  readonly width: number;
  readonly height: number;
}

export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface Rect extends Point, Size {}

export interface EdgeInsets {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
}

export type SemanticColorToken =
  | "canvas"
  | "surface"
  | "surfaceRaised"
  | "surfaceMuted"
  | "text"
  | "textMuted"
  | "accent"
  | "accentContrast"
  | "info"
  | "success"
  | "warning"
  | "danger"
  | "connector"
  | "border";

export type SemanticSpacingToken = "none" | "xs" | "sm" | "md" | "lg" | "xl" | "2xl";
export type SemanticRadiusToken = "none" | "sm" | "md" | "lg" | "pill";
export type SemanticTextStyle =
  "label" | "caption" | "body" | "bodyStrong" | "title" | "display" | "code";

export interface NodeStyle {
  readonly fill?: SemanticColorToken;
  readonly stroke?: SemanticColorToken;
  readonly strokeWidth?: number;
  readonly radius?: SemanticRadiusToken;
  readonly opacity?: number;
}

interface BaseSceneNode {
  readonly id: SceneNodeId;
  readonly name?: string;
  readonly hidden?: boolean;
  readonly bounds?: Rect;
  readonly style?: NodeStyle;
  readonly metadata?: Readonly<Record<string, string | number | boolean | null>>;
}

export interface GroupNode extends BaseSceneNode {
  readonly type: "group";
  readonly layout?: "free" | "row" | "column";
  readonly gap?: SemanticSpacingToken;
  readonly padding?: SemanticSpacingToken;
  readonly children: readonly SceneNode[];
}

export interface TextNode extends BaseSceneNode {
  readonly type: "text";
  readonly text: string;
  readonly textStyle?: SemanticTextStyle;
  readonly color?: SemanticColorToken;
  readonly align?: "start" | "center" | "end";
  readonly maxLines?: number;
}

export interface ShapeNode extends BaseSceneNode {
  readonly type: "shape";
  readonly shape: "rectangle" | "ellipse" | "line";
}

export interface IconNode extends BaseSceneNode {
  readonly type: "icon";
  /** Renderer-specific icon name, kept semantic rather than tied to an SVG implementation. */
  readonly icon: string;
  readonly label?: string;
  readonly color?: SemanticColorToken;
}

export interface PipelineNode extends BaseSceneNode {
  readonly type: "pipeline";
  readonly direction?: "auto" | "wide" | "stacked";
  readonly stages: readonly PipelineStage[];
}

export interface PipelineStage {
  readonly id: string;
  readonly title: string;
  readonly body?: string;
  readonly icon?: string;
  readonly tone?: "neutral" | "accent" | "success" | "warning" | "danger";
}

export type SceneNode = GroupNode | TextNode | ShapeNode | IconNode | PipelineNode;

export interface KineglyphScene {
  readonly schemaVersion: 1;
  readonly id: string;
  readonly title?: string;
  readonly viewport: Size;
  readonly background?: SemanticColorToken;
  readonly children: readonly SceneNode[];
}

/**
 * Returns a node by id using deterministic depth-first document order.
 * Pipeline stage ids are local to their pipeline and are not scene node ids.
 */
export function findSceneNode(scene: KineglyphScene, id: SceneNodeId): SceneNode | undefined {
  const visit = (nodes: readonly SceneNode[]): SceneNode | undefined => {
    for (const node of nodes) {
      if (node.id === id) return node;
      if (node.type === "group") {
        const nested = visit(node.children);
        if (nested !== undefined) return nested;
      }
    }
    return undefined;
  };

  return visit(scene.children);
}
