/**
 * `figure()` — the compact authoring surface over the scene IR.
 *
 * A figure is built imperatively against a builder `f`: helpers create typed nodes with inferred,
 * stable ids; `f.add` composes fragments (compiled charts, reusable clusters) under scoped ids;
 * `f.connect` draws connectors; motion presets return steps that `f.sequence` / `f.at` schedule
 * into one timeline; `f.machine` / `f.controls` add interaction. The result is an ordinary,
 * validated `SceneDefinition`, so `defineScene()` and raw nodes stay available as escape hatches
 * (`f.raw`) and nothing here is required by the runtimes.
 *
 * Id inference: `${kind}-${slug(primaryText)}` (lower-case ASCII, spaces → "-", at most 32
 * characters), de-duplicated with `-2`, `-3`, … in creation order, so ids are stable across builds
 * of the same figure. Every helper accepts an explicit `id` to override.
 */
import {
  drawEdge,
  flow as flowTracks,
  highlight as highlightTracks,
  progressTo,
  pulse as pulseTracks,
  reveal as revealTracks,
  track,
} from "./authoring.js";
import { scopeFragment, shiftTracks, tracksDuration, type SceneFragment } from "./fragment.js";
import type { Easing } from "./easing.js";
import { validateStateMachine, type StateMachineDefinition } from "./machine.js";
import {
  card,
  container,
  gate,
  junction,
  keyValue,
  panel,
  pill,
  rule,
  spacer,
  stack,
  type CardOptions,
  type ContainerOptions,
  type KeyValueOptions,
  type LogicGateKind,
  type LogicGateOptions,
  type JunctionOptions,
  type PanelOptions,
  type PillOptions,
  type TextOptions,
} from "./recipes.js";
import type {
  AnimationTimeline,
  TimelineKeyframe,
  TimelineProperty,
  TimelineTrack,
} from "./resolved.js";
import {
  defineScene,
  endpointNode,
  walkScene,
  type BadgeMark,
  type CalloutMark,
  type CircleMark,
  type EdgeDefinition,
  type EdgeEndpoint,
  type GroupLayout,
  type GroupNode,
  type IconMark,
  type ImageMark,
  type Insets,
  type LayoutBreakpoints,
  type LegendMark,
  type Paint,
  type PathMark,
  type PolylineMark,
  type RectMark,
  type Responsive,
  type SceneControl,
  type SceneDefinition,
  type SceneMetadata,
  type SceneNode,
  type TextMark,
} from "./scene.js";
import type { SemanticColorToken, SemanticTextStyle } from "./schema.js";
import type { Variables } from "./machine.js";

// ---------------------------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------------------------

/** Scene-level metadata for a figure; everything except `title` is optional. */
export interface FigureMeta {
  readonly title: string;
  readonly description?: string;
  readonly breakpoints?: Partial<LayoutBreakpoints>;
  readonly padding?: Responsive<Insets>;
  readonly background?: SemanticColorToken | "transparent";
  readonly metadata?: SceneMetadata;
  /** Defaults and declarations for signals supplied later by a live data source. */
  readonly signals?: Variables;
  /** Milliseconds added after the last keyframe so the terminal frame holds (default 0). */
  readonly hold?: number;
}

/** Thin typed wrapper options: every field of the mark except `type`, `id`, and its primary args. */
export type MarkOptions<M extends SceneNode, Primary extends keyof M = never> = Omit<
  M,
  "type" | "id" | Primary
> & { readonly id?: string };

export type FigureTextOptions = TextOptions &
  Omit<MarkOptions<TextMark, "text">, keyof TextOptions | "color" | "textStyle"> & {
    readonly id?: string;
    /** Overrides the helper's default text style (mostly useful with `f.text`). */
    readonly textStyle?: Responsive<SemanticTextStyle>;
  };
export type FigureTextPosition = NonNullable<TextMark["position"]>;
export type FigureBadgeOptions = MarkOptions<BadgeMark, "text">;
export type FigureIconOptions = MarkOptions<IconMark, "icon">;
export type FigureRectOptions = MarkOptions<RectMark>;
export type FigureCircleOptions = MarkOptions<CircleMark>;
export type FigurePolylineOptions = MarkOptions<PolylineMark, "points">;
export type FigurePathOptions = MarkOptions<PathMark, "d" | "viewBox">;
export type FigureImageOptions = MarkOptions<ImageMark, "src" | "alt">;
export type FigureLegendOptions = MarkOptions<LegendMark, "items">;
export type FigureCalloutOptions = MarkOptions<CalloutMark, "text">;
export type FigureCardOptions = CardOptions & { readonly id?: string };
export type FigurePanelOptions = PanelOptions & { readonly id?: string };
export type FigurePillOptions = PillOptions & { readonly id?: string };
export type FigureGateOptions = LogicGateOptions & { readonly id?: string };
export type FigureJunctionOptions = JunctionOptions & { readonly id?: string };
export type FigureKeyValueOptions = KeyValueOptions & { readonly id?: string };
export interface FigureRuleOptions {
  readonly id?: string;
  readonly tone?: Paint;
}
export interface FigureSpacerOptions {
  readonly id?: string;
}
export type FigureGroupOptions = ContainerOptions & { readonly id?: string };

/** High-level ranked layouts for node-link figures. Each inner array is one parallel stage. */
export type FigureGraphStyle = "flow" | "circuit" | "tree";
export type FigureGraphDirection = "horizontal" | "vertical";
export interface FigureGraphRank extends FigureGroupOptions {
  readonly nodes: readonly SceneNode[];
  readonly layout?: Responsive<"stack" | "row" | "grid">;
}
export type FigureGraphLayer = SceneNode | readonly SceneNode[] | FigureGraphRank;
export interface FigureGraphOptions extends FigureGroupOptions {
  /** `flow` adapts like prose, `circuit` preserves ranks, and `tree` centres each rank. */
  readonly style?: FigureGraphStyle;
  /** Overrides the preset's axis, including per responsive layout. */
  readonly direction?: Responsive<FigureGraphDirection>;
  /** Default layout inside every multi-node rank; individual ranks may override it. */
  readonly rankLayout?: Responsive<"stack" | "row" | "grid">;
  /** Default column count for grid ranks; individual ranks may override it. */
  readonly rankColumns?: Responsive<number>;
  /** Space between ranked stages; `gap` remains a concise alias. */
  readonly layerGap?: Responsive<number>;
  /** Space between nodes that share a stage. */
  readonly nodeGap?: Responsive<number>;
}

