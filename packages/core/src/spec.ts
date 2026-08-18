/**
 * Simple scenes from data.
 *
 * `SimpleSceneSpec` is a small, JSON-serialisable description of a diagram: an ordered list of
 * text or box nodes, optional edges between them, and one of two timelines. It exists so a
 * form-based builder (a WYSIWYG editor, a CMS field, a generator) can produce and re-open a
 * figure without emitting code, while power users keep authoring richer scenes with `defineScene`
 * and the recipes directly. The mapping is deliberately narrow: every spec produces a scene that
 * passes `validateScene` and resolves without error diagnostics.
 *
 * Ids are deterministic: the root group is `root`, a spec node `a` becomes `n:a` (its box parts
 * `n:a:title`, `n:a:body`, `n:a:children`), and the nth edge becomes `en:from:to`. Spec ids are
 * restricted to letters, digits, `_` and `-` so the `:` separator can never collide.
 */
import { drawEdge, flow, reveal, timeline as buildTimeline } from "./authoring.js";
import { CONNECTOR_LABEL_CLEARANCE, minimumConnectorRun } from "./connector.js";
import { edgeLabelHeight, edgeLabelWidth } from "./edges.js";
import { material } from "./material.js";
import { body, caption, code, container, heading, stack } from "./recipes.js";
import type { AnimationTimeline, TimelineTrack } from "./resolved.js";
import { defineScene } from "./scene.js";
import type {
  EdgeDefinition,
  GroupLayout,
  GroupNode,
  Insets,
  Paint,
  Responsive,
  SceneDefinition,
  SceneNode,
} from "./scene.js";
import type { TextFont } from "./text.js";
import { defaultTheme, type ThemeTokens } from "./theme.js";

// ---------------------------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------------------------

export type SimpleNodeKind = "heading" | "caption" | "code" | "text" | "box";
export type SimpleLayout = "stack" | "row";
export type SimpleBackground = "canvas" | "surface" | "none";
export type SimpleEdgeStyle = "solid" | "dashed" | "flow";
export type SimpleEdgeHead = "arrow" | "none";
export type SimpleTimeline = "reveal" | "none";

export interface SimpleTextNode {
  id: string;
  kind: "heading" | "caption" | "code" | "text";
  text: string;
  tone?: string;
}

export interface SimpleBoxNode {
  id: string;
  kind: "box";
  title?: string;
  body?: string;
  tone?: string;
  children?: SimpleNode[];
  layout?: SimpleLayout;
  /**
   * Whether this box's `row` of children becomes a column in the narrow layout. Defaults to
   * `true`; see `SimpleSceneSpec.stackWhenNarrow`. Ignored when the layout is already a stack.
   */
  stackWhenNarrow?: boolean;
}

export type SimpleNode = SimpleTextNode | SimpleBoxNode;

export interface SimpleEdge {
  from: string;
  to: string;
  label?: string;
  head?: SimpleEdgeHead;
  style?: SimpleEdgeStyle;
}

export interface SimpleSceneSpec {
  version: 1;
  id: string;
  title: string;
  description?: string;
  /** Root arrangement. */
  layout: SimpleLayout;
  gap?: number;
  padding?: number;
  background?: SimpleBackground;
  /**
   * Whether a `row` becomes a column in the narrow layout. Defaults to `true`.
   *
   * A row is a row until there is no room for one. Three boxes that are 260px wide at a 960px
   * container are three 80px columns at a 390px one, and a column that narrow turns every label
   * into a word ladder — the picture technically fits and stops being readable. The narrow
   * arrangement of a row is a column, which is the same answer `flex-wrap` gives in CSS and the
   * one a reader already expects from every other responsive layout they have met.
   *
   * Set it to `false` when the row *is* the meaning — a timeline, a spectrum, a before/after pair
   * — and a column would say something the diagram does not. Such a figure keeps its row at every
   * width and scrolls instead, which is the honest trade when the arrangement carries the point.
   *
   * The breakpoint itself is the scene's (`chooseLayout`: narrow below 560px by default), so a
   * figure re-arranges on the same boundary as everything else drawn at that width.
   */
  stackWhenNarrow?: boolean;
  /** Rendered in order. */
  nodes: SimpleNode[];
  edges?: SimpleEdge[];
  /** Reveal nodes then edges (default), or stay static. */
  timeline?: SimpleTimeline;
}

