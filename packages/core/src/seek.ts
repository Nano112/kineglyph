import { packetPositions } from "./edges.js";
import { applyEasing } from "./easing.js";
import type { VariableValue, Variables } from "./machine.js";
import type {
  AnimationTimeline,
  ResolvedEdge,
  ResolvedFrame,
  ResolvedNode,
  ResolvedScene,
  TimelineTrack,
} from "./resolved.js";

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

const EDGE_PROPERTIES: ReadonlySet<string> = new Set([
  "opacity",
  "stroke",
  "strokeWidth",
  "progress",
  "edgeReveal",
  "highlight",
  "flow",
]);
const NODE_PROPERTIES: ReadonlySet<string> = new Set([
  "opacity",
  "translateX",
  "translateY",
  "scale",
  "rotation",
  "x",
  "y",
  "width",
  "height",
  "fill",
  "stroke",
  "color",
  "strokeWidth",
  "radius",
  "numericText",
  "pathMorph",
  "followPath",
  "progress",
  "highlight",
  "revealX",
  "revealY",
]);

function validateTimeline(timeline: AnimationTimeline, scene: ResolvedScene): void {
  if (!Number.isFinite(timeline.duration) || timeline.duration < 0) {
    throw new RangeError("timeline duration must be finite and non-negative");
  }
  const edgeIds = new Set(scene.edges.map((edge) => edge.id));
  const targets = new Set([...scene.nodes.map((node) => node.id), ...edgeIds]);
  const cueNames = new Set<string>();
  for (const cue of timeline.cues ?? []) {
    if (cueNames.has(cue.name)) throw new Error(`duplicate timeline cue: ${cue.name}`);
    cueNames.add(cue.name);
    if (!Number.isFinite(cue.time) || cue.time < 0 || cue.time > timeline.duration)
      throw new RangeError(`timeline cue ${cue.name} is outside the timeline`);
  }
  const trackIds = new Set<string>();
  timeline.tracks.forEach((track, trackIndex) => {
    if (trackIds.has(track.id)) throw new Error(`duplicate timeline track id: ${track.id}`);
    trackIds.add(track.id);
    if (!targets.has(track.target))
      throw new Error(`timeline track ${track.id} targets missing scene id ${track.target}`);
    if (track.keyframes.length === 0)
      throw new Error(`timeline track ${track.id} must contain a keyframe`);
    const targetsEdge = edgeIds.has(track.target);
    if (targetsEdge && !EDGE_PROPERTIES.has(track.property))
      throw new Error(
        `timeline track ${track.id}: ${track.property} cannot target edge ${track.target} (edges accept opacity, stroke, strokeWidth, progress/edgeReveal, highlight, flow)`,
      );
    if (!targetsEdge && !NODE_PROPERTIES.has(track.property))
      throw new Error(
        `timeline track ${track.id}: ${track.property} cannot target node ${track.target}`,
      );
    let previous = -Infinity;
    track.keyframes.forEach((keyframe, keyframeIndex) => {
      if (
        !Number.isFinite(keyframe.time) ||
        keyframe.time < 0 ||
        keyframe.time > timeline.duration
      ) {
        throw new RangeError(
          `tracks[${trackIndex}].keyframes[${keyframeIndex}].time is outside the timeline`,
        );
      }
      const expectsString =
        track.property === "fill" ||
        track.property === "stroke" ||
        track.property === "color" ||
        track.property === "pathMorph";
      if (expectsString && typeof keyframe.value !== "string")
        throw new TypeError(
          `tracks[${trackIndex}].keyframes[${keyframeIndex}].value must be a string for ${track.property}`,
        );
      if (
        !expectsString &&
        (typeof keyframe.value !== "number" || !Number.isFinite(keyframe.value))
      )
        throw new RangeError(
          `tracks[${trackIndex}].keyframes[${keyframeIndex}].value must be finite for ${track.property}`,
        );
      if (keyframe.time <= previous)
        throw new Error(`timeline track ${track.id} keyframes must have strictly increasing times`);
      previous = keyframe.time;
    });
    if (track.property === "followPath" && (track.path?.length ?? 0) < 2)
      throw new Error(`timeline track ${track.id}: followPath needs at least two path points`);
  });
}

