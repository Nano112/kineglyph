/**
 * Deterministic layout resolver for the general scene schema.
 *
 * Widths flow top-down (rows allocate space by min/preferred/max/grow water-filling), heights
 * flow bottom-up (text wraps at its resolved width), then positions are assigned top-down.
 * Equal inputs produce byte-equivalent geometry; nothing here reads the DOM.
 */
import { minimumConnectorRun } from "./connector.js";
import { assignPorts, packetPositions, resolveEdge, type EdgeNodeBox } from "./edges.js";
import { rectsIntersect } from "./geometry.js";
import {
  createMachineState,
  evaluateSignals,
  validateStateMachine,
  type MachineState,
  type Variables,
  type VariableValue,
} from "./machine.js";
import {
  resolvePipeline,
  type PipelineDefinition,
  type ResolvePipelineOptions,
} from "./pipeline.js";
import type {
  ResolvedEdge,
  ResolvedLegendItem,
  ResolvedMaterialDefinition,
  ResolvedNode,
  ResolvedNodeAppearance,
  ResolvedScene,
  ResolvedText,
} from "./resolved.js";
import type { Point, Rect, SemanticTextStyle } from "./schema.js";
import {
  defineScene,
  endpointNode,
  pick,
  pickOr,
  type Align,
  type Anchor,
  type GroupLayout,
  type FillPaint,
  type Insets,
  type Justify,
  type LayoutName,
  type Length,
  type Paint,
  type SceneDefinition,
  type SceneDiagnostic,
  type SceneNode,
  type SceneNodeType,
} from "./scene.js";
import { measureText, wrapText, type TextFont, type TextLine, type TextMeasurer } from "./text.js";
import {
  defaultTheme,
  paintColor,
  projectTheme,
  resolveFillPaint,
  resolveMaterial,
  withAlpha,
  type ThemeTokens,
} from "./theme.js";

export interface ResolveSceneOptions {
  readonly width: number;
  readonly layout?: LayoutName | "auto";
  readonly theme?: ThemeTokens;
  readonly machineState?: MachineState;
  /** Extra or overriding signal values, useful for tests and export snapshots. */
  readonly signals?: Readonly<Record<string, VariableValue>>;
  /**
   * Host-side derived signals: called with the machine's variables (the resolved state's, or
   * the machine's initial ones) and merged before `signals`. Mirrors the mount option in
   * `@kineglyph/web` so exports and tests can resolve a parametric figure at any control value.
   */
  readonly deriveSignals?: (
    variables: Variables,
    signals: Readonly<Record<string, VariableValue>>,
  ) => Readonly<Record<string, VariableValue>>;
  readonly precision?: number;
  /** Embedded-font shaper used for exact text widths and line breaks. */
  readonly textMeasurer?: TextMeasurer;
}

const DEFAULT_BREAKPOINTS = { wide: 900, compact: 560 } as const;

/** Chooses the named layout for a container width. */
export function chooseLayout(
  width: number,
  breakpoints: SceneDefinition["breakpoints"] | undefined,
  requested: LayoutName | "auto" = "auto",
): LayoutName {
  if (requested !== "auto") return requested;
  const wide = breakpoints?.wide ?? DEFAULT_BREAKPOINTS.wide;
  const compact = breakpoints?.compact ?? DEFAULT_BREAKPOINTS.compact;
  if (width >= wide) return "wide";
  if (width >= compact) return "compact";
  return "narrow";
}

// ---------------------------------------------------------------------------------------------
// Effective views (responsive picks + bindings applied)
// ---------------------------------------------------------------------------------------------

interface Insets4 {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
}

interface View {
  readonly node: SceneNode;
  readonly id: string;
  readonly type: SceneNodeType;
  readonly hidden: boolean;
  readonly width: Length | undefined;
  readonly height: Length | undefined;
  readonly minWidth: number;
  readonly maxWidth: number;
  readonly minHeight: number;
  readonly grow: number;
  readonly alignSelf: Align | undefined;
  readonly justifySelf: Align | undefined;
  readonly position:
    { readonly x: number; readonly y: number; readonly anchor: Anchor } | undefined;
  readonly z: number;
  readonly opacity: number;
  readonly rotation: number;
  readonly highlight: number;
  readonly progress: number;
  readonly ports: NonNullable<EdgeNodeBox["ports"]>;
  readonly tone: Paint | undefined;
  readonly text: string | undefined;
  readonly pathData: string | undefined;
  readonly description: string | undefined;
  readonly font: TextFont | undefined;
  readonly textColor: string;
  readonly textAlign: "start" | "center" | "end";
  readonly transform: "none" | "uppercase";
  readonly maxLines: number;
  readonly textMeasurer: TextMeasurer | undefined;
  // group
  readonly layout: GroupLayout;
  readonly gap: number;
  readonly padding: Insets4;
  readonly align: Align | undefined;
  readonly justify: Justify;
  readonly columns: number | "auto";
  readonly children: readonly View[];
  // marks
  readonly iconSize: number;
  readonly circleRadius: number;
  readonly pointer: "none" | "up" | "down" | "left" | "right";
  readonly legendDirection: "row" | "column";
}

interface PlacedLegendItem {
  readonly item: {
    readonly id: string;
    readonly label: string;
    readonly swatch: Paint;
    readonly shape: "square" | "circle" | "line" | "dashed";
  };
  readonly box: Rect;
}

interface Placed {
  readonly view: View;
  x: number;
  y: number;
  width: number;
  height: number;
  readonly children: Placed[];
  lines?: readonly TextLine[];
  truncated?: boolean;
  legendItems?: PlacedLegendItem[];
  calloutBody?: Rect;
  calloutTip?: Point;
  overflowX?: boolean;
  overflowY?: boolean;
}

function insets(value: Insets | undefined, fallback: number): Insets4 {
  if (value === undefined)
    return { top: fallback, right: fallback, bottom: fallback, left: fallback };
  if (typeof value === "number") return { top: value, right: value, bottom: value, left: value };
  if (value.length === 2)
    return { top: value[0], right: value[1], bottom: value[0], left: value[1] };
  return { top: value[0], right: value[1], bottom: value[2], left: value[3] };
}

function fontFor(style: SemanticTextStyle, theme: ThemeTokens): TextFont {
  const token = theme.typography[style];
  return {
    family: token.family,
    size: token.size,
    weight: token.weight,
    lineHeight: token.lineHeight,
    ...(token.letterSpacing === undefined ? {} : { letterSpacing: token.letterSpacing }),
  };
}

function truthy(value: VariableValue | undefined): boolean {
  return value !== undefined && value !== null && value !== false && value !== 0 && value !== "";
}

function numeric(value: VariableValue | undefined): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function unit(value: number | undefined, fallback: number): number {
  return value === undefined ? fallback : Math.min(1, Math.max(0, value));
}

const DEFAULT_ANCHOR: Anchor = "top-left";

function buildView(
  node: SceneNode,
  layout: LayoutName,
  theme: ThemeTokens,
  signals: Readonly<Record<string, VariableValue>>,
  parentZ: number,
  textMeasurer?: TextMeasurer,
): View {
  const bind = node.bind ?? {};
  const signal = (key: string | undefined): VariableValue | undefined =>
    key === undefined ? undefined : signals[key];
  const hidden =
    bind.hidden !== undefined ? truthy(signal(bind.hidden)) : pickOr(node.hidden, layout, false);
  const boundWidth = numeric(signal(bind.width));
  const boundHeight = numeric(signal(bind.height));
  // Rects, polylines, and coordinate spaces have no natural width: they fill unless sized.
  const width =
    boundWidth ??
    pick(node.width, layout) ??
    (node.type === "rect" ||
    node.type === "polyline" ||
    (node.type === "group" && node.layout === "coordinates")
      ? "fill"
      : undefined);
  const height = boundHeight ?? pick(node.height, layout);
  const boundText = bind.text === undefined ? undefined : signal(bind.text);
  const boundPath = bind.path === undefined ? undefined : signal(bind.path);
  const boundTone = bind.tone === undefined ? undefined : signal(bind.tone);
  const boundDescription = bind.description === undefined ? undefined : signal(bind.description);
  const z = node.z ?? parentZ;
  const isGroup = node.type === "group";
  const positionRaw = pick(node.position, layout);
  const position =
    positionRaw === undefined
      ? undefined
      : { x: positionRaw.x, y: positionRaw.y, anchor: positionRaw.anchor ?? DEFAULT_ANCHOR };

  let text: string | undefined;
  let font: TextFont | undefined;
  let textColor = theme.colors.text;
  let textAlign: "start" | "center" | "end" = "start";
  let transform: "none" | "uppercase" = "none";
  let maxLines = Number.POSITIVE_INFINITY;
  let tone: Paint | undefined;
  let iconSize = 24;
  let circleRadius = 12;
  let pointer: View["pointer"] = "none";
  let legendDirection: "row" | "column" = "row";

  if (typeof boundTone === "string" && boundTone.length > 0) tone = boundTone as Paint;

  switch (node.type) {
    case "text": {
      const style = pickOr(node.textStyle, layout, "body");
      font = fontFor(style, theme);
      text =
        typeof boundText === "string"
          ? boundText
          : boundText === undefined || boundText === null
            ? node.text
            : String(boundText);
      const defaultColor =
        style === "label" || style === "caption" ? theme.colors.textMuted : theme.colors.text;
      textColor = paintColor(node.color, theme, "text", defaultColor);
      textAlign = pickOr(node.align, layout, "start");
      transform =
        node.transform ??
        (style === "label" && theme.ornament.eyebrow === true ? "uppercase" : "none");
      maxLines = node.wrap === false ? 1 : pickOr(node.maxLines, layout, Number.POSITIVE_INFINITY);
      break;
    }
    case "badge": {
      const style = pickOr(node.textStyle, layout, "label");
      font = fontFor(style, theme);
      text = typeof boundText === "string" ? boundText : node.text;
      tone ??= node.tone ?? "accent";
      transform = style === "label" && theme.ornament.eyebrow === true ? "uppercase" : "none";
      maxLines = 1;
      break;
    }
    case "callout": {
      const style = pickOr(node.textStyle, layout, "caption");
      font = fontFor(style, theme);
      text = typeof boundText === "string" ? boundText : node.text;
      tone ??= node.tone ?? "accent";
      textColor = theme.colors.text;
      pointer = pickOr(node.pointer, layout, "none");
      maxLines = pickOr(node.maxLines, layout, 4);
      break;
    }
    case "legend": {
      const style = pickOr(node.textStyle, layout, "caption");
      font = fontFor(style, theme);
      textColor = theme.colors.textMuted;
      legendDirection = pickOr(node.direction, layout, "row");
      break;
    }
    case "icon":
      iconSize = pickOr(node.size, layout, 24);
      tone ??= node.tone ?? "accent";
      break;
    case "circle":
      circleRadius = pickOr(node.radius, layout, 12);
      break;
    default:
      break;
  }

  const description = typeof boundDescription === "string" ? boundDescription : node.description;

  return {
    node,
    id: node.id,
    type: node.type,
    hidden,
    width,
    height,
    minWidth: pickOr(node.minWidth, layout, 0),
    maxWidth: pickOr(node.maxWidth, layout, Number.POSITIVE_INFINITY),
    minHeight: pickOr(node.minHeight, layout, 0),
    grow: pickOr(node.grow, layout, 0),
    alignSelf: pick(node.alignSelf, layout),
    justifySelf: pick(node.justifySelf, layout),
    position,
    z,
    opacity:
      bind.opacity !== undefined ? unit(numeric(signal(bind.opacity)), 1) : (node.opacity ?? 1),
    rotation: pickOr(node.rotation, layout, 0),
    highlight:
      bind.highlight !== undefined
        ? unit(numeric(signal(bind.highlight)) ?? (truthy(signal(bind.highlight)) ? 1 : 0), 0)
        : 0,
    progress: bind.progress !== undefined ? unit(numeric(signal(bind.progress)), 1) : 1,
    ports: Object.fromEntries(
      (node.ports ?? []).map((port) => [
        port.id,
        {
          side: pickOr(port.side, layout, "center"),
          offset: unit(pick(port.offset, layout), 0.5),
          ...(port.gap === undefined ? {} : { gap: port.gap }),
        },
      ]),
    ),
    tone,
    text,
    pathData: typeof boundPath === "string" ? boundPath : undefined,
    description,
    font,
    textColor,
    textAlign,
    transform,
    maxLines,
    textMeasurer,
    layout: isGroup ? pickOr(node.layout, layout, "stack") : "stack",
    gap: isGroup ? pickOr(node.gap, layout, theme.spacing.sm) : 0,
    padding: isGroup ? insets(pick(node.padding, layout), 0) : insets(undefined, 0),
    align: isGroup ? pick(node.align, layout) : undefined,
    justify: isGroup ? pickOr(node.justify, layout, "start") : "start",
    columns: isGroup
      ? (() => {
          const columns = pickOr<number | "auto">(node.columns, layout, 2);
          return columns === "auto" ? columns : Math.max(1, Math.floor(columns));
        })()
      : 1,
    children: isGroup
      ? node.children.map((child) => buildView(child, layout, theme, signals, z, textMeasurer))
      : [],
    iconSize,
    circleRadius,
    pointer,
    legendDirection,
  };
}