export interface SimpleSpecValidation {
  ok: boolean;
  errors: string[];
}

// ---------------------------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------------------------

const SPEC_ID = /^[A-Za-z0-9_-]+$/;
const NODE_KINDS: readonly SimpleNodeKind[] = ["heading", "caption", "code", "text", "box"];
const LAYOUTS: readonly SimpleLayout[] = ["stack", "row"];
const BACKGROUNDS: readonly SimpleBackground[] = ["canvas", "surface", "none"];
const EDGE_STYLES: readonly SimpleEdgeStyle[] = ["solid", "dashed", "flow"];
const EDGE_HEADS: readonly SimpleEdgeHead[] = ["arrow", "none"];
const TIMELINES: readonly SimpleTimeline[] = ["reveal", "none"];
/** Tones a spec may name; every one is a semantic paint the themes define. */
const TONES: readonly string[] = [
  "neutral",
  "accent",
  "success",
  "warning",
  "danger",
  "info",
  "muted",
  "text",
  "textMuted",
  "border",
  "connector",
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function list(values: readonly string[]): string {
  return values.map((value) => `"${value}"`).join(", ");
}

function checkText(
  value: unknown,
  path: string,
  errors: string[],
  options: { required?: boolean } = {},
): void {
  if (value === undefined) {
    if (options.required === true) errors.push(`${path}: required`);
    return;
  }
  if (typeof value !== "string") errors.push(`${path}: expected a string`);
  else if (value.trim().length === 0) errors.push(`${path}: must not be empty`);
}

function checkEnum(
  value: unknown,
  path: string,
  allowed: readonly string[],
  errors: string[],
  options: { required?: boolean } = {},
): void {
  if (value === undefined) {
    if (options.required === true) errors.push(`${path}: required`);
    return;
  }
  if (typeof value !== "string" || !allowed.includes(value))
    errors.push(`${path}: expected one of ${list(allowed)}`);
}

function checkSize(value: unknown, path: string, errors: string[]): void {
  if (value === undefined) return;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0)
    errors.push(`${path}: expected a finite number of pixels >= 0`);
}

function checkBoolean(value: unknown, path: string, errors: string[]): void {
  if (value === undefined) return;
  if (typeof value !== "boolean") errors.push(`${path}: expected a boolean`);
}

function checkNode(value: unknown, path: string, ids: Set<string>, errors: string[]): void {
  if (!isRecord(value)) {
    errors.push(`${path}: expected an object`);
    return;
  }

  const id: unknown = value.id;
  if (typeof id !== "string" || id.length === 0) errors.push(`${path}.id: required, a string`);
  else if (!SPEC_ID.test(id))
    errors.push(`${path}.id: may only contain letters, digits, "_" and "-"`);
  else if (ids.has(id)) errors.push(`${path}.id: duplicate node id "${id}"`);
  else ids.add(id);

  const kind: unknown = value.kind;
  checkEnum(kind, `${path}.kind`, NODE_KINDS, errors, { required: true });
  checkEnum(value.tone, `${path}.tone`, TONES, errors);

  if (kind === "box") {
    checkText(value.title, `${path}.title`, errors);
    checkText(value.body, `${path}.body`, errors);
    checkEnum(value.layout, `${path}.layout`, LAYOUTS, errors);
    checkBoolean(value.stackWhenNarrow, `${path}.stackWhenNarrow`, errors);
    const children: unknown = value.children;
    if (children !== undefined) {
      if (!Array.isArray(children)) errors.push(`${path}.children: expected an array`);
      else
        children.forEach((child, index) =>
          checkNode(child, `${path}.children[${index}]`, ids, errors),
        );
    }
    return;
  }
  if (typeof kind === "string" && NODE_KINDS.includes(kind as SimpleNodeKind))
    checkText(value.text, `${path}.text`, errors, { required: true });
}

