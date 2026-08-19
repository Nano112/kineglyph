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
}

export type CodeBlockSource = string | readonly (string | CodeBlockLine)[];

export interface CodeBlockOptions extends ContainerOptions {
  readonly language?: CodeLanguage;
  readonly title?: string;
  readonly chrome?: "header" | "plain";
  readonly lineNumbers?: boolean;
  readonly startLine?: number;
  readonly highlightLines?: readonly number[];
  readonly highlightRanges?: readonly (readonly [start: number, end: number])[];
  readonly highlightTone?: FillPaint;
  readonly lineGap?: Responsive<number>;
  readonly tabSize?: number;
  /** Marks generated token text for `f.typewrite(codeBlock)`. */
  readonly typing?: boolean;
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
  const language = options.language ?? "text";
  const sourceLines =
    typeof source === "string" ? source.replaceAll("\r\n", "\n").split("\n") : source;
  const startLine = options.startLine ?? 1;
  const highlighted = new Set(options.highlightLines ?? []);
  const inHighlightedRange = (line: number): boolean =>
    (options.highlightRanges ?? []).some(([start, end]) => line >= start && line <= end);
  const tabSize = Math.max(1, options.tabSize ?? 2);
  const rows = sourceLines.map((entry, index) => {
    const line: CodeBlockLine = typeof entry === "string" ? { text: entry } : entry;
    const lineNumber = line.number ?? startLine + index;
    const tokens = line.tokens ?? highlightCodeLine(line.text ?? "", language);
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
      metadata: {
        codeRole: "token",
        tokenKind: token.kind ?? "plain",
        typing,
        typingOrder: index * 10_000 + tokenIndex,
      },
    }));
    if (tokenNodes.length === 0)
      tokenNodes.push(code(`${id}-line-${index + 1}-empty`, "\u00a0", { tone: "text" }));
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
        }),
      );
    }
    const isHighlighted =
      line.highlighted === true || highlighted.has(lineNumber) || inHighlightedRange(lineNumber);
    const diffFill: FillPaint | undefined =
      line.diff === "add" ? "surfaceMuted" : line.diff === "remove" ? "surfaceMuted" : undefined;
    return row(`${id}-line-${index + 1}`, children, {
      gap: options.lineNumbers === false && line.diff === undefined ? 0 : 14,
      padding: [3, 8],
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
    lineNumbers: _lineNumbers,
    startLine: _startLine,
    highlightLines: _highlightLines,
    highlightRanges: _highlightRanges,
    highlightTone: _highlightTone,
    lineGap: _lineGap,
    tabSize: _tabSize,
    typing: _typing,
    tokenTones: _tokenTones,
    ...container
  } = options;
  void _language;
  void _title;
  void _chrome;
  void _lineNumbers;
  void _startLine;
  void _highlightLines;
  void _highlightRanges;
  void _highlightTone;
  void _lineGap;
  void _tabSize;
  void _typing;
  void _tokenTones;
  return stack(
    id,
    [...header, stack(`${id}-source`, rows, { gap: options.lineGap ?? 1, width: "fill" })],
    {
      ...containerOptions(container),
      gap: options.gap ?? 10,
      padding: options.padding ?? [12, 14],
      width: options.width ?? "fill",
      frame: options.frame ?? { fill: "surfaceRaised", stroke: "border" },
      label: options.label ?? options.title ?? `${language} code`,
      metadata: { ...options.metadata, codeRole: "block", language },
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

export interface TerminalOptions extends ContainerOptions {
  readonly title?: string;
  readonly cwd?: string;
  readonly prompt?: string;
  readonly promptTone?: Paint;
  readonly titleTone?: Paint;
  readonly cwdTone?: Paint;
  readonly rows?: Responsive<number>;
  readonly chrome?: "window" | "minimal" | "plain";
  /** Window control colours from left to right; pass an empty array to hide the controls. */
  readonly chromeControls?: readonly Paint[];
  readonly cursor?: boolean | TerminalCursorOptions;
  readonly lineGap?: Responsive<number>;
  /** Horizontal text policy. `clip` is the compact terminal default. */
  readonly wrap?: "wrap" | "clip" | "overflow";
  /** Number of authored rows kept in the static viewport. */
  readonly visibleLines?: number;
  /** First visible row (zero-based), or pin the viewport to either end. */
  readonly scroll?: "start" | "end" | number;
  readonly selectionTone?: FillPaint;
  /** Optional session-level status shown in the chrome. */
  readonly status?: TerminalStatus;
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

function terminalStatus(status: TerminalStatus): { readonly label: string; readonly tone: Paint } {
  if (typeof status !== "string") return { label: status.label, tone: status.tone ?? "info" };
  if (status === "success") return { label: "passed", tone: "success" };
  if (status === "error") return { label: "failed", tone: "danger" };
  return {
    label: status,
    tone: status === "warning" ? "warning" : status === "running" ? "info" : "textMuted",
  };
}

function terminalSpan(
  id: string,
  span: TerminalSpan,
  options: { readonly typing: boolean; readonly selectionTone: FillPaint },
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
    }),
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
  const selectionTone = options.selectionTone ?? "surfaceMuted";
  const allRows = lines.map((entry, index): GroupNode => {
    const line: TerminalLine = typeof entry === "string" ? { text: entry } : entry;
    const kind = line.kind ?? "output";
    const typing = line.typing ?? kind === "command";
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
    if (kind === "command") {
      children.push(
        code(`${id}-line-${index + 1}-prompt`, line.prompt ?? options.prompt ?? "$", {
          tone: line.promptTone ?? options.promptTone ?? "accent",
        }),
      );
    }
    if (line.spans !== undefined) {
      children.push(
        row(
          `${id}-line-${index + 1}-content`,
          line.spans.map((span, spanIndex) =>
            terminalSpan(`${id}-line-${index + 1}-span-${spanIndex + 1}`, span, {
              typing,
              selectionTone,
            }),
          ),
          {
            gap: 0,
            width: "fill",
            align: "start",
            clip: wrapPolicy === "clip",
            allowOverflow: wrapPolicy === "overflow",
          },
        ),
      );
    } else {
      children.push({
        ...code(`${id}-line-${index + 1}-text`, line.text ?? " ", {
          tone: line.tone ?? terminalLineTone(kind),
          reveal: typing ? "characters" : "lines",
          width: "fill",
          ...(options.rows === undefined ? {} : { maxLines: options.rows }),
        }),
        wrap: wrapPolicy === "wrap",
      });
    }
    if (lineCursor !== undefined) {
      const style = lineCursor.style ?? "block";
      children.push(
        code(
          `${id}-line-${index + 1}-cursor`,
          style === "bar" ? "▎" : style === "underline" ? "_" : "█",
          { tone: lineCursor.tone ?? "accent" },
        ),
      );
    }
    if (line.status !== undefined) {
      const status = terminalStatus(line.status);
      children.push(
        pill(`${id}-line-${index + 1}-status`, status.label, {
          tone: status.tone,
          variant: "outline",
        }),
      );
    }
    const selected = line.selected ?? false;
    return row(`${id}-line-${index + 1}`, children, {
      gap: kind === "command" ? 8 : 0,
      padding: line.background === undefined && !selected ? 0 : [2, 5],
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
      },
    });
  });

  const visibleLines = Math.max(1, Math.floor(options.visibleLines ?? allRows.length));
  const maximumStart = Math.max(0, allRows.length - visibleLines);
  const scrollStart =
    options.scroll === "end"
      ? maximumStart
      : options.scroll === "start" || options.scroll === undefined
        ? 0
        : Math.max(0, Math.min(maximumStart, Math.floor(options.scroll)));
  const rows = allRows.slice(scrollStart, scrollStart + visibleLines);

  const chrome: SceneNode[] = [];
  const chromeStyle = options.chrome ?? "window";
  if (chromeStyle !== "plain") {
    const dots = row(
      `${id}-window-controls`,
      (options.chromeControls ?? (["danger", "warning", "success"] as const)).map(
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
    const titleText = code(`${id}-title`, options.title ?? "Terminal", {
      tone: options.titleTone ?? "textMuted",
      width: "fill",
    });
    const sessionStatus = options.status === undefined ? undefined : terminalStatus(options.status);
    chrome.push(
      row(
        `${id}-chrome`,
        [
          ...(chromeStyle === "window" ? [dots] : []),
          titleText,
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
          gap: 12,
          align: "center",
          width: "fill",
        },
      ),
      rule(`${id}-chrome-rule`),
    );
  }
  if (options.cwd !== undefined)
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
    chromeControls: _chromeControls,
    cursor: _cursor,
    lineGap: _lineGap,
    wrap: _wrap,
    visibleLines: _visibleLines,
    scroll: _scroll,
    selectionTone: _selectionTone,
    status: _status,
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
  void _chromeControls;
  void _cursor;
  void _lineGap;
  void _wrap;
  void _visibleLines;
  void _scroll;
  void _selectionTone;
  void _status;
  return stack(
    id,
    [...chrome, stack(`${id}-screen`, rows, { gap: options.lineGap ?? 5, width: "fill" })],
    {
      ...containerOptions(container),
      gap: options.gap ?? 10,
      padding: options.padding ?? [14, 16],
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