export interface FigureAddOptions {
  /** Namespace for the fragment's ids (default: inferred from the fragment's root id). */
  readonly id?: string;
  /** Schedule the fragment's own motion at this absolute time immediately. */
  readonly at?: number;
}

/** Anything `f.add` accepts: a fragment, or a compiler result carrying one (e.g. `plot()`). */
export type FigureFragmentSource =
  SceneFragment | { readonly fragment: SceneFragment; readonly handles?: unknown };

export type NodeRef = SceneNode | string;
/** A connector endpoint: a node (or id), or a node plus port options. */
export type EndpointRef = NodeRef | ({ readonly node: NodeRef } & Omit<EdgeEndpoint, "node">);
export type ConnectOptions = Omit<EdgeDefinition, "id" | "from" | "to"> & { readonly id?: string };
export type FigureWireKind = "signal" | "bus" | "control";
export interface FigureWireOptions extends ConnectOptions {
  /** Semantic circuit-wire preset; individual connector options still override it. */
  readonly kind?: FigureWireKind;
}

/** Motion targets: nodes, edges, ids, or arrays of those (edges only where the property allows). */
export type MotionTarget =
  SceneNode | EdgeDefinition | string | readonly (SceneNode | EdgeDefinition | string)[];
export type EdgeTarget = EdgeDefinition | string | readonly (EdgeDefinition | string)[];

export interface MotionOptions {
  /** Milliseconds for one target; steps report their total span as `duration`. */
  readonly duration?: number;
  /** Delay between successive targets when the target is an array (default 0). */
  readonly stagger?: number;
  /** Named, cubic Bézier, or spring easing applied to the preset's interpolated keyframes. */
  readonly easing?: Easing;
}
export interface RevealOptions extends MotionOptions {
  /** Slide-in offset in pixels along y (starts offset, settles at 0). */
  readonly offset?: number;
  /** Starting scale (settles at 1). */
  readonly scale?: number;
}
export type DrawOptions = MotionOptions;
export type PulseOptions = MotionOptions;
export interface FlowOptions extends MotionOptions {
  /** Keep packets running for this long, then fade them out; omit to leave them on. */
  readonly duration?: number;
}
export interface HighlightOptions extends MotionOptions {
  readonly peak?: number;
  readonly rest?: number;
}
export interface ProgressOptions extends MotionOptions {
  readonly from?: number;
  readonly to?: number;
}
export type RiseOptions = MotionOptions;
export type WipeOptions = MotionOptions;

/** A schedulable unit of motion; `f.sequence` and `f.at` decide when it starts. */
export interface MotionStep {
  readonly kind: "motion";
  /** What the step does, for diagnostics (e.g. `reveal(card-plan)`). */
  readonly label: string;
  /** Milliseconds from the step start to its last keyframe. */
  readonly duration: number;
  /** Absolute tracks for a start time; the builder makes track ids unique. */
  readonly tracks: (start: number) => readonly TimelineTrack[];
}
export type SequenceEntry = MotionStep | readonly MotionStep[];
export interface SequenceOptions {
  /** Milliseconds between the end of one step and the start of the next (default 120). */
  readonly gap?: number;
  /** Absolute start of the first step (default 0). */
  readonly start?: number;
}

export type FigureMachine = Omit<StateMachineDefinition, "id"> & { readonly id?: string };
export type FigureControl = Omit<SceneControl, "id"> & { readonly id?: string };

/** The builder handed to `figure()`'s build callback. */
export interface FigureBuilder {
  // Text
  text(text: string, options?: FigureTextOptions): TextMark;
  /** Text positioned inside `coordinates` / `absolute`; position may vary by layout. */
  textAt(text: string, position: FigureTextPosition, options?: FigureTextOptions): TextMark;
  /** Strong coordinate label shorthand (for values, callouts, and direct annotations). */
  labelAt(text: string, position: FigureTextPosition, options?: FigureTextOptions): TextMark;
  eyebrow(text: string, options?: FigureTextOptions): TextMark;
  heading(text: string, options?: FigureTextOptions): TextMark;
  title(text: string, options?: FigureTextOptions): TextMark;
  caption(text: string, options?: FigureTextOptions): TextMark;
  body(text: string, options?: FigureTextOptions): TextMark;
  code(text: string, options?: FigureTextOptions): TextMark;
  // Marks
  badge(text: string, options?: FigureBadgeOptions): BadgeMark;
  icon(name: string, options?: FigureIconOptions): IconMark;
  rect(options?: FigureRectOptions): RectMark;
  circle(options?: FigureCircleOptions): CircleMark;
  polyline(points: PolylineMark["points"], options?: FigurePolylineOptions): PolylineMark;
  path(d: string, viewBox: PathMark["viewBox"], options?: FigurePathOptions): PathMark;
  image(src: string, alt: string, options?: FigureImageOptions): ImageMark;
  legend(items: LegendMark["items"], options?: FigureLegendOptions): LegendMark;
  callout(text: string, options?: FigureCalloutOptions): CalloutMark;
  // Recipes
  card(options: FigureCardOptions): GroupNode;
  panel(children: readonly SceneNode[], options?: FigurePanelOptions): GroupNode;
  pill(text: string, options?: FigurePillOptions): BadgeMark;
  /** Standard logic-gate silhouette with pins; connect using normal endpoint sides/offsets. */
  gate(kind: LogicGateKind, options?: FigureGateOptions): GroupNode;
  /** Filled net junction for explicit signal fan-out. */
  junction(options?: FigureJunctionOptions): CircleMark;
  keyValue(key: string, value: string, options?: FigureKeyValueOptions): GroupNode;
  rule(options?: FigureRuleOptions): RectMark;
  spacer(size: Responsive<number>, options?: FigureSpacerOptions): RectMark;
  // Layout
  /** Places an existing node in a coordinates/absolute group without cloning or changing its id. */
  place<T extends SceneNode>(node: T, position: NonNullable<SceneNode["position"]>): T;
  stack(children: readonly SceneNode[], options?: FigureGroupOptions): GroupNode;
  row(children: readonly SceneNode[], options?: FigureGroupOptions): GroupNode;
  grid(children: readonly SceneNode[], options?: FigureGroupOptions): GroupNode;
  overlay(children: readonly SceneNode[], options?: FigureGroupOptions): GroupNode;
  coordinates(children: readonly SceneNode[], options?: FigureGroupOptions): GroupNode;
  absolute(children: readonly SceneNode[], options?: FigureGroupOptions): GroupNode;
  /** Row on wide layouts, stack otherwise (given children); packets on (given an edge). */
  flow(children: readonly SceneNode[], options?: FigureGroupOptions): GroupNode;
  flow(edge: EdgeTarget, options?: FlowOptions): MotionStep;
  /** Ranked node-link layout. Circuit ranks stay stable while ordinary flow remains responsive. */
  graph(layers: readonly FigureGraphLayer[], options?: FigureGraphOptions): GroupNode;
  // Composition
  /**
   * Adds a fragment (or a `plot()` result). Ids are scoped under `options.id` unless the fragment
   * already lives in that namespace; edges and controls are appended; the fragment's relative
   * tracks become the step `f.reveal(root)` plays (or start at `options.at`). Returns the root
   * node; fragments with several top-level nodes are wrapped in a stack named after the scope.
   */
  add(source: FigureFragmentSource, options?: FigureAddOptions): SceneNode;
  /** Escape hatch: any hand-written node (ids are still registered and checked). */
  raw<T extends SceneNode>(node: T): T;
  // Connectors
  connect(from: EndpointRef, to: EndpointRef, options?: ConnectOptions): EdgeDefinition;
  /** Orthogonal circuit connector with signal, bus, and control presets. */
  wire(from: EndpointRef, to: EndpointRef, options?: FigureWireOptions): EdgeDefinition;
  // Motion presets
  reveal(target: MotionTarget, options?: RevealOptions): MotionStep;
  draw(edge: EdgeTarget, options?: DrawOptions): MotionStep;
  pulse(target: MotionTarget, options?: PulseOptions): MotionStep;
  highlight(target: MotionTarget, options?: HighlightOptions): MotionStep;
  progress(target: MotionTarget, options?: ProgressOptions): MotionStep;
  /** Anchored vertical reveal (`revealY` 0 → 1). */
  rise(target: MotionTarget, options?: RiseOptions): MotionStep;
  /** Anchored horizontal reveal (`revealX` 0 → 1). */
  wipe(target: MotionTarget, options?: WipeOptions): MotionStep;
  // Scheduling
  sequence(steps: readonly SequenceEntry[], options?: SequenceOptions): void;
  at(time: number, ...steps: readonly MotionStep[]): void;
  // Interaction
  machine(definition: FigureMachine): void;
  controls(list: readonly FigureControl[]): void;
  // Root
  root(node: GroupNode): void;
}

