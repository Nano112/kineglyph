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
  rotateTo,
  track,
} from "./authoring.js";
import { scopeFragment, shiftTracks, tracksDuration, type SceneFragment } from "./fragment.js";
import type { Easing } from "./easing.js";
import { expr } from "./machine.js";
import {
  validateStateMachine,
  type SignalExpression,
  type StateMachineDefinition,
} from "./machine.js";
import { material } from "./material.js";
import {
  card,
  cardFan,
  codeBlock,
  container,
  fileTree,
  figureSurface,
  gate,
  orientGate,
  junction,
  gridPlane,
  keyValue,
  panel,
  paneLayout,
  pill,
  port,
  rule,
  spacer,
  stack,
  tileNode,
  terminal,
  minecraftCommand,
  terminalWindow,
  windowFrame,
  type CardOptions,
  type CardFanOptions,
  type CodeBlockOptions,
  type CodeBlockSource,
  type ContainerOptions,
  type KeyValueOptions,
  type LogicGateKind,
  type LogicGateOptions,
  type LogicGateOrientation,
  type JunctionOptions,
  type GridPlaneOptions,
  type FileTreeEntry,
  type FileTreeOptions,
  type FigureSurfaceOptions,
  type PanelOptions,
  type PaneLayoutOptions,
  type PillOptions,
  type PortMarkOptions,
  type TextOptions,
  type TerminalLine,
  type TerminalOptions,
  type MinecraftCommandOptions,
  type TerminalPane,
  type TerminalWindowOptions,
  type TileNodeOptions,
  type WindowFrameOptions,
  type WorkspacePane,
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
  type EdgeSide,
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
export type FigureCardFanOptions = CardFanOptions & { readonly id?: string };
export type FigureCodeBlockOptions = CodeBlockOptions & { readonly id?: string };
export type FigurePanelOptions = PanelOptions & { readonly id?: string };
export type FigurePaneLayoutOptions = PaneLayoutOptions & { readonly id?: string };
export type FigureSurfaceBuilderOptions = FigureSurfaceOptions & { readonly id?: string };
export type FigurePillOptions = PillOptions & { readonly id?: string };
export type FigureGateOptions = LogicGateOptions & { readonly id?: string };
export type FigureJunctionOptions = JunctionOptions & { readonly id?: string };
export type FigureGridPlaneOptions = GridPlaneOptions & { readonly id?: string };
export type FigurePortOptions = PortMarkOptions & { readonly id?: string };
export type FigureTileNodeOptions = TileNodeOptions & { readonly id?: string };
export type FigureKeyValueOptions = KeyValueOptions & { readonly id?: string };
export type FigureTerminalOptions = TerminalOptions & { readonly id?: string };
export type FigureMinecraftCommandOptions = MinecraftCommandOptions & { readonly id?: string };
export type FigureTerminalWindowOptions = TerminalWindowOptions & { readonly id?: string };
export type FigureWindowFrameOptions = WindowFrameOptions & { readonly id?: string };
export type FigureFileTreeOptions = FileTreeOptions & { readonly id?: string };
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
  readonly rankColumns?: Responsive<number | "auto">;
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
export type FigureWireKind =
  "signal" | "bus" | "control" | "data" | "clock" | "feedback" | "optional" | "flow" | "spline";
export interface FigureWireOptions extends ConnectOptions {
  /** Semantic circuit-wire preset; individual connector options still override it. */
  readonly kind?: FigureWireKind;
}
export interface FigureCircuitConnection extends FigureWireOptions {
  readonly from: EndpointRef;
  /** Several targets share the source port without adding a layout node. */
  readonly to: EndpointRef | readonly EndpointRef[];
  /** Feedback and decorative links default to false; other links participate in rank inference. */
  readonly contributesToLayout?: boolean;
  /** Opts a multi-target net into one explicit, laid-out fan-out junction. */
  readonly junction?: FigureJunctionOptions;
}
export interface FigureCircuitOptions extends Omit<FigureGraphOptions, "style"> {
  /** Places terminal sink nodes in one final rank (default true). */
  readonly alignSinks?: boolean;
  /** Progressive rank-by-rank entrance authored onto `result.entrance`. */
  readonly entrance?: {
    readonly nodeDuration?: number;
    readonly edgeDuration?: number;
    readonly nodeStagger?: number;
    readonly edgeStagger?: number;
    readonly stageGap?: number;
    readonly easing?: Easing;
  };
}
export interface FigureCircuitResult {
  readonly root: GroupNode;
  readonly edges: readonly EdgeDefinition[];
  readonly ranks: readonly (readonly SceneNode[])[];
  /** Reveals each rank while the wires entering it draw, preventing unfinished holes. */
  readonly entrance: MotionStep;
}

/** Shared styling for the concise topology recipes. */
export interface FigureTopologyOptions extends FigureCircuitOptions {
  /** Applied to every generated connection. */
  readonly edge?: FigureWireOptions;
}
export interface FigureHubMapSpec {
  readonly host: SceneNode;
  readonly upstream?: readonly SceneNode[];
  readonly clients: readonly SceneNode[];
}
export interface FigureHubMapResult extends FigureCircuitResult {
  readonly host: SceneNode;
  readonly upstream: readonly SceneNode[];
  readonly clients: readonly SceneNode[];
}
export interface FigurePipelineResult extends FigureCircuitResult {
  readonly stages: readonly SceneNode[];
}
export interface FigureFanOutResult extends FigureCircuitResult {
  readonly source: SceneNode;
  readonly targets: readonly SceneNode[];
}
export interface FigureLayeredArchitectureSpec {
  readonly layers: readonly (readonly SceneNode[])[];
  /** Omit to connect every node in a rank to every node in the following rank. */
  readonly connections?: readonly FigureCircuitConnection[];
}
export interface FigureLayeredArchitectureResult extends FigureCircuitResult {
  readonly layers: readonly (readonly SceneNode[])[];
}

/** Declarative input terminal for `f.logicCircuit()`. */
export interface FigureLogicInput {
  readonly label?: string;
  readonly tone?: Paint;
  readonly initial?: boolean;
}

/** Declarative Boolean gate. References name inputs or earlier/later gates in the same spec. */
export interface FigureLogicGate {
  readonly kind: Exclude<LogicGateKind, "mux">;
  readonly inputs: readonly string[];
  readonly tone?: Paint;
  readonly label?: string;
}

/** Declarative output terminal fed by an input or gate. */
export interface FigureLogicOutput {
  readonly from: string;
  readonly label?: string;
  readonly tone?: Paint;
}

export interface FigureLogicCircuitSpec {
  readonly inputs: Readonly<Record<string, FigureLogicInput>>;
  readonly gates: Readonly<Record<string, FigureLogicGate>>;
  readonly outputs: Readonly<Record<string, FigureLogicOutput>>;
}

export interface FigureLogicCircuitResult extends FigureCircuitResult {
  readonly machine: FigureMachine;
  readonly nodes: {
    readonly inputs: Readonly<Record<string, GroupNode>>;
    readonly gates: Readonly<Record<string, GroupNode>>;
    readonly outputs: Readonly<Record<string, GroupNode>>;
  };
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
export interface RotateOptions extends MotionOptions {
  /** Clockwise starting angle in degrees (default 0). */
  readonly from?: number;
  /** Clockwise terminal angle in degrees (default 360). */
  readonly to?: number;
}
export type RiseOptions = MotionOptions;
export type WipeOptions = MotionOptions;
export interface TypewriteOptions extends MotionOptions {
  /**
   * `sequential` writes descendant text as one source-ordered stream. `overlap` retains the
   * per-node staggered animation used by older figures.
   */
  readonly mode?: "sequential" | "overlap";
  /** Milliseconds per visible character. When supplied it takes precedence over `duration`. */
  readonly characterDuration?: number;
  /** Additional pause when sequential writing advances to another authored line. */
  readonly lineDelay?: number;
}

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
  /** Smooth line through the authored positions of placed nodes. */
  spline(anchors: readonly SceneNode[], options?: FigurePolylineOptions): PolylineMark;
  path(d: string, viewBox: PathMark["viewBox"], options?: FigurePathOptions): PathMark;
  image(src: string, alt: string, options?: FigureImageOptions): ImageMark;
  legend(items: LegendMark["items"], options?: FigureLegendOptions): LegendMark;
  callout(text: string, options?: FigureCalloutOptions): CalloutMark;
  // Recipes
  card(options: FigureCardOptions): GroupNode;
  /** Responsive layered-card composition with static centre rotation. */
  cardFan(cards: readonly SceneNode[], options?: FigureCardFanOptions): GroupNode;
  /** Syntax-highlighted, line-addressable code compiled to ordinary scene nodes. */
  codeBlock(source: CodeBlockSource, options?: FigureCodeBlockOptions): GroupNode;
  panel(children: readonly SceneNode[], options?: FigurePanelOptions): GroupNode;
  /** Responsive application panes for editors, inspectors, sidebars, and previews. */
  panes(panes: readonly WorkspacePane[], options?: FigurePaneLayoutOptions): GroupNode;
  /** Generic portable application chrome around any existing scene node. */
  window(content: SceneNode, options?: FigureWindowFrameOptions): GroupNode;
  /** Semantic outer boundary: bare, card, inset, or edge-to-edge bleed. */
  surface(child: SceneNode, options?: FigureSurfaceBuilderOptions): GroupNode;
  pill(text: string, options?: FigurePillOptions): BadgeMark;
  /** Standard logic-gate silhouette with pins; connect using normal endpoint sides/offsets. */
  gate(kind: LogicGateKind, options?: FigureGateOptions): GroupNode;
  /** Filled net junction for explicit signal fan-out. */
  junction(options?: FigureJunctionOptions): GroupNode;
  /** Outlined or active connection point for a signal or physical control. */
  port(options?: FigurePortOptions): CircleMark;
  /** Icon-first semantic node whose material changes with the active state. */
  tile(options: FigureTileNodeOptions): GroupNode;
  /** Portable construction grid intended behind content in an overlay. */
  gridPlane(options?: FigureGridPlaneOptions): GroupNode;
  keyValue(key: string, value: string, options?: FigureKeyValueOptions): GroupNode;
  /** Structured terminal surface; pair with `f.typewrite(terminal)` for seekable typing. */
  terminal(lines: readonly (string | TerminalLine)[], options?: FigureTerminalOptions): GroupNode;
  /** Minecraft chat input with static history and suggestions; animate with `f.typewrite`. */
  minecraftCommand(command: string, options?: FigureMinecraftCommandOptions): GroupNode;
  /** Responsive one-or-many-pane terminal window with optional tmux-style status chrome. */
  terminalWindow(panes: readonly TerminalPane[], options?: FigureTerminalWindowOptions): GroupNode;
  /** Recursive directory tree with optional branch guides, details, and status badges. */
  fileTree(entries: readonly FileTreeEntry[], options?: FigureFileTreeOptions): GroupNode;
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
  /** Infers circuit ranks from a netlist, lays them out responsively, and authors its wires. */
  circuit(
    nodes: readonly SceneNode[],
    connections: readonly FigureCircuitConnection[],
    options?: FigureCircuitOptions,
  ): FigureCircuitResult;
  /** Builds terminals, gates, nets, signal expressions, and input toggles from Boolean logic. */
  logicCircuit(
    spec: FigureLogicCircuitSpec,
    options?: FigureCircuitOptions,
  ): FigureLogicCircuitResult;
  /** One host between optional upstreams and one or more clients. */
  hubMap(spec: FigureHubMapSpec, options?: FigureTopologyOptions): FigureHubMapResult;
  /** Sequential stages with responsive placement and authored flow edges. */
  pipeline(stages: readonly SceneNode[], options?: FigureTopologyOptions): FigurePipelineResult;
  /** A source feeding several targets through one concise recipe. */
  fanOut(
    source: SceneNode,
    targets: readonly SceneNode[],
    options?: FigureTopologyOptions,
  ): FigureFanOutResult;
  /** A pipeline with a non-ranking feedback connection from the last stage to the first. */
  feedbackLoop(stages: readonly SceneNode[], options?: FigureTopologyOptions): FigurePipelineResult;
  /** Explicit architectural ranks with optional custom connections. */
  layeredArchitecture(
    spec: FigureLayeredArchitectureSpec,
    options?: FigureTopologyOptions,
  ): FigureLayeredArchitectureResult;
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
  /** Rotate nodes clockwise around their resolved centres. */
  rotate(target: MotionTarget, options?: RotateOptions): MotionStep;
  /** Anchored vertical reveal (`revealY` 0 → 1). */
  rise(target: MotionTarget, options?: RiseOptions): MotionStep;
  /** Anchored horizontal reveal (`revealX` 0 → 1). */
  wipe(target: MotionTarget, options?: WipeOptions): MotionStep;
  /** Writes character-mode text in source order; prompts and syntax tokens remain one stream. */
  typewrite(target: MotionTarget, options?: TypewriteOptions): MotionStep;
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
  rotate: 900,
  rise: 500,
  wipe: 500,
  typewrite: 900,
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
  const nodesById = new Map<string, SceneNode>();
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
      nodesById.set(entry.id, entry);
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
    const { id: explicit, textStyle, tone, reveal, ...rest } = options;
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
        ...(reveal === undefined ? {} : { reveal }),
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
      const circuitRankLayout = (value: FigureGraphDirection): "stack" | "row" | "grid" =>
        value === "horizontal" ? "stack" : nodes.length > 2 ? "grid" : "row";
      const defaultLayout: Responsive<"stack" | "row" | "grid"> =
        style === "flow"
          ? "stack"
          : style === "tree"
            ? "row"
            : typeof direction === "string"
              ? circuitRankLayout(direction)
              : {
                  ...(direction.wide === undefined
                    ? {}
                    : { wide: circuitRankLayout(direction.wide) }),
                  ...(direction.compact === undefined
                    ? {}
                    : { compact: circuitRankLayout(direction.compact) }),
                  ...(direction.narrow === undefined
                    ? {}
                    : { narrow: circuitRankLayout(direction.narrow) }),
                };
      const layout = rank?.layout ?? rankLayout ?? defaultLayout;
      const inferredColumns: Responsive<number | "auto"> = "auto";
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
        align: rank?.align ?? (style === "flow" ? "stretch" : "center"),
        justify: rank?.justify ?? (style === "flow" ? "start" : "center"),
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
      justify: outerOptions.justify ?? (style === "flow" ? "start" : "center"),
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

  const wire = (
    from: EndpointRef,
    to: EndpointRef,
    options: FigureWireOptions = {},
  ): EdgeDefinition => {
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
          : kind === "data"
            ? {
                route: "orthogonal",
                head: "arrow",
                width: 2.5,
                tone: "info",
                cornerRadius: 6,
              }
            : kind === "clock"
              ? {
                  route: "orthogonal",
                  head: "arrow",
                  stroke: "dotted",
                  tone: "warning",
                  cornerRadius: 4,
                }
              : kind === "feedback"
                ? {
                    route: "spline",
                    head: "arrow",
                    stroke: "dashed",
                    tone: "warning",
                    spline: "fluid",
                    avoid: "nodes-and-edges",
                    cornerRadius: 22,
                  }
                : kind === "optional"
                  ? {
                      route: "orthogonal",
                      head: "none",
                      stroke: "dotted",
                      tone: "muted",
                      cornerRadius: 6,
                    }
                  : kind === "flow"
                    ? {
                        route: "orthogonal",
                        head: "arrow",
                        stroke: "solid",
                        tone: "accent",
                        cornerRadius: 6,
                        packets: { count: 1, speed: 96, trail: true },
                      }
                    : kind === "spline"
                      ? {
                          route: "spline",
                          spline: "fluid",
                          avoid: "nodes-and-edges",
                          head: "arrow",
                          stroke: "solid",
                          tone: "accent",
                          cornerRadius: 22,
                          packets: { count: 1, speed: 96, trail: true },
                        }
                      : {
                          route: "orthogonal",
                          head: "arrow",
                          tone: "accent",
                          cornerRadius: 6,
                        };
    return connect(from, to, { ...preset, ...rest });
  };

  const circuit = (
    nodes: readonly SceneNode[],
    connections: readonly FigureCircuitConnection[],
    options: FigureCircuitOptions = {},
  ): FigureCircuitResult => {
    if (nodes.length === 0) throw fail("f.circuit: no nodes given");
    const circuitDirection: Responsive<FigureGraphDirection> = options.direction ?? {
      wide: "horizontal",
      compact: "horizontal",
      narrow: "vertical",
    };
    for (const node of nodes) {
      if (!created.has(node))
        throw fail(`f.circuit: unknown node "${node.id}"; create it with a builder helper first`);
    }
    const orientationFor = (direction: FigureGraphDirection): LogicGateOrientation =>
      direction === "vertical" ? "down" : "right";
    const gateOrientation: Responsive<LogicGateOrientation> =
      typeof circuitDirection === "string"
        ? orientationFor(circuitDirection)
        : {
            wide: orientationFor(circuitDirection.wide ?? "horizontal"),
            compact: orientationFor(
              circuitDirection.compact ?? circuitDirection.wide ?? "horizontal",
            ),
            narrow: orientationFor(
              circuitDirection.narrow ??
                circuitDirection.compact ??
                circuitDirection.wide ??
                "horizontal",
            ),
          };
    const circuitNodes = nodes.map((node) => {
      if (
        node.type !== "group" ||
        node.metadata?.circuitRole !== "gate" ||
        node.metadata.gateAutoOrient !== true
      )
        return node;
      const oriented = orientGate(node, gateOrientation);
      created.add(oriented);
      nodesById.set(oriented.id, oriented);
      return oriented;
    });
    const idForEndpoint = (endpoint: EndpointRef): string =>
      typeof endpoint === "object" && !isSceneNode(endpoint)
        ? refId(endpoint.node, "f.circuit")
        : refId(endpoint, "f.circuit");
    const isEndpointList = (
      endpoint: FigureCircuitConnection["to"],
    ): endpoint is readonly EndpointRef[] => Array.isArray(endpoint);
    const expandedConnections: Array<
      Omit<FigureCircuitConnection, "to" | "junction"> & { readonly to: EndpointRef }
    > = [];
    for (const connection of connections) {
      const {
        to,
        junction: junctionOptions,
        from,
        contributesToLayout,
        ...wireOptions
      } = connection;
      const layoutOption = contributesToLayout === undefined ? {} : { contributesToLayout };
      const targets: readonly EndpointRef[] = isEndpointList(to) ? to : [to];
      if (targets.length === 0) throw fail("f.circuit: a fan-out net needs at least one target");
      if (targets.length === 1) {
        const target = targets[0];
        if (target !== undefined)
          expandedConnections.push({ from, to: target, ...layoutOption, ...wireOptions });
        continue;
      }
      if (junctionOptions === undefined) {
        for (const target of targets)
          expandedConnections.push({ from, to: target, ...layoutOption, ...wireOptions });
        continue;
      }
      const sourceId = idForEndpoint(from);
      const label = junctionOptions?.label ?? `${sourceId} fan-out`;
      const id = inferId("junction", label, junctionOptions?.id);
      const { id: _id, ...junctionRest } = junctionOptions ?? {};
      void _id;
      const branch = commit(
        junction(id, { size: junctionRest.size ?? 8, ...junctionRest }),
        where("circuit", label),
      );
      circuitNodes.push(branch);
      expandedConnections.push({ from, to: branch, ...layoutOption, ...wireOptions });
      for (const target of targets)
        expandedConnections.push({
          from: branch,
          to: target,
          ...layoutOption,
          ...wireOptions,
        });
    }
    const orderedIds = circuitNodes.map((node) => {
      return node.id;
    });
    if (new Set(orderedIds).size !== orderedIds.length)
      throw fail("f.circuit: every node may appear only once");
    const nodeIds = new Set(orderedIds);
    const adjacency = new Map<string, string[]>();
    const indegree = new Map(orderedIds.map((id) => [id, 0]));
    const hasIncoming = new Set<string>();
    const rank = new Map(orderedIds.map((id) => [id, 0]));
    for (const connection of expandedConnections) {
      const fromId = idForEndpoint(connection.from);
      const toId = idForEndpoint(connection.to);
      if (!nodeIds.has(fromId) || !nodeIds.has(toId))
        throw fail(
          `f.circuit: connection ${JSON.stringify(fromId)} → ${JSON.stringify(toId)} references a node outside the circuit`,
        );
      if (connection.contributesToLayout === false || connection.kind === "feedback") continue;
      const outgoing = adjacency.get(fromId) ?? [];
      if (!outgoing.includes(toId)) {
        outgoing.push(toId);
        adjacency.set(fromId, outgoing);
        indegree.set(toId, (indegree.get(toId) ?? 0) + 1);
        hasIncoming.add(toId);
      }
    }
    const ready = orderedIds.filter((id) => (indegree.get(id) ?? 0) === 0);
    const visited = new Set<string>();
    while (ready.length > 0) {
      const current = ready.shift();
      if (current === undefined || visited.has(current)) continue;
      visited.add(current);
      for (const target of adjacency.get(current) ?? []) {
        rank.set(target, Math.max(rank.get(target) ?? 0, (rank.get(current) ?? 0) + 1));
        const remaining = (indegree.get(target) ?? 1) - 1;
        indegree.set(target, remaining);
        if (remaining === 0) ready.push(target);
      }
    }
    if (visited.size !== circuitNodes.length) {
      const fallbackRank = Math.max(0, ...rank.values()) + 1;
      for (const id of orderedIds) if (!visited.has(id)) rank.set(id, fallbackRank);
    }
    if (options.alignSinks !== false) {
      const sinkRank = Math.max(0, ...rank.values());
      for (const id of orderedIds)
        if (hasIncoming.has(id) && (adjacency.get(id)?.length ?? 0) === 0) rank.set(id, sinkRank);
    }
    const maxRank = Math.max(0, ...rank.values());
    const ranks = Array.from({ length: maxRank + 1 }, (_, index) =>
      circuitNodes.filter((node) => (rank.get(node.id) ?? 0) === index),
    ).filter((layer) => layer.length > 0);
    const { alignSinks: _alignSinks, entrance: entranceOptions = {}, ...graphOptions } = options;
    void _alignSinks;
    const rankWidth: Responsive<"hug" | "fill"> =
      typeof circuitDirection === "string"
        ? circuitDirection === "horizontal"
          ? "hug"
          : "fill"
        : {
            ...(circuitDirection.wide === undefined
              ? {}
              : { wide: circuitDirection.wide === "horizontal" ? "hug" : "fill" }),
            ...(circuitDirection.compact === undefined
              ? {}
              : { compact: circuitDirection.compact === "horizontal" ? "hug" : "fill" }),
            ...(circuitDirection.narrow === undefined
              ? {}
              : { narrow: circuitDirection.narrow === "horizontal" ? "hug" : "fill" }),
          };
    const root = graph(
      ranks.map((nodes) => ({ nodes, width: rankWidth })),
      {
        ...graphOptions,
        style: "circuit",
        direction: circuitDirection,
        layerGap: options.layerGap ?? { wide: 42, compact: 30, narrow: 34 },
        nodeGap: options.nodeGap ?? { wide: 18, compact: 14, narrow: 12 },
      },
    );
    const sideFor = (
      direction: FigureGraphDirection,
      end: "from" | "to",
    ): Exclude<EdgeSide, "auto" | "center"> =>
      direction === "vertical"
        ? end === "from"
          ? "bottom"
          : "top"
        : end === "from"
          ? "right"
          : "left";
    const directionalSide = (end: "from" | "to"): Responsive<EdgeSide> =>
      typeof circuitDirection === "string"
        ? sideFor(circuitDirection, end)
        : {
            wide: sideFor(circuitDirection.wide ?? "horizontal", end),
            compact: sideFor(
              circuitDirection.compact ?? circuitDirection.wide ?? "horizontal",
              end,
            ),
            narrow: sideFor(
              circuitDirection.narrow ??
                circuitDirection.compact ??
                circuitDirection.wide ??
                "horizontal",
              end,
            ),
          };
    const incomingIndexes = new Map<string, number>();
    const circuitEndpoint = (reference: EndpointRef, end: "from" | "to"): EndpointRef => {
      const authored =
        typeof reference === "object" && !isSceneNode(reference) ? reference : undefined;
      if (
        authored !== undefined &&
        (authored.port !== undefined ||
          authored.side !== undefined ||
          authored.offset !== undefined)
      )
        return reference;
      const id = idForEndpoint(reference);
      const node = nodesById.get(id);
      const target: NodeRef = authored === undefined ? (reference as NodeRef) : authored.node;
      if (node?.metadata?.circuitRole === "gate") {
        if (end === "from") return { ...(authored ?? { node: target }), node: target, port: "out" };
        const count =
          node.metadata.gateKind === "not" || node.metadata.gateKind === "buffer" ? 1 : 2;
        const index = incomingIndexes.get(id) ?? 0;
        incomingIndexes.set(id, index + 1);
        // A two-input gate owns two visible pins. Extra incoming nets intentionally share the
        // nearest pin rather than landing on an arbitrary point of the silhouette.
        const port = `in-${Math.min(index, count - 1)}`;
        return { ...(authored ?? { node: target }), node: target, port };
      }
      if (node?.metadata?.circuitRole === "junction")
        return { ...(authored ?? { node: target }), node: target, side: "center" };
      return {
        ...(authored ?? { node: target }),
        node: target,
        side: directionalSide(end),
      };
    };
    const circuitEdges = expandedConnections.map(
      ({ from, to, contributesToLayout: _layout, ...wireOptions }) => {
        void _layout;
        const signal = wireOptions.signal;
        return wire(circuitEndpoint(from, "from"), circuitEndpoint(to, "to"), {
          avoid: "nodes",
          laneGap: 14,
          head: "none",
          cornerRadius: 10,
          casing: { tone: "canvas", width: 4.75, opacity: 0.94 },
          ...wireOptions,
          ...(signal === undefined
            ? {}
            : {
                signal: {
                  onWidth: 2.35,
                  offWidth: 1.15,
                  onOpacity: 1,
                  offOpacity: 0.72,
                  ...signal,
                },
              }),
        });
      },
    );
    const nodeDuration = entranceOptions.nodeDuration ?? 420;
    const edgeDuration = entranceOptions.edgeDuration ?? 460;
    const nodeStagger = entranceOptions.nodeStagger ?? 45;
    const edgeStagger = entranceOptions.edgeStagger ?? 28;
    const stageGap = entranceOptions.stageGap ?? 70;
    const entranceEasing = entranceOptions.easing ?? "easeOut";
    const rankByNode = new Map<string, number>();
    ranks.forEach((rank, index) => rank.forEach((node) => rankByNode.set(node.id, index)));
    const incomingByRank = ranks.map((_, index) =>
      circuitEdges.filter((edge) => rankByNode.get(endpointNode(edge.to)) === index),
    );
    const entranceTracks = (start: number): readonly TimelineTrack[] => {
      const tracks: TimelineTrack[] = [];
      let cursor = start;
      ranks.forEach((rank, index) => {
        const phase: TimelineTrack[] = [];
        rank.forEach((node, nodeIndex) =>
          phase.push(
            ...withEasing(
              revealTracks(
                node.id,
                cursor + nodeIndex * nodeStagger,
                cursor + nodeIndex * nodeStagger + nodeDuration,
              ),
              entranceEasing,
            ).map(tidy),
          ),
        );
        (incomingByRank[index] ?? []).forEach((edge, edgeIndex) =>
          phase.push(
            ...withEasing(
              drawEdge(
                edge.id,
                cursor + edgeIndex * edgeStagger,
                cursor + edgeIndex * edgeStagger + edgeDuration,
              ),
              entranceEasing,
            ).map(tidy),
          ),
        );
        tracks.push(...phase);
        const nodeSpan = rank.length === 0 ? 0 : nodeDuration + (rank.length - 1) * nodeStagger;
        const incoming = incomingByRank[index] ?? [];
        const edgeSpan =
          incoming.length === 0 ? 0 : edgeDuration + (incoming.length - 1) * edgeStagger;
        cursor += Math.max(nodeSpan, edgeSpan) + stageGap;
      });
      return tracks;
    };
    const entrance: MotionStep = {
      kind: "motion",
      label: "circuit-entrance",
      duration: tracksDuration(entranceTracks(0)),
      tracks: entranceTracks,
    };
    return { root, edges: circuitEdges, ranks, entrance };
  };

  const logicCircuit = (
    spec: FigureLogicCircuitSpec,
    options: FigureCircuitOptions = {},
  ): FigureLogicCircuitResult => {
    const inputEntries = Object.entries(spec.inputs);
    const gateEntries = Object.entries(spec.gates);
    const outputEntries = Object.entries(spec.outputs);
    if (inputEntries.length === 0) throw fail("f.logicCircuit: no inputs given");
    if (gateEntries.length === 0) throw fail("f.logicCircuit: no gates given");
    if (outputEntries.length === 0) throw fail("f.logicCircuit: no outputs given");

    const keys = [...inputEntries, ...gateEntries, ...outputEntries].map(([key]) => key);
    for (const key of keys)
      if (!ID_PATTERN.test(key))
        throw fail(`f.logicCircuit: key "${key}" is not a valid portable id`);
    if (new Set(keys).size !== keys.length)
      throw fail("f.logicCircuit: input, gate, and output keys must be unique");

    const inputKeys = new Set(inputEntries.map(([key]) => key));
    const gateKeys = new Set(gateEntries.map(([key]) => key));
    const sourceExists = (key: string): boolean => inputKeys.has(key) || gateKeys.has(key);
    const labelFor = (key: string): string => key.replace(/[-_]+/g, " ").toUpperCase();
    const eventFor = (key: string): string =>
      `TOGGLE_${key.replace(/[^A-Za-z0-9]+/g, "_").toUpperCase()}`;
    const bitExpression = (key: string): SignalExpression =>
      inputKeys.has(key) ? expr.when({ var: key, op: "truthy" }, 1, 0) : expr.signal(key);

    for (const [key, definition] of gateEntries) {
      const expected = definition.kind === "not" || definition.kind === "buffer" ? 1 : 2;
      if (definition.inputs.length !== expected)
        throw fail(
          `f.logicCircuit: gate "${key}" (${definition.kind}) needs ${expected} input${expected === 1 ? "" : "s"}`,
        );
      for (const source of definition.inputs)
        if (!sourceExists(source))
          throw fail(`f.logicCircuit: gate "${key}" references unknown source "${source}"`);
    }
    for (const [key, definition] of outputEntries)
      if (!sourceExists(definition.from))
        throw fail(
          `f.logicCircuit: output "${key}" references unknown source "${definition.from}"`,
        );

    const orderedGateEntries: Array<[string, FigureLogicGate]> = [];
    const available = new Set(inputKeys);
    const remaining = new Map(gateEntries);
    while (remaining.size > 0) {
      let progressed = false;
      for (const [key, definition] of remaining) {
        if (!definition.inputs.every((source) => available.has(source))) continue;
        orderedGateEntries.push([key, definition]);
        available.add(key);
        remaining.delete(key);
        progressed = true;
      }
      if (!progressed)
        throw fail(
          `f.logicCircuit: gate dependency cycle among ${[...remaining.keys()]
            .map((key) => `"${key}"`)
            .join(", ")}`,
        );
    }

    const inputNodes: Record<string, GroupNode> = {};
    const gateNodes: Record<string, GroupNode> = {};
    const outputNodes: Record<string, GroupNode> = {};
    const sourceNodes = new Map<string, GroupNode>();
    const sourceTones = new Map<string, Paint>();

    for (const [key, definition] of inputEntries) {
      const tone = definition.tone ?? "accent";
      const node = commit(
        tileNode(`input-${key}`, {
          icon: "circle",
          eyebrow: "INPUT",
          title: definition.label ?? labelFor(key),
          detail: "0",
          detailStyle: "title",
          detailTone: tone,
          detailBind: { text: `${key}Value` },
          tone,
          variant: "compact",
          frame: material("flat"),
          bind: { highlight: key },
          interactive: true,
          onActivate: eventFor(key),
        }),
        where("logicCircuit input", key),
      );
      inputNodes[key] = node;
      sourceNodes.set(key, node);
      sourceTones.set(key, tone);
    }

    for (const [key, definition] of orderedGateEntries) {
      const tone = definition.tone ?? "accent";
      const node = commit(
        gate(`gate-${key}`, definition.kind, {
          tone,
          ...(definition.label === undefined ? {} : { text: definition.label }),
          bind: { highlight: key },
        }),
        where("logicCircuit gate", key),
      );
      gateNodes[key] = node;
      sourceNodes.set(key, node);
      sourceTones.set(key, tone);
    }

    for (const [key, definition] of outputEntries) {
      const tone = definition.tone ?? sourceTones.get(definition.from) ?? "accent";
      const node = commit(
        tileNode(`output-${key}`, {
          icon: "arrow-right",
          eyebrow: "OUTPUT",
          title: definition.label ?? labelFor(key),
          detail: "0",
          detailStyle: "title",
          detailTone: tone,
          detailBind: { text: `${key}Value` },
          tone,
          variant: "compact",
          frame: material("flat"),
          bind: { highlight: definition.from },
        }),
        where("logicCircuit output", key),
      );
      outputNodes[key] = node;
    }

    const connections: FigureCircuitConnection[] = [];
    for (const [key, definition] of orderedGateEntries) {
      const target = gateNodes[key];
      if (target === undefined) continue;
      for (const source of definition.inputs) {
        const from = sourceNodes.get(source);
        if (from === undefined) continue;
        connections.push({
          from,
          to: target,
          kind: "flow",
          signal: { onTone: sourceTones.get(source) ?? "accent", offTone: "connector" },
          bind: { signal: source },
        });
      }
    }
    for (const [key, definition] of outputEntries) {
      const from = sourceNodes.get(definition.from);
      const to = outputNodes[key];
      if (from === undefined || to === undefined) continue;
      connections.push({
        from,
        to,
        kind: "flow",
        signal: {
          onTone: definition.tone ?? sourceTones.get(definition.from) ?? "accent",
          offTone: "connector",
        },
        bind: { signal: definition.from },
      });
    }

    const signals: Record<string, SignalExpression> = {};
    for (const [key] of inputEntries) signals[`${key}Value`] = expr.format(bitExpression(key));
    for (const [key, definition] of orderedGateEntries) {
      const values = definition.inputs.map(bitExpression);
      const combined =
        definition.kind === "and" || definition.kind === "nand"
          ? expr.bitAnd(...values)
          : definition.kind === "or" || definition.kind === "nor"
            ? expr.bitOr(...values)
            : definition.kind === "xor" || definition.kind === "xnor"
              ? expr.bitXor(...values)
              : (values[0] ?? 0);
      signals[key] =
        definition.kind === "not" ||
        definition.kind === "nand" ||
        definition.kind === "nor" ||
        definition.kind === "xnor"
          ? expr.bitXor(combined, 1)
          : combined;
    }
    for (const [key, definition] of outputEntries)
      signals[`${key}Value`] = expr.format(bitExpression(definition.from));

    const circuitResult = circuit(
      [...Object.values(inputNodes), ...Object.values(gateNodes), ...Object.values(outputNodes)],
      connections,
      {
        direction: { wide: "horizontal", compact: "vertical", narrow: "vertical" },
        width: "fill",
        ...options,
      },
    );
    const machineDefinition: FigureMachine = {
      initial: "ready",
      variables: Object.fromEntries(
        inputEntries.map(([key, definition]) => [key, definition.initial ?? false]),
      ),
      states: {
        ready: {
          on: Object.fromEntries(
            inputEntries.map(([key]) => [
              eventFor(key),
              { target: "ready", actions: [{ type: "toggle" as const, var: key }] },
            ]),
          ),
        },
      },
      signals,
      events: inputEntries.map(([key]) => eventFor(key)),
    };
    return {
      ...circuitResult,
      machine: machineDefinition,
      nodes: { inputs: inputNodes, gates: gateNodes, outputs: outputNodes },
    };
  };

  const topologyOptions = (
    options: FigureTopologyOptions,
  ): { readonly circuit: FigureCircuitOptions; readonly edge: FigureWireOptions } => {
    const { edge = {}, ...circuitOptions } = options;
    return { circuit: circuitOptions, edge };
  };

  const pipelineTopology = (
    stages: readonly SceneNode[],
    options: FigureTopologyOptions = {},
    closeLoop = false,
  ): FigurePipelineResult => {
    if (stages.length < 2) throw fail("f.pipeline: give at least two stages");
    const authored = topologyOptions(options);
    const connections: FigureCircuitConnection[] = stages.slice(0, -1).map((stage, index) => ({
      from: stage,
      to: stages[index + 1] as SceneNode,
      kind: "flow",
      ...authored.edge,
    }));
    if (closeLoop)
      connections.push({
        from: stages[stages.length - 1] as SceneNode,
        to: stages[0] as SceneNode,
        kind: "feedback",
        contributesToLayout: false,
        ...authored.edge,
      });
    return { ...circuit(stages, connections, authored.circuit), stages };
  };

  const hubMapTopology = (
    spec: FigureHubMapSpec,
    options: FigureTopologyOptions = {},
  ): FigureHubMapResult => {
    if (spec.clients.length === 0) throw fail("f.hubMap: give at least one client");
    const upstream = spec.upstream ?? [];
    const authored = topologyOptions(options);
    const connections: FigureCircuitConnection[] = [
      ...upstream.map((node) => ({
        from: node,
        to: spec.host,
        kind: "spline" as const,
        ...authored.edge,
      })),
      { from: spec.host, to: spec.clients, kind: "spline", ...authored.edge },
    ];
    return {
      ...circuit([...upstream, spec.host, ...spec.clients], connections, authored.circuit),
      host: spec.host,
      upstream,
      clients: spec.clients,
    };
  };

  const fanOutTopology = (
    source: SceneNode,
    targets: readonly SceneNode[],
    options: FigureTopologyOptions = {},
  ): FigureFanOutResult => {
    if (targets.length === 0) throw fail("f.fanOut: give at least one target");
    const authored = topologyOptions(options);
    return {
      ...circuit(
        [source, ...targets],
        [{ from: source, to: targets, kind: "spline", ...authored.edge }],
        authored.circuit,
      ),
      source,
      targets,
    };
  };

  const layeredArchitectureTopology = (
    spec: FigureLayeredArchitectureSpec,
    options: FigureTopologyOptions = {},
  ): FigureLayeredArchitectureResult => {
    if (spec.layers.length < 2 || spec.layers.some((layer) => layer.length === 0))
      throw fail("f.layeredArchitecture: give at least two non-empty layers");
    const authored = topologyOptions(options);
    const generated = spec.layers.slice(0, -1).flatMap((layer, index) => {
      const next = spec.layers[index + 1] ?? [];
      return layer.flatMap((from) =>
        next.map((to) => ({ from, to, kind: "flow" as const, ...authored.edge })),
      );
    });
    return {
      ...circuit(spec.layers.flat(), spec.connections ?? generated, authored.circuit),
      layers: spec.layers,
    };
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
    spline(anchors, options = {}) {
      const points = anchors.map((node) => {
        const position = node.position;
        if (position === undefined || !("x" in position) || !("y" in position)) {
          throw new Error(
            `f.spline: anchor ${JSON.stringify(node.id)} needs a direct position; place it with f.place(node, { x, y, anchor: "center" })`,
          );
        }
        return [position.x, position.y] as const;
      });
      const { id: explicit, ...rest } = options;
      const id = inferId("spline", rest.label, explicit);
      return commit(
        { id, type: "polyline", points, curve: "monotone", ...rest },
        where("spline", rest.label),
      );
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
    cardFan(cards, options = {}) {
      const { id: explicit, ...rest } = options;
      const id = inferId("card-fan", rest.label, explicit);
      const arranged = cardFan(id, cards, rest);
      const children = arranged.children.map((placement, index) => {
        const card = cards[index];
        if (card === undefined) return placement;
        if (!created.has(card))
          throw fail(
            `f.cardFan: unknown node "${card.id}"; create every card with a builder helper first`,
          );
        Object.assign(card, {
          width: placement.width,
          position: placement.position,
          rotation: placement.rotation,
          z: placement.z,
          metadata: placement.metadata,
        });
        return card;
      });
      return commit({ ...arranged, children }, where("cardFan", rest.label));
    },
    codeBlock(source, options = {}) {
      const { id: explicit, ...rest } = options;
      const primary = rest.title ?? rest.label ?? rest.language;
      const id = inferId("code-block", primary, explicit);
      return commit(codeBlock(id, source, rest), where("codeBlock", primary));
    },
    panel(children, options = {}) {
      const { id: explicit, ...rest } = options;
      const primary = rest.title ?? rest.eyebrow ?? rest.label;
      const id = inferId("panel", primary, explicit);
      return commit(panel(id, children, rest), where("panel", primary));
    },
    panes(panes, options = {}) {
      const { id: explicit, ...rest } = options;
      const primary = rest.label ?? panes.find((pane) => pane.active === true)?.title;
      const id = inferId("panes", primary, explicit);
      return commit(paneLayout(id, panes, rest), where("panes", primary));
    },
    window(content, options = {}) {
      const { id: explicit, ...rest } = options;
      const primary = rest.title ?? rest.label ?? content.label;
      const id = inferId("window", primary, explicit);
      return commit(windowFrame(id, content, rest), where("window", primary));
    },
    surface(child, options = {}) {
      if (!created.has(child))
        throw fail(`f.surface: unknown node "${child.id}"; create it with a builder helper first`);
      const { id: explicit, ...rest } = options;
      const id = inferId("surface", rest.label ?? child.label ?? child.id, explicit);
      return commit(figureSurface(id, child, rest), where("surface", rest.label ?? child.id));
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
    port(options = {}) {
      const { id: explicit, ...rest } = options;
      const id = inferId("port", rest.label, explicit);
      return commit(port(id, rest), where("port", rest.label));
    },
    tile(options) {
      const { id: explicit, ...rest } = options;
      const primary = rest.title ?? rest.eyebrow ?? rest.icon;
      const id = inferId("tile", primary, explicit);
      return commit(tileNode(id, rest), where("tile", primary));
    },
    gridPlane(options = {}) {
      const { id: explicit, ...rest } = options;
      const id = inferId("grid-plane", rest.label, explicit);
      return commit(gridPlane(id, rest), where("gridPlane", rest.label));
    },
    keyValue(key, value, options = {}) {
      const { id: explicit, ...rest } = options;
      const id = inferId("key-value", key, explicit);
      return commit(keyValue(id, key, value, rest), where("keyValue", key));
    },
    terminal(lines, options = {}) {
      const { id: explicit, ...rest } = options;
      const primary = rest.title ?? rest.label;
      const id = inferId("terminal", primary, explicit);
      return commit(terminal(id, lines, rest), where("terminal", primary));
    },
    minecraftCommand(command, options = {}) {
      const { id: explicit, ...rest } = options;
      const id = inferId("minecraft-command", command, explicit);
      return commit(minecraftCommand(id, command, rest), where("minecraftCommand", command));
    },
    terminalWindow(panes, options = {}) {
      const { id: explicit, ...rest } = options;
      const primary = rest.title ?? rest.label;
      const id = inferId("terminal-window", primary, explicit);
      return commit(terminalWindow(id, panes, rest), where("terminalWindow", primary));
    },
    fileTree(entries, options = {}) {
      const { id: explicit, ...rest } = options;
      const primary = rest.root ?? rest.label;
      const id = inferId("file-tree", primary, explicit);
      return commit(fileTree(id, entries, rest), where("fileTree", primary));
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
    circuit,
    logicCircuit,
    hubMap: hubMapTopology,
    pipeline: (stages, options) => pipelineTopology(stages, options),
    fanOut: fanOutTopology,
    feedbackLoop: (stages, options) => pipelineTopology(stages, options, true),
    layeredArchitecture: layeredArchitectureTopology,

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
    wire,

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
    rotate(target, options = {}) {
      const { duration = DEFAULTS.rotate, stagger = 0, from = 0, to = 360, easing } = options;
      const resolved = resolveTargets(target, "f.rotate");
      return step(`rotate(${resolved.ids.join(",")})`, resolved.ids, stagger, (id, start) =>
        withEasing([rotateTo(id, start, start + duration, from, to)], easing),
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
    typewrite(target, options = {}) {
      const {
        duration = DEFAULTS.typewrite,
        stagger = 0,
        easing = "linear",
        mode = "sequential",
        characterDuration,
        lineDelay = 70,
      } = options;
      const resolved = resolveTargets(target, "f.typewrite");
      const targets: {
        readonly id: string;
        readonly text: string;
        readonly order: number;
        readonly line?: number;
      }[] = [];
      let traversalOrder = 0;
      const collect = (node: SceneNode, scopeOffset: number): void => {
        if (node.type === "text" && node.reveal === "characters") {
          const authoredOrder = node.metadata?.typingOrder;
          const authoredLine = node.metadata?.typingLine;
          targets.push({
            id: node.id,
            text: node.text,
            order:
              scopeOffset + (typeof authoredOrder === "number" ? authoredOrder : traversalOrder),
            ...(typeof authoredLine === "number" ? { line: authoredLine } : {}),
          });
          traversalOrder += 1;
        }
        if (node.type === "group") node.children.forEach((child) => collect(child, scopeOffset));
      };
      resolved.ids.forEach((id, index) => {
        const node = nodesById.get(id);
        if (node !== undefined) collect(node, index * 1_000_000_000);
      });
      if (targets.length === 0)
        throw fail(
          `f.typewrite: no character-reveal text found in ${resolved.ids.map((id) => `"${id}"`).join(", ")}; use f.terminal(...) or set reveal: "characters" on a text node`,
        );
      const ordered = [...new Map(targets.map((entry) => [entry.id, entry])).values()].sort(
        (left, right) => left.order - right.order,
      );
      const ids = ordered.map((entry) => entry.id);
      if (mode === "overlap")
        return step(`typewrite(${ids.join(",")})`, ids, stagger, (id, start) => [
          ramp(id, "progress", start, start + duration, 0, 1, easing),
        ]);

      const runGap = validTime(stagger, "f.typewrite stagger");
      const linePause = validTime(lineDelay, "f.typewrite lineDelay");
      const authoredDuration = validTime(duration, "f.typewrite duration");
      const perCharacter =
        characterDuration === undefined
          ? undefined
          : validTime(characterDuration, "f.typewrite characterDuration");
      const characterCounts = ordered.map((entry) => Math.max(1, [...entry.text].length));
      const totalCharacters = characterCounts.reduce((sum, count) => sum + count, 0);
      const runDurations = characterCounts.map((count) =>
        perCharacter === undefined
          ? (authoredDuration * count) / totalCharacters
          : perCharacter * count,
      );
      const offsets: number[] = [];
      let cursor = 0;
      for (let index = 0; index < ordered.length; index += 1) {
        const current = ordered[index];
        const previous = ordered[index - 1];
        if (index > 0) {
          cursor += runGap;
          if (
            current?.line !== undefined &&
            previous?.line !== undefined &&
            current.line !== previous.line
          )
            cursor += linePause;
        }
        offsets.push(cursor);
        cursor += runDurations[index] ?? 0;
      }
      return {
        kind: "motion",
        label: `typewrite(${ids.join(",")})`,
        duration: cursor,
        tracks: (start) =>
          ordered.flatMap((entry, index) => {
            const runStart = start + (offsets[index] ?? 0);
            return [
              ramp(
                entry.id,
                "progress",
                runStart,
                runStart + (runDurations[index] ?? 0),
                0,
                1,
                easing,
              ),
            ];
          }),
      };
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

    if (
      controls.some((control) => (control.kind ?? "event") !== "transport") &&
      machine === undefined
    )
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
    for (const control of controls)
      checkBinding(control.id, control.bind === undefined ? [] : [["value", control.bind]]);

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