// ---------------------------------------------------------------------------------------------
// Measurement
// ---------------------------------------------------------------------------------------------

const BADGE_PAD_X = 10;
const BADGE_PAD_Y = 4;
const CALLOUT_POINTER = 8;
const LEGEND_SWATCH = 12;
const LEGEND_SWATCH_GAP = 7;
const LEGEND_ITEM_GAP = 16;

function displayText(view: View): string {
  const text = view.text ?? "";
  return view.transform === "uppercase" ? text.toUpperCase() : text;
}

function calloutPadding(view: View): Insets4 {
  const node = view.node;
  return node.type === "callout" ? insets(pick(node.padding, "wide"), 0) : insets(undefined, 0);
}

function visibleChildren(view: View): readonly View[] {
  return view.children.filter((child) => !child.hidden);
}

/** Natural, unwrapped width of a node. */
function intrinsicWidth(view: View, layout: LayoutName): number {
  if (typeof view.width === "number") return view.width;
  switch (view.type) {
    case "text":
      return view.font === undefined
        ? 0
        : longestLineWidth(displayText(view), view.font, view.textMeasurer);
    case "badge":
      return (
        (view.font === undefined
          ? 0
          : measureText(displayText(view), view.font, view.textMeasurer)) +
        BADGE_PAD_X * 2
      );
    case "callout": {
      const pad = calloutPaddingResolved(view);
      const pointerX = view.pointer === "left" || view.pointer === "right" ? CALLOUT_POINTER : 0;
      return (
        (view.font === undefined
          ? 0
          : longestLineWidth(displayText(view), view.font, view.textMeasurer)) +
        pad.left +
        pad.right +
        pointerX
      );
    }
    case "icon":
      return view.iconSize;
    case "circle":
      return view.circleRadius * 2;
    case "path": {
      const node = view.node;
      if (node.type !== "path") return 0;
      if (typeof view.height === "number")
        return (view.height * node.viewBox.width) / node.viewBox.height;
      return node.viewBox.width;
    }
    case "image":
      return typeof view.height === "number" ? view.height * 1.6 : 160;
    case "rect":
    case "polyline":
      return Math.max(view.minWidth, 0);
    case "legend": {
      const node = view.node;
      if (node.type !== "legend" || view.font === undefined) return 0;
      const widths = node.items.map(
        (item) =>
          LEGEND_SWATCH +
          LEGEND_SWATCH_GAP +
          measureText(item.label, view.font ?? fallbackFont, view.textMeasurer),
      );
      const gap = pickOr(node.gap, layout, LEGEND_ITEM_GAP);
      return view.legendDirection === "row"
        ? widths.reduce((sum, width) => sum + width, 0) + gap * Math.max(0, widths.length - 1)
        : Math.max(0, ...widths);
    }
    case "group": {
      const children = visibleChildren(view);
      const pad = view.padding.left + view.padding.right;
      switch (view.layout) {
        case "row":
          return (
            children.reduce(
              (sum, child) => sum + Math.max(intrinsicWidth(child, layout), child.minWidth),
              0,
            ) +
            view.gap * Math.max(0, children.length - 1) +
            pad
          );
        case "grid": {
          const columns = view.columns === "auto" ? Math.max(1, children.length) : view.columns;
          const widest = Math.max(
            0,
            ...children.map((child) => Math.max(intrinsicWidth(child, layout), child.minWidth)),
          );
          return widest * columns + view.gap * (columns - 1) + pad;
        }
        case "absolute":
          return (
            Math.max(
              0,
              ...children.map(
                (child) =>
                  (child.position?.x ?? 0) +
                  Math.max(intrinsicWidth(child, layout), child.minWidth),
              ),
            ) + pad
          );
        default:
          return (
            Math.max(
              0,
              ...children.map((child) => Math.max(intrinsicWidth(child, layout), child.minWidth)),
            ) + pad
          );
      }
    }
  }
}

const fallbackFont: TextFont = { family: "sans-serif", size: 12, weight: 400, lineHeight: 16 };

function longestLineWidth(text: string, font: TextFont, measurer?: TextMeasurer): number {
  // Authored whitespace is significant for code, terminals, and other monospace surfaces. Recipes
  // may split one line into independently coloured text nodes, so trimming here would collapse a
  // whitespace-only token to zero width and make adjacent syntax tokens run together.
  return Math.max(0, ...text.split(/\n/).map((line) => measureText(line, font, measurer)));
}

function longestWordWidth(text: string, font: TextFont, measurer?: TextMeasurer): number {
  return Math.max(0, ...text.split(/\s+/).map((word) => measureText(word, font, measurer)));
}

/** Smallest width a node can be squeezed to before its content must overflow. */
function minContentWidth(view: View, layout: LayoutName): number {
  if (typeof view.width === "number") return view.width;
  switch (view.type) {
    case "text":
      return Math.max(
        view.minWidth,
        view.font === undefined
          ? 0
          : Math.min(
              longestWordWidth(displayText(view), view.font, view.textMeasurer),
              intrinsicWidth(view, layout),
            ),
      );
    case "badge":
    case "icon":
    case "circle":
    case "legend":
      return Math.max(
        view.minWidth,
        view.type === "legend"
          ? Math.min(intrinsicWidth(view, layout), 96)
          : intrinsicWidth(view, layout),
      );
    case "callout": {
      const pad = calloutPaddingResolved(view);
      const pointerX = view.pointer === "left" || view.pointer === "right" ? CALLOUT_POINTER : 0;
      return Math.max(
        view.minWidth,
        (view.font === undefined
          ? 0
          : longestWordWidth(displayText(view), view.font, view.textMeasurer)) +
          pad.left +
          pad.right +
          pointerX,
      );
    }
    case "path":
    case "image":
      return Math.max(view.minWidth, Math.min(intrinsicWidth(view, layout), 48));
    case "rect":
    case "polyline":
      return view.minWidth;
    case "group": {
      const children = visibleChildren(view);
      const pad = view.padding.left + view.padding.right;
      switch (view.layout) {
        case "row":
          return Math.max(
            view.minWidth,
            children.reduce((sum, child) => sum + minContentWidth(child, layout), 0) +
              view.gap * Math.max(0, children.length - 1) +
              pad,
          );
        case "grid": {
          const widest = Math.max(0, ...children.map((child) => minContentWidth(child, layout)));
          const columns = view.columns === "auto" ? 1 : view.columns;
          return Math.max(view.minWidth, widest * columns + view.gap * (columns - 1) + pad);
        }
        case "absolute":
          return Math.max(
            view.minWidth,
            Math.max(
              0,
              ...children.map((child) => (child.position?.x ?? 0) + minContentWidth(child, layout)),
            ) + pad,
          );
        default:
          return Math.max(
            view.minWidth,
            Math.max(0, ...children.map((child) => minContentWidth(child, layout))) + pad,
          );
      }
    }
  }
}

function calloutPaddingResolved(view: View): Insets4 {
  const explicit = calloutPadding(view);
  const node = view.node;
  if (node.type === "callout" && node.padding !== undefined) return explicit;
  return { top: 8, right: 12, bottom: 8, left: 12 };
}

// ---------------------------------------------------------------------------------------------
// Width allocation (deterministic capped water-filling)
// ---------------------------------------------------------------------------------------------

interface FlexItem {
  /** Hypothetical main size before free space is distributed (flex-basis). */
  readonly basis: number;
  readonly min: number;
  readonly max: number;
  readonly grow: number;
  readonly shrink: number;
}

/**
 * Deterministic flexible allocation: free space is distributed by grow weights (or removed by
 * shrink weights scaled by basis), items violating their min/max are frozen, and the remainder
 * is redistributed until stable. Input order is the tie-breaker.
 */