function colorChannels(value: string): readonly [number, number, number, number] | undefined {
  const short = /^#([0-9a-f]{3}|[0-9a-f]{4})$/i.exec(value)?.[1];
  if (short !== undefined) {
    const channels = [...short].map((entry) => Number.parseInt(entry + entry, 16));
    return [channels[0] ?? 0, channels[1] ?? 0, channels[2] ?? 0, channels[3] ?? 255];
  }
  const long = /^#([0-9a-f]{6}|[0-9a-f]{8})$/i.exec(value)?.[1];
  if (long !== undefined)
    return [
      Number.parseInt(long.slice(0, 2), 16),
      Number.parseInt(long.slice(2, 4), 16),
      Number.parseInt(long.slice(4, 6), 16),
      long.length === 8 ? Number.parseInt(long.slice(6, 8), 16) : 255,
    ];
  return undefined;
}

function interpolateColor(from: string, to: string, progress: number): string {
  const left = colorChannels(from);
  const right = colorChannels(to);
  if (left === undefined || right === undefined) return progress < 1 ? from : to;
  const channel = (index: number): number =>
    Math.round((left[index] ?? 0) + ((right[index] ?? 0) - (left[index] ?? 0)) * progress);
  const alpha = channel(3);
  const hex = [channel(0), channel(1), channel(2), ...(alpha === 255 ? [] : [alpha])]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
  return `#${hex}`;
}

const PATH_TOKEN = /-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?|[a-z]+/gi;

function interpolatePath(from: string, to: string, progress: number): string {
  const left = from.match(PATH_TOKEN) ?? [];
  const right = to.match(PATH_TOKEN) ?? [];
  if (left.length !== right.length) return progress < 1 ? from : to;
  const parts: string[] = [];
  for (let index = 0; index < left.length; index += 1) {
    const a = left[index] ?? "";
    const b = right[index] ?? "";
    const an = Number(a);
    const bn = Number(b);
    if (Number.isFinite(an) && Number.isFinite(bn))
      parts.push(String(Math.round((an + (bn - an) * progress) * 1e4) / 1e4));
    else if (a.toUpperCase() === b.toUpperCase()) parts.push(a);
    else return progress < 1 ? from : to;
  }
  return parts.join(" ");
}

function evaluateTrack(track: TimelineTrack, time: number): number | string {
  const first = track.keyframes[0];
  const last = track.keyframes[track.keyframes.length - 1];
  if (first === undefined || last === undefined)
    throw new Error(`timeline track ${track.id} has no keyframes`);
  if (time <= first.time) return first.value;
  if (time >= last.time) return last.value;

  for (let index = 1; index < track.keyframes.length; index += 1) {
    const right = track.keyframes[index];
    const left = track.keyframes[index - 1];
    if (left !== undefined && right !== undefined && time <= right.time) {
      const progress = (time - left.time) / (right.time - left.time);
      const eased = applyEasing(right.easing, progress);
      if (typeof left.value === "number" && typeof right.value === "number")
        return left.value + (right.value - left.value) * eased;
      if (typeof left.value === "string" && typeof right.value === "string")
        return track.property === "pathMorph"
          ? interpolatePath(left.value, right.value, eased)
          : interpolateColor(left.value, right.value, eased);
      return progress < 1 ? left.value : right.value;
    }
  }
  return last.value;
}