function checkEdge(value: unknown, path: string, ids: ReadonlySet<string>, errors: string[]): void {
  if (!isRecord(value)) {
    errors.push(`${path}: expected an object`);
    return;
  }
  for (const end of ["from", "to"] as const) {
    const target: unknown = value[end];
    if (typeof target !== "string" || target.length === 0)
      errors.push(`${path}.${end}: required, a node id`);
    else if (!ids.has(target)) errors.push(`${path}.${end}: unknown node id "${target}"`);
  }
  checkText(value.label, `${path}.label`, errors);
  checkEnum(value.head, `${path}.head`, EDGE_HEADS, errors);
  checkEnum(value.style, `${path}.style`, EDGE_STYLES, errors);
}

/** Structural validation of untrusted spec data. Returns every problem, each named by its path. */
export function validateSpec(spec: unknown): SimpleSpecValidation {
  if (!isRecord(spec)) return { ok: false, errors: ["spec: expected an object"] };
  const errors: string[] = [];

  if (spec.version !== 1) errors.push("version: expected 1");
  const id: unknown = spec.id;
  if (typeof id !== "string" || id.length === 0) errors.push("id: required, a string");
  else if (!SPEC_ID.test(id)) errors.push('id: may only contain letters, digits, "_" and "-"');
  checkText(spec.title, "title", errors, { required: true });
  checkText(spec.description, "description", errors);
  checkEnum(spec.layout, "layout", LAYOUTS, errors, { required: true });
  checkBoolean(spec.stackWhenNarrow, "stackWhenNarrow", errors);
  checkSize(spec.gap, "gap", errors);
  checkSize(spec.padding, "padding", errors);
  checkEnum(spec.background, "background", BACKGROUNDS, errors);
  checkEnum(spec.timeline, "timeline", TIMELINES, errors);

  const ids = new Set<string>();
  const nodes: unknown = spec.nodes;
  if (!Array.isArray(nodes)) errors.push("nodes: expected an array");
  else nodes.forEach((node, index) => checkNode(node, `nodes[${index}]`, ids, errors));

  const edges: unknown = spec.edges;
  if (edges !== undefined) {
    if (!Array.isArray(edges)) errors.push("edges: expected an array");
    else edges.forEach((edge, index) => checkEdge(edge, `edges[${index}]`, ids, errors));
  }

  return { ok: errors.length === 0, errors };
}

// ---------------------------------------------------------------------------------------------
// Scene construction
// ---------------------------------------------------------------------------------------------

const ROOT_ID = "root";

function nodeId(id: string): string {
  return `n:${id}`;
}

function edgeId(edge: SimpleEdge, index: number): string {
  return `e${index}:${edge.from}:${edge.to}`;
}

function toneOptions(tone: string | undefined): { readonly tone?: Paint } {
  return tone === undefined ? {} : { tone: tone as Paint };
}

// ---------------------------------------------------------------------------------------------
// Connector-aware spacing
// ---------------------------------------------------------------------------------------------

/**
 * How much room the connectors between a set of siblings need.
 *
 * A gap is not a spacing preference in a diagram that has edges in it — it is the space a
 * connector has to live in, and a connector that does not fit reads as a glitch: a 12px run behind
 * a 10px arrowhead is an arrowhead with a smudge, and an edge label wider than the gap has nowhere
 * to sit but on top of the boxes either side.
 *
 * So the gap is derived, per container, from what its own connectors carry:
 *
 *   - every connected pair needs `minimumConnectorRun` — the head's length plus enough shaft
 *     behind it to read as an arrow;
 *   - a *labelled* connector in a row also needs its label's width plus clearance, because the run
 *     is horizontal and the label sits across it; in a stack the label sits beside a vertical run,
 *     so it needs its height instead.
 *
 * Containers with no edges of their own keep the plain spacing default: this only spends space
 * where a connector actually has to be drawn.
 */
interface SpacingContext {
  /** Edges whose two endpoints are siblings, keyed by the container that holds them. */
  readonly labelsByPair: ReadonlyMap<string, readonly string[]>;
  readonly font: TextFont;
  readonly strokeWidth: number;
}

function siblingKey(ids: readonly string[]): string {
  return [...ids].sort().join(" ");
}