function allocateFlex(items: readonly FlexItem[], available: number): number[] {
  const clampItem = (item: FlexItem, size: number): number =>
    Math.min(item.max, Math.max(item.min, size));
  const sizes = items.map((item) => clampItem(item, item.basis));
  // Items that can neither grow nor shrink are frozen at their clamped basis from the start.
  const frozen = items.map((item) => item.grow <= 0 && item.shrink <= 0);
  for (let guard = 0; guard < 64; guard += 1) {
    // Every unfrozen item restarts from its basis; free space is measured against frozen sizes
    // and unfrozen bases, so freezing one item redistributes its share instead of shrinking others.
    let used = 0;
    items.forEach((item, index) => {
      used += frozen[index] ? (sizes[index] ?? 0) : item.basis;
    });
    const free = available - used;
    const growing = free > 0;
    const active = items
      .map((item, index) => ({ item, index }))
      .filter(({ item, index }) => !frozen[index] && (growing ? item.grow > 0 : item.shrink > 0));
    if (active.length === 0 || Math.abs(free) < 1e-6) {
      items.forEach((item, index) => {
        if (!frozen[index]) sizes[index] = clampItem(item, item.basis);
      });
      break;
    }
    const weightOf = (item: FlexItem): number =>
      growing ? item.grow : item.shrink * Math.max(item.basis, 1e-6);
    const totalWeight = active.reduce((sum, { item }) => sum + weightOf(item), 0);
    if (totalWeight <= 0) break;
    let violated = false;
    for (const { item, index } of active) {
      const proposed = item.basis + free * (weightOf(item) / totalWeight);
      const clamped = clampItem(item, proposed);
      sizes[index] = clamped;
      if (Math.abs(clamped - proposed) > 1e-9) {
        frozen[index] = true;
        violated = true;
      }
    }
    // Unfrozen items that could not participate in this direction keep their clamped basis.
    items.forEach((item, index) => {
      if (!frozen[index] && !active.some((entry) => entry.index === index))
        sizes[index] = clampItem(item, item.basis);
    });
    if (!violated) break;
  }
  return sizes.map((size, index) => {
    const item = items[index];
    return item === undefined ? size : clampItem(item, size);
  });
}

// ---------------------------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------------------------

interface LayoutContext {
  readonly layout: LayoutName;
  readonly theme: ThemeTokens;
  readonly diagnostics: SceneDiagnostic[];
  readonly signals: Readonly<Record<string, VariableValue>>;
  readonly textMeasurer?: TextMeasurer;
}

/** Fraction encoded as a percent length ("25%"), or undefined for other lengths. */
function percentFraction(value: Length | undefined): number | undefined {
  if (typeof value !== "string" || !value.endsWith("%")) return undefined;
  const parsed = Number(value.slice(0, -1));
  return Number.isFinite(parsed) ? Math.max(0, parsed / 100) : undefined;
}

/** Percent heights resolve against the parent's known inner height; otherwise they hug. */
function percentHeightBasis(child: View, innerHeight: number | undefined): number | undefined {
  return percentFraction(child.height) !== undefined ? innerHeight : undefined;
}

function resolveChildWidth(
  child: View,
  available: number,
  stretch: boolean,
  context: LayoutContext,
): number {
  if (typeof child.width === "number") return clampWidth(child, child.width);
  const percent = percentFraction(child.width);
  if (percent !== undefined) return clampWidth(child, Math.max(0, available) * percent);
  if (child.width === "fill" || stretch) return clampWidth(child, Math.max(0, available));
  return clampWidth(
    child,
    Math.min(
      Math.max(0, available),
      Math.max(intrinsicWidth(child, context.layout), child.minWidth),
    ),
  );
}

function clampWidth(view: View, width: number): number {
  return Math.min(view.maxWidth, Math.max(view.minWidth, width));
}

/**
 * What a child does with the cross axis of the row or column it sits in, when nobody said.
 *
 * **A row is a band and a column is a stack of bands.** Two cards side by side are read as one
 * band across the figure, so they are the same height and their centre lines agree; the moment one
 * card carries an extra line of body copy and the other does not, sizing each to its own content
 * makes the band ragged and — because a connector anchors at the middle of a side — tilts every
 * arrow between them. A row of boxes that lines up is the common case, so it is the default.
 *
 * The default applies to *containers* only. A leaf mark keeps its own size, because for a dot, a
 * rule, a pill or a piece of text the size **is** the content, not the slot it was given: stretching
 * a badge across its row would draw a pill the width of the figure and mean something else entirely.
 *
 * Authors opt out per container with `align` and per child with `alignSelf`, either of which may be
 * `"start"`, `"center"`, `"end"` or `"stretch"` — a deliberately ragged row is still one word away.
 */
function crossAlign(child: View, parentAlign: Align | undefined): Align {
  return child.alignSelf ?? parentAlign ?? (child.type === "group" ? "stretch" : "start");
}

function stretchHeight(child: View, parentAlign: Align | undefined): boolean {
  return child.height === "fill" || crossAlign(child, parentAlign) === "stretch";
}

/** Lays out a node into a Placed tree with positions relative to the node's own origin. */
function layoutNode(
  view: View,
  width: number,
  availableHeight: number | undefined,
  context: LayoutContext,
  /** True when a parent stretches this child (align: "stretch"): adopt the available height. */
  stretch = false,
): Placed {
  if (view.node.type === "group" && view.node.breakpoints !== undefined) {
    const localLayout = chooseLayout(width, view.node.breakpoints);
    if (localLayout !== context.layout) {
      view = buildView(
        view.node,
        localLayout,
        context.theme,
        context.signals,
        view.z,
        context.textMeasurer,
      );
      context = { ...context, layout: localLayout };
    }
  }
  const placed: Placed = { view, x: 0, y: 0, width, height: 0, children: [] };
  const heightPercent = percentFraction(view.height);
  const fixedHeight =
    typeof view.height === "number"
      ? view.height
      : heightPercent !== undefined && availableHeight !== undefined
        ? availableHeight * heightPercent
        : undefined;
  const fillHeight =
    (view.height === "fill" || stretch) && availableHeight !== undefined
      ? availableHeight
      : undefined;
  switch (view.type) {
    case "text": {
      const font = view.font ?? fallbackFont;
      const maxLines =
        fixedHeight === undefined
          ? view.maxLines
          : Math.max(1, Math.min(view.maxLines, Math.floor(fixedHeight / font.lineHeight)));
      const paragraphs = displayText(view).split(/\n/);
      const lines: TextLine[] = [];
      let truncated = false;
      for (const paragraph of paragraphs) {
        const remaining = maxLines - lines.length;
        if (remaining <= 0) {
          truncated = true;
          break;
        }
        const wrapped = wrapText(paragraph, width, font, {
          maxLines: remaining,
          ...(view.textMeasurer === undefined ? {} : { measurer: view.textMeasurer }),
        });
        lines.push(...wrapped);
        if (wrapped.some((line) => line.text.endsWith("…"))) truncated = true;
      }
      placed.lines = lines;
      placed.truncated = truncated;
      placed.height =
        fixedHeight ?? fillHeight ?? Math.max(view.minHeight, lines.length * font.lineHeight);
      break;
    }
    case "badge": {
      const font = view.font ?? fallbackFont;
      const lines = wrapText(displayText(view), Math.max(1, width - BADGE_PAD_X * 2), font, {
        maxLines: 1,
        ...(view.textMeasurer === undefined ? {} : { measurer: view.textMeasurer }),
      });
      placed.lines = lines;
      placed.truncated = lines.some((line) => line.text.endsWith("…"));
      placed.height = fixedHeight ?? Math.max(view.minHeight, font.lineHeight + BADGE_PAD_Y * 2);
      break;
    }
    case "callout": {
      const font = view.font ?? fallbackFont;
      const pad = calloutPaddingResolved(view);
      const pointerX = view.pointer === "left" || view.pointer === "right" ? CALLOUT_POINTER : 0;
      const pointerY = view.pointer === "up" || view.pointer === "down" ? CALLOUT_POINTER : 0;
      const textWidth = Math.max(1, width - pad.left - pad.right - pointerX);
      const lines = wrapText(displayText(view), textWidth, font, {
        maxLines: view.maxLines,
        ...(view.textMeasurer === undefined ? {} : { measurer: view.textMeasurer }),
      });
      placed.lines = lines;
      placed.truncated = lines.some((line) => line.text.endsWith("…"));
      const bodyHeight = lines.length * font.lineHeight + pad.top + pad.bottom;
      placed.height = fixedHeight ?? Math.max(view.minHeight, bodyHeight + pointerY);
      const body = {
        x: view.pointer === "left" ? CALLOUT_POINTER : 0,
        y: view.pointer === "up" ? CALLOUT_POINTER : 0,
        width: width - pointerX,
        height: placed.height - pointerY,
      };
      placed.calloutBody = body;
      placed.calloutTip =
        view.pointer === "up"
          ? { x: body.x + Math.min(24, body.width / 2), y: 0 }
          : view.pointer === "down"
            ? { x: body.x + Math.min(24, body.width / 2), y: placed.height }
            : view.pointer === "left"
              ? { x: 0, y: body.y + Math.min(18, body.height / 2) }
              : view.pointer === "right"
                ? { x: width, y: body.y + Math.min(18, body.height / 2) }
                : { x: body.x, y: body.y };
      break;
    }
    case "legend": {
      const node = view.node;
      const font = view.font ?? fallbackFont;
      if (node.type !== "legend") break;
      const gap = pickOr(node.gap, context.layout, LEGEND_ITEM_GAP);
      const items = node.items.map((item) => ({
        item: {
          id: item.id,
          label: item.label,
          swatch: item.swatch,
          shape: item.shape ?? "square",
        },
        width: LEGEND_SWATCH + LEGEND_SWATCH_GAP + measureText(item.label, font, view.textMeasurer),
      }));
      const boxes: NonNullable<Placed["legendItems"]> = [];
      if (view.legendDirection === "column") {
        items.forEach((entry, index) => {
          boxes.push({
            item: entry.item,
            box: {
              x: 0,
              y: index * (font.lineHeight + gap / 2),
              width: Math.min(width, entry.width),
              height: font.lineHeight,
            },
          });
        });
        placed.height =
          fixedHeight ??
          Math.max(
            view.minHeight,
            items.length * font.lineHeight + Math.max(0, items.length - 1) * (gap / 2),
          );
      } else {
        let x = 0;
        let row = 0;
        for (const entry of items) {
          if (x > 0 && x + entry.width > width + 1e-6) {
            x = 0;
            row += 1;
          }
          boxes.push({
            item: entry.item,
            box: {
              x,
              y: row * (font.lineHeight + 4),
              width: Math.min(width, entry.width),
              height: font.lineHeight,
            },
          });
          x += entry.width + gap;
        }
        placed.height =
          fixedHeight ?? Math.max(view.minHeight, (row + 1) * font.lineHeight + row * 4);
      }
      placed.legendItems = boxes;
      break;
    }
    case "icon":
      placed.height = fixedHeight ?? fillHeight ?? Math.max(view.minHeight, view.iconSize);
      break;
    case "circle":
      placed.height =
        fixedHeight ??
        fillHeight ??
        Math.max(
          view.minHeight,
          typeof view.width === "number" ? view.width : view.circleRadius * 2,
        );
      break;
    case "path": {
      const node = view.node;
      const aspect = node.type === "path" ? node.viewBox.height / node.viewBox.width : 1;
      placed.height = fixedHeight ?? fillHeight ?? Math.max(view.minHeight, width * aspect);
      break;
    }
    case "image":
      placed.height = fixedHeight ?? fillHeight ?? Math.max(view.minHeight, width * 0.625);
      break;
    case "polyline":
      placed.height = fixedHeight ?? fillHeight ?? Math.max(view.minHeight, 48);
      break;
    case "rect":
      placed.height = fixedHeight ?? fillHeight ?? Math.max(view.minHeight, 8);
      break;
    case "group":
      layoutGroup(view, placed, width, fixedHeight ?? fillHeight, context);
      break;
  }
  return placed;
}

