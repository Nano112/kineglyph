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

export interface LogicGateOptions extends ContainerOptions {
  /** Outline and pin colour. */
  readonly tone?: Paint;
  /** Interior of the gate silhouette. */
  readonly fill?: FillPaint;
  /** Short symbol drawn inside the gate; defaults to the upper-case kind. */
  readonly text?: string;
  /** Hide the interior text for a strictly symbolic schematic. */
  readonly showText?: boolean;
  readonly textTone?: Paint;
}

/**
 * A proper logic-gate silhouette with visible input/output pins. It is still an ordinary group of
 * path, circle, and text marks, so it exports everywhere and can be targeted by normal edges.
 */
export function gate(id: string, kind: LogicGateKind, options: LogicGateOptions = {}): GroupNode {
  const {
    tone = "accent",
    fill = "surfaceRaised",
    text: symbol = kind.toUpperCase(),
    showText = true,
    textTone = "text",
    width = 120,
    height = 80,
    label = `${kind.toUpperCase()} logic gate`,
    metadata,
    ...containerOptions
  } = options;
  const shapeBind = containerOptions.bind;
  const inverted = kind === "nand" || kind === "nor" || kind === "xnor" || kind === "not";
  const base = kind === "nand" ? "and" : kind === "nor" || kind === "xnor" ? "or" : kind;
  const outputX = inverted ? 98 : 108;
  const body =
    base === "and"
      ? `M 14 8 L 52 8 C 86 8 ${outputX} 22 ${outputX} 40 C ${outputX} 58 86 72 52 72 L 14 72 Z`
      : base === "or" || base === "xor"
        ? `M 14 8 C 35 29 35 51 14 72 C 53 72 88 64 ${outputX} 40 C 88 16 53 8 14 8 Z`
        : base === "not" || base === "buffer"
          ? `M 14 8 L ${outputX} 40 L 14 72 Z`
          : "M 18 8 L 100 18 L 100 62 L 18 72 Z";
  const inputPins =
    base === "not" || base === "buffer" ? "M 0 40 L 14 40" : "M 0 27 L 17 27 M 0 53 L 17 53";
  const outputPin = inverted ? "M 112 40 L 120 40" : `M ${outputX} 40 L 120 40`;
  const children: SceneNode[] = [
    {
      id: `${id}-shape`,
      type: "path",
      d: `${body} ${inputPins} ${outputPin}`,
      viewBox: { width: 120, height: 80 },
      fill,
      stroke: tone,
      strokeWidth: 2.4,
      width: "100%",
      height: "100%",
      position: { x: 0, y: 0 },
      ...(shapeBind === undefined ? {} : { bind: shapeBind }),
    },
  ];
  if (base === "xor") {
    children.push({
      id: `${id}-xor-arc`,
      type: "path",
      d: "M 7 8 C 28 29 28 51 7 72",
      viewBox: { width: 120, height: 80 },
      fill: "none",
      stroke: tone,
      strokeWidth: 2.4,
      width: "100%",
      height: "100%",
      position: { x: 0, y: 0 },
      ...(shapeBind === undefined ? {} : { bind: shapeBind }),
    });
  }
  if (inverted) {
    children.push({
      id: `${id}-bubble`,
      type: "circle",
      radius: 7,
      fill,
      stroke: tone,
      strokeWidth: 2.4,
      width: 14,
      height: 14,
      position: { x: 105 / 120, y: 0.5, anchor: "center" },
      ...(shapeBind === undefined ? {} : { bind: shapeBind }),
    });
  }
  if (showText) {
    children.push({
      ...code(`${id}-text`, symbol, { tone: textTone, align: "center", width: 52 }),
      position: { x: base === "mux" ? 0.5 : 0.48, y: 0.5, anchor: "center" },
    });
  }
  return container(id, "coordinates", children, {
    ...containerOptions,
    width,
    height,
    label,
    metadata: { ...metadata, circuitRole: "gate", gateKind: kind },
  });
}

export interface JunctionOptions {
  readonly tone?: Paint;
  readonly size?: Responsive<number>;
  readonly label?: string;
  readonly bind?: NodeBindings;
  readonly hidden?: Responsive<boolean>;
}