// ---------------------------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------------------------

const MAX_SLUG = 32;
const ID_PATTERN = /^[A-Za-z0-9_.:-]+$/;
const DEFAULTS = {
  reveal: 500,
  draw: 450,
  pulse: 500,
  highlight: 500,
  progress: 600,
  rise: 500,
  wipe: 500,
  gap: 120,
} as const;

/** Lower-case ASCII slug: letters and digits, everything else collapsed to "-", ≤ 32 chars. */
function slug(text: string): string {
  const ascii = text
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return ascii.length <= MAX_SLUG ? ascii : ascii.slice(0, MAX_SLUG).replace(/-+$/g, "");
}

function shorten(text: string, max = 28): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

function where(helper: string, primary?: string): string {
  return `f.${helper}(${primary === undefined ? "…" : JSON.stringify(shorten(primary))})`;
}

function isSceneNode(value: unknown): value is SceneNode {
  return (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    "id" in value &&
    !("from" in value)
  );
}

function isNodeList(value: unknown): value is readonly SceneNode[] {
  return Array.isArray(value) && value.every(isSceneNode);
}

function isFragment(source: FigureFragmentSource): source is SceneFragment {
  return Array.isArray((source as SceneFragment).nodes);
}

/** Compiler results may publish stable ids as handles; those ids must never be rewritten. */
function carriesHandles(
  source: FigureFragmentSource,
): source is { readonly fragment: SceneFragment; readonly handles: unknown } {
  return !isFragment(source) && "handles" in source;
}

/** Keeps keyframe times strictly increasing (a later frame at the same time replaces the earlier). */
function tidy(entry: TimelineTrack): TimelineTrack {
  const frames: TimelineKeyframe[] = [];
  for (const frame of entry.keyframes) {
    const previous = frames[frames.length - 1];
    if (previous !== undefined && frame.time <= previous.time)
      frames[frames.length - 1] = { ...frame, time: previous.time };
    else frames.push(frame);
  }
  return frames.length === entry.keyframes.length ? entry : { ...entry, keyframes: frames };
}

function ramp(
  target: string,
  property: TimelineProperty,
  start: number,
  end: number,
  from: number,
  to: number,
  easing: Easing = "easeOut",
): TimelineTrack {
  const frames: TimelineKeyframe[] = [];
  if (start > 0) frames.push({ time: 0, value: from });
  frames.push({ time: start, value: from }, { time: end, value: to, easing });
  return tidy(track(target, property, frames));
}

function withEasing(tracks: readonly TimelineTrack[], easing: Easing | undefined): TimelineTrack[] {
  if (easing === undefined) return [...tracks];
  return tracks.map((entry) => ({
    ...entry,
    keyframes: entry.keyframes.map((frame) =>
      frame.easing === undefined ? frame : { ...frame, easing },
    ),
  }));
}

function inNamespace(id: string, scope: string): boolean {
  return id === scope || id.startsWith(`${scope}:`);
}

/** True when every id in the fragment already lives under `scope`. */
function fragmentInNamespace(fragment: SceneFragment, scope: string): boolean {
  let ok = true;
  const visit = (node: SceneNode): void => {
    if (!inNamespace(node.id, scope)) ok = false;
    if (node.type === "group") node.children.forEach(visit);
  };
  fragment.nodes.forEach(visit);
  for (const edge of fragment.edges ?? [])
    if (
      !inNamespace(edge.id, scope) ||
      !inNamespace(endpointNode(edge.from), scope) ||
      !inNamespace(endpointNode(edge.to), scope)
    )
      ok = false;
  for (const entry of fragment.tracks ?? [])
    if (!inNamespace(entry.id, scope) || !inNamespace(entry.target, scope)) ok = false;
  for (const control of fragment.controls ?? []) if (!inNamespace(control.id, scope)) ok = false;
  return ok;
}