/** Chooses grid density from the width the parent actually allocated, not from viewport labels. */
function autoFitColumns(
  children: readonly View[],
  innerWidth: number,
  gap: number,
  layout: LayoutName,
): number {
  if (children.length === 0) return 1;
  const cellMinimum = Math.max(1, ...children.map((child) => minContentWidth(child, layout)));
  return Math.max(
    1,
    Math.min(children.length, Math.floor((innerWidth + gap) / (cellMinimum + gap))),
  );
}

function layoutGroup(
  view: View,
  placed: Placed,
  width: number,
  forcedHeight: number | undefined,
  context: LayoutContext,
): void {
  const pad = view.padding;
  const innerWidth = Math.max(0, width - pad.left - pad.right);
  const innerHeight =
    forcedHeight === undefined ? undefined : Math.max(0, forcedHeight - pad.top - pad.bottom);
  const children = visibleChildren(view);
  const gap = view.gap;
  const results: Placed[] = [];
  let contentHeight = 0;

  const alignCross = (child: Placed, extent: number): number => {
    const align = crossAlign(child.view, view.align);
    // A stack runs down the page, so its cross axis is horizontal; a row and a grid's rows run
    // across it, so theirs is vertical.
    const size = view.layout === "stack" ? child.width : child.height;
    switch (align) {
      case "center":
        return (extent - size) / 2;
      case "end":
        return extent - size;
      default:
        return 0;
    }
  };

  const distribute = (count: number, free: number): { lead: number; between: number } => {
    if (free <= 0 || count === 0) return { lead: 0, between: 0 };
    switch (view.justify) {
      case "center":
        return { lead: free / 2, between: 0 };
      case "end":
        return { lead: free, between: 0 };
      case "between":
        return count > 1
          ? { lead: 0, between: free / (count - 1) }
          : { lead: free / 2, between: 0 };
      case "around":
        return { lead: free / (count * 2), between: free / count };
      case "evenly":
        return { lead: free / (count + 1), between: free / (count + 1) };
      default:
        return { lead: 0, between: 0 };
    }
  };

  switch (view.layout) {
    case "stack": {
      const naturals = children.map((child) =>
        layoutNode(
          child,
          resolveChildWidth(
            child,
            innerWidth,
            crossAlign(child, view.align) === "stretch",
            context,
          ),
          percentHeightBasis(child, innerHeight),
          context,
        ),
      );
      const fillChildren = children.filter((child) => child.height === "fill");
      const totalGap = gap * Math.max(0, children.length - 1);
      const fixedTotal = naturals.reduce(
        (sum, child) => sum + (child.view.height === "fill" ? 0 : child.height),
        0,
      );
      let heights = naturals.map((child) => child.height);
      if (innerHeight !== undefined && fillChildren.length > 0) {
        const free = Math.max(0, innerHeight - fixedTotal - totalGap);
        const totalGrow = fillChildren.reduce((sum, child) => sum + Math.max(child.grow, 1), 0);
        heights = naturals.map((child) =>
          child.view.height === "fill"
            ? (free * Math.max(child.view.grow, 1)) / totalGrow
            : child.height,
        );
      }
      const finals = naturals.map((child, index) => {
        const target = heights[index] ?? child.height;
        return Math.abs(target - child.height) > 1e-6
          ? layoutNode(child.view, child.width, target, context, true)
          : child;
      });
      const total = finals.reduce((sum, child) => sum + child.height, 0) + totalGap;
      const extent = innerHeight ?? total;
      const { lead, between } = distribute(finals.length, extent - total);
      let y = pad.top + lead;
      for (const child of finals) {
        child.x = pad.left + alignCross(child, innerWidth);
        child.y = y;
        y += child.height + gap + between;
        results.push(child);
      }
      contentHeight = total;
      break;
    }
    case "row": {
      const specs: FlexItem[] = children.map((child) => {
        const percent = percentFraction(child.width);
        if (typeof child.width === "number" || percent !== undefined) {
          const width = clampWidth(
            child,
            typeof child.width === "number" ? child.width : innerWidth * (percent ?? 0),
          );
          return { basis: width, min: width, max: width, grow: 0, shrink: 0 };
        }
        const minContent = Math.min(minContentWidth(child, context.layout), child.maxWidth);
        if (child.width === "fill") {
          const min = Math.max(child.minWidth, minContent);
          return {
            basis: 0,
            min,
            max: child.maxWidth,
            grow: child.grow > 0 ? child.grow : 1,
            shrink: 0,
          };
        }
        const basis = clampWidth(
          child,
          Math.max(intrinsicWidth(child, context.layout), child.minWidth),
        );
        const min = Math.min(basis, Math.max(child.minWidth, minContent));
        return {
          basis,
          min,
          max: child.grow > 0 ? child.maxWidth : basis,
          grow: child.grow,
          shrink: 1,
        };
      });
      const available = innerWidth - gap * Math.max(0, children.length - 1);
      const widths = allocateFlex(specs, available);
      const naturals = children.map((child, index) =>
        layoutNode(child, widths[index] ?? 0, percentHeightBasis(child, innerHeight), context),
      );
      const rowHeight = innerHeight ?? Math.max(0, ...naturals.map((child) => child.height));
      const finals = naturals.map((child) =>
        stretchHeight(child.view, view.align) &&
        typeof child.view.height !== "number" &&
        Math.abs(child.height - rowHeight) > 1e-6
          ? layoutNode(child.view, child.width, rowHeight, context, true)
          : child,
      );
      const total =
        finals.reduce((sum, child) => sum + child.width, 0) + gap * Math.max(0, finals.length - 1);
      const { lead, between } = distribute(finals.length, innerWidth - total);
      let x = pad.left + lead;
      for (const child of finals) {
        child.x = x;
        child.y = pad.top + alignCross(child, rowHeight);
        x += child.width + gap + between;
        results.push(child);
      }
      if (total > innerWidth + 0.5) {
        placed.overflowX = true;
        context.diagnostics.push({
          severity: "warning",
          code: "overflow",
          message: `row ${view.id} content (${round(total, 1)}px) exceeds its ${round(innerWidth, 1)}px inner width in the ${context.layout} layout`,
          path: view.id,
        });
      }
      contentHeight = rowHeight;
      break;
    }
    case "grid": {
      const columns =
        view.columns === "auto"
          ? autoFitColumns(children, innerWidth, gap, context.layout)
          : view.columns;
      const columnWidth = Math.max(0, (innerWidth - gap * (columns - 1)) / columns);
      const naturals = children.map((child) =>
        layoutNode(
          child,
          resolveChildWidth(
            child,
            columnWidth,
            view.align === "stretch" ||
              child.alignSelf === "stretch" ||
              (child.justifySelf ?? undefined) === "stretch",
            context,
          ),
          percentHeightBasis(child, innerHeight),
          context,
        ),
      );
      let y = pad.top;
      for (let start = 0; start < naturals.length; start += columns) {
        const row = naturals.slice(start, start + columns);
        const rowHeight = Math.max(0, ...row.map((child) => child.height));
        row.forEach((child, index) => {
          const final =
            stretchHeight(child.view, view.align) &&
            typeof child.view.height !== "number" &&
            Math.abs(child.height - rowHeight) > 1e-6
              ? layoutNode(child.view, child.width, rowHeight, context, true)
              : child;
          const cellX = pad.left + index * (columnWidth + gap);
          const horizontal = final.view.justifySelf ?? justifyToAlign(view.justify);
          final.x =
            cellX +
            (horizontal === "center"
              ? (columnWidth - final.width) / 2
              : horizontal === "end"
                ? columnWidth - final.width
                : 0);
          final.y = y + alignCross(final, rowHeight);
          results.push(final);
        });
        y += rowHeight + gap;
      }
      contentHeight = Math.max(0, y - pad.top - gap);
      break;
    }
    case "overlay": {
      const naturals = children.map((child) =>
        layoutNode(
          child,
          resolveChildWidth(
            child,
            innerWidth,
            child.alignSelf === "stretch" || (child.justifySelf ?? undefined) === "stretch",
            context,
          ),
          percentHeightBasis(child, innerHeight),
          context,
        ),
      );
      const extent = innerHeight ?? Math.max(0, ...naturals.map((child) => child.height));
      for (const child of naturals) {
        const final =
          (child.view.height === "fill" || child.view.alignSelf === "stretch") &&
          typeof child.view.height !== "number" &&
          Math.abs(child.height - extent) > 1e-6
            ? layoutNode(child.view, child.width, extent, context, true)
            : child;
        const horizontal = final.view.justifySelf ?? justifyToAlign(view.justify, "center");
        const vertical = final.view.alignSelf ?? view.align ?? "center";
        final.x =
          pad.left +
          (horizontal === "center"
            ? (innerWidth - final.width) / 2
            : horizontal === "end"
              ? innerWidth - final.width
              : 0);
        final.y =
          pad.top +
          (vertical === "center"
            ? (extent - final.height) / 2
            : vertical === "end"
              ? extent - final.height
              : 0);
        results.push(final);
      }
      contentHeight = extent;
      break;
    }
    case "coordinates": {
      // Fractional placement in a normalised box; the box height must be known.
      let extent = innerHeight;
      const aspect = view.node.type === "group" ? view.node.aspect : undefined;
      if (extent === undefined) {
        if (aspect !== undefined && Number.isFinite(aspect) && aspect > 0) {
          extent = innerWidth * aspect;
        } else if (
          view.node.type === "group" &&
          pickOr(view.node.fit, context.layout, "none") === "content"
        ) {
          extent = Math.max(
            1,
            ...children.map((child) => {
              const position = child.position ?? { x: 0, y: 0, anchor: "top-left" as Anchor };
              const childWidth = resolveChildWidth(child, innerWidth, false, context);
              const natural = layoutNode(child, childWidth, undefined, context);
              const anchor = position.anchor;
              const factor =
                anchor === "bottom-left" || anchor === "bottom" || anchor === "bottom-right"
                  ? 1
                  : anchor === "left" || anchor === "center" || anchor === "right"
                    ? 0.5
                    : 0;
              const before = position.y > 0 ? (factor * natural.height) / position.y : 0;
              const after = position.y < 1 ? ((1 - factor) * natural.height) / (1 - position.y) : 0;
              return Math.max(before, after);
            }),
          );
        } else {
          extent = Math.max(0, view.minHeight - pad.top - pad.bottom) || 160;
          context.diagnostics.push({
            severity: "warning",
            code: "coordinates-height",
            message: `coordinates group ${view.id} has no height; using ${round(extent, 1)}px`,
            path: view.id,
          });
        }
      }
      for (const child of children) {
        const position = child.position ?? { x: 0, y: 0, anchor: "top-left" as Anchor };
        const widthPercent = percentFraction(child.width);
        const childWidth =
          typeof child.width === "number"
            ? child.width
            : widthPercent !== undefined
              ? innerWidth * widthPercent
              : child.width === "fill"
                ? innerWidth
                : resolveChildWidth(child, innerWidth, false, context);
        const heightPercent = percentFraction(child.height);
        const availableHeight =
          heightPercent !== undefined
            ? extent * heightPercent
            : child.height === "fill"
              ? extent
              : undefined;
        const final = layoutNode(
          heightPercent === undefined ? child : { ...child, height: "fill" },
          childWidth,
          availableHeight,
          context,
        );
        const anchored = anchorOffset(position.anchor, final.width, final.height);
        final.x = pad.left + position.x * innerWidth - anchored.x;
        final.y = pad.top + position.y * extent - anchored.y;
        results.push(final);
      }
      contentHeight = extent;
      break;
    }
    case "absolute": {
      let maxBottom = 0;
      for (const child of children) {
        const position = child.position ?? { x: 0, y: 0, anchor: "top-left" as Anchor };
        const available = Math.max(0, innerWidth - position.x);
        const childWidth = resolveChildWidth(child, available, false, context);
        const availableHeight =
          innerHeight === undefined ? undefined : Math.max(0, innerHeight - position.y);
        const final = layoutNode(child, childWidth, availableHeight, context);
        const anchored = anchorOffset(position.anchor, final.width, final.height);
        final.x = pad.left + position.x - anchored.x;
        final.y = pad.top + position.y - anchored.y;
        maxBottom = Math.max(maxBottom, final.y + final.height - pad.top);
        results.push(final);
      }
      contentHeight = maxBottom;
      break;
    }
  }

  placed.children.push(...results);
  // Hidden children keep real geometry (out of flow) so ids stay addressable for tracks and toggles.
  for (const child of view.children) {
    if (!child.hidden) continue;
    const ghostContext: LayoutContext = { ...context, diagnostics: [] };
    const ghost = layoutNode(
      child,
      resolveChildWidth(child, innerWidth, false, ghostContext),
      undefined,
      ghostContext,
    );
    ghost.x = pad.left;
    ghost.y = pad.top;
    placed.children.push(ghost);
  }
  placed.height = forcedHeight ?? Math.max(view.minHeight, contentHeight + pad.top + pad.bottom);
  const limitBottom = placed.height - pad.bottom + 0.5;
  const limitRight = width - pad.right + 0.5;
  const overflowAllowed = view.node.type === "group" && view.node.allowOverflow === true;
  for (const child of results) {
    if (overflowAllowed) break;
    if (
      child.x + child.width > limitRight ||
      child.y + child.height > limitBottom ||
      child.x < pad.left - 0.5 ||
      child.y < pad.top - 0.5
    ) {
      if (view.layout === "row" && placed.overflowX === true) continue;
      context.diagnostics.push({
        severity: "warning",
        code: "overflow",
        message: `${child.view.type} ${child.view.id} extends outside the content box of ${view.id} in the ${context.layout} layout`,
        path: child.view.id,
      });
    }
  }
  if (view.layout !== "overlay" && view.layout !== "coordinates") {
    for (let i = 0; i < results.length; i += 1) {
      for (let j = i + 1; j < results.length; j += 1) {
        const a = results[i];
        const b = results[j];
        if (a === undefined || b === undefined) continue;
        if (rectsIntersect(a, b, 0.5)) {
          context.diagnostics.push({
            severity: "warning",
            code: "overlap",
            message: `${a.view.id} overlaps ${b.view.id} inside ${view.id} in the ${context.layout} layout`,
            path: view.id,
          });
        }
      }
    }
  }
}