function connectorGap(
  siblings: readonly SimpleNode[],
  layout: SimpleLayout,
  fallback: number,
  context: SpacingContext,
): number {
  if (siblings.length < 2) return fallback;
  const present = new Set(siblings.map((node) => node.id));
  let required = 0;
  for (const [pair, labels] of context.labelsByPair) {
    const [from, to] = pair.split(" ");
    if (from === undefined || to === undefined) continue;
    if (!present.has(from) || !present.has(to)) continue;
    required = Math.max(required, minimumConnectorRun(context.strokeWidth));
    for (const label of labels) {
      const room =
        layout === "row" ? edgeLabelWidth(label, context.font) : edgeLabelHeight(context.font);
      required = Math.max(required, Math.ceil(room) + CONNECTOR_LABEL_CLEARANCE * 2);
    }
  }
  return Math.max(fallback, required);
}

/**
 * The arrangement a container is given, which is one arrangement or one per layout.
 *
 * A stack is a stack at every width — there is nothing narrower for it to become — so it is passed
 * through as the plain string it was written as, and a scene that never had a row is byte-for-byte
 * the scene it was before this existed. A row that is allowed to reflow becomes a *responsive*
 * value instead: still a row where there is room for one, a column where there is not.
 */
function arrangement(layout: SimpleLayout, stackWhenNarrow: boolean): Responsive<GroupLayout> {
  if (layout !== "row" || !stackWhenNarrow) return layout;
  return { wide: "row", compact: "row", narrow: "stack" };
}

/**
 * The gap that arrangement needs, per layout.
 *
 * `connectorGap` already answers a different question for a row than for a stack — a label across
 * a horizontal run asks for its width, a label beside a vertical one asks for its height — so a
 * container that changes arrangement has to change gap with it, or the column it becomes keeps
 * paying for the widest label it used to carry.
 */
function arrangementGap(
  siblings: readonly SimpleNode[],
  layout: SimpleLayout,
  stackWhenNarrow: boolean,
  fallback: number,
  context: SpacingContext,
): Responsive<number> {
  const row = connectorGap(siblings, layout, fallback, context);
  if (layout !== "row" || !stackWhenNarrow) return row;
  const narrow = connectorGap(siblings, "stack", fallback, context);
  return narrow === row ? row : { wide: row, compact: row, narrow };
}

function buildNode(node: SimpleNode, context: SpacingContext): SceneNode {
  const id = nodeId(node.id);
  if (node.kind === "box") return buildBox(node, id, context);
  const options = toneOptions(node.tone);
  switch (node.kind) {
    case "heading":
      return heading(id, node.text, options);
    case "caption":
      return caption(id, node.text, options);
    case "code":
      return code(id, node.text, options);
    default:
      return body(id, node.text, options);
  }
}

function buildBox(node: SimpleBoxNode, id: string, context: SpacingContext): GroupNode {
  const children: SceneNode[] = [];
  if (node.title !== undefined) children.push(heading(`${id}:title`, node.title));
  if (node.body !== undefined) children.push(caption(`${id}:body`, node.body));
  if (node.children !== undefined && node.children.length > 0) {
    const layout = node.layout ?? "stack";
    const stackWhenNarrow = node.stackWhenNarrow ?? true;
    children.push(
      container(
        `${id}:children`,
        arrangement(layout, stackWhenNarrow),
        node.children.map((child) => buildNode(child, context)),
        {
          gap: arrangementGap(node.children, layout, stackWhenNarrow, 12, context),
          width: "fill",
        },
      ),
    );
  }
  return stack(id, children, {
    gap: 8,
    padding: 16,
    width: "fill",
    frame: material("flat", {
      fill: "surface",
      stroke: node.tone === undefined ? "border" : (node.tone as Paint),
      radius: 12,
    }),
    ...(node.title === undefined ? {} : { label: node.title }),
    ...(node.body === undefined ? {} : { description: node.body }),
  });
}

