import { packetPositions } from "./edges.js";
import type {
  AnimationTimeline,
  ResolvedEdge,
  ResolvedFrame,
  ResolvedNode,
  ResolvedScene,
  TimelineKeyframe,
  TimelineTrack,
} from "./resolved.js";

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function easing(name: TimelineKeyframe["easing"], t: number): number {
  switch (name ?? "linear") {
    case "easeIn":
      return t * t;
    case "easeOut":
      return 1 - (1 - t) ** 2;
    case "easeInOut":
      return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
    case "linear":
      return t;
  }
}

function validateTimeline(timeline: AnimationTimeline, scene: ResolvedScene): void {
  if (!Number.isFinite(timeline.duration) || timeline.duration < 0) {
    throw new RangeError("timeline duration must be finite and non-negative");
  }
  const targets = new Set([
    ...scene.nodes.map((node) => node.id),
    ...scene.edges.map((edge) => edge.id),
  ]);
  const trackIds = new Set<string>();
  timeline.tracks.forEach((track, trackIndex) => {
    if (trackIds.has(track.id)) throw new Error(`duplicate timeline track id: ${track.id}`);
    trackIds.add(track.id);
    if (!targets.has(track.target))
      throw new Error(`timeline track ${track.id} targets missing scene id ${track.target}`);
    if (track.keyframes.length === 0)
      throw new Error(`timeline track ${track.id} must contain a keyframe`);
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
      if (!Number.isFinite(keyframe.value)) {
        throw new RangeError(
          `tracks[${trackIndex}].keyframes[${keyframeIndex}].value must be finite`,
        );
      }
      if (keyframe.time <= previous)
        throw new Error(`timeline track ${track.id} keyframes must have strictly increasing times`);
      previous = keyframe.time;
    });
  });
}

function evaluateTrack(track: TimelineTrack, time: number): number {
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
      return left.value + (right.value - left.value) * easing(right.easing, progress);
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
  for (const track of tracks) {
    const value = evaluateTrack(track, time);
    switch (track.property) {
      case "opacity":
      case "progress":
        state[track.property] = clamp(value, 0, 1);
        break;
      case "highlight":
        state.highlight = clamp(value, 0, 1);
        break;
      case "translateX":
      case "translateY":
      case "scale":
        state[track.property] = value;
        break;
      case "edgeReveal":
      case "flow":
        throw new Error(`${track.property} track ${track.id} cannot target node ${node.id}`);
    }
  }
  return { ...node, state };
}

function updateEdge(
  edge: ResolvedEdge,
  tracks: readonly TimelineTrack[],
  time: number,
): ResolvedEdge {
  const state = { ...edge.state };
  for (const track of tracks) {
    const value = evaluateTrack(track, time);
    if (track.property === "opacity") state.opacity = clamp(value, 0, 1);
    else if (track.property === "progress" || track.property === "edgeReveal")
      state.progress = clamp(value, 0, 1);
    else if (track.property === "highlight") state.highlight = clamp(value, 0, 1);
    else if (track.property === "flow") state.flow = clamp(value, 0, 1);
    else throw new Error(`${track.property} track ${track.id} cannot target edge ${edge.id}`);
  }
  const count = numberValue(edge.metadata?.packetCount);
  const period = numberValue(edge.metadata?.packetPeriod);
  const packets =
    edge.samples !== undefined && count > 0 && period > 0
      ? packetPositions(edge.samples, count, period, time)
      : edge.packets;
  if (tracks.length === 0 && packets === edge.packets) return edge;
  return { ...edge, state, ...(packets === undefined ? {} : { packets }) };
}

function numberValue(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

/** Pure random-access evaluation of a resolved scene's animation tracks. */
export function seekTimeline(scene: ResolvedScene, requestedTime: number): ResolvedFrame {
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
    nodes: scene.nodes.map((node) => updateNode(node, tracksByTarget.get(node.id) ?? [], time)),
    edges: scene.edges.map((edge) => updateEdge(edge, tracksByTarget.get(edge.id) ?? [], time)),
  };
}