/** A filled circuit-net junction suitable for branching orthogonal wires. */
export function junction(id: string, options: JunctionOptions = {}): CircleMark {
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
    fill: options.tone ?? "accent",
    stroke: "canvas",
    strokeWidth: 2,
    label: options.label ?? "Circuit junction",
    metadata: { circuitRole: "junction" },
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

export type TerminalLineKind = "command" | "output" | "success" | "warning" | "error" | "comment";

export interface TerminalLine {
  readonly text: string;
  readonly kind?: TerminalLineKind;
  /** Prompt shown before command text. Defaults to `$`. */
  readonly prompt?: string;
  /** Marks this line for `f.typewrite(terminal)`. Commands default to true. */
  readonly typing?: boolean;
}

export interface TerminalOptions extends ContainerOptions {
  readonly title?: string;
  readonly cwd?: string;
  readonly prompt?: string;
  readonly rows?: Responsive<number>;
  readonly chrome?: "window" | "plain";
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
  const rows = lines.map((entry, index): GroupNode => {
    const line: TerminalLine = typeof entry === "string" ? { text: entry } : entry;
    const kind = line.kind ?? "output";
    const typing = line.typing ?? kind === "command";
    const content = code(`${id}-line-${index + 1}-text`, line.text, {
      tone: terminalLineTone(kind),
      reveal: typing ? "characters" : "lines",
      width: "fill",
      ...(options.rows === undefined ? {} : { maxLines: options.rows }),
    });
    const children: SceneNode[] = [];
    if (kind === "command") {
      children.push(
        code(`${id}-line-${index + 1}-prompt`, line.prompt ?? options.prompt ?? "$", {
          tone: "accent",
        }),
      );
    }
    children.push(content);
    return row(`${id}-line-${index + 1}`, children, {
      gap: kind === "command" ? 8 : 0,
      width: "fill",
      align: "start",
      metadata: { terminalRole: "line", terminalLineKind: kind, typing },
    });
  });

  const chrome: SceneNode[] = [];
  if ((options.chrome ?? "window") === "window") {
    const dots = row(
      `${id}-window-controls`,
      (["danger", "warning", "success"] as const).map((tone, index) => ({
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
    const titleText = code(`${id}-title`, options.title ?? "Terminal", { tone: "textMuted" });
    chrome.push(
      row(`${id}-chrome`, [dots, titleText], {
        gap: 12,
        align: "center",
        width: "fill",
      }),
      rule(`${id}-chrome-rule`),
    );
  }
  if (options.cwd !== undefined)
    chrome.push(eyebrow(`${id}-cwd`, options.cwd, { tone: "textMuted" }));

  const {
    title: _title,
    cwd: _cwd,
    prompt: _prompt,
    rows: _rows,
    chrome: _chrome,
    ...container
  } = options;
  void _title;
  void _cwd;
  void _prompt;
  void _rows;
  void _chrome;
  return stack(id, [...chrome, stack(`${id}-screen`, rows, { gap: 5, width: "fill" })], {
    ...containerOptions(container),
    gap: options.gap ?? 10,
    padding: options.padding ?? [14, 16],
    width: options.width ?? "fill",
    frame: options.frame ?? { fill: "surfaceRaised", stroke: "border" },
    label: options.label ?? options.title ?? "Terminal session",
    metadata: { ...options.metadata, terminalRole: "terminal" },
  });
}

export interface FileTreeEntry {
  readonly name: string;
  readonly kind?: "file" | "folder";
  readonly children?: readonly FileTreeEntry[];
  readonly detail?: string;
  readonly status?: string;
  readonly tone?: Paint;
  readonly expanded?: boolean;
}

export interface FileTreeOptions extends ContainerOptions {
  readonly root?: string;
  readonly guides?: boolean;
  readonly density?: "compact" | "comfortable";
}

/** A recursive, responsive directory tree with semantic icons, branch guides, and annotations. */
export function fileTree(
  id: string,
  entries: readonly FileTreeEntry[],
  options: FileTreeOptions = {},
): GroupNode {
  const gap = options.density === "compact" ? 4 : 7;
  const branch = (entry: FileTreeEntry, path: string, depth: number): GroupNode => {
    const folder = entry.kind === "folder" || entry.children !== undefined;
    const tone = entry.tone ?? (folder ? "accent" : "textMuted");
    const label = row(
      `${path}-label`,
      [
        motif(`${path}-icon`, folder ? "folder" : "file", { tone, size: 16 }),
        code(`${path}-name`, entry.name, { tone: folder ? "text" : tone }),
        ...(entry.detail === undefined
          ? []
          : [caption(`${path}-detail`, entry.detail, { tone: "textMuted", width: "fill" })]),
        ...(entry.status === undefined
          ? []
          : [pill(`${path}-status`, entry.status, { tone, variant: "outline" })]),
      ],
      {
        gap: 8,
        align: "center",
        width: "fill",
        metadata: { fileTreeRole: folder ? "folder" : "file", depth },
      },
    );
    const children = entry.expanded === false ? [] : (entry.children ?? []);
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
  const { root: _root, guides: _guides, density: _density, ...container } = options;
  void _root;
  void _guides;
  void _density;
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
