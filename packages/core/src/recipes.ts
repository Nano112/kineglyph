/**
 * Reusable recipes composed from primitives. Figures and the catalogue scenes share these so
 * illustrations read as one system while each keeps its own motifs and rhythm. Every recipe takes
 * an explicit id and returns plain scene nodes; `figure()` layers id inference on top.
 */
import type {
  Align,
  BadgeMark,
  CircleMark,
  FillPaint,
  GroupLayout,
  GroupNode,
  IconMark,
  InspectInfo,
  Insets,
  Justify,
  Length,
  NodeBindings,
  NodePort,
  Paint,
  RectMark,
  Responsive,
  SceneMetadata,
  SceneNode,
  TextMark,
} from "./scene.js";
import { LAYOUT_NAMES, pickOr } from "./scene.js";
import { material } from "./material.js";

export interface TextOptions {
  readonly tone?: Paint;
  readonly align?: Responsive<"start" | "center" | "end">;
  readonly maxLines?: Responsive<number>;
  readonly bind?: NodeBindings;
  readonly hidden?: Responsive<boolean>;
  readonly width?: Responsive<Length>;
  readonly transform?: "none" | "uppercase";
  /** How a `progress` track reveals this text. */
  readonly reveal?: TextMark["reveal"];
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
    ...(options.reveal === undefined ? {} : { reveal: options.reveal }),
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

export type LogicGateKind =
  "and" | "or" | "xor" | "nand" | "nor" | "xnor" | "not" | "buffer" | "mux";
export type LogicGateOrientation = "right" | "down" | "left" | "up";
export type LogicGateVariant = "schematic" | "solid";

export interface LogicGateOptions extends ContainerOptions {
  /** Outline and pin colour. */
  readonly tone?: Paint;
  /** Interior of the gate silhouette. */
  readonly fill?: FillPaint;
  /** `schematic` continues the wire casing and active ink through the symbol; `solid` is filled. */
  readonly variant?: LogicGateVariant;
  /** Short symbol drawn inside the gate; defaults to the upper-case kind. */
  readonly text?: string;
  /** Hide the interior text for a strictly symbolic schematic. */
  readonly showText?: boolean;
  readonly textTone?: Paint;
  /** Direction of signal travel. Omit (or use `auto`) to let `f.circuit()` orient the gate. */
  readonly orientation?: Responsive<LogicGateOrientation> | "auto";
}

const collapsedResponsive = <T>(values: {
  readonly wide: T;
  readonly compact: T;
  readonly narrow: T;
}): Responsive<T> =>
  values.wide === values.compact && values.compact === values.narrow ? values.wide : values;

const gateRotation = (orientation: LogicGateOrientation): number =>
  orientation === "right" ? 0 : orientation === "down" ? 90 : orientation === "left" ? 180 : 270;

const verticalGate = (orientation: LogicGateOrientation): boolean =>
  orientation === "down" || orientation === "up";

const gatePortSide = (
  orientation: LogicGateOrientation,
  end: "input" | "output",
): "left" | "right" | "top" | "bottom" => {
  if (end === "output")
    return orientation === "right"
      ? "right"
      : orientation === "down"
        ? "bottom"
        : orientation === "left"
          ? "left"
          : "top";
  return orientation === "right"
    ? "left"
    : orientation === "down"
      ? "top"
      : orientation === "left"
        ? "right"
        : "bottom";
};

const gateInputOffset = (orientation: LogicGateOrientation, offset: number): number =>
  orientation === "down" || orientation === "left" ? 1 - offset : offset;

/** Ports describe the actual endpoints drawn into the 120×80 gate silhouette. */
function logicGatePorts(
  kind: LogicGateKind,
  orientation: Responsive<LogicGateOrientation>,
): readonly NodePort[] {
  const inputOffsets = kind === "not" || kind === "buffer" ? [0.5] : [27 / 80, 53 / 80];
  const responsive = <T>(select: (value: LogicGateOrientation) => T): Responsive<T> =>
    collapsedResponsive({
      wide: select(pickOr(orientation, "wide", "right")),
      compact: select(pickOr(orientation, "compact", "right")),
      narrow: select(pickOr(orientation, "narrow", "right")),
    });
  return [
    ...inputOffsets.map((offset, index): NodePort => ({
      id: `in-${index}`,
      side: responsive((value) => gatePortSide(value, "input")),
      offset: responsive((value) => gateInputOffset(value, offset)),
      // Incoming signal ink overlaps the visible pin up to the body instead of stopping at the
      // outer connection box and leaving a differently coloured stub.
      gap: -12,
    })),
    {
      id: "out",
      side: responsive((value) => gatePortSide(value, "output")),
      offset: 0.5,
    },
  ];
}

/**
 * Reorients a gate's silhouette while keeping its text upright and its visible pins exactly on the
 * outer connection box. This is also used by `f.circuit()` for responsive flow direction.
 */
export function orientGate(
  node: GroupNode,
  orientation: Responsive<LogicGateOrientation>,
): GroupNode {
  if (node.metadata?.circuitRole !== "gate") return node;
  const graphicId = `${node.id}-graphic`;
  const graphic = node.children.find(
    (child): child is GroupNode => child.id === graphicId && child.type === "group",
  );
  if (graphic === undefined) return node;
  const baseWidth = graphic.width ?? node.width ?? 120;
  const baseHeight = graphic.height ?? node.height ?? 80;
  const rotations = { wide: 0, compact: 0, narrow: 0 };
  const widths = { wide: 120 as Length, compact: 120 as Length, narrow: 120 as Length };
  const heights = { wide: 80 as Length, compact: 80 as Length, narrow: 80 as Length };
  for (const layout of LAYOUT_NAMES) {
    const direction = pickOr(orientation, layout, "right");
    const width = pickOr(baseWidth, layout, 120);
    const height = pickOr(baseHeight, layout, 80);
    rotations[layout] = gateRotation(direction);
    widths[layout] = verticalGate(direction) ? height : width;
    heights[layout] = verticalGate(direction) ? width : height;
  }
  const rotation = collapsedResponsive(rotations);
  const width = collapsedResponsive(widths);
  const height = collapsedResponsive(heights);
  return {
    ...node,
    width,
    height,
    ports: logicGatePorts(node.metadata.gateKind as LogicGateKind, orientation),
    children: node.children.map((child) =>
      child.id === graphicId
        ? {
            ...child,
            width: baseWidth,
            height: baseHeight,
            position: { x: 0.5, y: 0.5, anchor: "center" },
            rotation,
          }
        : child,
    ),
    metadata: {
      ...node.metadata,
      gateOrientation: typeof orientation === "string" ? orientation : "responsive",
    },
  };
}

/**
 * A proper logic-gate silhouette with visible input/output pins. It is still an ordinary group of
 * path, circle, and text marks, so it exports everywhere and can be targeted by normal edges.
 */
export function gate(id: string, kind: LogicGateKind, options: LogicGateOptions = {}): GroupNode {
  const {
    tone = "accent",
    fill: authoredFill,
    variant = "schematic",
    text: symbol = kind.toUpperCase(),
    showText = true,
    textTone = "text",
    width = { wide: 108, compact: 96, narrow: 90 },
    height = { wide: 72, compact: 64, narrow: 60 },
    label = `${kind.toUpperCase()} logic gate`,
    metadata,
    orientation: authoredOrientation,
    ...containerOptions
  } = options;
  const fill = authoredFill ?? (variant === "schematic" ? "surface" : "surfaceRaised");
  const shapeBind = containerOptions.bind;
  const { bind: _shapeBind, ...gateContainerOptions } = containerOptions;
  void _shapeBind;
  const inverted = kind === "nand" || kind === "nor" || kind === "xnor" || kind === "not";
  const base = kind === "nand" ? "and" : kind === "nor" || kind === "xnor" ? "or" : kind;
  const outputX = inverted ? 98 : 108;
  const body =
    base === "and"
      ? `M 18 10 L 52 10 C 84 10 ${outputX} 23 ${outputX} 40 C ${outputX} 57 84 70 52 70 L 18 70 Z`
      : base === "or" || base === "xor"
        ? `M 16 10 C 35 29 35 51 16 70 C 55 70 88 61 ${outputX} 40 C 88 19 55 10 16 10 Z`
        : base === "not" || base === "buffer"
          ? `M 18 10 L ${outputX} 40 L 18 70 Z`
          : "M 20 10 L 100 19 L 100 61 L 20 70 Z";
  const inputPins =
    base === "not" || base === "buffer" ? "M 0 40 L 18 40" : "M 0 27 L 18 27 M 0 53 L 18 53";
  const outputPin = inverted ? "M 112 40 L 120 40" : `M ${outputX} 40 L 120 40`;
  const silhouette = `${body} ${inputPins} ${outputPin}`;
  const activeSilhouette = `${body} ${outputPin}`;
  const signalBind =
    shapeBind?.highlight === undefined
      ? shapeBind
      : {
          ...(shapeBind.hidden === undefined ? {} : { hidden: shapeBind.hidden }),
          ...(shapeBind.tone === undefined ? {} : { tone: shapeBind.tone }),
          opacity: shapeBind.highlight,
        };
  const commonPath = {
    type: "path" as const,
    viewBox: { width: 120, height: 80 },
    width: "100%" as const,
    height: "100%" as const,
    position: { x: 0, y: 0 },
  };
  const graphicChildren: SceneNode[] = [];
  if (variant === "schematic")
    graphicChildren.push({
      ...commonPath,
      id: `${id}-channel`,
      d: silhouette,
      fill: "none",
      stroke: "canvas",
      strokeWidth: 4.15,
    });
  graphicChildren.push({
    ...commonPath,
    id: `${id}-shape`,
    d: silhouette,
    fill,
    stroke: variant === "schematic" ? "connector" : tone,
    strokeWidth: variant === "schematic" ? 1.25 : 1.8,
    ...(variant === "solid" && shapeBind !== undefined ? { bind: shapeBind } : {}),
  });
  if (variant === "schematic")
    graphicChildren.push({
      ...commonPath,
      id: `${id}-signal`,
      d: activeSilhouette,
      fill: "none",
      stroke: tone,
      strokeWidth: 2.25,
      ...(signalBind === undefined ? {} : { bind: signalBind }),
    });
  if (base === "xor") {
    graphicChildren.push({
      ...commonPath,
      id: `${id}-xor-arc`,
      d: "M 8 10 C 27 29 27 51 8 70",
      fill: "none",
      stroke: variant === "schematic" ? "connector" : tone,
      strokeWidth: variant === "schematic" ? 1.15 : 1.8,
      ...(variant === "solid" && shapeBind !== undefined ? { bind: shapeBind } : {}),
    });
    if (variant === "schematic")
      graphicChildren.push({
        ...commonPath,
        id: `${id}-xor-signal`,
        d: "M 8 10 C 27 29 27 51 8 70",
        fill: "none",
        stroke: tone,
        strokeWidth: 2.25,
        ...(signalBind === undefined ? {} : { bind: signalBind }),
      });
  }
  if (inverted) {
    graphicChildren.push({
      id: `${id}-bubble`,
      type: "circle",
      radius: 7,
      fill,
      stroke: variant === "schematic" ? "connector" : tone,
      strokeWidth: variant === "schematic" ? 1.15 : 1.8,
      width: 14,
      height: 14,
      position: { x: 105 / 120, y: 0.5, anchor: "center" },
      ...(variant === "solid" && shapeBind !== undefined ? { bind: shapeBind } : {}),
    });
    if (variant === "schematic")
      graphicChildren.push({
        id: `${id}-bubble-signal`,
        type: "circle",
        radius: 7,
        fill: "none",
        stroke: tone,
        strokeWidth: 2.15,
        width: 14,
        height: 14,
        position: { x: 105 / 120, y: 0.5, anchor: "center" },
        ...(signalBind === undefined ? {} : { bind: signalBind }),
      });
  }
  const graphic = container(`${id}-graphic`, "coordinates", graphicChildren, {
    width,
    height,
    position: { x: 0.5, y: 0.5, anchor: "center" },
  });
  const children: SceneNode[] = [graphic];
  if (showText) {
    children.push({
      ...code(`${id}-text`, symbol, { tone: textTone, align: "center", width: 52 }),
      position: { x: base === "mux" ? 0.5 : 0.48, y: 0.5, anchor: "center" },
    });
  }
  const result = container(id, "coordinates", children, {
    ...gateContainerOptions,
    width,
    height,
    allowOverflow: gateContainerOptions.allowOverflow ?? true,
    label,
    metadata: {
      ...metadata,
      circuitRole: "gate",
      gateKind: kind,
      gateVariant: variant,
      gateAutoOrient: authoredOrientation === undefined || authoredOrientation === "auto",
    },
  });
  return orientGate(
    result,
    authoredOrientation === undefined || authoredOrientation === "auto"
      ? "right"
      : authoredOrientation,
  );
}

export interface JunctionOptions {
  readonly tone?: Paint;
  readonly size?: Responsive<number>;
  readonly label?: string;
  readonly bind?: NodeBindings;
  readonly hidden?: Responsive<boolean>;
}

/** A layered circuit-net junction: neutral while idle, signal-coloured only when active. */
export function junction(id: string, options: JunctionOptions = {}): GroupNode {
  const size = options.size ?? 10;
  const radius: Responsive<number> =
    typeof size === "number"
      ? size / 2
      : {
          ...(size.wide === undefined ? {} : { wide: size.wide / 2 }),
          ...(size.compact === undefined ? {} : { compact: size.compact / 2 }),
          ...(size.narrow === undefined ? {} : { narrow: size.narrow / 2 }),
        };
  const activeBind =
    options.bind?.highlight === undefined ? undefined : { opacity: options.bind.highlight };
  const rootBind = options.bind?.hidden === undefined ? undefined : { hidden: options.bind.hidden };
  return container(
    id,
    "coordinates",
    [
      {
        id: `${id}-base`,
        type: "circle",
        radius,
        width: size,
        height: size,
        position: { x: 0.5, y: 0.5, anchor: "center" },
        fill: "connector",
        stroke: "canvas",
        strokeWidth: 2,
      },
      {
        id: `${id}-signal`,
        type: "circle",
        radius,
        width: size,
        height: size,
        position: { x: 0.5, y: 0.5, anchor: "center" },
        fill: options.tone ?? "accent",
        stroke: "canvas",
        strokeWidth: 2,
        ...(activeBind === undefined ? {} : { bind: activeBind }),
      },
    ],
    {
      width: size,
      height: size,
      label: options.label ?? "Circuit junction",
      metadata: { circuitRole: "junction" },
      ...(rootBind === undefined ? {} : { bind: rootBind }),
      ...(options.hidden === undefined ? {} : { hidden: options.hidden }),
    },
  );
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
  readonly interactionGroup?: string;
  /** Named connector locations on this node's resolved connection box. */
  readonly ports?: readonly NodePort[];
  readonly gap?: Responsive<number>;
  readonly padding?: Responsive<Insets>;
  readonly align?: Responsive<Align>;
  readonly justify?: Responsive<Justify>;
  readonly width?: Responsive<Length>;
  readonly height?: Responsive<Length>;
  readonly minWidth?: Responsive<number>;
  readonly maxWidth?: Responsive<number>;
  readonly grow?: Responsive<number>;
  readonly columns?: Responsive<number | "auto">;
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
  readonly rotation?: Responsive<number>;
  /** Single tab stop whose interactive descendants are reached with the arrow keys. */
  readonly focusGroup?: boolean;
  readonly inspect?: InspectInfo;
  readonly revealAnchor?: GroupNode["revealAnchor"];
  /** Silences overflow diagnostics for intentional spill (e.g. decorative marks). */
  readonly allowOverflow?: boolean;
  /** Tight-fit a `coordinates` group to its positioned children instead of a fallback height. */
  readonly fit?: GroupNode["fit"];
  /** Height as a fraction of width for a `coordinates` group without an explicit height. */
  readonly aspect?: number;
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
    ...(options.ports === undefined ? {} : { ports: options.ports }),
    ...(options.interactionGroup === undefined
      ? {}
      : { interactionGroup: options.interactionGroup }),
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
    ...(options.rotation === undefined ? {} : { rotation: options.rotation }),
    ...(options.focusGroup === undefined ? {} : { focusGroup: options.focusGroup }),
    ...(options.inspect === undefined ? {} : { inspect: options.inspect }),
    ...(options.revealAnchor === undefined ? {} : { revealAnchor: options.revealAnchor }),
    ...(options.allowOverflow === undefined ? {} : { allowOverflow: options.allowOverflow }),
    ...(options.fit === undefined ? {} : { fit: options.fit }),
    ...(options.aspect === undefined ? {} : { aspect: options.aspect }),
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

export interface PortMarkOptions {
  readonly tone?: Paint;
  readonly size?: Responsive<number>;
  readonly active?: boolean;
  readonly label?: string;
  readonly bind?: NodeBindings;
  readonly hidden?: Responsive<boolean>;
  readonly position?: CircleMark["position"];
}

/** Small, explicit connection point for signal diagrams and physical controls. */
export function port(id: string, options: PortMarkOptions = {}): CircleMark {
  const size = options.size ?? 10;
  const radius: Responsive<number> =
    typeof size === "number"
      ? size / 2
      : {
          ...(size.wide === undefined ? {} : { wide: size.wide / 2 }),
          ...(size.compact === undefined ? {} : { compact: size.compact / 2 }),
          ...(size.narrow === undefined ? {} : { narrow: size.narrow / 2 }),
        };
  return {
    id,
    type: "circle",
    radius,
    width: size,
    height: size,
    fill: options.active === true ? (options.tone ?? "accent") : "canvas",
    stroke: options.tone ?? "accent",
    strokeWidth: 2,
    label: options.label ?? (options.active === true ? "Active port" : "Port"),
    metadata: { diagramRole: "port", active: options.active === true },
    ...(options.bind === undefined ? {} : { bind: options.bind }),
    ...(options.hidden === undefined ? {} : { hidden: options.hidden }),
    ...(options.position === undefined ? {} : { position: options.position }),
  };
}

export interface TileNodeOptions extends ContainerOptions {
  readonly icon: string;
  readonly title?: string;
  readonly eyebrow?: string;
  /** Optional third line for a value, expression, or compact explanation. */
  readonly detail?: string;
  readonly detailTone?: Paint;
  readonly detailStyle?: TextMark["textStyle"];
  readonly detailBind?: NodeBindings;
  readonly tone?: Paint;
  readonly active?: boolean;
  readonly size?: Responsive<number>;
  /** `icon` is square, `compact` is horizontal, and `labelled` is vertically composed. */
  readonly variant?: "icon" | "compact" | "labelled";
}

/**
 * Compact icon-first node for topologies, state machines, and control surfaces. The semantic
 * `raised` / `floating` role lets a flat theme outline it while a physical theme gives it depth.
 */
export function tileNode(id: string, options: TileNodeOptions): GroupNode {
  const labelled =
    options.title !== undefined || options.eyebrow !== undefined || options.detail !== undefined;
  const variant = options.variant ?? (labelled ? "labelled" : "icon");
  const icon = motif(`${id}-icon`, options.icon, {
    tone: options.tone ?? "accent",
    size: variant === "compact" ? 24 : 26,
  });
  const textChildren: SceneNode[] = [];
  if (options.eyebrow !== undefined)
    textChildren.push(
      eyebrow(`${id}-eyebrow`, options.eyebrow, {
        align: variant === "compact" ? "start" : "center",
      }),
    );
  if (options.title !== undefined)
    textChildren.push(
      heading(`${id}-title`, options.title, {
        align: variant === "compact" ? "start" : "center",
        maxLines: 2,
      }),
    );
  if (options.detail !== undefined)
    textChildren.push(
      text(`${id}-detail`, options.detail, {
        textStyle: options.detailStyle ?? "caption",
        tone: options.detailTone ?? "textMuted",
        align: variant === "compact" ? "start" : "center",
        maxLines: 2,
        ...(options.detailBind === undefined ? {} : { bind: options.detailBind }),
      }),
    );
  const children: SceneNode[] =
    variant === "compact" && textChildren.length > 0
      ? [icon, stack(`${id}-copy`, textChildren, { gap: 3, width: "hug" })]
      : [icon, ...textChildren];
  const layout = variant === "compact" ? "row" : "stack";
  const defaultWidth: Responsive<Length> = variant === "icon" ? (options.size ?? 58) : "hug";
  const defaultMinWidth: Responsive<number> =
    variant === "icon"
      ? 0
      : variant === "compact"
        ? { wide: 116, compact: 104, narrow: 92 }
        : { wide: 118, compact: 106, narrow: 94 };
  const defaultMaxWidth: Responsive<number> | undefined =
    variant === "icon"
      ? undefined
      : variant === "compact"
        ? { wide: 260, compact: 224, narrow: 190 }
        : { wide: 232, compact: 200, narrow: 172 };
  const maxWidth = options.maxWidth ?? defaultMaxWidth;
  return container(id, layout, children, {
    gap: variant === "compact" ? 11 : labelled ? 7 : 0,
    padding: labelled
      ? variant === "compact"
        ? { wide: [12, 14], compact: [11, 12], narrow: [10, 10] }
        : { wide: [14, 16], compact: [12, 12], narrow: [10, 8] }
      : { wide: 14, compact: 12, narrow: 10 },
    align: "center",
    justify: "center",
    width: options.width ?? defaultWidth,
    minWidth: options.minWidth ?? defaultMinWidth,
    ...(maxWidth === undefined ? {} : { maxWidth }),
    minHeight:
      options.minHeight ??
      options.size ??
      (variant === "icon"
        ? 58
        : variant === "compact"
          ? { wide: 72, compact: 68, narrow: 64 }
          : { wide: 96, compact: 90, narrow: 82 }),
    frame: options.frame ?? material(options.active === true ? "floating" : "raised"),
    label: options.label ?? options.title ?? options.eyebrow ?? options.icon,
    metadata: {
      ...options.metadata,
      diagramRole: "tile-node",
      active: options.active === true,
    },
    ...containerOptions(options, [
      "frame",
      "width",
      "minWidth",
      "maxWidth",
      "minHeight",
      "metadata",
      "label",
    ]),
  });
}

export interface GridPlaneOptions extends ContainerOptions {
  readonly columns?: number;
  readonly rows?: number;
  readonly tone?: Paint;
  readonly lineOpacity?: number;
}

/** Quiet responsive construction grid made from ordinary portable marks. */
export function gridPlane(id: string, options: GridPlaneOptions = {}): GroupNode {
  const columns = Math.max(1, Math.floor(options.columns ?? 12));
  const rows = Math.max(1, Math.floor(options.rows ?? 8));
  const tone = options.tone ?? "border";
  const lineOpacity = options.lineOpacity ?? 0.28;
  const lines: SceneNode[] = [];
  for (let index = 0; index <= columns; index += 1) {
    lines.push({
      id: `${id}-column-${index}`,
      type: "rect",
      width: 1,
      height: "100%",
      position: { x: index / columns, y: 0, anchor: "top" },
      fill: tone,
      stroke: "none",
      opacity: lineOpacity,
    });
  }
  for (let index = 0; index <= rows; index += 1) {
    lines.push({
      id: `${id}-row-${index}`,
      type: "rect",
      width: "100%",
      height: 1,
      position: { x: 0, y: index / rows, anchor: "left" },
      fill: tone,
      stroke: "none",
      opacity: lineOpacity,
    });
  }
  return container(id, "coordinates", lines, {
    width: options.width ?? "fill",
    height: options.height ?? { wide: 280, compact: 250, narrow: 220 },
    label: options.label ?? "Diagram grid",
    metadata: { ...options.metadata, diagramRole: "grid-plane" },
    ...containerOptions(options, ["width", "height", "label", "metadata", "columns"]),
  });
}

export interface CardFanOptions extends ContainerOptions {
  /** Maximum horizontal displacement from the centre, as a fraction of the fan width. */
  readonly spread?: number;
  /** Maximum clockwise/counter-clockwise angle of an outside card. */
  readonly angle?: number;
  /** Index drawn highest and closest to the viewer. Defaults to the middle card. */
  readonly activeIndex?: number;
  readonly cardWidth?: Responsive<number>;
}

/** Responsive, exportable fan of ordinary nodes with centre-origin rotation. */
export function cardFan(
  id: string,
  cards: readonly SceneNode[],
  options: CardFanOptions = {},
): GroupNode {
  const activeIndex = Math.max(
    0,
    Math.min(cards.length - 1, options.activeIndex ?? Math.floor(cards.length / 2)),
  );
  const maxDistance = Math.max(activeIndex, cards.length - 1 - activeIndex, 1);
  const spread = options.spread ?? 0.25;
  const angle = options.angle ?? 9;
  const cardWidth = options.cardWidth ?? { wide: 210, compact: 188, narrow: 152 };
  const placed = cards.map((card, index): SceneNode => {
    const offset = (index - activeIndex) / maxDistance;
    const depth = cards.length - Math.abs(index - activeIndex);
    return {
      ...card,
      width: card.width === undefined || card.width === "fill" ? cardWidth : card.width,
      position: {
        wide: { x: 0.5 + offset * spread, y: 0.48 + Math.abs(offset) * 0.07, anchor: "center" },
        compact: {
          x: 0.5 + offset * spread * 0.76,
          y: 0.49 + Math.abs(offset) * 0.055,
          anchor: "center",
        },
        narrow: {
          x: 0.5 + offset * spread * 0.48,
          y: 0.5 + Math.abs(offset) * 0.04,
          anchor: "center",
        },
      },
      rotation: {
        wide: offset * angle,
        compact: offset * angle * 0.72,
        narrow: offset * angle * 0.42,
      },
      z: card.z ?? depth,
      metadata: { ...card.metadata, diagramRole: "fan-card", fanIndex: index },
    };
  });
  return container(id, "coordinates", placed, {
    width: options.width ?? "fill",
    height: options.height ?? { wide: 270, compact: 250, narrow: 220 },
    label: options.label ?? "Card fan",
    allowOverflow: options.allowOverflow ?? false,
    metadata: { ...options.metadata, diagramRole: "card-fan", activeIndex },
    ...containerOptions(options, ["width", "height", "label", "allowOverflow", "metadata"]),
  });
}

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
  "interactionGroup",
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
  "rotation",
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

/** Semantic figure chrome. Exporters and editors use this instead of guessing from paint. */
export type FigureSurfaceAppearance = "bare" | "card" | "inset" | "bleed";
export type FigureSurfaceCrop = "scene" | "surface" | "content";
export interface FigureSurfaceOptions extends Omit<ContainerOptions, "padding" | "frame" | "clip"> {
  readonly appearance?: FigureSurfaceAppearance;
  /** `auto` follows the appearance and remains responsive. */
  readonly padding?: "auto" | Responsive<Insets>;
  readonly frame?: GroupNode["frame"];
  readonly clip?: boolean;
  /** Preferred default crop for exporters and embedded editors. */
  readonly exportCrop?: FigureSurfaceCrop;
}

/**
 * A first-class boundary around a complete figure.
 *
 * Unlike `panel`, a surface carries no editorial heading and does not imply content structure.
 * Its metadata gives runtimes a stable target for chrome, debugging, and export cropping.
 */
export function figureSurface(
  id: string,
  child: SceneNode,
  options: FigureSurfaceOptions = {},
): GroupNode {
  const appearance = options.appearance ?? "bare";
  const automaticPadding: Responsive<Insets> =
    appearance === "card"
      ? { wide: 24, compact: 20, narrow: 14 }
      : appearance === "inset"
        ? { wide: 18, compact: 16, narrow: 12 }
        : 0;
  const automaticFrame: GroupNode["frame"] | undefined =
    appearance === "card"
      ? material("raised")
      : appearance === "inset"
        ? material("inset")
        : undefined;
  const { appearance: _appearance, exportCrop, ...rest } = options;
  void _appearance;
  return stack(id, [child], {
    width: "fill",
    gap: 0,
    ...containerOptions(rest as ContainerOptions),
    padding:
      options.padding === undefined || options.padding === "auto"
        ? automaticPadding
        : options.padding,
    ...(options.frame === undefined && automaticFrame === undefined
      ? {}
      : { frame: options.frame ?? automaticFrame }),
    clip: options.clip ?? appearance === "bleed",
    metadata: {
      ...(options.metadata ?? {}),
      figureSurface: true,
      surfaceAppearance: appearance,
      exportCrop: exportCrop ?? (appearance === "bare" ? "content" : "surface"),
    },
  });
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

export type CodeLanguage =
  "text" | "typescript" | "javascript" | "tsx" | "jsx" | "json" | "shell" | "css" | "html";

export type CodeTokenKind =
  | "plain"
  | "keyword"
  | "string"
  | "number"
  | "comment"
  | "operator"
  | "punctuation"
  | "function"
  | "property"
  | "tag";

export interface CodeToken {
  readonly text: string;
  /** Semantic role used by the default palette and available to inspection tooling. */
  readonly kind?: CodeTokenKind;
  /** Per-token escape hatch for authored or externally tokenized code. */
  readonly tone?: Paint;
}

export interface CodeBlockLine {
  /** Plain source for this line. Ignored when `tokens` is supplied. */
  readonly text?: string;
  /** Runtime bindings for a dynamically selected or generated source line. */
  readonly bind?: NodeBindings;
  /** Caller-supplied tokens, useful when a full parser already exists upstream. */
  readonly tokens?: readonly CodeToken[];
  /** Highlights this line independently of `highlightLines`. */
  readonly highlighted?: boolean;
  /** Diff gutter and semantic surface for this source line. */
  readonly diff?: "add" | "remove" | "context";
  /** Short review note rendered beside the source. */
  readonly annotation?: string | CodeAnnotation;
  /** Overrides block-level character typing for this line. */
  readonly typing?: boolean;
  /** Overrides the displayed line number without changing source order. */
  readonly number?: number;
}

export interface CodeAnnotation {
  readonly text: string;
  readonly tone?: Paint;
  /** Defaults to hiding inline notes when the editor becomes compact; pass `false` to force it. */
  readonly hidden?: Responsive<boolean>;
}

export type CodeBlockSource = string | readonly (string | CodeBlockLine)[];

export interface CodeCursorOptions {
  /** Displayed line number. Defaults to the final authored line. */
  readonly line?: number;
  readonly style?: "bar" | "block" | "underline";
  readonly tone?: Paint;
}

export type CodeTokenizer = (
  source: string,
  context: { readonly language: CodeLanguage; readonly line: number; readonly index: number },
) => readonly CodeToken[];

export interface CodeBlockOptions extends ContainerOptions {
  readonly language?: CodeLanguage;
  readonly title?: string;
  readonly chrome?: "header" | "plain";
  /** Controls editor gutters and inset without changing typography. Defaults to `compact`. */
  readonly density?: "compact" | "comfortable";
  readonly lineNumbers?: boolean;
  readonly startLine?: number;
  readonly highlightLines?: readonly number[];
  readonly highlightRanges?: readonly (readonly [start: number, end: number])[];
  readonly highlightTone?: FillPaint;
  readonly lineGap?: Responsive<number>;
  readonly tabSize?: number;
  /** Marks generated token text for `f.typewrite(codeBlock)`. */
  readonly typing?: boolean;
  /** Override the built-in lightweight tokenizer at authoring time (for example with Shiki). */
  readonly tokenize?: CodeTokenizer;
  readonly cursor?: boolean | CodeCursorOptions;
  /** Number of authored lines kept in the deterministic editor viewport. */
  readonly visibleLines?: number;
  /** First visible line (zero-based), or pin the viewport to an end. */
  readonly scroll?: "start" | "end" | "follow" | number;
  /** Re-theme syntax roles without changing or post-processing the generated scene. */
  readonly tokenTones?: Partial<Readonly<Record<CodeTokenKind, Paint>>>;
}

const SCRIPT_KEYWORDS = new Set([
  "as",
  "async",
  "await",
  "break",
  "case",
  "catch",
  "class",
  "const",
  "continue",
  "default",
  "delete",
  "do",
  "else",
  "enum",
  "export",
  "extends",
  "false",
  "finally",
  "for",
  "from",
  "function",
  "if",
  "implements",
  "import",
  "in",
  "instanceof",
  "interface",
  "keyof",
  "let",
  "new",
  "null",
  "of",
  "readonly",
  "return",
  "satisfies",
  "static",
  "super",
  "switch",
  "this",
  "throw",
  "true",
  "try",
  "type",
  "typeof",
  "undefined",
  "var",
  "void",
  "while",
  "yield",
]);

const CODE_KEYWORDS: Readonly<Record<CodeLanguage, ReadonlySet<string>>> = {
  text: new Set(),
  typescript: SCRIPT_KEYWORDS,
  javascript: SCRIPT_KEYWORDS,
  tsx: SCRIPT_KEYWORDS,
  jsx: SCRIPT_KEYWORDS,
  json: new Set(["false", "null", "true"]),
  shell: new Set([
    "case",
    "do",
    "done",
    "elif",
    "else",
    "esac",
    "export",
    "fi",
    "for",
    "function",
    "if",
    "in",
    "then",
    "while",
  ]),
  css: new Set(["@import", "@keyframes", "@media", "from", "to"]),
  html: new Set(),
};

const DEFAULT_CODE_TONES: Readonly<Record<CodeTokenKind, Paint>> = {
  plain: "text",
  keyword: "accent",
  string: "success",
  number: "warning",
  comment: "textMuted",
  operator: "info",
  punctuation: "textMuted",
  function: "info",
  property: "warning",
  tag: "accent",
};

/**
 * Small deterministic tokenizer for documentation snippets. It deliberately covers common lexical
 * roles rather than pretending to be a parser; callers can pass exact tokens through `codeBlock`.
 */
export function highlightCodeLine(
  source: string,
  language: CodeLanguage = "text",
): readonly CodeToken[] {
  if (source.length === 0) return [];
  const tokens: CodeToken[] = [];
  const pattern =
    /\s+|<!--[\s\S]*?-->|\/\*[\s\S]*?\*\/|\/\/.*|#[^!].*|`(?:\\.|[^`\\])*`|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|(?:0x[\da-f]+|\d+(?:\.\d+)?)(?:e[+-]?\d+)?|[A-Za-z_$@][\w$@-]*|===|!==|=>|==|!=|<=|>=|&&|\|\||\+\+|--|\*\*|\?\?|\?\.|[+\-*/%=!<>?:&|~^]+|[{}()[\],.;]|./gi;
  const pieces = source.match(pattern) ?? [source];
  let offset = 0;
  for (const text of pieces) {
    const start = offset;
    offset += text.length;
    const rest = source.slice(offset);
    let kind: CodeTokenKind = "plain";
    if (/^(?:\/\/|\/\*|<!--)/.test(text) || (language === "shell" && text.startsWith("#")))
      kind = "comment";
    else if (/^[`'"]/.test(text))
      kind =
        language === "json" && /^\s*:/.test(rest) && text.startsWith('"') ? "property" : "string";
    else if (/^(?:0x[\da-f]+|\d)/i.test(text)) kind = "number";
    else if (/^[A-Za-z_$@]/.test(text)) {
      if (CODE_KEYWORDS[language].has(text)) kind = "keyword";
      else if (/^\s*\(/.test(rest)) kind = "function";
      else if ((language === "css" || language === "json") && /^\s*:/.test(rest)) kind = "property";
      else if (language === "html" && /<\/?\s*$/.test(source.slice(0, start))) kind = "tag";
    } else if (/^[{}()[\],.;]$/.test(text)) kind = "punctuation";
    else if (!/^\s+$/.test(text)) kind = "operator";
    tokens.push({ text, kind });
  }
  return tokens;
}

function visibleCodeToken(text: string, tabSize: number): string {
  return text.replaceAll("\t", " ".repeat(tabSize)).replaceAll(" ", "\u00a0");
}

/** Syntax-highlighted code made exclusively from portable scene nodes. */
export function codeBlock(
  id: string,
  source: CodeBlockSource,
  options: CodeBlockOptions = {},
): GroupNode {
  if (
    options.visibleLines !== undefined &&
    (!Number.isInteger(options.visibleLines) || options.visibleLines <= 0)
  )
    throw new Error("codeBlock: visibleLines must be a positive integer");
  if (
    typeof options.scroll === "number" &&
    (!Number.isFinite(options.scroll) || options.scroll < 0)
  )
    throw new Error("codeBlock: numeric scroll must be a finite, non-negative line index");
  const language = options.language ?? "text";
  const density = options.density ?? "compact";
  const sourceLines =
    typeof source === "string" ? source.replaceAll("\r\n", "\n").split("\n") : source;
  const startLine = options.startLine ?? 1;
  const highlighted = new Set(options.highlightLines ?? []);
  const inHighlightedRange = (line: number): boolean =>
    (options.highlightRanges ?? []).some(([start, end]) => line >= start && line <= end);
  const tabSize = Math.max(1, options.tabSize ?? 2);
  const allRows = sourceLines.map((entry, index) => {
    const line: CodeBlockLine = typeof entry === "string" ? { text: entry } : entry;
    const lineNumber = line.number ?? startLine + index;
    const tokens =
      line.tokens ??
      (line.bind?.text === undefined
        ? (options.tokenize?.(line.text ?? "", { language, line: lineNumber, index }) ??
          highlightCodeLine(line.text ?? "", language))
        : [{ text: line.text ?? "", kind: "plain" as const }]);
    const typing = line.typing ?? options.typing ?? false;
    const tokenNodes: SceneNode[] = tokens.map((token, tokenIndex) => ({
      ...code(
        `${id}-line-${index + 1}-token-${tokenIndex + 1}`,
        visibleCodeToken(token.text, tabSize),
        {
          tone:
            token.tone ??
            options.tokenTones?.[token.kind ?? "plain"] ??
            DEFAULT_CODE_TONES[token.kind ?? "plain"],
        },
      ),
      ...(typing ? { reveal: "characters" as const } : {}),
      ...(line.bind === undefined ? {} : { bind: line.bind }),
      metadata: {
        codeRole: "token",
        tokenKind: token.kind ?? "plain",
        typing,
        typingOrder: index * 10_000 + tokenIndex,
        typingLine: index,
      },
    }));
    if (tokenNodes.length === 0)
      tokenNodes.push(code(`${id}-line-${index + 1}-empty`, "\u00a0", { tone: "text" }));
    const cursor =
      options.cursor === true
        ? {}
        : options.cursor === false || options.cursor === undefined
          ? undefined
          : options.cursor;
    const cursorLine = cursor?.line ?? startLine + sourceLines.length - 1;
    if (cursor !== undefined && lineNumber === cursorLine) {
      const style = cursor.style ?? "bar";
      tokenNodes.push({
        ...code(
          `${id}-line-${index + 1}-cursor`,
          style === "block" ? "█" : style === "underline" ? "_" : "▎",
          { tone: cursor.tone ?? "accent", reveal: typing ? "characters" : "lines" },
        ),
        metadata: {
          codeRole: "cursor",
          typing,
          typingOrder: index * 10_000 + 9_999,
          typingLine: index,
        },
      });
    }
    const content = row(`${id}-line-${index + 1}-content`, tokenNodes, {
      gap: 0,
      align: "center",
      grow: 1,
    });
    const children: SceneNode[] = [];
    const diff = line.diff ?? "context";
    if (line.diff !== undefined)
      children.push(
        code(`${id}-line-${index + 1}-diff`, diff === "add" ? "+" : diff === "remove" ? "−" : " ", {
          tone: diff === "add" ? "success" : diff === "remove" ? "danger" : "textMuted",
        }),
      );
    if (options.lineNumbers !== false)
      children.push(
        code(`${id}-line-${index + 1}-number`, String(lineNumber), {
          tone: "textMuted",
          align: "end",
          width: 28,
        }),
      );
    children.push(content);
    if (line.annotation !== undefined) {
      const annotation =
        typeof line.annotation === "string" ? { text: line.annotation } : line.annotation;
      children.push(
        pill(`${id}-line-${index + 1}-annotation`, annotation.text, {
          tone: annotation.tone ?? "info",
          variant: "outline",
          hidden: annotation.hidden ?? { wide: false, compact: true, narrow: true },
        }),
      );
    }
    const isHighlighted =
      line.highlighted === true || highlighted.has(lineNumber) || inHighlightedRange(lineNumber);
    const diffFill: FillPaint | undefined =
      line.diff === "add" ? "surfaceMuted" : line.diff === "remove" ? "surfaceMuted" : undefined;
    return row(`${id}-line-${index + 1}`, children, {
      gap:
        options.lineNumbers === false && line.diff === undefined
          ? 0
          : density === "compact"
            ? 8
            : 14,
      padding:
        density === "compact"
          ? { wide: [2, 4], compact: [2, 4], narrow: [2, 2] }
          : { wide: [4, 8], compact: [3, 7], narrow: [3, 5] },
      align: "center",
      width: "fill",
      ...(isHighlighted || diffFill !== undefined
        ? {
            frame: {
              fill: isHighlighted
                ? (options.highlightTone ?? "surfaceMuted")
                : (diffFill ?? "surfaceMuted"),
              stroke: "none" as const,
              radius: 4,
            },
          }
        : {}),
      metadata: {
        codeRole: "line",
        lineNumber,
        highlighted: isHighlighted,
        diff,
        typing,
        annotation: line.annotation !== undefined,
      },
    });
  });

  const visibleLines = Math.max(1, Math.floor(options.visibleLines ?? allRows.length));
  const maximumStart = Math.max(0, allRows.length - visibleLines);
  const scrollStart =
    options.scroll === "end" || options.scroll === "follow"
      ? maximumStart
      : options.scroll === "start" || options.scroll === undefined
        ? 0
        : Math.max(0, Math.min(maximumStart, Math.floor(options.scroll)));
  const rows = allRows.slice(scrollStart, scrollStart + visibleLines);

  const header: SceneNode[] = [];
  if ((options.chrome ?? "header") === "header") {
    const titleText = options.title ?? "Code";
    header.push(
      row(
        `${id}-header`,
        [
          code(`${id}-title`, titleText, { tone: "text" }),
          pill(`${id}-language`, language.toUpperCase(), { tone: "textMuted", variant: "outline" }),
        ],
        { gap: 12, justify: "between", align: "center", width: "fill" },
      ),
      rule(`${id}-header-rule`),
    );
  }

  const {
    language: _language,
    title: _title,
    chrome: _chrome,
    density: _density,
    lineNumbers: _lineNumbers,
    startLine: _startLine,
    highlightLines: _highlightLines,
    highlightRanges: _highlightRanges,
    highlightTone: _highlightTone,
    lineGap: _lineGap,
    tabSize: _tabSize,
    typing: _typing,
    tokenize: _tokenize,
    cursor: _cursor,
    visibleLines: _visibleLines,
    scroll: _scroll,
    tokenTones: _tokenTones,
    ...container
  } = options;
  void _language;
  void _title;
  void _chrome;
  void _density;
  void _lineNumbers;
  void _startLine;
  void _highlightLines;
  void _highlightRanges;
  void _highlightTone;
  void _lineGap;
  void _tabSize;
  void _typing;
  void _tokenize;
  void _cursor;
  void _visibleLines;
  void _scroll;
  void _tokenTones;
  return stack(
    id,
    [
      ...header,
      stack(`${id}-source`, rows, {
        gap: options.lineGap ?? (density === "compact" ? 0 : 2),
        width: "fill",
      }),
    ],
    {
      ...containerOptions(container),
      gap: options.gap ?? (density === "compact" ? 7 : 11),
      padding:
        options.padding ??
        (density === "compact"
          ? { wide: [8, 9], compact: [8, 8], narrow: [7, 6] }
          : { wide: [14, 16], compact: [12, 14], narrow: [10, 10] }),
      width: options.width ?? "fill",
      frame: options.frame ?? { fill: "surfaceRaised", stroke: "border" },
      label: options.label ?? options.title ?? `${language} code`,
      metadata: {
        ...options.metadata,
        codeRole: "block",
        language,
        totalLines: allRows.length,
        visibleLines: rows.length,
        scrollStart,
      },
    },
  );
}

export type TerminalLineKind = "command" | "output" | "success" | "warning" | "error" | "comment";

export interface TerminalAnsiStyle {
  readonly foreground?: number | string;
  readonly background?: number | string;
  readonly bold?: boolean;
  readonly dim?: boolean;
  readonly italic?: boolean;
  readonly underline?: boolean;
  readonly inverse?: boolean;
}

export interface TerminalSpan {
  readonly text: string;
  readonly tone?: Paint;
  readonly background?: FillPaint;
  readonly bold?: boolean;
  readonly dim?: boolean;
  readonly italic?: boolean;
  readonly underline?: boolean;
  readonly inverse?: boolean;
  readonly selected?: boolean;
  /** Original ANSI state when this span came from an asciicast. */
  readonly ansi?: TerminalAnsiStyle;
  readonly typing?: boolean;
}

export type TerminalStatus =
  | "queued"
  | "running"
  | "success"
  | "warning"
  | "error"
  | { readonly label: string; readonly tone?: Paint };

export interface TerminalLine {
  readonly text?: string;
  /** Styled runs; takes precedence over `text`. */
  readonly spans?: readonly TerminalSpan[];
  readonly kind?: TerminalLineKind;
  /** Prompt shown before command text. Defaults to `$`. */
  readonly prompt?: string;
  /** Overrides the semantic colour selected by `kind`. */
  readonly tone?: Paint;
  readonly promptTone?: Paint;
  /** Optional line-level surface, useful for selections and active commands. */
  readonly background?: FillPaint;
  readonly selected?: boolean;
  readonly status?: TerminalStatus;
  /** Compact trailing metadata such as elapsed time, a port, or an exit code. */
  readonly meta?: string;
  /** Marker rendered in the semantic gutter. `false` suppresses an enabled automatic marker. */
  readonly marker?: string | false;
  readonly markerTone?: Paint;
  /** Places a cursor after this line; `false` suppresses a terminal-level cursor here. */
  readonly cursor?: boolean | TerminalCursorOptions;
  /** Marks this line for `f.typewrite(terminal)`. Commands default to true. */
  readonly typing?: boolean;
}

export type TerminalCursorStyle = "block" | "bar" | "underline";

export interface TerminalCursorOptions {
  readonly style?: TerminalCursorStyle;
  readonly tone?: Paint;
  /** One-based source line; defaults to the final line. */
  readonly line?: number;
}

export interface TerminalChromeItem {
  /** Compact semantic component placed in the terminal title bar. */
  readonly kind?: "label" | "badge" | "icon" | "dot";
  readonly text?: string;
  readonly icon?: string;
  readonly tone?: Paint;
}

export interface TerminalOptions extends ContainerOptions {
  readonly title?: string;
  readonly cwd?: string;
  readonly prompt?: string;
  readonly promptTone?: Paint;
  readonly titleTone?: Paint;
  readonly cwdTone?: Paint;
  readonly rows?: Responsive<number>;
  readonly chrome?: "window" | "tab" | "minimal" | "plain";
  /** Controls screen inset and row rhythm without changing terminal text size. */
  readonly density?: "compact" | "comfortable";
  /** Window control colours from left to right; pass an empty array to hide the controls. */
  readonly chromeControls?: readonly Paint[];
  /** Composable title-bar components before and after the terminal title. */
  readonly chromeStart?: readonly TerminalChromeItem[];
  readonly chromeEnd?: readonly TerminalChromeItem[];
  readonly cursor?: boolean | TerminalCursorOptions;
  readonly lineGap?: Responsive<number>;
  /** Add semantic glyphs beside success, warning, error, comment, and command lines. */
  readonly lineMarkers?: boolean;
  /** Keep the working directory in the body or fold it into the title bar. */
  readonly cwdPosition?: "header" | "body";
  /** Horizontal text policy. `clip` is the compact terminal default. */
  readonly wrap?: "wrap" | "clip" | "overflow";
  /** Number of authored rows kept in the static viewport. */
  readonly visibleLines?: number;
  /** First visible row (zero-based), or pin the viewport to either end. */
  readonly scroll?: "start" | "end" | "follow" | number;
  readonly selectionTone?: FillPaint;
  /** Optional session-level status shown in the chrome. */
  readonly status?: TerminalStatus;
  /** Marks command rows, every row, or no rows for `f.typewrite()`. Defaults to `commands`. */
  readonly typing?: "commands" | "all" | false;
  /** Source-order offset for composing several terminals into one typewrite stream. */
  readonly typingOrderOffset?: number;
}

function terminalLineTone(kind: TerminalLineKind): Paint {
  switch (kind) {
    case "success":
      return "success";
    case "warning":
      return "warning";
    case "error":
      return "danger";
    case "comment":
      return "textMuted";
    case "command":
      return "text";
    default:
      return "textMuted";
  }
}

function terminalLineMarker(kind: TerminalLineKind): string {
  switch (kind) {
    case "command":
      return "›";
    case "success":
      return "✓";
    case "warning":
      return "!";
    case "error":
      return "×";
    case "comment":
      return "#";
    default:
      return "·";
  }
}

function terminalStatus(status: TerminalStatus): { readonly label: string; readonly tone: Paint } {
  if (typeof status !== "string") return { label: status.label, tone: status.tone ?? "info" };
  if (status === "success") return { label: "passed", tone: "success" };
  if (status === "error") return { label: "failed", tone: "danger" };
  return {
    label: status,
    tone: status === "warning" ? "warning" : status === "running" ? "info" : "textMuted",
  };
}

function terminalChromeItemNode(
  id: string,
  item: TerminalChromeItem,
  fallbackTone: Paint,
): SceneNode {
  const tone = item.tone ?? fallbackTone;
  if (item.kind === "dot")
    return {
      id,
      type: "circle",
      radius: 4,
      width: 8,
      height: 8,
      fill: tone,
      stroke: "none",
    };
  if (item.kind === "icon") return motif(id, item.icon ?? "terminal", { tone, size: 16 });
  if (item.kind === "badge") return pill(id, item.text ?? "", { tone, variant: "outline" });
  return code(id, item.text ?? "", { tone });
}

function terminalChrome(
  id: string,
  options: Pick<
    TerminalOptions,
    | "title"
    | "titleTone"
    | "cwd"
    | "cwdPosition"
    | "cwdTone"
    | "chrome"
    | "chromeControls"
    | "chromeStart"
    | "chromeEnd"
    | "status"
  >,
): readonly SceneNode[] {
  const chromeStyle = options.chrome ?? "window";
  if (chromeStyle === "plain") return [];
  const start = (options.chromeStart ?? []).map((item, index) =>
    terminalChromeItemNode(`${id}-chrome-start-${index + 1}`, item, "textMuted"),
  );
  const end = (options.chromeEnd ?? []).map((item, index) =>
    terminalChromeItemNode(`${id}-chrome-end-${index + 1}`, item, "textMuted"),
  );
  const dots = row(
    `${id}-window-controls`,
    (options.chromeControls ?? (["danger", "warning", "success"] as const)).map((tone, index) => ({
      id: `${id}-window-control-${index + 1}`,
      type: "circle" as const,
      radius: 4,
      width: 8,
      height: 8,
      fill: tone,
      stroke: "none" as const,
    })),
    { gap: 6, align: "center" },
  );
  const titleText = code(`${id}-title`, options.title ?? "Terminal", {
    tone: options.titleTone ?? (chromeStyle === "tab" ? "text" : "textMuted"),
    width: "fill",
  });
  const headerCwd =
    options.cwd !== undefined && options.cwdPosition === "header"
      ? code(`${id}-cwd`, options.cwd, {
          tone: options.cwdTone ?? "textMuted",
          hidden: { wide: false, compact: false, narrow: true },
        })
      : undefined;
  const sessionStatus = options.status === undefined ? undefined : terminalStatus(options.status);
  const header = row(
    `${id}-chrome`,
    [
      ...(chromeStyle === "window" ? [dots] : []),
      ...(chromeStyle === "tab"
        ? [motif(`${id}-tab-icon`, "terminal", { tone: "accent", size: 16 })]
        : []),
      ...start,
      titleText,
      ...(headerCwd === undefined ? [] : [headerCwd]),
      ...end,
      ...(sessionStatus === undefined
        ? []
        : [
            pill(`${id}-status`, sessionStatus.label, {
              tone: sessionStatus.tone,
              variant: "outline",
            }),
          ]),
    ],
    {
      gap: chromeStyle === "tab" ? 8 : 12,
      align: "center",
      width: "fill",
      ...(chromeStyle === "tab"
        ? { padding: [6, 8], frame: { fill: "surfaceMuted", stroke: "border", radius: 5 } }
        : {}),
      metadata: { terminalRole: "chrome", terminalChrome: chromeStyle },
    },
  );
  return chromeStyle === "tab" ? [header] : [header, rule(`${id}-chrome-rule`)];
}

function terminalSpan(
  id: string,
  span: TerminalSpan,
  options: {
    readonly typing: boolean;
    readonly selectionTone: FillPaint;
    readonly typingOrder: number;
    readonly typingLine: number;
  },
): GroupNode {
  const inverse = span.inverse ?? span.ansi?.inverse ?? false;
  const selected = span.selected ?? false;
  const background = selected
    ? options.selectionTone
    : (span.background ?? (inverse ? "text" : undefined));
  const text = {
    ...code(`${id}-text`, span.text.length === 0 ? "\u00a0" : span.text, {
      tone: span.tone ?? (inverse ? "canvas" : "text"),
      reveal: (span.typing ?? options.typing) ? "characters" : "lines",
      maxLines: 1,
    }),
    wrap: false,
    ...((span.dim ?? span.ansi?.dim) === true ? { opacity: 0.58 } : {}),
    metadata: {
      terminalRole: "span",
      bold: span.bold ?? span.ansi?.bold ?? false,
      dim: span.dim ?? span.ansi?.dim ?? false,
      italic: span.italic ?? span.ansi?.italic ?? false,
      underline: span.underline ?? span.ansi?.underline ?? false,
      inverse,
      selected,
      ...(span.ansi?.foreground === undefined
        ? {}
        : { ansiForeground: String(span.ansi.foreground) }),
      ...(span.ansi?.background === undefined
        ? {}
        : { ansiBackground: String(span.ansi.background) }),
      typingOrder: options.typingOrder,
      typingLine: options.typingLine,
    },
  };
  return row(id, [text], {
    gap: 0,
    padding: background === undefined ? 0 : [1, 2],
    ...(background === undefined ? {} : { frame: { fill: background, stroke: "none", radius: 2 } }),
    metadata: { terminalRole: "spanContainer" },
  });
}

/**
 * A structured terminal surface. Lines remain ordinary text nodes, so they are selectable,
 * inspectable, responsive, and exportable. `f.typewrite(terminal)` animates command lines (or any
 * line with `typing: true`) without changing the layout as characters appear.
 */
export function terminal(
  id: string,
  lines: readonly (string | TerminalLine)[],
  options: TerminalOptions = {},
): GroupNode {
  if (
    options.visibleLines !== undefined &&
    (!Number.isInteger(options.visibleLines) || options.visibleLines <= 0)
  )
    throw new Error("terminal: visibleLines must be a positive integer");
  if (
    typeof options.scroll === "number" &&
    (!Number.isFinite(options.scroll) || options.scroll < 0)
  )
    throw new Error("terminal: numeric scroll must be a finite, non-negative row index");
  const wrapPolicy = options.wrap ?? "clip";
  const density = options.density ?? "compact";
  const typingOrderOffset = options.typingOrderOffset ?? 0;
  const selectionTone = options.selectionTone ?? "surfaceMuted";
  const allRows = lines.map((entry, index): GroupNode => {
    const line: TerminalLine = typeof entry === "string" ? { text: entry } : entry;
    const kind = line.kind ?? "output";
    const typingMode = options.typing ?? "commands";
    const typing =
      line.typing ?? (typingMode === "all" || (typingMode === "commands" && kind === "command"));
    const terminalCursor =
      options.cursor === true
        ? {}
        : options.cursor === false || options.cursor === undefined
          ? undefined
          : options.cursor;
    const cursorLine = terminalCursor?.line ?? lines.length;
    const lineCursor =
      line.cursor === false
        ? undefined
        : line.cursor === true
          ? {}
          : (line.cursor ?? (index + 1 === cursorLine ? terminalCursor : undefined));
    const children: SceneNode[] = [];
    const body: SceneNode[] = [];
    const marker =
      line.marker === false
        ? undefined
        : (line.marker ?? (options.lineMarkers ? terminalLineMarker(kind) : undefined));
    if (marker !== undefined) {
      children.push(
        code(`${id}-line-${index + 1}-marker`, marker, {
          tone: line.markerTone ?? line.tone ?? terminalLineTone(kind),
          align: "center",
          width: 14,
        }),
      );
    }
    if (kind === "command") {
      body.push({
        ...code(`${id}-line-${index + 1}-prompt`, line.prompt ?? options.prompt ?? "$", {
          tone: line.promptTone ?? options.promptTone ?? "accent",
          reveal: typing ? "characters" : "lines",
        }),
        metadata: {
          terminalRole: "prompt",
          typing,
          typingOrder: typingOrderOffset + index * 10_000,
          typingLine: index,
        },
      });
    }
    if (line.spans !== undefined) {
      body.push(
        row(
          `${id}-line-${index + 1}-content`,
          line.spans.map((span, spanIndex) =>
            terminalSpan(`${id}-line-${index + 1}-span-${spanIndex + 1}`, span, {
              typing,
              selectionTone,
              typingOrder: typingOrderOffset + index * 10_000 + spanIndex + 1,
              typingLine: index,
            }),
          ),
          {
            gap: 0,
            align: "start",
            clip: wrapPolicy === "clip",
            allowOverflow: wrapPolicy === "overflow",
          },
        ),
      );
    } else {
      body.push({
        ...code(`${id}-line-${index + 1}-text`, line.text ?? " ", {
          tone: line.tone ?? terminalLineTone(kind),
          reveal: typing ? "characters" : "lines",
          ...(options.rows === undefined ? {} : { maxLines: options.rows }),
        }),
        wrap: wrapPolicy === "wrap",
        ...(wrapPolicy === "wrap" ? { width: "fill" as const, grow: 1, minWidth: 0 } : {}),
        metadata: {
          terminalRole: "text",
          typing,
          typingOrder: typingOrderOffset + index * 10_000 + 1,
          typingLine: index,
        },
      });
    }
    if (lineCursor !== undefined) {
      const style = lineCursor.style ?? "block";
      body.push(
        code(
          `${id}-line-${index + 1}-cursor`,
          style === "bar" ? "▎" : style === "underline" ? "_" : "█",
          { tone: lineCursor.tone ?? "accent" },
        ),
      );
    }
    children.push(
      row(`${id}-line-${index + 1}-body`, body, {
        gap: kind === "command" ? 8 : 0,
        ...(wrapPolicy === "wrap" ? { width: "fill" as const } : {}),
        grow: 1,
        minWidth: 0,
        align: "start",
        clip: wrapPolicy === "clip",
        allowOverflow: wrapPolicy === "overflow",
        metadata: { terminalRole: "lineBody" },
      }),
    );
    if (line.status !== undefined) {
      const status = terminalStatus(line.status);
      children.push(
        pill(`${id}-line-${index + 1}-status`, status.label, {
          tone: status.tone,
          variant: "outline",
        }),
      );
    }
    if (line.meta !== undefined) {
      children.push(
        code(`${id}-line-${index + 1}-meta`, line.meta, {
          tone: "textMuted",
          align: "end",
          hidden: { wide: false, compact: false, narrow: true },
        }),
      );
    }
    const selected = line.selected ?? false;
    return row(`${id}-line-${index + 1}`, children, {
      gap: 8,
      padding:
        line.background === undefined && !selected
          ? density === "compact"
            ? { wide: [1, 2], compact: [1, 2], narrow: [1, 1] }
            : { wide: [2, 5], compact: [2, 5], narrow: [2, 2] }
          : density === "compact"
            ? { wide: [3, 5], compact: [3, 5], narrow: [2, 3] }
            : { wide: [4, 7], compact: [4, 7], narrow: [3, 3] },
      width: "fill",
      align: "start",
      clip: wrapPolicy === "clip",
      allowOverflow: wrapPolicy === "overflow",
      ...(line.background === undefined && !selected
        ? {}
        : {
            frame: {
              fill: selected ? selectionTone : (line.background ?? "surfaceMuted"),
              stroke: "none",
              radius: 3,
            },
          }),
      metadata: {
        terminalRole: "line",
        terminalLineKind: kind,
        typing,
        cursor: lineCursor !== undefined,
        selected,
        status: line.status === undefined ? false : terminalStatus(line.status).label,
        meta: line.meta ?? false,
      },
    });
  });

  const visibleLines = Math.max(1, Math.floor(options.visibleLines ?? allRows.length));
  const maximumStart = Math.max(0, allRows.length - visibleLines);
  const scrollStart =
    options.scroll === "end" || options.scroll === "follow"
      ? maximumStart
      : options.scroll === "start" || options.scroll === undefined
        ? 0
        : Math.max(0, Math.min(maximumStart, Math.floor(options.scroll)));
  const rows = allRows.slice(scrollStart, scrollStart + visibleLines);

  const chrome: SceneNode[] = [...terminalChrome(id, options)];
  if (options.cwd !== undefined && (options.cwdPosition ?? "body") === "body")
    chrome.push(eyebrow(`${id}-cwd`, options.cwd, { tone: options.cwdTone ?? "textMuted" }));

  const {
    title: _title,
    cwd: _cwd,
    prompt: _prompt,
    promptTone: _promptTone,
    titleTone: _titleTone,
    cwdTone: _cwdTone,
    rows: _rows,
    chrome: _chrome,
    density: _density,
    chromeControls: _chromeControls,
    chromeStart: _chromeStart,
    chromeEnd: _chromeEnd,
    cursor: _cursor,
    lineGap: _lineGap,
    wrap: _wrap,
    visibleLines: _visibleLines,
    scroll: _scroll,
    selectionTone: _selectionTone,
    status: _status,
    typing: _typing,
    typingOrderOffset: _typingOrderOffset,
    ...container
  } = options;
  void _title;
  void _cwd;
  void _prompt;
  void _promptTone;
  void _titleTone;
  void _cwdTone;
  void _rows;
  void _chrome;
  void _density;
  void _chromeControls;
  void _chromeStart;
  void _chromeEnd;
  void _cursor;
  void _lineGap;
  void _wrap;
  void _visibleLines;
  void _scroll;
  void _selectionTone;
  void _status;
  void _typing;
  void _typingOrderOffset;
  return stack(
    id,
    [
      ...chrome,
      stack(`${id}-screen`, rows, {
        gap: options.lineGap ?? (density === "compact" ? 2 : 5),
        width: "fill",
      }),
    ],
    {
      ...containerOptions(container),
      gap: options.gap ?? (density === "compact" ? 7 : 10),
      padding:
        options.padding ??
        (density === "compact"
          ? { wide: [8, 10], compact: [8, 9], narrow: [7, 6] }
          : { wide: [14, 16], compact: [12, 14], narrow: [10, 9] }),
      width: options.width ?? "fill",
      frame: options.frame ?? { fill: "surfaceRaised", stroke: "border" },
      label: options.label ?? options.title ?? "Terminal session",
      metadata: {
        ...options.metadata,
        terminalRole: "terminal",
        totalLines: allRows.length,
        visibleLines: rows.length,
        scrollStart,
        wrap: wrapPolicy,
      },
    },
  );
}

export interface MinecraftCommandOptions extends ContainerOptions {
  /** Chat already visible before the command is typed. It is never retyped. */
  readonly history?: readonly (string | TerminalLine)[];
  /** Static completion hints above the input. */
  readonly suggestions?: readonly string[];
  /** Optional label such as "Multiplayer chat" or "Singleplayer". */
  readonly context?: string;
  readonly cursor?: boolean | TerminalCursorOptions;
}

/** Minecraft-style chat input, compiled to ordinary terminal and text nodes. */
export function minecraftCommand(
  id: string,
  command: string,
  options: MinecraftCommandOptions = {},
): GroupNode {
  if (!command.startsWith("/") || /[\r\n]/.test(command)) {
    throw new Error(
      "minecraftCommand requires one slash-prefixed command, such as /schematio or //paste",
    );
  }
  const { history = [], suggestions = [], context, cursor = false, ...container } = options;
  const children: SceneNode[] = [];
  if (context !== undefined) children.push(caption(`${id}-context`, context));
  if (history.length > 0) {
    children.push(
      terminal(
        `${id}-history`,
        history.map((line) => ({
          ...(typeof line === "string" ? { text: line, kind: "output" as const } : line),
          typing: false,
          cursor: false,
        })),
        {
          chrome: "plain",
          typing: false,
          density: "compact",
          padding: [6, 10],
          frame: { fill: "surfaceMuted", stroke: "none", radius: 0 },
        },
      ),
    );
  }
  if (suggestions.length > 0) {
    children.push(
      terminal(
        `${id}-suggestions`,
        suggestions.map((suggestion) => ({
          text: suggestion,
          kind: "output" as const,
          tone: "warning" as const,
          typing: false,
        })),
        {
          chrome: "plain",
          density: "compact",
          padding: [6, 10],
          frame: { fill: "surfaceMuted", stroke: "none", radius: 0 },
          label: "Command suggestions",
        },
      ),
    );
  }
  children.push(
    terminal(`${id}-input`, [{ text: command, kind: "output", typing: true, cursor }], {
      chrome: "plain",
      density: "compact",
      padding: [8, 10],
      wrap: "wrap",
      frame: { fill: "surfaceRaised", stroke: "border", radius: 0 },
      label: "Minecraft command input",
    }),
  );
  return stack(id, children, {
    ...container,
    gap: options.gap ?? 4,
    width: options.width ?? "fill",
    label: options.label ?? "Minecraft command",
    metadata: { ...options.metadata, minecraftRole: "command" },
  });
}

export interface TerminalPane {
  readonly id?: string;
  readonly title?: string;
  readonly cwd?: string;
  readonly lines: readonly (string | TerminalLine)[];
  readonly active?: boolean;
  readonly grow?: Responsive<number>;
  readonly options?: Omit<TerminalOptions, "title" | "cwd" | "chrome" | "width" | "grow" | "frame">;
}

export interface TerminalStatusBar {
  readonly left?: string;
  readonly center?: string;
  readonly right?: string;
  readonly tone?: Paint;
  readonly background?: FillPaint;
}

export interface TerminalWindowOptions extends ContainerOptions {
  readonly title?: string;
  readonly chrome?: TerminalOptions["chrome"];
  readonly chromeControls?: readonly Paint[];
  readonly chromeStart?: readonly TerminalChromeItem[];
  readonly chromeEnd?: readonly TerminalChromeItem[];
  readonly status?: TerminalStatus;
  readonly layout?: Responsive<"row" | "stack">;
  readonly paneGap?: Responsive<number>;
  readonly activeTone?: Paint;
  /** Defaults shared by every pane; a pane's own `options` take precedence. */
  readonly paneOptions?: Omit<
    TerminalOptions,
    "title" | "cwd" | "chrome" | "width" | "grow" | "frame" | "typingOrderOffset"
  >;
  /** A tmux-like footer; `false` leaves the window without a status line. */
  readonly statusBar?: TerminalStatusBar | false;
}

/**
 * A responsive terminal window with one or more independently titled panes. It is ordinary scene
 * composition, so pane text remains inspectable, typewritable, exportable, and themeable.
 */
export function terminalWindow(
  id: string,
  panes: readonly TerminalPane[],
  options: TerminalWindowOptions = {},
): GroupNode {
  if (panes.length === 0) throw new Error("terminalWindow: give at least one pane");
  const activeTone = options.activeTone ?? "accent";
  const paneNodes = panes.map((pane, index) => {
    const paneId = pane.id ?? `${id}-pane-${index + 1}`;
    const paneOptions = { ...options.paneOptions, ...pane.options };
    return terminal(paneId, pane.lines, {
      ...paneOptions,
      title: pane.title ?? `pane ${index + 1}`,
      ...(pane.cwd === undefined ? {} : { cwd: pane.cwd, cwdPosition: "header" }),
      chrome: "minimal",
      density: paneOptions.density ?? "compact",
      typingOrderOffset: index * 1_000_000 + (pane.options?.typingOrderOffset ?? 0),
      width: "fill",
      grow: pane.grow ?? 1,
      frame: {
        fill: "surface",
        stroke: pane.active === true ? activeTone : "border",
        radius: 5,
      },
      metadata: {
        ...paneOptions.metadata,
        terminalRole: "pane",
        paneIndex: index,
        active: pane.active ?? false,
      },
    });
  });
  const chrome = terminalChrome(id, {
    title: options.title ?? "Terminal workspace",
    chrome: options.chrome ?? "window",
    ...(options.chromeControls === undefined ? {} : { chromeControls: options.chromeControls }),
    ...(options.chromeStart === undefined ? {} : { chromeStart: options.chromeStart }),
    ...(options.chromeEnd === undefined ? {} : { chromeEnd: options.chromeEnd }),
    ...(options.status === undefined ? {} : { status: options.status }),
  });
  const content = container(
    `${id}-panes`,
    options.layout ?? { wide: "row", compact: "row", narrow: "stack" },
    paneNodes,
    {
      gap: options.paneGap ?? 1,
      width: "fill",
      align: "stretch",
      metadata: { terminalRole: "panes", paneCount: panes.length },
    },
  );
  const statusBar =
    options.statusBar === false || options.statusBar === undefined
      ? undefined
      : row(
          `${id}-status-bar`,
          [
            code(`${id}-status-left`, options.statusBar.left ?? "", {
              tone: options.statusBar.tone ?? "canvas",
              width: "fill",
            }),
            ...(options.statusBar.center === undefined
              ? []
              : [
                  code(`${id}-status-center`, options.statusBar.center, {
                    tone: options.statusBar.tone ?? "canvas",
                    align: "center",
                    hidden: { wide: false, compact: false, narrow: true },
                  }),
                ]),
            code(`${id}-status-right`, options.statusBar.right ?? "", {
              tone: options.statusBar.tone ?? "canvas",
              align: "end",
              width: "fill",
            }),
          ],
          {
            gap: 10,
            padding: [5, 8],
            width: "fill",
            align: "center",
            frame: {
              fill: options.statusBar.background ?? activeTone,
              stroke: "none",
              radius: 3,
            },
            metadata: { terminalRole: "statusBar" },
          },
        );
  const {
    title: _title,
    chrome: _chrome,
    chromeControls: _chromeControls,
    chromeStart: _chromeStart,
    chromeEnd: _chromeEnd,
    status: _status,
    layout: _layout,
    paneGap: _paneGap,
    activeTone: _activeTone,
    paneOptions: _paneOptions,
    statusBar: _statusBar,
    ...containerOptionsInput
  } = options;
  void _title;
  void _chrome;
  void _chromeControls;
  void _chromeStart;
  void _chromeEnd;
  void _status;
  void _layout;
  void _paneGap;
  void _activeTone;
  void _paneOptions;
  void _statusBar;
  return stack(id, [...chrome, content, ...(statusBar === undefined ? [] : [statusBar])], {
    ...containerOptions(containerOptionsInput),
    gap: options.gap ?? 7,
    padding: options.padding ?? { wide: 9, compact: 8, narrow: 6 },
    width: options.width ?? "fill",
    frame: options.frame ?? { fill: "surfaceRaised", stroke: "border", radius: 8 },
    label: options.label ?? options.title ?? "Terminal workspace",
    metadata: {
      ...options.metadata,
      terminalRole: "window",
      paneCount: panes.length,
    },
  });
}

export interface WorkspaceTab {
  readonly id?: string;
  readonly label: string;
  readonly icon?: string;
  readonly tone?: Paint;
  readonly active?: boolean;
  readonly interactive?: boolean;
  readonly onActivate?: string;
  readonly bind?: NodeBindings;
}

export interface WorkspacePane {
  readonly id?: string;
  readonly title?: string;
  readonly icon?: string;
  readonly content: SceneNode;
  readonly active?: boolean;
  readonly interactive?: boolean;
  readonly onActivate?: string;
  readonly bind?: NodeBindings;
  readonly grow?: Responsive<number>;
  readonly minWidth?: Responsive<number>;
  readonly hidden?: Responsive<boolean>;
  readonly tone?: Paint;
}

export interface PaneLayoutOptions extends ContainerOptions {
  readonly layout?: Responsive<"row" | "stack">;
  readonly paneGap?: Responsive<number>;
  readonly activeTone?: Paint;
  readonly headers?: boolean;
  readonly panePadding?: Responsive<Insets>;
  readonly paneFrame?: GroupNode["frame"];
}

/**
 * Responsive editor/inspector panes. Pane content remains an ordinary node, while selection and
 * activation can be wired directly to the scene state machine.
 */
export function paneLayout(
  id: string,
  panes: readonly WorkspacePane[],
  options: PaneLayoutOptions = {},
): GroupNode {
  if (panes.length === 0) throw new Error("paneLayout: give at least one pane");
  const activeTone = options.activeTone ?? "accent";
  const paneNodes = panes.map((pane, index) => {
    const paneId = pane.id ?? `${id}-pane-${index + 1}`;
    const header =
      options.headers === false || pane.title === undefined
        ? undefined
        : row(
            `${paneId}-header`,
            [
              ...(pane.icon === undefined
                ? []
                : [
                    motif(`${paneId}-icon`, pane.icon, {
                      tone: pane.tone ?? "textMuted",
                      size: 15,
                    }),
                  ]),
              code(`${paneId}-title`, pane.title, {
                tone: pane.active === true ? "text" : "textMuted",
                width: "fill",
              }),
              ...(pane.active === true
                ? [pill(`${paneId}-active`, "active", { tone: activeTone, variant: "outline" })]
                : []),
            ],
            {
              gap: 7,
              align: "center",
              width: "fill",
              padding: [6, 8],
              frame: { fill: "surfaceMuted", stroke: "none", radius: 4 },
              metadata: { workspaceRole: "paneHeader" },
            },
          );
    return stack(paneId, [...(header === undefined ? [] : [header]), pane.content], {
      gap: header === undefined ? 0 : 6,
      padding: options.panePadding ?? 6,
      width: "fill",
      grow: pane.grow ?? 1,
      ...(pane.minWidth === undefined ? {} : { minWidth: pane.minWidth }),
      ...(pane.hidden === undefined ? {} : { hidden: pane.hidden }),
      frame:
        options.paneFrame ??
        ({
          fill: "surface",
          stroke: pane.active === true ? activeTone : "border",
          radius: 5,
        } as const),
      interactive: pane.interactive ?? pane.onActivate !== undefined,
      ...(pane.onActivate === undefined ? {} : { onActivate: pane.onActivate }),
      ...(pane.bind === undefined ? {} : { bind: pane.bind }),
      clip: true,
      label: pane.title ?? `Pane ${index + 1}`,
      metadata: {
        workspaceRole: "pane",
        paneIndex: index,
        active: pane.active ?? false,
      },
    });
  });
  const {
    layout: _layout,
    paneGap: _paneGap,
    activeTone: _activeTone,
    headers: _headers,
    panePadding: _panePadding,
    paneFrame: _paneFrame,
    ...containerInput
  } = options;
  void _layout;
  void _paneGap;
  void _activeTone;
  void _headers;
  void _panePadding;
  void _paneFrame;
  return container(
    id,
    options.layout ?? { wide: "row", compact: "row", narrow: "stack" },
    paneNodes,
    {
      ...containerOptions(containerInput),
      gap: options.paneGap ?? 1,
      width: options.width ?? "fill",
      align: "stretch",
      metadata: { ...options.metadata, workspaceRole: "panes", paneCount: panes.length },
    },
  );
}

export interface WindowFrameOptions extends ContainerOptions {
  readonly title?: string;
  readonly icon?: string;
  readonly chrome?: "window" | "tab" | "minimal" | "plain";
  readonly chromeControls?: readonly Paint[];
  readonly chromeStart?: readonly TerminalChromeItem[];
  readonly chromeEnd?: readonly TerminalChromeItem[];
  readonly tabs?: readonly WorkspaceTab[];
  readonly activeTone?: Paint;
  readonly statusBar?: readonly TerminalChromeItem[] | false;
  readonly contentPadding?: Responsive<Insets>;
}

/** Generic portable application chrome for editors, browsers, inspectors, and terminals. */
export function windowFrame(
  id: string,
  content: SceneNode,
  options: WindowFrameOptions = {},
): GroupNode {
  const chromeStyle = options.chrome ?? "window";
  const activeTone = options.activeTone ?? "accent";
  const controls = row(
    `${id}-window-controls`,
    (options.chromeControls ?? (["textMuted", "textMuted", "textMuted"] as const)).map(
      (tone, index) => ({
        id: `${id}-window-control-${index + 1}`,
        type: "circle" as const,
        radius: 4,
        width: 8,
        height: 8,
        fill: tone,
        stroke: "none" as const,
      }),
    ),
    { gap: 6, align: "center" },
  );
  const start = (options.chromeStart ?? []).map((item, index) =>
    terminalChromeItemNode(`${id}-chrome-start-${index + 1}`, item, "textMuted"),
  );
  const end = (options.chromeEnd ?? []).map((item, index) =>
    terminalChromeItemNode(`${id}-chrome-end-${index + 1}`, item, "textMuted"),
  );
  const tabs = (options.tabs ?? []).map((tab, index) => {
    const tabId = tab.id ?? `${id}-tab-${index + 1}`;
    return row(
      tabId,
      [
        ...(tab.icon === undefined
          ? []
          : [motif(`${tabId}-icon`, tab.icon, { tone: tab.tone ?? "textMuted", size: 14 })]),
        code(`${tabId}-label`, tab.label, {
          tone: tab.active === true ? "text" : (tab.tone ?? "textMuted"),
        }),
      ],
      {
        gap: 6,
        padding: [5, 8],
        align: "center",
        frame: {
          fill: tab.active === true ? "surface" : "none",
          stroke: tab.active === true ? activeTone : "none",
          radius: 4,
        },
        interactive: tab.interactive ?? tab.onActivate !== undefined,
        ...(tab.onActivate === undefined ? {} : { onActivate: tab.onActivate }),
        ...(tab.bind === undefined ? {} : { bind: tab.bind }),
        label: tab.label,
        metadata: { workspaceRole: "tab", tabIndex: index, active: tab.active ?? false },
      },
    );
  });
  const header =
    chromeStyle === "plain"
      ? undefined
      : row(
          `${id}-chrome`,
          [
            ...(chromeStyle === "window" ? [controls] : []),
            ...(options.icon === undefined
              ? []
              : [motif(`${id}-icon`, options.icon, { tone: activeTone, size: 16 })]),
            ...start,
            code(`${id}-title`, options.title ?? "Workspace", {
              tone: chromeStyle === "minimal" ? "textMuted" : "text",
              ...(tabs.length === 0
                ? {}
                : { hidden: { wide: false, compact: false, narrow: true } }),
            }),
            ...(tabs.length === 0
              ? [
                  {
                    id: `${id}-chrome-space`,
                    type: "rect" as const,
                    width: 1,
                    height: 1,
                    grow: 1,
                    fill: "none" as const,
                    stroke: "none" as const,
                  },
                ]
              : [row(`${id}-tabs`, tabs, { gap: 4, align: "center", grow: 1, clip: true })]),
            ...end,
          ],
          {
            gap: 9,
            padding: chromeStyle === "minimal" ? [4, 6] : [6, 8],
            width: "fill",
            align: "center",
            clip: true,
            frame: { fill: "surfaceMuted", stroke: "none", radius: 5 },
            metadata: { workspaceRole: "chrome", chrome: chromeStyle },
          },
        );
  const status =
    options.statusBar === false || options.statusBar === undefined
      ? undefined
      : row(
          `${id}-status-bar`,
          options.statusBar.map((item, index) =>
            terminalChromeItemNode(`${id}-status-${index + 1}`, item, "textMuted"),
          ),
          {
            gap: 8,
            padding: [5, 8],
            width: "fill",
            frame: { fill: "surfaceMuted", stroke: "none", radius: 4 },
            metadata: { workspaceRole: "statusBar" },
          },
        );
  const {
    title: _title,
    icon: _icon,
    chrome: _chrome,
    chromeControls: _chromeControls,
    chromeStart: _chromeStart,
    chromeEnd: _chromeEnd,
    tabs: _tabs,
    activeTone: _activeTone,
    statusBar: _statusBar,
    contentPadding: _contentPadding,
    ...containerInput
  } = options;
  void _title;
  void _icon;
  void _chrome;
  void _chromeControls;
  void _chromeStart;
  void _chromeEnd;
  void _tabs;
  void _activeTone;
  void _statusBar;
  void _contentPadding;
  const body = stack(`${id}-body`, [content], {
    padding: options.contentPadding ?? 0,
    width: "fill",
    frame: { fill: "surface", stroke: "none", radius: 5 },
    metadata: { workspaceRole: "content" },
  });
  return stack(
    id,
    [...(header === undefined ? [] : [header]), body, ...(status === undefined ? [] : [status])],
    {
      ...containerOptions(containerInput),
      gap: options.gap ?? 5,
      padding: options.padding ?? { wide: 7, compact: 6, narrow: 5 },
      width: options.width ?? "fill",
      frame: options.frame ?? { fill: "surfaceRaised", stroke: "border", radius: 8 },
      label: options.label ?? options.title ?? "Application window",
      metadata: { ...options.metadata, workspaceRole: "window", chrome: chromeStyle },
    },
  );
}

export interface FileTreeEntry {
  readonly name: string;
  readonly kind?: "file" | "folder";
  readonly children?: readonly FileTreeEntry[];
  readonly detail?: string;
  readonly status?: string;
  readonly tone?: Paint;
  readonly statusTone?: Paint;
  /** Motif override. `false` removes the icon; files otherwise infer a compact type mark. */
  readonly icon?: string | false;
  /** Emphasises the current path without changing the underlying tree structure. */
  readonly selected?: boolean;
  readonly interactive?: boolean;
  readonly onActivate?: string;
  readonly description?: string;
  readonly inspect?: InspectInfo;
  readonly expanded?: boolean;
}

export interface FileTreeOptions extends ContainerOptions {
  readonly root?: string;
  readonly guides?: boolean;
  readonly density?: "compact" | "comfortable";
  /** `auto` uses compact extension marks, `generic` uses the file motif, and `none` hides icons. */
  readonly icons?: "auto" | "generic" | "none";
  readonly selectionTone?: FillPaint;
  /** Supplemental status pills hide on narrow panes by default; pass `false` to keep them. */
  readonly statusHidden?: Responsive<boolean>;
  /** Show a disclosure mark beside folders. */
  readonly disclosures?: boolean;
}

const FILE_TYPE_LABELS: Readonly<Record<string, string>> = {
  cast: "CAST",
  css: "CSS",
  env: "ENV",
  html: "HTML",
  js: "JS",
  jsx: "JSX",
  json: "JSON",
  md: "MD",
  mjs: "JS",
  png: "IMG",
  svg: "SVG",
  ts: "TS",
  tsx: "TSX",
  yaml: "YML",
  yml: "YML",
};

function fileTypeLabel(name: string): string | undefined {
  const base = name.toLowerCase();
  if (base === "dockerfile") return "DOCKER";
  if (base.startsWith(".")) return base.slice(1, 5).toUpperCase();
  const extension = base.includes(".") ? base.slice(base.lastIndexOf(".") + 1) : "";
  return (
    FILE_TYPE_LABELS[extension] ??
    (extension.length > 0 && extension.length <= 4 ? extension.toUpperCase() : undefined)
  );
}

function fileTreeIcon(
  path: string,
  entry: FileTreeEntry,
  folder: boolean,
  mode: NonNullable<FileTreeOptions["icons"]>,
  tone: Paint,
): SceneNode[] {
  if (entry.icon === false || mode === "none") return [];
  if (entry.icon !== undefined || folder || mode === "generic")
    return [motif(`${path}-icon`, entry.icon ?? (folder ? "folder" : "file"), { tone, size: 16 })];
  const label = fileTypeLabel(entry.name);
  if (label === undefined) return [motif(`${path}-icon`, "file", { tone, size: 16 })];
  return [
    row(`${path}-type`, [code(`${path}-type-label`, label, { tone, align: "center" })], {
      padding: [1, 4],
      frame: { fill: "none", stroke: tone, radius: 2 },
      align: "center",
      metadata: { fileTreeRole: "type", fileType: label },
    }),
  ];
}

/** A recursive, responsive directory tree with semantic icons, branch guides, and annotations. */
export function fileTree(
  id: string,
  entries: readonly FileTreeEntry[],
  options: FileTreeOptions = {},
): GroupNode {
  const gap = options.density === "compact" ? 4 : 7;
  const icons = options.icons ?? "auto";
  const selectionTone = options.selectionTone ?? "surfaceMuted";
  const branch = (entry: FileTreeEntry, path: string, depth: number): GroupNode => {
    const folder = entry.kind === "folder" || entry.children !== undefined;
    const tone = entry.tone ?? (folder ? "accent" : "textMuted");
    const expanded = entry.expanded !== false;
    const selected = entry.selected ?? false;
    const label = row(
      `${path}-label`,
      [
        ...(depth > 0 && options.guides !== false
          ? [
              {
                id: `${path}-branch`,
                type: "rect" as const,
                width: 9,
                height: 1,
                fill: "border" as const,
                stroke: "none" as const,
                radius: 0,
              },
            ]
          : []),
        ...(options.disclosures === false
          ? []
          : folder
            ? [
                code(`${path}-disclosure`, expanded ? "−" : "+", {
                  tone: "textMuted",
                  align: "center",
                  width: 12,
                }),
              ]
            : [
                {
                  id: `${path}-disclosure-space`,
                  type: "rect" as const,
                  width: 12,
                  height: 1,
                  fill: "none" as const,
                  stroke: "none" as const,
                  radius: 0,
                },
              ]),
        ...fileTreeIcon(path, entry, folder, icons, tone),
        code(`${path}-name`, entry.name, { tone: folder ? "text" : tone }),
        ...(entry.detail === undefined
          ? []
          : [caption(`${path}-detail`, entry.detail, { tone: "textMuted", width: "fill" })]),
        ...(entry.status === undefined
          ? []
          : [
              pill(`${path}-status`, entry.status, {
                tone: entry.statusTone ?? tone,
                variant: "outline",
                hidden: options.statusHidden ?? { wide: false, compact: false, narrow: true },
              }),
            ]),
      ],
      {
        gap: 8,
        padding: selected ? [5, 7] : [3, 7],
        align: "center",
        width: "fill",
        ...(selected
          ? { frame: { fill: selectionTone, stroke: tone, strokeWidth: 1, radius: 3 } }
          : {}),
        interactive: entry.interactive ?? entry.onActivate !== undefined,
        ...(entry.onActivate === undefined ? {} : { onActivate: entry.onActivate }),
        ...(entry.description === undefined && entry.detail === undefined
          ? {}
          : { description: entry.description ?? entry.detail }),
        ...(entry.inspect === undefined ? {} : { inspect: entry.inspect }),
        metadata: {
          fileTreeRole: folder ? "folder" : "file",
          depth,
          selected,
          ...(folder ? { expanded } : {}),
          fileType: folder ? "folder" : (fileTypeLabel(entry.name) ?? "file"),
        },
      },
    );
    const children = expanded ? (entry.children ?? []) : [];
    if (children.length === 0) return label;
    const nestedRows = stack(
      `${path}-children-list`,
      children.map((child, index) => branch(child, `${path}-${index + 1}`, depth + 1)),
      { gap, width: "fill" },
    );
    const nested = row(
      `${path}-children`,
      [
        ...(options.guides === false
          ? []
          : [
              {
                id: `${path}-guide`,
                type: "rect" as const,
                width: 1,
                height: "fill" as const,
                fill: "border" as const,
                stroke: "none" as const,
                radius: 0,
              },
            ]),
        nestedRows,
      ],
      {
        gap: options.guides === false ? 0 : 14,
        padding: [0, 0, 0, options.guides === false ? 18 : 7],
        align: "stretch",
        width: "fill",
        metadata: { fileTreeRole: "children", depth: depth + 1 },
      },
    );
    return stack(path, [label, nested], { gap, width: "fill" });
  };

  const content = entries.map((entry, index) => branch(entry, `${id}-entry-${index + 1}`, 0));
  const rootLabel =
    options.root === undefined
      ? []
      : [
          row(
            `${id}-root-label`,
            [
              motif(`${id}-root-icon`, "folder", { tone: "accent", size: 18 }),
              heading(`${id}-root-name`, options.root),
            ],
            { gap: 9, align: "center", width: "fill" },
          ),
          rule(`${id}-root-rule`),
        ];
  const {
    root: _root,
    guides: _guides,
    density: _density,
    icons: _icons,
    selectionTone: _selectionTone,
    statusHidden: _statusHidden,
    disclosures: _disclosures,
    ...container
  } = options;
  void _root;
  void _guides;
  void _density;
  void _icons;
  void _selectionTone;
  void _statusHidden;
  void _disclosures;
  return stack(id, [...rootLabel, ...content], {
    gap,
    padding: options.padding ?? 14,
    width: options.width ?? "fill",
    frame: options.frame ?? { fill: "surface", stroke: "border" },
    label:
      options.label ??
      (options.root === undefined ? "File structure" : `${options.root} file structure`),
    metadata: { ...options.metadata, fileTreeRole: "tree" },
    ...containerOptions(container, ["padding", "width", "frame", "label", "metadata"]),
  });
}