function justifyToAlign(justify: Justify, fallback: Align = "start"): Align {
  switch (justify) {
    case "center":
      return "center";
    case "end":
      return "end";
    case "start":
      return "start";
    default:
      return fallback;
  }
}

function anchorOffset(anchor: Anchor, width: number, height: number): Point {
  switch (anchor) {
    case "top":
      return { x: width / 2, y: 0 };
    case "top-right":
      return { x: width, y: 0 };
    case "left":
      return { x: 0, y: height / 2 };
    case "center":
      return { x: width / 2, y: height / 2 };
    case "right":
      return { x: width, y: height / 2 };
    case "bottom-left":
      return { x: 0, y: height };
    case "bottom":
      return { x: width / 2, y: height };
    case "bottom-right":
      return { x: width, y: height };
    default:
      return { x: 0, y: 0 };
  }
}

// ---------------------------------------------------------------------------------------------
// Resolution
// ---------------------------------------------------------------------------------------------

function round(value: number, precision: number): number {
  const scale = 10 ** precision;
  return Math.round((value + Number.EPSILON) * scale) / scale;
}

interface Emitted {
  readonly nodes: ResolvedNode[];
  readonly boxes: Map<string, EdgeNodeBox>;
  readonly obstacles: EdgeNodeBox[];
}

function frameAppearance(view: View, theme: ThemeTokens): ResolvedNodeAppearance {
  const node = view.node;
  const stroke = (paint: Paint | undefined, fallback: string): string =>
    paintColor(paint, theme, "stroke", fallback);
  const fill = (paint: FillPaint | undefined, fallback: string) =>
    resolveFillPaint(paint, theme, fallback);
  const finish = (
    appearance: Omit<ResolvedNodeAppearance, "effects" | "blendMode">,
    material: ResolvedMaterialDefinition,
  ): ResolvedNodeAppearance => ({
    ...appearance,
    ...(material.effects === undefined ? {} : { effects: material.effects }),
    ...(material.blendMode === undefined ? {} : { blendMode: material.blendMode }),
  });
  switch (node.type) {
    case "group": {
      const frame = node.frame;
      if (frame === undefined) return { fill: "none", stroke: "none", strokeWidth: 0, radius: 0 };
      const surface = resolveMaterial(frame, theme);
      return finish(
        {
          fill: surface.fill ?? "none",
          stroke: surface.stroke ?? "none",
          strokeWidth: surface.strokeWidth ?? theme.strokes.hairline,
          radius: surface.radius ?? theme.radii.lg,
          ...(surface.opacity === undefined ? {} : { opacity: surface.opacity }),
          ...(frame.dash === undefined ? {} : { dash: frame.dash }),
        },
        surface,
      );
    }
    case "rect": {
      const surface = resolveMaterial(node.material, theme);
      return finish(
        {
          fill:
            view.tone !== undefined || node.fill !== undefined
              ? fill(view.tone ?? node.fill, theme.colors.surface)
              : (surface.fill ?? theme.colors.surface),
          stroke:
            node.stroke !== undefined
              ? stroke(node.stroke, "none")
              : (surface.stroke ?? (view.tone === undefined ? theme.colors.border : "none")),
          strokeWidth: node.strokeWidth ?? surface.strokeWidth ?? theme.strokes.hairline,
          radius: node.radius ?? surface.radius ?? theme.radii.md,
          ...(surface.opacity === undefined ? {} : { opacity: surface.opacity }),
          ...(node.dash === undefined ? {} : { dash: node.dash }),
        },
        surface,
      );
    }
    case "circle": {
      const surface = resolveMaterial(node.material, theme);
      return finish(
        {
          fill:
            view.tone !== undefined || node.fill !== undefined
              ? fill(view.tone ?? node.fill, theme.colors.surface)
              : (surface.fill ?? theme.colors.surface),
          stroke:
            node.stroke !== undefined
              ? stroke(node.stroke, "none")
              : (surface.stroke ?? (view.tone === undefined ? theme.colors.border : "none")),
          strokeWidth: node.strokeWidth ?? surface.strokeWidth ?? theme.strokes.hairline,
          radius: surface.radius ?? 0,
          ...(surface.opacity === undefined ? {} : { opacity: surface.opacity }),
          ...(node.dash === undefined ? {} : { dash: node.dash }),
        },
        surface,
      );
    }
    case "path": {
      const surface = resolveMaterial(node.material, theme);
      return finish(
        {
          fill:
            view.tone !== undefined || node.fill !== undefined
              ? fill(view.tone ?? node.fill, "none")
              : (surface.fill ?? "none"),
          stroke:
            node.stroke !== undefined
              ? stroke(node.stroke, "none")
              : (surface.stroke ??
                (view.tone === undefined && node.fill === undefined
                  ? theme.colors.accent
                  : "none")),
          strokeWidth: node.strokeWidth ?? surface.strokeWidth ?? theme.strokes.thin,
          radius: surface.radius ?? 0,
          ...(surface.opacity === undefined ? {} : { opacity: surface.opacity }),
          ...(node.dash === undefined ? {} : { dash: node.dash }),
          ...(node.lineCap === undefined ? {} : { lineCap: node.lineCap }),
        },
        surface,
      );
    }
    case "polyline": {
      const surface = resolveMaterial(node.material, theme);
      return finish(
        {
          fill: node.fill !== undefined ? fill(node.fill, "none") : (surface.fill ?? "none"),
          stroke:
            view.tone !== undefined || node.stroke !== undefined
              ? stroke(view.tone ?? node.stroke, "none")
              : (surface.stroke ??
                (node.fill === undefined && view.tone === undefined
                  ? theme.colors.accent
                  : "none")),
          strokeWidth: node.strokeWidth ?? surface.strokeWidth ?? theme.strokes.regular,
          radius: surface.radius ?? 0,
          ...(surface.opacity === undefined ? {} : { opacity: surface.opacity }),
          ...(node.dash === undefined ? {} : { dash: node.dash }),
          ...(node.lineCap === undefined ? {} : { lineCap: node.lineCap }),
        },
        surface,
      );
    }
    case "image":
      return {
        fill: "none",
        stroke: "none",
        strokeWidth: 0,
        radius: node.radius ?? theme.radii.sm,
      };
    case "badge": {
      const tone = paintColor(view.tone ?? "accent", theme, "stroke", theme.colors.accent);
      const variant = node.variant ?? "soft";
      if (variant === "solid")
        return { fill: tone, stroke: "none", strokeWidth: 0, radius: theme.radii.pill };
      if (variant === "outline")
        return {
          fill: "none",
          stroke: tone,
          strokeWidth: theme.strokes.hairline,
          radius: theme.radii.pill,
        };
      return {
        fill: withAlpha(tone, 0.16),
        stroke: "none",
        strokeWidth: 0,
        radius: theme.radii.pill,
      };
    }
    case "callout": {
      const tone = paintColor(view.tone ?? "accent", theme, "stroke", theme.colors.accent);
      return {
        fill: theme.colors.surfaceRaised,
        stroke: tone,
        strokeWidth: theme.strokes.hairline,
        radius: theme.radii.md,
      };
    }
    case "icon": {
      const tone = paintColor(view.tone ?? "accent", theme, "stroke", theme.colors.accent);
      return {
        fill: paintColor(node.background, theme, "fill", "none"),
        stroke: tone,
        strokeWidth: theme.strokes.thin,
        radius: 0,
      };
    }
    case "text":
    case "legend":
      return { fill: "none", stroke: "none", strokeWidth: 0, radius: 0 };
  }
}

