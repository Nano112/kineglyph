/**
 * Reusable recipes composed from primitives. Figures and the catalogue scenes share these so
 * illustrations read as one system while each keeps its own motifs and rhythm. Every recipe takes
 * an explicit id and returns plain scene nodes; `figure()` layers id inference on top.
 */
import type {
  Align,
  BadgeMark,
  GroupLayout,
  GroupNode,
  IconMark,
  InspectInfo,
  Insets,
  Justify,
  Length,
  NodeBindings,
  Paint,
  RectMark,
  Responsive,
  SceneMetadata,
  SceneNode,
  TextMark,
} from "./scene.js";

export interface TextOptions {
  readonly tone?: Paint;
  readonly align?: Responsive<"start" | "center" | "end">;
  readonly maxLines?: Responsive<number>;
  readonly bind?: NodeBindings;
  readonly hidden?: Responsive<boolean>;
  readonly width?: Responsive<Length>;
  readonly transform?: "none" | "uppercase";
}

function textMark(
  id: string,
  text: string,
  textStyle: TextMark["textStyle"],
  options: TextOptions = {},
): TextMark {
  return {
    id,
    type: "text",
    text,
    ...(textStyle === undefined ? {} : { textStyle }),
    ...(options.tone === undefined ? {} : { color: options.tone }),
    ...(options.align === undefined ? {} : { align: options.align }),
    ...(options.maxLines === undefined ? {} : { maxLines: options.maxLines }),
    ...(options.bind === undefined ? {} : { bind: options.bind }),
    ...(options.hidden === undefined ? {} : { hidden: options.hidden }),
    ...(options.width === undefined ? {} : { width: options.width }),
    ...(options.transform === undefined ? {} : { transform: options.transform }),
  };
}

/** Plain text with an explicit (or renderer-default) style; the other text recipes fix the style. */
export const text = (
  id: string,
  content: string,
  options: TextOptions & { readonly textStyle?: TextMark["textStyle"] } = {},
): TextMark => textMark(id, content, options.textStyle, options);
/** Small uppercase label above a title. */
export const eyebrow = (id: string, text: string, options?: TextOptions): TextMark =>
  textMark(id, text, "label", options);
/** Card or panel title. */
export const heading = (id: string, text: string, options?: TextOptions): TextMark =>
  textMark(id, text, "bodyStrong", options);
/** Section title. */
export const title = (id: string, text: string, options?: TextOptions): TextMark =>
  textMark(id, text, "title", options);
/** Supporting text. */
export const caption = (id: string, text: string, options?: TextOptions): TextMark =>
  textMark(id, text, "caption", { maxLines: 4, ...options });
/** Body copy. */
export const body = (id: string, text: string, options?: TextOptions): TextMark =>
  textMark(id, text, "body", options);
/** Monospace token, identifier, or expression. */
export const code = (id: string, text: string, options?: TextOptions): TextMark =>
  textMark(id, text, "code", options);

export interface PillOptions {
  readonly tone?: Paint;
  readonly variant?: BadgeMark["variant"];
  readonly bind?: NodeBindings;
  readonly hidden?: Responsive<boolean>;
}

/** Compact status pill. */
export function pill(id: string, text: string, options: PillOptions = {}): BadgeMark {
  return {
    id,
    type: "badge",
    text,
    tone: options.tone ?? "accent",
    variant: options.variant ?? "soft",
    ...(options.bind === undefined ? {} : { bind: options.bind }),
    ...(options.hidden === undefined ? {} : { hidden: options.hidden }),
  };
}

export interface MotifOptions {
  readonly tone?: Paint;
  readonly size?: Responsive<number>;
  readonly background?: Paint;
}

/** Semantic motif icon, accent-toned at 24px unless told otherwise. */
export function motif(id: string, icon: string, options: MotifOptions = {}): IconMark {
  return {
    id,
    type: "icon",
    icon,
    tone: options.tone ?? "accent",
    size: options.size ?? 24,
    ...(options.background === undefined ? {} : { background: options.background }),
  };
}

export interface ContainerOptions {
  readonly gap?: Responsive<number>;
  readonly padding?: Responsive<Insets>;
  readonly align?: Responsive<Align>;
  readonly justify?: Responsive<Justify>;
  readonly width?: Responsive<Length>;
  readonly height?: Responsive<Length>;
  readonly minWidth?: Responsive<number>;
  readonly maxWidth?: Responsive<number>;
  readonly grow?: Responsive<number>;
  readonly columns?: Responsive<number>;
  readonly frame?: GroupNode["frame"];
  readonly hidden?: Responsive<boolean>;
  readonly z?: number;
  readonly label?: string;
  readonly description?: string;
  readonly interactive?: boolean;
  readonly onActivate?: string;
  readonly bind?: NodeBindings;
  readonly metadata?: SceneMetadata;
  readonly alignSelf?: Responsive<Align>;
  readonly clip?: boolean;
  readonly minHeight?: Responsive<number>;
  readonly justifySelf?: Responsive<Align>;
  readonly position?: GroupNode["position"];
  readonly opacity?: number;
  /** Single tab stop whose interactive descendants are reached with the arrow keys. */
  readonly focusGroup?: boolean;
  readonly inspect?: InspectInfo;
  readonly revealAnchor?: GroupNode["revealAnchor"];
  /** Silences overflow diagnostics for intentional spill (e.g. decorative marks). */
  readonly allowOverflow?: boolean;
}

