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
import { material } from "./material.js";
import { body, caption, code, container, heading, stack } from "./recipes.js";
import type { AnimationTimeline, TimelineTrack } from "./resolved.js";
import { defineScene } from "./scene.js";
import type {
  EdgeDefinition,
  GroupNode,
  Insets,
  Paint,
  SceneDefinition,
  SceneNode,
} from "./scene.js";

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

function buildNode(node: SimpleNode): SceneNode {
  const id = nodeId(node.id);
  if (node.kind === "box") return buildBox(node, id);
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

function buildBox(node: SimpleBoxNode, id: string): GroupNode {
  const children: SceneNode[] = [];
  if (node.title !== undefined) children.push(heading(`${id}:title`, node.title));
  if (node.body !== undefined) children.push(caption(`${id}:body`, node.body));
  if (node.children !== undefined && node.children.length > 0)
    children.push(
      container(`${id}:children`, node.layout ?? "stack", node.children.map(buildNode), {
        gap: 12,
        width: "fill",
      }),
    );
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

/**
 * Turns a validated spec into a scene definition. Throws with the same path-named messages
 * `validateSpec` reports when the spec is unusable.
 */
export function sceneFromSpec(spec: SimpleSceneSpec): SceneDefinition {
  const validation = validateSpec(spec);
  if (!validation.ok)
    throw new Error(
      `invalid scene spec:\n${validation.errors.map((error) => `- ${error}`).join("\n")}`,
    );

  const root = container(ROOT_ID, spec.layout, spec.nodes.map(buildNode), {
    gap: spec.gap ?? 16,
    ...(spec.layout === "row" ? { align: "start" as const } : {}),
  });
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