function textBlock(
  view: View,
  placed: Placed,
  origin: Point,
  box: Rect,
  precision: number,
  colorOverride?: string,
): ResolvedText | undefined {
  if (placed.lines === undefined || view.font === undefined) return undefined;
  const font = view.font;
  return {
    lines: placed.lines.map((line) => ({ text: line.text, width: round(line.width, precision) })),
    fontFamily: font.family,
    fontSize: font.size,
    fontWeight: font.weight,
    lineHeight: font.lineHeight,
    letterSpacing: font.letterSpacing ?? 0,
    color: colorOverride ?? view.textColor,
    align: view.textAlign,
    transform: view.transform,
    ...(view.node.type === "text" && view.node.reveal !== undefined
      ? { reveal: view.node.reveal }
      : {}),
    box: {
      x: round(origin.x + box.x, precision),
      y: round(origin.y + box.y, precision),
      width: round(box.width, precision),
      height: round(box.height, precision),
    },
  };
}

function emit(
  placed: Placed,
  origin: Point,
  parent: string | undefined,
  theme: ThemeTokens,
  precision: number,
  out: Emitted,
): void {
  const view = placed.view;
  const x = origin.x + placed.x;
  const y = origin.y + placed.y;
  const rect: Rect = {
    x: round(x, precision),
    y: round(y, precision),
    width: round(placed.width, precision),
    height: round(placed.height, precision),
  };
  const node = view.node;
  const label =
    node.label ??
    node.inspect?.title ??
    (view.type === "text" || view.type === "badge" || view.type === "callout"
      ? (view.text ?? "")
      : "");
  const description = view.description ?? node.inspect?.summary;
  const kind: ResolvedNode["kind"] =
    view.type === "group"
      ? "group"
      : view.type === "rect"
        ? "rect"
        : view.type === "circle"
          ? "circle"
          : view.type === "polyline"
            ? "path"
            : view.type;
  const appearance = frameAppearance(view, theme);
  const badgeText =
    view.type === "badge"
      ? ((node.type === "badge" ? node.variant : undefined) ?? "soft") === "solid"
        ? theme.colors.accentContrast
        : paintColor(view.tone ?? "accent", theme, "text", theme.colors.accent)
      : undefined;
  let text: ResolvedText | undefined;
  if (view.type === "text")
    text = textBlock(
      view,
      placed,
      { x, y },
      { x: 0, y: 0, width: placed.width, height: placed.height },
      precision,
    );
  else if (view.type === "badge")
    text = textBlock(
      view,
      placed,
      { x, y },
      {
        x: BADGE_PAD_X,
        y: BADGE_PAD_Y,
        width: Math.max(0, placed.width - BADGE_PAD_X * 2),
        height: Math.max(0, placed.height - BADGE_PAD_Y * 2),
      },
      precision,
      badgeText,
    );
  else if (view.type === "callout" && placed.calloutBody !== undefined) {
    const pad = calloutPaddingResolved(view);
    text = textBlock(
      view,
      placed,
      { x, y },
      {
        x: placed.calloutBody.x + pad.left,
        y: placed.calloutBody.y + pad.top,
        width: Math.max(0, placed.calloutBody.width - pad.left - pad.right),
        height: Math.max(0, placed.calloutBody.height - pad.top - pad.bottom),
      },
      precision,
    );
  }
  const legend =
    view.type === "legend" && placed.legendItems !== undefined && view.font !== undefined
      ? {
          items: placed.legendItems.map((entry): ResolvedLegendItem => ({
            id: entry.item.id,
            label: entry.item.label,
            swatch: paintColor(entry.item.swatch, theme, "fill", theme.colors.accent),
            shape: entry.item.shape,
            box: {
              x: round(x + entry.box.x, precision),
              y: round(y + entry.box.y, precision),
              width: round(entry.box.width, precision),
              height: round(entry.box.height, precision),
            },
          })),
          text: {
            fontFamily: view.font.family,
            fontSize: view.font.size,
            fontWeight: view.font.weight,
            lineHeight: view.font.lineHeight,
            letterSpacing: view.font.letterSpacing ?? 0,
            color: view.textColor,
            align: "start" as const,
            transform: "none" as const,
          },
        }
      : undefined;
  const iconColor =
    view.type === "icon"
      ? paintColor(view.tone ?? "accent", theme, "stroke", theme.colors.accent)
      : undefined;
  const interactive =
    node.interactive ??
    [
      node.onActivate,
      node.onHover,
      node.onLeave,
      node.onFocus,
      node.onBlur,
      node.onPointer,
      node.onDrag,
    ].some((event) => event !== undefined);
  const resolved: ResolvedNode = {
    id: view.id,
    ...(node.interactionGroup === undefined ? {} : { interactionGroup: node.interactionGroup }),
    ...(Object.keys(view.ports).length === 0
      ? {}
      : {
          ports: Object.entries(view.ports).map(([id, port]) => {
            const gap = port.gap ?? 0;
            const offset = port.offset;
            const point =
              port.side === "left"
                ? { x: rect.x - gap, y: rect.y + rect.height * offset }
                : port.side === "right"
                  ? { x: rect.x + rect.width + gap, y: rect.y + rect.height * offset }
                  : port.side === "top"
                    ? { x: rect.x + rect.width * offset, y: rect.y - gap }
                    : port.side === "bottom"
                      ? { x: rect.x + rect.width * offset, y: rect.y + rect.height + gap }
                      : { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
            return {
              id,
              side: port.side,
              offset,
              x: round(point.x, precision),
              y: round(point.y, precision),
            };
          }),
        }),
    kind,
    ...rect,
    label,
    ...(description === undefined ? {} : { description }),
    appearance,
    state: {
      opacity: view.opacity,
      translateX: 0,
      translateY: 0,
      scale: 1,
      rotation: view.rotation,
      progress: view.progress,
      highlight: view.highlight,
    },
    interactive,
    focusable: interactive,
    metadata: node.metadata ?? {},
    ...(parent === undefined ? {} : { parent }),
    z: view.z,
    ...(view.hidden ? { hidden: true } : {}),
    ...(node.type === "group" && node.clip === true ? { clip: true } : {}),
    ...(node.onActivate === undefined ? {} : { onActivate: node.onActivate }),
    ...(node.onHover === undefined ? {} : { onHover: node.onHover }),
    ...(node.onLeave === undefined ? {} : { onLeave: node.onLeave }),
    ...(node.onFocus === undefined ? {} : { onFocus: node.onFocus }),
    ...(node.onBlur === undefined ? {} : { onBlur: node.onBlur }),
    ...(node.onPointer === undefined ? {} : { onPointer: node.onPointer }),
    ...(node.onDrag === undefined ? {} : { onDrag: node.onDrag }),
    ...(node.inspect === undefined ? {} : { inspect: node.inspect }),
    ...(node.focusGroup === true ? { focusGroup: true } : {}),
    ...(node.revealAnchor === undefined ? {} : { revealAnchor: node.revealAnchor }),
    ...(text === undefined ? {} : { text }),
    ...(view.type === "icon" && node.type === "icon"
      ? {
          icon: {
            name: node.icon,
            size: view.iconSize,
            color: iconColor ?? theme.colors.accent,
            background: paintColor(node.background, theme, "fill", "none"),
          },
        }
      : {}),
    ...(node.type === "path"
      ? { path: { d: view.pathData ?? node.d, viewBox: node.viewBox } }
      : {}),
    ...(node.type === "polyline"
      ? {
          path: {
            d: polylinePath(node, placed.width, placed.height, precision),
            viewBox: { width: Math.max(1e-6, placed.width), height: Math.max(1e-6, placed.height) },
            length: round(polylineLength(node, placed.width, placed.height), precision),
          },
        }
      : {}),
    ...(node.type === "image"
      ? {
          image: {
            href: node.src,
            alt: node.alt,
            fit: node.fit ?? "contain",
            live: node.live ?? false,
          },
        }
      : {}),
    ...(legend === undefined ? {} : { legend }),
    ...(view.type === "callout" &&
    placed.calloutBody !== undefined &&
    placed.calloutTip !== undefined
      ? {
          callout: {
            pointer: view.pointer,
            tip: {
              x: round(x + placed.calloutTip.x, precision),
              y: round(y + placed.calloutTip.y, precision),
            },
            body: {
              x: round(x + placed.calloutBody.x, precision),
              y: round(y + placed.calloutBody.y, precision),
              width: round(placed.calloutBody.width, precision),
              height: round(placed.calloutBody.height, precision),
            },
          },
        }
      : {}),
  };
  out.nodes.push(resolved);
  const edgeBox: EdgeNodeBox = {
    id: view.id,
    ...rect,
    kind:
      kind === "circle"
        ? "circle"
        : kind === "group"
          ? "group"
          : kind === "rect"
            ? "rect"
            : "other",
    ...(Object.keys(view.ports).length === 0 ? {} : { ports: view.ports }),
  };
  out.boxes.set(view.id, edgeBox);
  // A framed group is as solid as a leaf as far as a label is concerned: it has a fill and a
  // border, and a label that lands on it looks stuck to it. Unframed groups stay out — they are
  // arrangement, not surface — and an edge is never pushed around by a box it emerges from, which
  // is what keeps the root group (and any card an endpoint lives in) from blocking everything.
  const framed = view.type === "group" && node.type === "group" && node.frame !== undefined;
  if (!view.hidden && (view.type !== "group" || framed)) out.obstacles.push(edgeBox);
  const sorted = [...placed.children].sort((a, b) => a.view.z - b.view.z);
  for (const child of sorted) emit(child, { x, y }, view.id, theme, precision, out);
}

/** Resolves a general scene definition into finite, renderer-ready geometry. */
export function resolveScene(input: SceneDefinition, options: ResolveSceneOptions): ResolvedScene {
  const scene = defineScene(input);
  const theme = options.theme ?? defaultTheme;
  const precision = options.precision ?? 3;
  if (!Number.isFinite(options.width) || options.width <= 0)
    throw new RangeError("resolveScene width must be a positive, finite number");
  const layout = chooseLayout(options.width, scene.breakpoints, options.layout ?? "auto");
  const diagnostics: SceneDiagnostic[] = [];

  let machineState: MachineState | undefined;
  let signals: Record<string, VariableValue> = { ...(scene.signals ?? {}) };
  if (scene.machine !== undefined) {
    const nodeIds = new Set<string>();
    const collect = (node: SceneNode): void => {
      nodeIds.add(node.id);
      if (node.type === "group") node.children.forEach(collect);
    };
    collect(scene.root);
    const validation = validateStateMachine(scene.machine, { nodeIds });
    const errors = validation.diagnostics.filter((entry) => entry.severity === "error");
    if (errors.length > 0)
      throw new Error(
        `invalid state machine ${scene.machine.id}:\n${errors.map((entry) => `- ${entry.message}`).join("\n")}`,
      );
    machineState = options.machineState ?? createMachineState(scene.machine);
    signals = { ...signals, ...evaluateSignals(scene.machine, machineState) };
  }
  if (options.deriveSignals !== undefined)
    signals = {
      ...signals,
      ...options.deriveSignals(machineState?.variables ?? scene.machine?.variables ?? {}, signals),
    };
  if (options.signals !== undefined) signals = { ...signals, ...options.signals };
  checkBindings(scene, signals, diagnostics);

  const padding = insets(pick(scene.padding, layout), layout === "narrow" ? 16 : 24);
  const rootView = buildView(scene.root, layout, theme, signals, 0, options.textMeasurer);
  const rootWidth = Math.max(0, options.width - padding.left - padding.right);
  const context: LayoutContext = {
    layout,
    theme,
    diagnostics,
    signals,
    ...(options.textMeasurer === undefined ? {} : { textMeasurer: options.textMeasurer }),
  };
  const placedRoot = layoutNode(
    { ...rootView, width: rootView.width ?? "fill" },
    rootWidth,
    typeof rootView.height === "number" ? rootView.height : undefined,
    context,
  );
  placedRoot.x = padding.left;
  placedRoot.y = padding.top;
  const emitted: Emitted = { nodes: [], boxes: new Map(), obstacles: [] };
  emit(placedRoot, { x: 0, y: 0 }, undefined, theme, precision, emitted);
  for (const node of emitted.nodes)
    if (node.text !== undefined && node.text.lines.some((line) => line.text.endsWith("…")))
      diagnostics.push({
        severity: "warning",
        code: "text-truncated",
        message: `text in ${node.id} was truncated in the ${layout} layout`,
        path: node.id,
      });

  const height = round(placedRoot.height + padding.top + padding.bottom, precision);
  const width = round(options.width, precision);

  const edgeDefinitions = scene.edges ?? [];
  const endpointIds = new Set(
    edgeDefinitions.flatMap((edge) => [endpointNode(edge.from), endpointNode(edge.to)]),
  );
  const logicalObstacles = [...endpointIds]
    .map((id) => emitted.boxes.get(id))
    .filter((box): box is EdgeNodeBox => box !== undefined);
  const parentById = new Map(emitted.nodes.map((node) => [node.id, node.parent]));
  const belongsToEndpoint = (id: string): boolean => {
    let current: string | undefined = id;
    while (current !== undefined) {
      if (endpointIds.has(current)) return true;
      current = parentById.get(current);
    }
    return false;
  };
  // A connected card/gate is one obstacle. Its icon, label, and silhouette must not each inflate
  // the forbidden area; genuinely separate decorative marks still participate in routing.
  const edgeObstacles = [
    ...logicalObstacles,
    ...emitted.obstacles.filter((obstacle) => !belongsToEndpoint(obstacle.id)),
  ].filter(
    (obstacle, index, all) =>
      all.findIndex(
        (candidate) =>
          Math.abs(candidate.x - obstacle.x) < 1e-6 &&
          Math.abs(candidate.y - obstacle.y) < 1e-6 &&
          Math.abs(candidate.width - obstacle.width) < 1e-6 &&
          Math.abs(candidate.height - obstacle.height) < 1e-6,
      ) === index,
  );
  const ports = assignPorts(edgeDefinitions, layout, emitted.boxes);
  const labelFont = fontFor("caption", theme);
  const edges: ResolvedEdge[] = [];
  const routedEdges: (readonly Point[])[] = [];
  for (const definition of edgeDefinitions) {
    const port = ports.get(definition.id);
    if (port === undefined) continue;
    const bind = definition.bind ?? {};
    const boundTone = bind.tone === undefined ? undefined : signals[bind.tone];
    const boundHidden = bind.hidden === undefined ? undefined : truthy(signals[bind.hidden]);
    const boundLabel = bind.label === undefined ? undefined : signals[bind.label];
    const boundSignal = bind.signal === undefined ? undefined : signals[bind.signal];
    const signal =
      boundSignal === undefined
        ? undefined
        : (numeric(boundSignal) ?? (truthy(boundSignal) ? 1 : 0));
    const labelHidden = new Set<string>();
    const labelText = new Map<string, string>();
    (definition.labels ?? []).forEach((label, index) => {
      const id = label.id ?? `${definition.id}-label-${index + 1}`;
      if (label.bind?.hidden !== undefined && truthy(signals[label.bind.hidden]))
        labelHidden.add(id);
      if (label.bind?.text !== undefined) {
        const value = signals[label.bind.text];
        if (typeof value === "string") labelText.set(id, value);
      }
    });
    if (typeof boundLabel === "string") labelText.set(`${definition.id}-label`, boundLabel);
    const resolved = resolveEdge(definition, port, {
      layout,
      theme,
      boxes: emitted.boxes,
      obstacles: edgeObstacles,
      routedEdges,
      bounds: { x: 0, y: 0, width, height },
      labelFont,
      ...(options.textMeasurer === undefined ? {} : { textMeasurer: options.textMeasurer }),
      labelColor: theme.colors.textMuted,
      precision,
      overrides: {
        ...(typeof boundTone === "string" ? { tone: boundTone } : {}),
        ...(boundHidden === undefined ? {} : { hidden: boundHidden }),
        ...(typeof boundLabel === "string" ? { label: boundLabel } : {}),
        ...(signal === undefined ? {} : { signal: unit(signal, 0) }),
        labelHidden,
        labelText,
      },
    });
    if (resolved === undefined) continue;
    if (resolved.routePoints !== undefined && resolved.edge.hidden !== true)
      routedEdges.push(resolved.routePoints);
    if (resolved.collidingObstacles)
      diagnostics.push({
        severity: "warning",
        code: "edge-collision",
        message: `edge ${definition.id} could not find an obstacle-free orthogonal route in the ${layout} layout`,
        path: definition.id,
      });
    for (const labelId of resolved.collidingLabels)
      diagnostics.push({
        severity: "warning",
        code: "label-collision",
        message: `edge label ${labelId} overlaps a node in the ${layout} layout; hide it per layout, shorten it, or widen the gap`,
        path: definition.id,
      });
    const boundHighlight = bind.highlight === undefined ? undefined : signals[bind.highlight];
    const boundOpacity = bind.opacity === undefined ? undefined : numeric(signals[bind.opacity]);
    const boundProgress = bind.progress === undefined ? undefined : numeric(signals[bind.progress]);
    const boundFlow = bind.flow === undefined ? undefined : signals[bind.flow];
    const highlight =
      boundHighlight === undefined
        ? 0
        : (numeric(boundHighlight) ?? (truthy(boundHighlight) ? 1 : 0));
    const flow =
      boundFlow === undefined
        ? resolved.edge.state.flow
        : (numeric(boundFlow) ?? (truthy(boundFlow) ? 1 : 0));
    const packets = packetPositions(
      resolved.edge.samples ?? [],
      resolved.packetCount,
      resolved.packetPeriod,
      0,
      precision,
    );
    edges.push({
      ...resolved.edge,
      state: {
        opacity: unit(boundOpacity, resolved.edge.state.opacity),
        progress: unit(boundProgress, 1),
        highlight: unit(highlight, 0),
        flow: unit(flow, 0),
        ...(resolved.edge.state.signal === undefined ? {} : { signal: resolved.edge.state.signal }),
      },
      packets,
      metadata: {
        ...(resolved.edge.metadata ?? {}),
        packetCount: resolved.packetCount,
        packetPeriod: resolved.packetPeriod,
        packetPhase: 0,
        ...(definition.packets?.trail === true
          ? {
              packetTrail: true,
              packetTrailLength: Math.min(
                0.45,
                Math.max(0.02, definition.packets.trailLength ?? 0.085),
              ),
              packetTrailWidth:
                definition.packets.trailWidth ??
                Math.max(0.8, resolved.edge.appearance.strokeWidth * 0.78),
              packetTrailOpacity: Math.min(1, Math.max(0, definition.packets.trailOpacity ?? 0.72)),
            }
          : {}),
      },
    });
  }

  const nodesRects = emitted.nodes.filter((node) => node.hidden !== true);
  for (const node of nodesRects) {
    if (![node.x, node.y, node.width, node.height].every(Number.isFinite))
      throw new Error(`node ${node.id} resolved to non-finite geometry`);
  }

  const background =
    scene.background === "transparent"
      ? "transparent"
      : paintColor(scene.background, theme, "fill", theme.colors.canvas);

  return {
    id: scene.id,
    width,
    height,
    label: scene.title,
    title: scene.title,
    ...(scene.description === undefined ? {} : { description: scene.description }),
    layout: layout === "wide" ? "wide" : "stacked",
    layoutName: layout,
    theme: projectTheme(theme),
    background,
    nodes: emitted.nodes,
    edges,
    ...(scene.timeline === undefined ? {} : { timeline: scene.timeline }),
    diagnostics,
    ...(scene.machine === undefined ? {} : { machine: scene.machine }),
    ...(machineState === undefined ? {} : { machineState }),
    signals,
    ...(scene.controls === undefined ? {} : { controls: scene.controls }),
    root: scene.root.id,
  };
}

function checkBindings(
  scene: SceneDefinition,
  signals: Readonly<Record<string, VariableValue>>,
  diagnostics: SceneDiagnostic[],
): void {
  const known = new Set(Object.keys(signals));
  const check = (
    id: string,
    bindings: Readonly<Record<string, string | undefined>> | undefined,
  ): void => {
    if (bindings === undefined) return;
    for (const [property, signal] of Object.entries(bindings))
      if (typeof signal === "string" && !known.has(signal))
        diagnostics.push({
          severity: "error",
          code: "unknown-signal",
          message: `${id} binds ${property} to unknown signal "${signal}"`,
          path: id,
        });
  };
  const visit = (node: SceneNode): void => {
    check(node.id, node.bind as Readonly<Record<string, string | undefined>> | undefined);
    if (node.type === "group") node.children.forEach(visit);
  };
  visit(scene.root);
  for (const edge of scene.edges ?? []) {
    check(edge.id, edge.bind as Readonly<Record<string, string | undefined>> | undefined);
    for (const label of edge.labels ?? []) check(`${edge.id} label`, label.bind);
  }
  const errors = diagnostics.filter((entry) => entry.code === "unknown-signal");
  if (errors.length > 0)
    throw new Error(
      `invalid bindings in scene ${scene.id}:\n${errors.map((entry) => `- ${entry.message}`).join("\n")}`,
    );
}

// ---------------------------------------------------------------------------------------------
// Unified entry point
// ---------------------------------------------------------------------------------------------

export type FigureSource = SceneDefinition | PipelineDefinition;

export interface ResolveFigureOptions {
  readonly width: number;
  readonly theme?: ThemeTokens;
  readonly layout?: LayoutName | "auto" | "stacked";
  readonly machineState?: MachineState;
  readonly signals?: Readonly<Record<string, VariableValue>>;
  readonly deriveSignals?: ResolveSceneOptions["deriveSignals"];
  readonly precision?: number;
  readonly textMeasurer?: TextMeasurer;
}

export function isSceneDefinition(source: FigureSource): source is SceneDefinition {
  return (source as { schemaVersion?: unknown }).schemaVersion === 2;
}

/** Resolves either the general scene schema or a legacy pipeline definition. */
export function resolveFigure(source: FigureSource, options: ResolveFigureOptions): ResolvedScene {
  if (isSceneDefinition(source)) {
    return resolveScene(source, {
      width: options.width,
      layout: options.layout === "stacked" ? "compact" : (options.layout ?? "auto"),
      ...(options.theme === undefined ? {} : { theme: options.theme }),
      ...(options.machineState === undefined ? {} : { machineState: options.machineState }),
      ...(options.signals === undefined ? {} : { signals: options.signals }),
      ...(options.deriveSignals === undefined ? {} : { deriveSignals: options.deriveSignals }),
      ...(options.precision === undefined ? {} : { precision: options.precision }),
      ...(options.textMeasurer === undefined ? {} : { textMeasurer: options.textMeasurer }),
    });
  }
  const requested = options.layout ?? "auto";
  // "auto" is handed to the layout rather than decided here against a fixed 820px threshold. The
  // gap between two stages is now whatever the connector between them needs, so how wide a
  // pipeline has to be before it can run wide is a function of its stage count — something only
  // the layout knows. Deciding it up here meant asking for a wide layout that could not fit.
  const layout: ResolvePipelineOptions["layout"] =
    requested === "wide" ? "wide" : requested === "auto" ? "auto" : "stacked";
  const resolved = resolvePipeline(source, {
    width: options.width,
    layout,
    ...(options.theme === undefined ? {} : { theme: options.theme }),
    padding: options.width < 520 ? 16 : 24,
    gap: minimumConnectorRun(),
    stackedGap: minimumConnectorRun(),
  });
  const layoutName: LayoutName =
    resolved.layout === "wide" ? "wide" : options.width < 560 ? "narrow" : "compact";
  return { ...resolved, layoutName, background: resolved.theme.background };
}

// ---------------------------------------------------------------------------------------------
// Polylines
// ---------------------------------------------------------------------------------------------

/** Path data for a polyline mark in local box coordinates (0..width, 0..height). */
export function polylinePath(
  node: {
    readonly points: readonly (readonly [number, number])[];
    readonly space?: "fraction" | "px";
    readonly curve?: "linear" | "monotone" | "step";
    readonly closed?: boolean;
    readonly baseline?: number;
  },
  width: number,
  height: number,
  precision = 3,
): string {
  const scale = node.space === "px" ? 1 : undefined;
  const pts = node.points.map(([x, y]) => ({
    x: scale === undefined ? x * width : x,
    y: scale === undefined ? y * height : y,
  }));
  if (pts.length === 0) return "";
  const n = (value: number): string => {
    const rounded = Number(value.toFixed(precision));
    return Object.is(rounded, -0) ? "0" : String(rounded);
  };
  const first = pts[0];
  if (first === undefined) return "";
  const parts: string[] = [`M ${n(first.x)} ${n(first.y)}`];
  const curve = node.curve ?? "linear";
  if (curve === "step") {
    for (let index = 1; index < pts.length; index += 1) {
      const previous = pts[index - 1];
      const current = pts[index];
      if (previous === undefined || current === undefined) continue;
      parts.push(`L ${n(current.x)} ${n(previous.y)}`, `L ${n(current.x)} ${n(current.y)}`);
    }
  } else if (curve === "monotone" && pts.length > 2 && isStrictlyIncreasingX(pts)) {
    // Fritsch–Carlson monotone cubic interpolation (slope-limited), emitted as cubic Béziers.
    // Uneven spacing is handled by the weighted three-point tangent (Fritsch–Butland) and the
    // α/β circle limiter, so the curve never overshoots the data envelope.
    const tangents = monotoneTangents(pts);
    for (let index = 0; index < pts.length - 1; index += 1) {
      const a = pts[index];
      const b = pts[index + 1];
      if (a === undefined || b === undefined) continue;
      const step = (b.x - a.x) / 3;
      const c1 = { x: a.x + step, y: a.y + step * (tangents[index] ?? 0) };
      const c2 = { x: b.x - step, y: b.y - step * (tangents[index + 1] ?? 0) };
      parts.push(`C ${n(c1.x)} ${n(c1.y)} ${n(c2.x)} ${n(c2.y)} ${n(b.x)} ${n(b.y)}`);
    }
  } else {
    // Linear (also the fallback for monotone when x is not strictly increasing).
    for (let index = 1; index < pts.length; index += 1) {
      const current = pts[index];
      if (current !== undefined) parts.push(`L ${n(current.x)} ${n(current.y)}`);
    }
  }
  if (node.baseline !== undefined) {
    const baselineY = scale === undefined ? node.baseline * height : node.baseline;
    const last = pts[pts.length - 1];
    if (last !== undefined)
      parts.push(`L ${n(last.x)} ${n(baselineY)}`, `L ${n(first.x)} ${n(baselineY)}`, "Z");
  } else if (node.closed === true) parts.push("Z");
  return parts.join(" ");
}

function isStrictlyIncreasingX(pts: readonly Point[]): boolean {
  for (let index = 1; index < pts.length; index += 1) {
    const a = pts[index - 1];
    const b = pts[index];
    if (a === undefined || b === undefined || !(b.x > a.x)) return false;
  }
  return true;
}

/**
 * Slope-limited monotone tangents (Fritsch–Carlson with Fritsch–Butland initial estimates).
 * Requires strictly increasing x. Exported for tests.
 */
export function monotoneTangents(pts: readonly Point[]): number[] {
  const count = pts.length;
  if (count < 2) return pts.map(() => 0);
  const h: number[] = [];
  const delta: number[] = [];
  for (let index = 0; index < count - 1; index += 1) {
    const a = pts[index];
    const b = pts[index + 1];
    if (a === undefined || b === undefined) continue;
    h.push(b.x - a.x);
    delta.push((b.y - a.y) / (b.x - a.x));
  }
  const m: number[] = new Array<number>(count).fill(0);
  // Interior tangents: zero at local extrema/plateaus, otherwise the weighted harmonic mean.
  for (let index = 1; index < count - 1; index += 1) {
    const d0 = delta[index - 1] ?? 0;
    const d1 = delta[index] ?? 0;
    const h0 = h[index - 1] ?? 0;
    const h1 = h[index] ?? 0;
    if (d0 * d1 <= 0) m[index] = 0;
    else {
      const w1 = 2 * h1 + h0;
      const w2 = h1 + 2 * h0;
      m[index] = (w1 + w2) / (w1 / d0 + w2 / d1);
    }
  }
  // End tangents: one-sided three-point estimate, clamped to preserve the end interval's shape.
  const endTangent = (dNear: number, dFar: number, hNear: number, hFar: number): number => {
    let value = ((2 * hNear + hFar) * dNear - hNear * dFar) / (hNear + hFar);
    if (Math.sign(value) !== Math.sign(dNear)) value = 0;
    else if (Math.sign(dNear) !== Math.sign(dFar) && Math.abs(value) > Math.abs(3 * dNear))
      value = 3 * dNear;
    return value;
  };
  m[0] =
    count > 2 ? endTangent(delta[0] ?? 0, delta[1] ?? 0, h[0] ?? 0, h[1] ?? 0) : (delta[0] ?? 0);
  m[count - 1] =
    count > 2
      ? endTangent(
          delta[count - 2] ?? 0,
          delta[count - 3] ?? 0,
          h[count - 2] ?? 0,
          h[count - 3] ?? 0,
        )
      : (delta[0] ?? 0);
  // Fritsch–Carlson limiter: keep (α, β) inside the circle of radius 3.
  for (let index = 0; index < count - 1; index += 1) {
    const d = delta[index] ?? 0;
    if (d === 0) {
      m[index] = 0;
      m[index + 1] = 0;
      continue;
    }
    const alpha = (m[index] ?? 0) / d;
    const beta = (m[index + 1] ?? 0) / d;
    const radius = alpha * alpha + beta * beta;
    if (radius > 9) {
      const tau = 3 / Math.sqrt(radius);
      m[index] = tau * alpha * d;
      m[index + 1] = tau * beta * d;
    }
  }
  return m;
}

/** Approximate polyline length in local box units (curves sampled deterministically). */
export function polylineLength(
  node: {
    readonly points: readonly (readonly [number, number])[];
    readonly space?: "fraction" | "px";
    readonly curve?: "linear" | "monotone" | "step";
    readonly closed?: boolean;
    readonly baseline?: number;
  },
  width: number,
  height: number,
): number {
  const px = node.space === "px";
  const pts = node.points.map(([x, y]) => ({ x: px ? x : x * width, y: px ? y : y * height }));
  if (pts.length < 2) return 0;
  let total = 0;
  const curve = node.curve ?? "linear";
  const tangents =
    curve === "monotone" && pts.length > 2 && isStrictlyIncreasingX(pts)
      ? monotoneTangents(pts)
      : undefined;
  for (let index = 1; index < pts.length; index += 1) {
    const a = pts[index - 1];
    const b = pts[index];
    if (a === undefined || b === undefined) continue;
    if (curve === "step") total += Math.abs(b.x - a.x) + Math.abs(b.y - a.y);
    else if (tangents !== undefined) {
      const step = (b.x - a.x) / 3;
      const c1 = { x: a.x + step, y: a.y + step * (tangents[index - 1] ?? 0) };
      const c2 = { x: b.x - step, y: b.y - step * (tangents[index] ?? 0) };
      let previous = a;
      for (let sample = 1; sample <= 16; sample += 1) {
        const t = sample / 16;
        const u = 1 - t;
        const point = {
          x: u * u * u * a.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * b.x,
          y: u * u * u * a.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * b.y,
        };
        total += Math.hypot(point.x - previous.x, point.y - previous.y);
        previous = point;
      }
    } else total += Math.hypot(b.x - a.x, b.y - a.y);
  }
  const first = pts[0];
  const last = pts[pts.length - 1];
  if (node.baseline !== undefined && first !== undefined && last !== undefined) {
    const baselineY = px ? node.baseline : node.baseline * height;
    total +=
      Math.abs(last.y - baselineY) + Math.abs(last.x - first.x) + Math.abs(baselineY - first.y);
  } else if (node.closed === true && first !== undefined && last !== undefined)
    total += Math.hypot(last.x - first.x, last.y - first.y);
  return total;
}