function bindingEntries(
  bind: Readonly<Record<string, string | undefined>> | undefined,
): [string, string][] {
  if (bind === undefined) return [];
  return Object.entries(bind).filter(
    (entry): entry is [string, string] => typeof entry[1] === "string",
  );
}

interface FragmentRecord {
  readonly scope: string;
  readonly tracks: readonly TimelineTrack[];
  readonly duration: number;
}

interface ResolvedTargets {
  readonly ids: readonly string[];
  readonly fragment: FragmentRecord | undefined;
}

// ---------------------------------------------------------------------------------------------
// Builder
// ---------------------------------------------------------------------------------------------

function createBuilder(
  figureId: string,
  meta: FigureMeta,
): { readonly builder: FigureBuilder; readonly finish: () => SceneDefinition } {
  /** Every node and edge id → where it was created (they share one id space). */
  const ids = new Map<string, string>();
  const edgeIds = new Set<string>();
  /** Objects returned by helpers, in creation order; the default root is built from them. */
  const created = new Set<SceneNode>();
  const topLevel: SceneNode[] = [];
  /** Ids of created nodes that were placed inside another created group. */
  const nested = new Set<string>();
  const edges: EdgeDefinition[] = [];
  const controls: SceneControl[] = [];
  const controlIds = new Set<string>();
  const tracks: TimelineTrack[] = [];
  const trackIds = new Set<string>();
  const fragments = new WeakMap<object, FragmentRecord>();
  const fragmentRoots = new Map<string, FragmentRecord>();
  let machine: StateMachineDefinition | undefined;
  let explicitRoot: GroupNode | undefined;

  const fail = (message: string): Error => new Error(`figure "${figureId}": ${message}`);

  const register = (id: string, origin: string): void => {
    if (id.length === 0) throw fail(`${origin} produced an empty id`);
    if (!ID_PATTERN.test(id))
      throw fail(`id "${id}" (${origin}) may only contain letters, digits, "_", ".", ":" and "-"`);
    const existing = ids.get(id);
    if (existing !== undefined)
      throw fail(`duplicate id "${id}" (first created by ${existing}, again by ${origin})`);
    ids.set(id, origin);
  };

  const uniqueId = (base: string): string => {
    if (!ids.has(base)) return base;
    for (let n = 2; ; n += 1) {
      const candidate = `${base}-${n}`;
      if (!ids.has(candidate)) return candidate;
    }
  };

  const inferId = (
    kind: string,
    primary: string | undefined,
    explicit: string | undefined,
  ): string => {
    if (explicit !== undefined) return explicit;
    const tail = primary === undefined ? "" : slug(primary);
    return uniqueId(tail.length === 0 ? kind : `${kind}-${tail}`);
  };

  const nest = (node: SceneNode, origin: string): void => {
    if (nested.has(node.id))
      throw fail(
        `node "${node.id}" is already inside another group and cannot be placed again by ${origin}; create a second node instead of reusing the object`,
      );
    nested.add(node.id);
  };

  /** Registers a helper result: its own id, its fresh descendants, and nests embedded created nodes. */
  const commit = <T extends SceneNode>(node: T, origin: string): T => {
    const visit = (entry: SceneNode, top: boolean): void => {
      if (!top && created.has(entry)) {
        nest(entry, origin);
        return;
      }
      register(entry.id, origin);
      if (entry.type === "group") for (const child of entry.children) visit(child, false);
    };
    visit(node, true);
    created.add(node);
    topLevel.push(node);
    return node;
  };

  /** A known node id (edges rejected unless `allowEdges`), with a message naming the helper. */
  const requireTarget = (id: string, helper: string, allowEdges: boolean): string => {
    if (edgeIds.has(id)) {
      if (allowEdges) return id;
      throw fail(
        `${helper}: "${id}" is an edge, not a node; use f.draw / f.flow / f.pulse for connectors`,
      );
    }
    if (!ids.has(id)) throw fail(`${helper}: unknown target "${id}"`);
    return id;
  };

  const requireEdge = (id: string, helper: string): string => {
    if (edgeIds.has(id)) return id;
    if (ids.has(id)) throw fail(`${helper}: "${id}" is a node, not an edge`);
    throw fail(`${helper}: unknown edge "${id}"`);
  };

  const refId = (
    ref: SceneNode | EdgeDefinition | string,
    helper: string,
    allowEdges = false,
  ): string => {
    if (typeof ref === "string") return requireTarget(ref, helper, allowEdges);
    if (!isSceneNode(ref)) return requireTarget(ref.id, helper, allowEdges);
    if (!created.has(ref) && !ids.has(ref.id))
      throw fail(
        `${helper}: node "${ref.id}" was not created by this figure; create it with a helper or f.raw() first`,
      );
    return requireTarget(ref.id, helper, allowEdges);
  };

  const schedule = (entries: readonly TimelineTrack[]): void => {
    for (const entry of entries) {
      let id = entry.id;
      for (let n = 2; trackIds.has(id); n += 1) id = `${entry.id}#${n}`;
      trackIds.add(id);
      tracks.push(id === entry.id ? entry : { ...entry, id });
    }
  };

  /**
   * Motion targets: a node, an id, an array of either, or the root returned by `f.add` (then the
   * fragment record is returned too). Edge ids are accepted only for edge-capable properties.
   */
  const resolveTargets = (
    target: MotionTarget,
    helper: string,
    allowEdges = false,
  ): ResolvedTargets => {
    if (isSceneNode(target)) {
      const record = fragments.get(target);
      if (record !== undefined) return { ids: [refId(target, helper)], fragment: record };
    } else if (typeof target === "string") {
      const record = fragmentRoots.get(target);
      if (record !== undefined) return { ids: [refId(target, helper)], fragment: record };
    }
    const list = Array.isArray(target)
      ? (target as readonly (SceneNode | EdgeDefinition | string)[])
      : [target as SceneNode | EdgeDefinition | string];
    if (list.length === 0) throw fail(`${helper}: no targets given`);
    return { ids: list.map((entry) => refId(entry, helper, allowEdges)), fragment: undefined };
  };

  const resolveEdges = (target: EdgeTarget, helper: string): readonly string[] => {
    const list = Array.isArray(target)
      ? (target as readonly (EdgeDefinition | string)[])
      : [target as EdgeDefinition | string];
    if (list.length === 0) throw fail(`${helper}: no edges given`);
    return list.map((entry) => requireEdge(typeof entry === "string" ? entry : entry.id, helper));
  };

  const step = (
    label: string,
    targets: readonly string[],
    stagger: number,
    single: (id: string, start: number) => readonly TimelineTrack[],
  ): MotionStep => {
    const build = (start: number): readonly TimelineTrack[] =>
      targets.flatMap((id, index) => single(id, start + index * stagger).map(tidy));
    return { kind: "motion", label, duration: tracksDuration(build(0)), tracks: build };
  };

  const fragmentStep = (record: FragmentRecord, easing?: Easing): MotionStep => ({
    kind: "motion",
    label: `reveal(${record.scope})`,
    duration: record.duration,
    tracks: (start) => withEasing(shiftTracks(record.tracks, start), easing),
  });

  const validTime = (time: number, helper: string): number => {
    if (!Number.isFinite(time) || time < 0)
      throw fail(`${helper}: time must be a finite, non-negative number of milliseconds`);
    return time;
  };

  // Node helpers ------------------------------------------------------------------------------

  const textNode = (
    kind: string,
    style: SemanticTextStyle | undefined,
    text: string,
    options: FigureTextOptions = {},
  ): TextMark => {
    const { id: explicit, textStyle, tone, ...rest } = options;
    const id = inferId(kind, text, explicit);
    const resolvedStyle = textStyle ?? style;
    return commit(
      {
        id,
        type: "text",
        text,
        ...rest,
        ...(resolvedStyle === undefined ? {} : { textStyle: resolvedStyle }),
        ...(tone === undefined ? {} : { color: tone }),
      },
      where(kind, text),
    );
  };

  const group = (
    kind: string,
    layout: Responsive<GroupLayout>,
    children: readonly SceneNode[],
    options: FigureGroupOptions = {},
  ): GroupNode => {
    const { id: explicit, ...rest } = options;
    const id = inferId(kind, rest.label, explicit);
    return commit(container(id, layout, children, rest), where(kind, rest.label));
  };

  // The `flow` overload: layout for children, packets for edges.
  function flow(children: readonly SceneNode[], options?: FigureGroupOptions): GroupNode;
  function flow(edge: EdgeTarget, options?: FlowOptions): MotionStep;
  function flow(
    subject: readonly SceneNode[] | EdgeTarget,
    options: FigureGroupOptions | FlowOptions = {},
  ): GroupNode | MotionStep {
    if (isNodeList(subject))
      return group(
        "flow",
        { wide: "row", compact: "stack" },
        subject,
        options as FigureGroupOptions,
      );
    const { duration, stagger = 0, easing } = options as FlowOptions;
    const targets = resolveEdges(subject, "f.flow");
    return step(`flow(${targets.join(",")})`, targets, stagger, (id, start) =>
      withEasing(
        [flowTracks(id, start, duration === undefined ? undefined : start + duration)],
        easing,
      ),
    );
  }

  const graph = (
    layers: readonly FigureGraphLayer[],
    options: FigureGraphOptions = {},
  ): GroupNode => {
    if (layers.length === 0) throw fail("f.graph: no layers given");
    const {
      style = "flow",
      direction: directionOption,
      rankLayout,
      rankColumns,
      layerGap,
      nodeGap = style === "circuit" ? 16 : 12,
      gap,
      ...outerOptions
    } = options;
    const presetDirection: Responsive<FigureGraphDirection> =
      style === "flow" ? { wide: "horizontal", compact: "vertical" } : "vertical";
    const direction: Responsive<FigureGraphDirection> =
      directionOption === undefined
        ? presetDirection
        : typeof directionOption === "string"
          ? directionOption
          : {
              ...(typeof presetDirection === "string"
                ? { wide: presetDirection }
                : presetDirection),
              ...directionOption,
            };
    const stages = layers.map((layer) => {
      const rank = !Array.isArray(layer) && "nodes" in layer ? layer : undefined;
      const nodes =
        rank !== undefined
          ? rank.nodes
          : Array.isArray(layer)
            ? (layer as readonly SceneNode[])
            : [layer as SceneNode];
      if (nodes.length === 0) throw fail("f.graph: layers must not be empty");
      if (nodes.length === 1 && nodes[0] !== undefined && rank === undefined) return nodes[0];
      const defaultLayout = style === "flow" ? "stack" : style === "tree" ? "row" : "grid";
      const layout = rank?.layout ?? rankLayout ?? defaultLayout;
      const inferredColumns: Responsive<number> = {
        wide: nodes.length,
        compact: nodes.length,
        narrow: Math.min(nodes.length, 2),
      };
      const {
        nodes: _nodes,
        layout: _layout,
        id,
        gap: rankGap,
        columns,
        metadata,
        ...rankOptions
      } = rank ?? { nodes };
      void _nodes;
      void _layout;
      return group(style === "circuit" ? "circuit-rank" : "graph-rank", layout, nodes, {
        ...rankOptions,
        ...(id === undefined ? {} : { id }),
        gap: rankGap ?? nodeGap,
        width: rank?.width ?? "fill",
        align: rank?.align ?? (style === "tree" ? "center" : "stretch"),
        justify: rank?.justify ?? (style === "tree" ? "center" : "start"),
        ...(layout === "grid" || typeof layout !== "string"
          ? { columns: columns ?? rankColumns ?? inferredColumns }
          : {}),
        metadata: { ...metadata, graphRole: "rank", graphStyle: style },
      });
    });
    const axisLayout = (value: FigureGraphDirection): GroupLayout =>
      value === "horizontal" ? "row" : "stack";
    const layout: Responsive<GroupLayout> =
      typeof direction === "string"
        ? axisLayout(direction)
        : {
            ...(direction.wide === undefined ? {} : { wide: axisLayout(direction.wide) }),
            ...(direction.compact === undefined ? {} : { compact: axisLayout(direction.compact) }),
            ...(direction.narrow === undefined ? {} : { narrow: axisLayout(direction.narrow) }),
          };
    return group("graph", layout, stages, {
      ...outerOptions,
      gap: layerGap ?? gap ?? (style === "circuit" ? 56 : style === "tree" ? 40 : 24),
      width: outerOptions.width ?? "fill",
      align: outerOptions.align ?? "stretch",
      metadata: {
        ...outerOptions.metadata,
        graphStyle: style,
      },
    });
  };

  const connect = (
    from: EndpointRef,
    to: EndpointRef,
    options: ConnectOptions = {},
  ): EdgeDefinition => {
    const helper = "f.connect";
    const endpoint = (ref: EndpointRef): string | EdgeEndpoint => {
      if (typeof ref === "string" || isSceneNode(ref)) return refId(ref, helper);
      const { node, ...port } = ref;
      return { node: refId(node, helper), ...port };
    };
    const fromEnd = endpoint(from);
    const toEnd = endpoint(to);
    const { id: explicit, ...rest } = options;
    const fromId = endpointNode(fromEnd);
    const toId = endpointNode(toEnd);
    const id = explicit ?? uniqueId(`${fromId}-${toId}`);
    register(id, `${helper}(${JSON.stringify(fromId)}, ${JSON.stringify(toId)})`);
    edgeIds.add(id);
    const edge: EdgeDefinition = { id, from: fromEnd, to: toEnd, ...rest };
    edges.push(edge);
    return edge;
  };

  const builder: FigureBuilder = {
    text: (text, options) => textNode("text", undefined, text, options),
    textAt: (text, position, options) =>
      textNode("text-at", undefined, text, { ...options, position }),
    labelAt: (text, position, options) =>
      textNode("label-at", "bodyStrong", text, { ...options, position }),
    eyebrow: (text, options) => textNode("eyebrow", "label", text, options),
    heading: (text, options) => textNode("heading", "bodyStrong", text, options),
    title: (text, options) => textNode("title", "title", text, options),
    caption: (text, options) => textNode("caption", "caption", text, { maxLines: 4, ...options }),
    body: (text, options) => textNode("body", "body", text, options),
    code: (text, options) => textNode("code", "code", text, options),

    badge(text, options = {}) {
      const { id: explicit, ...rest } = options;
      const id = inferId("badge", text, explicit);
      return commit({ id, type: "badge", text, ...rest }, where("badge", text));
    },
    icon(name, options = {}) {
      const { id: explicit, ...rest } = options;
      const id = inferId("icon", name, explicit);
      return commit({ id, type: "icon", icon: name, ...rest }, where("icon", name));
    },
    rect(options = {}) {
      const { id: explicit, ...rest } = options;
      const id = inferId("rect", rest.label, explicit);
      return commit({ id, type: "rect", ...rest }, where("rect", rest.label));
    },
    circle(options = {}) {
      const { id: explicit, ...rest } = options;
      const id = inferId("circle", rest.label, explicit);
      return commit({ id, type: "circle", ...rest }, where("circle", rest.label));
    },
    polyline(points, options = {}) {
      const { id: explicit, ...rest } = options;
      const id = inferId("polyline", rest.label, explicit);
      return commit({ id, type: "polyline", points, ...rest }, where("polyline", rest.label));
    },
    path(d, viewBox, options = {}) {
      const { id: explicit, ...rest } = options;
      const id = inferId("path", rest.label, explicit);
      return commit({ id, type: "path", d, viewBox, ...rest }, where("path", rest.label));
    },
    image(src, alt, options = {}) {
      const { id: explicit, ...rest } = options;
      const id = inferId("image", alt, explicit);
      return commit({ id, type: "image", src, alt, ...rest }, where("image", alt));
    },
    legend(items, options = {}) {
      const { id: explicit, ...rest } = options;
      const id = inferId("legend", rest.label, explicit);
      return commit({ id, type: "legend", items, ...rest }, where("legend", rest.label));
    },
    callout(text, options = {}) {
      const { id: explicit, ...rest } = options;
      const id = inferId("callout", text, explicit);
      return commit({ id, type: "callout", text, ...rest }, where("callout", text));
    },

    card(options) {
      const { id: explicit, ...rest } = options;
      const id = inferId("card", rest.title, explicit);
      return commit(card(id, rest), where("card", rest.title));
    },
    panel(children, options = {}) {
      const { id: explicit, ...rest } = options;
      const primary = rest.title ?? rest.eyebrow ?? rest.label;
      const id = inferId("panel", primary, explicit);
      return commit(panel(id, children, rest), where("panel", primary));
    },
    pill(text, options = {}) {
      const { id: explicit, ...rest } = options;
      const id = inferId("pill", text, explicit);
      return commit(pill(id, text, rest), where("pill", text));
    },
    gate(kind, options = {}) {
      const { id: explicit, ...rest } = options;
      const id = inferId("gate", rest.text ?? kind, explicit);
      return commit(gate(id, kind, rest), where("gate", kind));
    },
    junction(options = {}) {
      const { id: explicit, ...rest } = options;
      const id = inferId("junction", rest.label, explicit);
      return commit(junction(id, rest), where("junction", rest.label));
    },
    keyValue(key, value, options = {}) {
      const { id: explicit, ...rest } = options;
      const id = inferId("key-value", key, explicit);
      return commit(keyValue(id, key, value, rest), where("keyValue", key));
    },
    rule(options = {}) {
      const id = inferId("rule", undefined, options.id);
      return commit(rule(id, options.tone), where("rule"));
    },
    spacer(size, options = {}) {
      const id = inferId("spacer", undefined, options.id);
      return commit(spacer(id, size), where("spacer"));
    },

    place(node, position) {
      if (!created.has(node))
        throw fail(`f.place: unknown node "${node.id}"; create it with a builder helper first`);
      if (nested.has(node.id)) throw fail(`f.place: "${node.id}" is already inside another group`);
      // Builder nodes are intentionally mutable until they are nested. Returning the same object
      // preserves the builder's identity bookkeeping; an object spread here would look like a
      // second node with a duplicate id when the coordinates group is committed.
      (node as SceneNode & { position: NonNullable<SceneNode["position"]> }).position = position;
      return node;
    },

    stack: (children, options) => group("stack", "stack", children, options),
    row: (children, options) => group("row", "row", children, options),
    grid: (children, options) => group("grid", "grid", children, options),
    overlay: (children, options) => group("overlay", "overlay", children, options),
    coordinates: (children, options) => group("coordinates", "coordinates", children, options),
    absolute: (children, options) => group("absolute", "absolute", children, options),
    flow,
    graph,

    add(source, options = {}) {
      const fragment = isFragment(source) ? source : source.fragment;
      const errors = (fragment.diagnostics ?? []).filter((entry) => entry.severity === "error");
      if (errors.length > 0)
        throw fail(
          `f.add: the fragment reports errors:\n${errors.map((entry) => `- ${entry.message}`).join("\n")}`,
        );
      if (fragment.nodes.length === 0) throw fail("f.add: the fragment has no nodes");
      const single = fragment.nodes.length === 1 ? fragment.nodes[0] : undefined;
      const base = single === undefined ? "fragment" : (single.id.split(":")[0] ?? "");
      const scope = options.id ?? uniqueId(base.length === 0 ? "fragment" : base);
      const alreadyScoped = fragmentInNamespace(fragment, scope);
      if (!alreadyScoped && carriesHandles(source))
        throw fail(
          `f.add(${JSON.stringify(scope)}): this compiler result exposes stable handles, so its ids cannot be re-scoped; set the id when compiling it (for example plot(rows, { id: ${JSON.stringify(scope)}, ... })) and call f.add(result) without a different id`,
        );
      const scoped = alreadyScoped ? fragment : scopeFragment(fragment, scope);
      const origin = `f.add(${JSON.stringify(scope)})`;
      const roots = scoped.nodes.map((node) => commit(node, origin));
      for (const edge of scoped.edges ?? []) {
        register(edge.id, origin);
        edgeIds.add(edge.id);
        edges.push(edge);
      }
      for (const control of scoped.controls ?? []) {
        if (controlIds.has(control.id))
          throw fail(`duplicate control id "${control.id}" (added by ${origin})`);
        controlIds.add(control.id);
        controls.push(control);
      }
      const relative = scoped.tracks ?? [];
      const record: FragmentRecord = {
        scope,
        tracks: relative,
        duration: tracksDuration(relative),
      };
      if (options.at !== undefined) schedule(shiftTracks(relative, validTime(options.at, "f.add")));
      let result: SceneNode;
      if (roots.length === 1 && roots[0] !== undefined) result = roots[0];
      else {
        const wrapperId = scoped.nodes.some((node) => node.id === scope)
          ? uniqueId(`${scope}-group`)
          : scope;
        result = commit(stack(wrapperId, roots, { gap: 0, width: "fill" }), origin);
      }
      fragments.set(result, record);
      fragmentRoots.set(result.id, record);
      return result;
    },

    raw(node) {
      if (created.has(node)) return node;
      return commit(node, `f.raw(${JSON.stringify(node.id)})`);
    },

    connect,
    wire(from, to, options = {}) {
      const { kind = "signal", ...rest } = options;
      const preset: ConnectOptions =
        kind === "bus"
          ? {
              route: "orthogonal",
              head: "none",
              width: 4,
              tone: "info",
              cornerRadius: 4,
            }
          : kind === "control"
            ? {
                route: "orthogonal",
                head: "arrow",
                stroke: "dashed",
                tone: "muted",
                cornerRadius: 6,
              }
            : {
                route: "orthogonal",
                head: "arrow",
                tone: "accent",
                cornerRadius: 6,
              };
      return connect(from, to, { ...preset, ...rest });
    },

    reveal(target, options = {}) {
      const { duration = DEFAULTS.reveal, stagger = 0, offset, scale, easing } = options;
      // Plain fades work on edges too; slide/scale are node-only transforms.
      const resolved = resolveTargets(
        target,
        "f.reveal",
        offset === undefined && scale === undefined,
      );
      if (resolved.fragment !== undefined && resolved.fragment.tracks.length > 0)
        return fragmentStep(resolved.fragment, easing);
      return step(`reveal(${resolved.ids.join(",")})`, resolved.ids, stagger, (id, start) =>
        withEasing(
          revealTracks(id, start, start + duration, {
            ...(scale === undefined ? {} : { scale }),
            ...(offset === undefined ? {} : { offset }),
          }),
          easing,
        ),
      );
    },
    draw(edge, options = {}) {
      const { duration = DEFAULTS.draw, stagger = 0, easing } = options;
      const targets = resolveEdges(edge, "f.draw");
      return step(`draw(${targets.join(",")})`, targets, stagger, (id, start) =>
        withEasing(drawEdge(id, start, start + duration), easing),
      );
    },
    pulse(target, options = {}) {
      const { duration = DEFAULTS.pulse, stagger = 0, easing } = options;
      const resolved = resolveTargets(target, "f.pulse", true);
      return step(`pulse(${resolved.ids.join(",")})`, resolved.ids, stagger, (id, start) =>
        withEasing([pulseTracks(id, start, duration)], easing),
      );
    },
    highlight(target, options = {}) {
      const { duration = DEFAULTS.highlight, stagger = 0, peak = 1, rest = peak, easing } = options;
      const resolved = resolveTargets(target, "f.highlight", true);
      return step(`highlight(${resolved.ids.join(",")})`, resolved.ids, stagger, (id, start) =>
        withEasing([highlightTracks(id, start, start + duration, peak, rest)], easing),
      );
    },
    progress(target, options = {}) {
      const { duration = DEFAULTS.progress, stagger = 0, from = 0, to = 1, easing } = options;
      const resolved = resolveTargets(target, "f.progress", true);
      return step(`progress(${resolved.ids.join(",")})`, resolved.ids, stagger, (id, start) =>
        withEasing([progressTo(id, start, start + duration, from, to)], easing),
      );
    },
    rise(target, options = {}) {
      const { duration = DEFAULTS.rise, stagger = 0, easing } = options;
      const resolved = resolveTargets(target, "f.rise");
      return step(`rise(${resolved.ids.join(",")})`, resolved.ids, stagger, (id, start) => [
        ramp(id, "revealY", start, start + duration, 0, 1, easing),
      ]);
    },
    wipe(target, options = {}) {
      const { duration = DEFAULTS.wipe, stagger = 0, easing } = options;
      const resolved = resolveTargets(target, "f.wipe");
      return step(`wipe(${resolved.ids.join(",")})`, resolved.ids, stagger, (id, start) => [
        ramp(id, "revealX", start, start + duration, 0, 1, easing),
      ]);
    },

    sequence(steps, options = {}) {
      const gap = options.gap ?? DEFAULTS.gap;
      let time = validTime(options.start ?? 0, "f.sequence");
      for (const entry of steps) {
        const parallel = Array.isArray(entry)
          ? (entry as readonly MotionStep[])
          : [entry as MotionStep];
        let longest = 0;
        for (const motion of parallel) {
          schedule(motion.tracks(time));
          longest = Math.max(longest, motion.duration);
        }
        time += longest + gap;
      }
    },
    at(time, ...steps) {
      const start = validTime(time, "f.at");
      for (const motion of steps) schedule(motion.tracks(start));
    },

    machine(definition) {
      if (machine !== undefined) throw fail("f.machine was called twice; merge the definitions");
      const { id: explicit, ...rest } = definition;
      machine = { id: explicit ?? `${figureId}-machine`, ...rest };
    },
    controls(list) {
      for (const control of list) {
        const { id: explicit, ...rest } = control;
        let id = explicit;
        if (id === undefined) {
          const base = slug(control.label) || "control";
          id = base;
          for (let n = 2; controlIds.has(id); n += 1) id = `${base}-${n}`;
        } else if (controlIds.has(id)) throw fail(`duplicate control id "${id}"`);
        controlIds.add(id);
        controls.push({ id, ...rest });
      }
    },

    root(node) {
      if (explicitRoot !== undefined) throw fail("f.root was called twice");
      if (!created.has(node)) commit(node, "f.root(…)");
      else if (nested.has(node.id))
        throw fail(`f.root: "${node.id}" is nested inside another group and cannot be the root`);
      explicitRoot = node;
    },
  };

  const finish = (): SceneDefinition => {
    let root = explicitRoot;
    if (root === undefined) {
      const children = topLevel.filter((node) => !nested.has(node.id));
      if (children.length === 0)
        throw fail("no nodes were created; add content or call f.root(...)");
      root = commit(
        stack(uniqueId("root"), children, { gap: 16, width: "fill" }),
        "root (inferred)",
      );
    }
    const inRoot = new Set<string>();
    walkScene(root, (node) => inRoot.add(node.id));
    const orphans = topLevel.filter((node) => !nested.has(node.id) && !inRoot.has(node.id));
    if (orphans.length > 0) {
      const list = orphans.map((node) => `"${node.id}" (${ids.get(node.id) ?? "?"})`).join(", ");
      const [verb, pronoun] = orphans.length === 1 ? ["is", "it"] : ["are", "them"];
      throw fail(
        `${list} ${verb} not inside the root; add ${pronoun} to a group or pass ${pronoun} to f.root(...)`,
      );
    }

    if (controls.length > 0 && machine === undefined)
      throw fail("controls need a state machine; call f.machine(...)");
    if (machine !== undefined) {
      const result = validateStateMachine(machine, { nodeIds: inRoot });
      const errors = result.diagnostics.filter((entry) => entry.severity === "error");
      if (errors.length > 0)
        throw fail(`invalid machine:\n${errors.map((entry) => `- ${entry.message}`).join("\n")}`);
    }
    // Bindings must name machine variables or signals; resolve would reject them later anyway,
    // but the message here says which node and which property.
    const knownNames = [
      ...Object.keys(meta.signals ?? {}),
      ...Object.keys(machine?.variables ?? {}),
      ...Object.keys(machine?.signals ?? {}),
      ...(machine === undefined ? [] : ["$state", "$selection"]),
    ];
    const known = knownNames.length === 0 ? undefined : new Set(knownNames);
    const checkBinding = (owner: string, entries: [string, string][]): void => {
      for (const [property, signal] of entries) {
        if (known === undefined)
          throw fail(
            `"${owner}" binds ${property} to signal "${signal}" but the figure declares no signals; add meta.signals or call f.machine(...)`,
          );
        if (!known.has(signal))
          throw fail(
            `"${owner}" binds ${property} to unknown signal "${signal}"; declare it in meta.signals or the machine`,
          );
      }
    };
    walkScene(root, (node) =>
      checkBinding(
        node.id,
        bindingEntries(node.bind as Readonly<Record<string, string | undefined>> | undefined),
      ),
    );
    for (const edge of edges) {
      checkBinding(
        edge.id,
        bindingEntries(edge.bind as Readonly<Record<string, string | undefined>> | undefined),
      );
      for (const label of edge.labels ?? [])
        checkBinding(`${edge.id} label`, bindingEntries(label.bind));
    }

    let timeline: AnimationTimeline | undefined;
    if (tracks.length > 0) {
      timeline = { duration: tracksDuration(tracks) + (meta.hold ?? 0), tracks: [...tracks] };
    }

    const scene: SceneDefinition = {
      schemaVersion: 2,
      id: figureId,
      title: meta.title,
      ...(meta.description === undefined ? {} : { description: meta.description }),
      ...(meta.breakpoints === undefined ? {} : { breakpoints: meta.breakpoints }),
      ...(meta.padding === undefined ? {} : { padding: meta.padding }),
      ...(meta.background === undefined ? {} : { background: meta.background }),
      root,
      ...(edges.length === 0 ? {} : { edges: [...edges] }),
      ...(timeline === undefined ? {} : { timeline }),
      ...(machine === undefined ? {} : { machine }),
      ...(meta.signals === undefined ? {} : { signals: meta.signals }),
      ...(controls.length === 0 ? {} : { controls: [...controls] }),
      ...(meta.metadata === undefined ? {} : { metadata: meta.metadata }),
    };
    return defineScene(scene);
  };

  return { builder, finish };
}

