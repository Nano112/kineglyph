/**
 * Small authoring helpers for purposeful timelines. Everything returns plain serializable tracks.
 */
import type {
  AnimationTimeline,
  TimelineKeyframe,
  TimelineProperty,
  TimelineTrack,
} from "./resolved.js";

type Easing = NonNullable<TimelineKeyframe["easing"]>;

function keyframes(
  start: number,
  end: number,
  from: number,
  to: number,
  easing: Easing,
  initial = from,
): TimelineKeyframe[] {
  const frames: TimelineKeyframe[] = [];
  if (start > 0) frames.push({ time: 0, value: initial });
  frames.push({ time: start, value: from });
  frames.push({ time: end, value: to, easing });
  return frames;
}

/** A single-property track; ids are derived from target and property unless overridden. */
export function track(
  target: string,
  property: TimelineProperty,
  frames: readonly TimelineKeyframe[],
  id = `${target}:${property}`,
): TimelineTrack {
  return { id, target, property, keyframes: frames };
}

export function fadeIn(target: string, start: number, end: number, from = 0): TimelineTrack {
  return track(target, "opacity", keyframes(start, end, from, 1, "easeOut"));
}

export function fadeTo(
  target: string,
  start: number,
  end: number,
  from: number,
  to: number,
): TimelineTrack {
  return track(
    target,
    "opacity",
    keyframes(start, end, from, to, "easeInOut"),
    `${target}:opacity:${start}`,
  );
}

export function scaleIn(target: string, start: number, end: number, from = 0.94): TimelineTrack {
  return track(target, "scale", keyframes(start, end, from, 1, "easeOut"));
}

export function slideIn(
  target: string,
  start: number,
  end: number,
  offset: number,
  axis: "x" | "y" = "y",
): TimelineTrack {
  return track(
    target,
    axis === "x" ? "translateX" : "translateY",
    keyframes(start, end, offset, 0, "easeOut"),
  );
}

/** Fade + settle: the default entrance for cards and marks. */
export function reveal(
  target: string,
  start: number,
  end: number,
  options: { readonly scale?: number; readonly offset?: number } = {},
): TimelineTrack[] {
  const tracks = [fadeIn(target, start, end)];
  if (options.scale !== undefined) tracks.push(scaleIn(target, start, end, options.scale));
  if (options.offset !== undefined) tracks.push(slideIn(target, start, end, options.offset));
  return tracks;
}

/** Draws an edge from its source to its target between start and end. */
export function drawEdge(edge: string, start: number, end: number): TimelineTrack[] {
  return [
    track(edge, "opacity", [
      { time: 0, value: 0 },
      { time: Math.max(0, start - 1), value: 0 },
      { time: start, value: 1 },
    ]),
    track(edge, "edgeReveal", keyframes(start, end, 0, 1, "easeInOut")),
  ];
}

/** Turns packets on (flow 0→1) at a moment, optionally off again later. */
export function flow(edge: string, on: number, off?: number): TimelineTrack {
  const frames: TimelineKeyframe[] = [
    { time: 0, value: 0 },
    { time: on, value: 0 },
    { time: on + 1, value: 1 },
  ];
  if (off !== undefined)
    frames.push({ time: off, value: 1 }, { time: off + 200, value: 0, easing: "easeOut" });
  return track(edge, "flow", frames);
}

/** Emphasis rising to `peak` and settling to `rest`. */
export function highlight(
  target: string,
  start: number,
  end: number,
  peak = 1,
  rest = peak,
): TimelineTrack {
  const frames: TimelineKeyframe[] = [
    { time: 0, value: 0 },
    { time: start, value: 0 },
    { time: (start + end) / 2, value: peak, easing: "easeOut" },
    { time: end, value: rest, easing: "easeInOut" },
  ];
  return track(target, "highlight", dedupeTimes(frames));
}

/** Brief pulse: highlight 0 → 1 → 0. */
export function pulse(target: string, at: number, duration = 500): TimelineTrack {
  return track(
    target,
    "highlight",
    dedupeTimes([
      { time: 0, value: 0 },
      { time: at, value: 0 },
      { time: at + duration / 2, value: 1, easing: "easeOut" },
      { time: at + duration, value: 0, easing: "easeIn" },
    ]),
    `${target}:highlight:${at}`,
  );
}

/** Progress 0→1 for nodes bound to progress (bars, line-by-line text). */
export function progressTo(
  target: string,
  start: number,
  end: number,
  from = 0,
  to = 1,
): TimelineTrack {
  return track(target, "progress", keyframes(start, end, from, to, "easeInOut"));
}

function dedupeTimes(frames: readonly TimelineKeyframe[]): TimelineKeyframe[] {
  const out: TimelineKeyframe[] = [];
  for (const frame of frames) {
    const previous = out[out.length - 1];
    if (previous !== undefined && frame.time <= previous.time) {
      out[out.length - 1] = { ...frame, time: previous.time };
      continue;
    }
    out.push(frame);
  }
  return out;
}

/**
 * Assembles tracks into a timeline. Tracks with the same id are rejected so authoring mistakes
 * surface early; the duration defaults to the last keyframe.
 */
export function timeline(
  tracks: ReadonlyArray<TimelineTrack | readonly TimelineTrack[]>,
  duration?: number,
): AnimationTimeline {
  const flat = tracks.flatMap((entry) =>
    Array.isArray(entry) ? entry : [entry],
  ) as TimelineTrack[];
  const ids = new Set<string>();
  let last = 0;
  for (const entry of flat) {
    if (ids.has(entry.id)) throw new Error(`duplicate timeline track id: ${entry.id}`);
    ids.add(entry.id);
    for (const frame of entry.keyframes) last = Math.max(last, frame.time);
  }
  const total = duration ?? last;
  if (total < last)
    throw new RangeError(`timeline duration ${total} is shorter than its last keyframe ${last}`);
  return { duration: total, tracks: flat };
}