function buildEdge(edge: SimpleEdge, index: number): EdgeDefinition {
  const style = edge.style ?? "solid";
  return {
    id: edgeId(edge, index),
    from: nodeId(edge.from),
    to: nodeId(edge.to),
    route: "straight",
    head: edge.head === "none" ? "none" : "arrow",
    ...(style === "solid" ? {} : { stroke: style }),
    ...(style === "flow" ? { packets: { count: 3 } } : {}),
    ...(edge.label === undefined ? {} : { label: edge.label }),
    description: edge.label ?? `${edge.from} to ${edge.to}`,
  };
}

/**
 * Reveal timeline: each top-level node fades and settles in turn, then every edge draws from its
 * source to its target, with packets starting once a flow edge has finished drawing. The rhythm
 * mirrors the hand-authored catalogue scenes so data-built and code-built figures move alike.
 */
function buildTimelineTracks(
  spec: SimpleSceneSpec,
  edges: readonly EdgeDefinition[],
): AnimationTimeline {
  const nodeTracks = spec.nodes.flatMap((node, index) =>
    reveal(nodeId(node.id), 80 + index * 120, 440 + index * 120, { offset: 8, scale: 0.985 }),
  );
  const edgeBase = 360 + spec.nodes.length * 80;
  const edgeTracks = edges.flatMap((edge, index): TimelineTrack[] => {
    const start = edgeBase + index * 140;
    const end = start + 360;
    return [
      ...drawEdge(edge.id, start, end),
      ...(edge.packets === undefined ? [] : [flow(edge.id, end)]),
    ];
  });
  return buildTimeline(
    [...nodeTracks, ...edgeTracks],
    Math.max(1_200, edgeBase + edges.length * 140 + 480),
  );
}

export interface SceneFromSpecOptions {
  /**
   * The theme the scene will be resolved with.
   *
   * Spacing depends on it: the connector's stroke width decides the shortest run an arrowhead can
   * sit on, and the caption font decides how much room an edge label asks for. Passing the theme
   * the figure will actually be drawn in keeps the two in step; the default theme is assumed
   * otherwise, which is right for every caller that does not retheme.
   */
  readonly theme?: ThemeTokens;
}

/**
 * Turns a validated spec into a scene definition. Throws with the same path-named messages
 * `validateSpec` reports when the spec is unusable.
 */
export function sceneFromSpec(
  spec: SimpleSceneSpec,
  options: SceneFromSpecOptions = {},
): SceneDefinition {
  const validation = validateSpec(spec);
  if (!validation.ok)
    throw new Error(
      `invalid scene spec:\n${validation.errors.map((error) => `- ${error}`).join("\n")}`,
    );

  const theme = options.theme ?? defaultTheme;
  const labelsByPair = new Map<string, string[]>();
  for (const edge of spec.edges ?? []) {
    const key = siblingKey([edge.from, edge.to]);
    const list = labelsByPair.get(key) ?? [];
    if (edge.label !== undefined) list.push(edge.label);
    labelsByPair.set(key, list);
  }
  const spacing: SpacingContext = {
    labelsByPair,
    font: theme.typography.caption,
    strokeWidth: theme.strokes.regular,
  };

  const stackWhenNarrow = spec.stackWhenNarrow ?? true;
  const root = container(
    ROOT_ID,
    arrangement(spec.layout, stackWhenNarrow),
    spec.nodes.map((node) => buildNode(node, spacing)),
    {
      gap: spec.gap ?? arrangementGap(spec.nodes, spec.layout, stackWhenNarrow, 16, spacing),
    },
  );
  const edges = (spec.edges ?? []).map(buildEdge);
  const padding: Insets | undefined = spec.padding;
  const background =
    spec.background === undefined
      ? undefined
      : spec.background === "none"
        ? ("transparent" as const)
        : spec.background;

  return defineScene({
    schemaVersion: 2,
    id: spec.id,
    title: spec.title,
    ...(spec.description === undefined ? {} : { description: spec.description }),
    ...(padding === undefined ? {} : { padding }),
    ...(background === undefined ? {} : { background }),
    root,
    ...(edges.length === 0 ? {} : { edges }),
    ...((spec.timeline ?? "reveal") === "none"
      ? {}
      : { timeline: buildTimelineTracks(spec, edges) }),
  });
}