function updateNode(
  node: ResolvedNode,
  tracks: readonly TimelineTrack[],
  time: number,
): ResolvedNode {
  if (tracks.length === 0) return node;
  const state = { ...node.state };
  let appearance = node.appearance;
  let text = node.text;
  let path = node.path;
  let x = node.x;
  let y = node.y;
  let width = node.width;
  let height = node.height;
  for (const track of tracks) {
    const value = evaluateTrack(track, time);
    switch (track.property) {
      // Timeline opacity composes with binding-driven base opacity (e.g. a dimmed card still fades in).
      case "opacity":
        state.opacity = clamp(Number(value), 0, 1) * clamp(node.state.opacity, 0, 1);
        break;
      case "progress":
        state.progress = clamp(Number(value), 0, 1);
        break;
      // Emphasis from timelines and machines combine as the stronger of the two.
      case "highlight":
        state.highlight = Math.max(clamp(Number(value), 0, 1), node.state.highlight ?? 0);
        break;
      case "translateX":
      case "translateY":
      case "scale":
      case "rotation":
        state[track.property] = Number(value);
        break;
      case "x":
        x = Number(value);
        break;
      case "y":
        y = Number(value);
        break;
      case "width":
        width = Math.max(0, Number(value));
        break;
      case "height":
        height = Math.max(0, Number(value));
        break;
      case "fill":
        appearance = { ...appearance, fill: String(value) };
        break;
      case "stroke":
        appearance = { ...appearance, stroke: String(value) };
        break;
      case "color":
        if (text !== undefined) text = { ...text, color: String(value) };
        break;
      case "strokeWidth":
        appearance = { ...appearance, strokeWidth: Math.max(0, Number(value)) };
        break;
      case "radius":
        appearance = { ...appearance, radius: Math.max(0, Number(value)) };
        break;
      case "numericText": {
        if (text === undefined) break;
        const digits = Math.max(0, Math.floor(track.format?.digits ?? 0));
        const formatted = Number(value).toLocaleString("en-US", {
          useGrouping: track.format?.thousands ?? false,
          minimumFractionDigits: digits,
          maximumFractionDigits: digits,
        });
        const lines = [...text.lines];
        const first = lines[0];
        if (first !== undefined)
          lines[0] = {
            ...first,
            text: `${track.format?.prefix ?? ""}${formatted}${track.format?.suffix ?? ""}`,
          };
        text = { ...text, lines };
        break;
      }
      case "pathMorph":
        if (path !== undefined) path = { ...path, d: String(value) };
        break;
      case "followPath": {
        const points = track.path ?? [];
        const scaled = clamp(Number(value), 0, 1) * (points.length - 1);
        const index = Math.min(points.length - 2, Math.floor(scaled));
        const local = scaled - index;
        const from = points[index];
        const to = points[index + 1];
        const origin = points[0];
        if (from !== undefined && to !== undefined && origin !== undefined) {
          const px = from.x + (to.x - from.x) * local;
          const py = from.y + (to.y - from.y) * local;
          state.translateX = node.state.translateX + px - origin.x;
          state.translateY = node.state.translateY + py - origin.y;
          if (track.orient === true)
            state.rotation = (Math.atan2(to.y - from.y, to.x - from.x) * 180) / Math.PI;
        }
        break;
      }
      case "revealX":
        state.revealX = clamp(Number(value), 0, 1);
        break;
      case "revealY":
        state.revealY = clamp(Number(value), 0, 1);
        break;
      case "edgeReveal":
      case "flow":
        throw new Error(`${track.property} track ${track.id} cannot target node ${node.id}`);
    }
  }
  return {
    ...node,
    x,
    y,
    width,
    height,
    appearance,
    state,
    ...(text === undefined ? {} : { text }),
    ...(path === undefined ? {} : { path }),
  };
}