/** A group with any layout; the layout-specific helpers below are the readable spellings. */
export function container(
  id: string,
  layout: Responsive<GroupLayout>,
  children: readonly SceneNode[],
  options: ContainerOptions = {},
): GroupNode {
  return {
    id,
    type: "group",
    layout,
    children,
    ...(options.gap === undefined ? {} : { gap: options.gap }),
    ...(options.padding === undefined ? {} : { padding: options.padding }),
    ...(options.align === undefined ? {} : { align: options.align }),
    ...(options.justify === undefined ? {} : { justify: options.justify }),
    ...(options.width === undefined ? {} : { width: options.width }),
    ...(options.height === undefined ? {} : { height: options.height }),
    ...(options.minWidth === undefined ? {} : { minWidth: options.minWidth }),
    ...(options.maxWidth === undefined ? {} : { maxWidth: options.maxWidth }),
    ...(options.grow === undefined ? {} : { grow: options.grow }),
    ...(options.columns === undefined ? {} : { columns: options.columns }),
    ...(options.frame === undefined ? {} : { frame: options.frame }),
    ...(options.hidden === undefined ? {} : { hidden: options.hidden }),
    ...(options.z === undefined ? {} : { z: options.z }),
    ...(options.label === undefined ? {} : { label: options.label }),
    ...(options.description === undefined ? {} : { description: options.description }),
    ...(options.interactive === undefined ? {} : { interactive: options.interactive }),
    ...(options.onActivate === undefined ? {} : { onActivate: options.onActivate }),
    ...(options.bind === undefined ? {} : { bind: options.bind }),
    ...(options.metadata === undefined ? {} : { metadata: options.metadata }),
    ...(options.alignSelf === undefined ? {} : { alignSelf: options.alignSelf }),
    ...(options.clip === undefined ? {} : { clip: options.clip }),
    ...(options.minHeight === undefined ? {} : { minHeight: options.minHeight }),
    ...(options.justifySelf === undefined ? {} : { justifySelf: options.justifySelf }),
    ...(options.position === undefined ? {} : { position: options.position }),
    ...(options.opacity === undefined ? {} : { opacity: options.opacity }),
    ...(options.focusGroup === undefined ? {} : { focusGroup: options.focusGroup }),
    ...(options.inspect === undefined ? {} : { inspect: options.inspect }),
    ...(options.revealAnchor === undefined ? {} : { revealAnchor: options.revealAnchor }),
    ...(options.allowOverflow === undefined ? {} : { allowOverflow: options.allowOverflow }),
  };
}

export const stack = (
  id: string,
  children: readonly SceneNode[],
  options?: ContainerOptions,
): GroupNode => container(id, "stack", children, options);
export const row = (
  id: string,
  children: readonly SceneNode[],
  options?: ContainerOptions,
): GroupNode => container(id, "row", children, options);
export const grid = (
  id: string,
  children: readonly SceneNode[],
  options?: ContainerOptions,
): GroupNode => container(id, "grid", children, options);
export const overlay = (
  id: string,
  children: readonly SceneNode[],
  options?: ContainerOptions,
): GroupNode => container(id, "overlay", children, options);
/**
 * Row on wide layouts, stack otherwise. Exported as `flowLayout` because core's `flow` is the
 * packet-flow timeline helper; `@kineglyph/scenes` re-exports it under the shorter name.
 */
export const flowLayout = (
  id: string,
  children: readonly SceneNode[],
  options?: ContainerOptions,
): GroupNode => container(id, { wide: "row", compact: "stack" }, children, options);

export interface CardOptions extends ContainerOptions {
  readonly eyebrow?: string;
  readonly title: string;
  readonly body?: string;
  readonly motif?: string;
  readonly tone?: Paint;
  readonly badge?: string;
  readonly badgeTone?: Paint;
  readonly extras?: readonly SceneNode[];
  readonly bodyBind?: NodeBindings;
  readonly titleBind?: NodeBindings;
  readonly badgeBind?: NodeBindings;
  readonly compact?: boolean;
}

/**
 * A framed card with an optional motif, eyebrow, title, body, badge, and extra content.
 * Interactive cards get their accessible name from the title unless a label is provided.
 */