// ---------------------------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------------------------

/**
 * Builds a validated `SceneDefinition` from a compact authoring callback.
 *
 * ```ts
 * export const explainer = figure("explainer", { title: "Three stages" }, (f) => {
 *   const plan = f.card({ title: "Plan", body: "Bound the region." });
 *   const place = f.card({ title: "Place", body: "Choose the blocks." });
 *   const edge = f.connect(plan, place, { head: "arrow" });
 *   f.flow([plan, place]);
 *   f.sequence([f.reveal(plan), f.draw(edge), f.reveal(place)]);
 * });
 * ```
 *
 * The callback runs synchronously; errors are thrown eagerly with messages prefixed
 * `figure "<id>":` (duplicate ids, unknown connect endpoints or motion targets, orphaned nodes,
 * invalid machines, bindings to undeclared signals).
 */
export function figure(
  id: string,
  meta: FigureMeta,
  build: (f: FigureBuilder) => void,
): SceneDefinition {
  if (id.length === 0 || !ID_PATTERN.test(id))
    throw new Error(
      `figure id "${id}" may only contain letters, digits, "_", ".", ":" and "-" and must not be empty`,
    );
  if (meta.title.length === 0) throw new Error(`figure "${id}": title must not be empty`);
  const { builder, finish } = createBuilder(id, meta);
  build(builder);
  return finish();
}