function updateEdge(
  edge: ResolvedEdge,
  tracks: readonly TimelineTrack[],
  time: number,
): ResolvedEdge {
  const state = { ...edge.state };
  let appearance = edge.appearance;
  for (const track of tracks) {
    const value = evaluateTrack(track, time);
    if (track.property === "opacity")
      state.opacity = clamp(Number(value), 0, 1) * clamp(edge.state.opacity, 0, 1);
    else if (track.property === "progress" || track.property === "edgeReveal")
      state.progress = clamp(Number(value), 0, 1);
    else if (track.property === "highlight")
      state.highlight = Math.max(clamp(Number(value), 0, 1), edge.state.highlight ?? 0);
    else if (track.property === "flow") state.flow = clamp(Number(value), 0, 1);
    else if (track.property === "stroke") appearance = { ...appearance, stroke: String(value) };
    else if (track.property === "strokeWidth")
      appearance = { ...appearance, strokeWidth: Math.max(0, Number(value)) };
    else throw new Error(`${track.property} track ${track.id} cannot target edge ${edge.id}`);
  }
  const count = numberValue(edge.metadata?.packetCount);
  const period = numberValue(edge.metadata?.packetPeriod);
  const packets =
    edge.samples !== undefined && count > 0 && period > 0
      ? packetPositions(edge.samples, count, period, time)
      : edge.packets;
  if (tracks.length === 0 && packets === edge.packets) return edge;
  return {
    ...edge,
    appearance,
    state,
    ...(packets === undefined ? {} : { packets }),
    metadata: {
      ...(edge.metadata ?? {}),
      ...(period > 0 ? { packetPhase: (((time % period) + period) % period) / period } : {}),
    },
  };
}

function numberValue(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

/** Pure random-access evaluation of a resolved scene's animation tracks. */
/** Options for {@link seekTimeline}. */
export interface SeekOptions {
  /**
   * Frame signals: values that override a node's `bind.path`, `bind.text`, `bind.opacity`, and
   * `bind.hidden` for this frame only. They come from things that move with time outside the
   * timeline — a live surface reporting where its objects are — and apply equally to live
   * playback and exported frames.
   */
  readonly signals?: Variables;
}

function frameTruthy(value: VariableValue): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0 && !Number.isNaN(value);
  if (typeof value === "string") return value !== "" && value !== "false" && value !== "0";
  return Array.isArray(value) ? value.length > 0 : Boolean(value);
}

function applyFrameSignals(node: ResolvedNode, signals: Variables): ResolvedNode {
  const bind = node.bind;
  if (bind === undefined) return node;
  let next = node;
  const path = bind.path === undefined ? undefined : signals[bind.path];
  if (path !== undefined && next.path !== undefined)
    next = { ...next, path: { ...next.path, d: String(path) } };
  const text = bind.text === undefined ? undefined : signals[bind.text];
  if (text !== undefined && next.text !== undefined) {
    const first = next.text.lines[0];
    next = {
      ...next,
      text: {
        ...next.text,
        lines: first === undefined ? [] : [{ ...first, text: String(text) }],
      },
    };
  }
  const opacity = bind.opacity === undefined ? undefined : signals[bind.opacity];
  if (opacity !== undefined) {
    const factor = clamp(numberValue(opacity), 0, 1);
    next = { ...next, state: { ...next.state, opacity: next.state.opacity * factor } };
  }
  const hidden = bind.hidden === undefined ? undefined : signals[bind.hidden];
  if (hidden !== undefined) {
    const value = frameTruthy(hidden);
    next = value ? { ...next, hidden: true } : { ...next, hidden: false };
  }
  return next;
}

export function seekTimeline(
  scene: ResolvedScene,
  requestedTime: number,
  options: SeekOptions = {},
): ResolvedFrame {
  if (!Number.isFinite(requestedTime)) throw new RangeError("seek time must be finite");
  const timeline = scene.timeline ?? { duration: 0, tracks: [] };
  validateTimeline(timeline, scene);
  const time = clamp(requestedTime, 0, timeline.duration);
  const tracksByTarget = new Map<string, TimelineTrack[]>();
  for (const track of timeline.tracks) {
    const tracks = tracksByTarget.get(track.target) ?? [];
    tracks.push(track);
    tracksByTarget.set(track.target, tracks);
  }
  return {
    ...scene,
    time,
    progress: timeline.duration === 0 ? 1 : time / timeline.duration,
    nodes: scene.nodes.map((node) => {
      const updated = updateNode(node, tracksByTarget.get(node.id) ?? [], time);
      return options.signals === undefined ? updated : applyFrameSignals(updated, options.signals);
    }),
    edges: scene.edges.map((edge) => updateEdge(edge, tracksByTarget.get(edge.id) ?? [], time)),
  };
}