export function card(id: string, options: CardOptions): GroupNode {
  const tone = options.tone ?? "accent";
  const header: SceneNode[] = [];
  const titleBlock: SceneNode[] = [];
  if (options.eyebrow !== undefined) titleBlock.push(eyebrow(`${id}-eyebrow`, options.eyebrow));
  titleBlock.push(
    heading(`${id}-title`, options.title, {
      ...(options.titleBind === undefined ? {} : { bind: options.titleBind }),
    }),
  );
  if (options.motif !== undefined) {
    header.push(motif(`${id}-motif`, options.motif, { tone }));
    header.push(stack(`${id}-heading`, titleBlock, { gap: 2, width: "fill" }));
  }
  const children: SceneNode[] = [];
  if (header.length > 0)
    children.push(row(`${id}-header`, header, { gap: 12, align: "center", width: "fill" }));
  else children.push(...titleBlock);
  if (options.body !== undefined)
    children.push(
      caption(`${id}-body`, options.body, {
        ...(options.bodyBind === undefined ? {} : { bind: options.bodyBind }),
      }),
    );
  if (options.badge !== undefined)
    children.push(
      pill(`${id}-badge`, options.badge, {
        tone: options.badgeTone ?? tone,
        ...(options.badgeBind === undefined ? {} : { bind: options.badgeBind }),
      }),
    );
  if (options.extras !== undefined) children.push(...options.extras);
  return stack(id, children, {
    gap: options.compact ? 6 : 8,
    padding: options.compact ? [12, 14] : [16, 18],
    frame: { fill: "surface", stroke: "border" },
    width: "fill",
    label: options.label ?? options.title,
    ...(options.body === undefined ? {} : { description: options.body }),
    ...containerOptions(options),
  });
}

const CONTAINER_KEYS: readonly (keyof ContainerOptions)[] = [
  "gap",
  "padding",
  "align",
  "justify",
  "width",
  "height",
  "minWidth",
  "maxWidth",
  "grow",
  "columns",
  "frame",
  "hidden",
  "z",
  "label",
  "description",
  "interactive",
  "onActivate",
  "bind",
  "metadata",
  "alignSelf",
  "clip",
  "minHeight",
  "justifySelf",
  "position",
  "opacity",
  "focusGroup",
  "inspect",
  "revealAnchor",
  "allowOverflow",
];

/** Picks only the generic container options out of a richer recipe options object. */
export function containerOptions(
  options: ContainerOptions,
  omit: readonly (keyof ContainerOptions)[] = [],
): ContainerOptions {
  const picked: Record<string, unknown> = {};
  for (const key of CONTAINER_KEYS) {
    if (omit.includes(key)) continue;
    const value = options[key];
    if (value !== undefined) picked[key] = value;
  }
  return picked;
}

export interface PanelOptions extends ContainerOptions {
  readonly eyebrow?: string;
  readonly title?: string;
  readonly layout?: Responsive<GroupLayout>;
  readonly tone?: Paint;
}

/** Muted framed region grouping related cards, with an optional eyebrow and title. */
export function panel(
  id: string,
  children: readonly SceneNode[],
  options: PanelOptions = {},
): GroupNode {
  const head: SceneNode[] = [];
  if (options.eyebrow !== undefined)
    head.push(
      eyebrow(
        `${id}-eyebrow`,
        options.eyebrow,
        options.tone === undefined ? {} : { tone: options.tone },
      ),
    );
  if (options.title !== undefined) head.push(heading(`${id}-title`, options.title));
  const content = container(`${id}-content`, options.layout ?? "stack", children, {
    gap: options.gap ?? 12,
    width: "fill",
    ...(options.columns === undefined ? {} : { columns: options.columns }),
  });
  return stack(id, head.length > 0 ? [stack(`${id}-head`, head, { gap: 2 }), content] : [content], {
    gap: 12,
    padding: 16,
    frame: { fill: "surfaceMuted", stroke: "border", dash: "dashed" },
    width: "fill",
    ...containerOptions(options, ["columns", "gap"]),
  });
}

/** Thin horizontal rule. */
export function rule(id: string, tone: Paint = "border"): RectMark {
  return { id, type: "rect", width: "fill", height: 1, fill: tone, stroke: "none", radius: 0 };
}

/** Invisible spacer. */
export function spacer(id: string, size: Responsive<number>): RectMark {
  return { id, type: "rect", width: 1, height: size, fill: "none", stroke: "none" };
}

export interface KeyValueOptions {
  readonly valueTone?: Paint;
}

/** Key/value line used inside cards. */
export function keyValue(
  id: string,
  key: string,
  value: string,
  options: KeyValueOptions = {},
): GroupNode {
  return row(
    id,
    [caption(`${id}-key`, key), code(`${id}-value`, value, { tone: options.valueTone ?? "text" })],
    {
      gap: 8,
      justify: "between",
      width: "fill",
      align: "center",
    },
  );
}
