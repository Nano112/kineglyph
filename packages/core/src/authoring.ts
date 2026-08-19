/**
 * Small authoring helpers for purposeful timelines. Everything returns plain serializable tracks.
 */
import type {
  AnimationTimeline,
  TimelineCue,
  TimelineKeyframe,
  TimelineNumberFormat,
  TimelineProperty,
  TimelineTrack,
} from "./resolved.js";
import type { Point } from "./schema.js";

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

/** Rotates a node clockwise in degrees about its resolved centre. */
export function rotateTo(
  target: string,
  start: number,
  end: number,
  from: number,
  to: number,
): TimelineTrack {
  return track(
    target,
    "rotation",
    keyframes(start, end, from, to, "easeInOut"),
    `${target}:rotation:${start}`,
  );
}

function stringKeyframes(
  start: number,
  end: number,
  from: string,
  to: string,
  easing: Easing = "easeInOut",
): TimelineKeyframe[] {
  return [
    ...(start > 0 ? [{ time: 0, value: from } as const] : []),
    { time: start, value: from },
    { time: end, value: to, easing },
  ];
}

/** Interpolates solid resolved fill colours; semantic tokens switch at the final keyframe. */
export function fillTo(
  target: string,
  start: number,
  end: number,
  from: string,
  to: string,
): TimelineTrack {
  return track(target, "fill", stringKeyframes(start, end, from, to), `${target}:fill:${start}`);
}

/** Interpolates node or edge stroke colours. */
export function strokeTo(
  target: string,
  start: number,
  end: number,
  from: string,
  to: string,
): TimelineTrack {
  return track(
    target,
    "stroke",
    stringKeyframes(start, end, from, to),
    `${target}:stroke:${start}`,
  );
}

/** Interpolates text colour. */
export function textColorTo(
  target: string,
  start: number,
  end: number,
  from: string,
  to: string,
): TimelineTrack {
  return track(target, "color", stringKeyframes(start, end, from, to), `${target}:color:${start}`);
}

export function strokeWidthTo(
  target: string,
  start: number,
  end: number,
  from: number,
  to: number,
): TimelineTrack {
  return track(
    target,
    "strokeWidth",
    keyframes(start, end, from, to, "easeInOut"),
    `${target}:strokeWidth:${start}`,
  );
}

export function radiusTo(
  target: string,
  start: number,
  end: number,
  from: number,
  to: number,
): TimelineTrack {
  return track(
    target,
    "radius",
    keyframes(start, end, from, to, "easeInOut"),
    `${target}:radius:${start}`,
  );
}

/** Tweens the first line of a resolved text node without relaying out its reserved box. */
export function numericTextTo(
  target: string,
  start: number,
  end: number,
  from: number,
  to: number,
  format?: TimelineNumberFormat,
): TimelineTrack {
  return {
    ...track(
      target,
      "numericText",
      keyframes(start, end, from, to, "easeOut"),
      `${target}:numericText:${start}`,
    ),
    ...(format === undefined ? {} : { format }),
  };
}

/** Morphs paths with matching command topology and number counts. */
export function morphPath(
  target: string,
  start: number,
  end: number,
  from: string,
  to: string,
): TimelineTrack {
  return track(
    target,
    "pathMorph",
    stringKeyframes(start, end, from, to),
    `${target}:pathMorph:${start}`,
  );
}

export interface LayoutRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** Four deterministic geometry tracks for keyed layout transitions. */
export function layoutTo(
  target: string,
  start: number,
  end: number,
  from: LayoutRect,
  to: LayoutRect,
): TimelineTrack[] {
  return (["x", "y", "width", "height"] as const).map((property) =>
    track(
      target,
      property,
      keyframes(start, end, from[property], to[property], "easeInOut"),
      `${target}:${property}:${start}`,
    ),
  );
}

/** Moves a node along scene-pixel points; optional orientation follows the active segment. */
export function followPath(
  target: string,
  start: number,
  end: number,
  path: readonly Point[],
  options: { readonly orient?: boolean } = {},
): TimelineTrack {
  return {
    ...track(
      target,
      "followPath",
      keyframes(start, end, 0, 1, "easeInOut"),
      `${target}:followPath:${start}`,
    ),
    path,
    ...(options.orient === undefined ? {} : { orient: options.orient }),
  };
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
  cues: readonly TimelineCue[] = [],
): AnimationTimeline {
  const flat: TimelineTrack[] = [];
  for (const entry of tracks) {
    if (Array.isArray(entry)) flat.push(...(entry as readonly TimelineTrack[]));
    else flat.push(entry as TimelineTrack);
  }
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
  const cueNames = new Set<string>();
  for (const entry of cues) {
    if (cueNames.has(entry.name)) throw new Error(`duplicate timeline cue: ${entry.name}`);
    cueNames.add(entry.name);
    if (!Number.isFinite(entry.time) || entry.time < 0 || entry.time > total)
      throw new RangeError(`timeline cue ${entry.name} is outside the timeline`);
  }
  return { duration: total, tracks: flat, ...(cues.length === 0 ? {} : { cues }) };
}

export function cue(name: string, time: number): TimelineCue {
  if (name.trim().length === 0) throw new Error("timeline cue needs a name");
  if (!Number.isFinite(time) || time < 0)
    throw new RangeError("timeline cue time must be non-negative");
  return { name, time };
}

/** Resolves a named cue for transports and editors without duplicating timestamps. */
export function cueTime(source: AnimationTimeline, name: string): number {
  const match = source.cues?.find((entry) => entry.name === name);
  if (match === undefined) throw new Error(`unknown timeline cue: ${name}`);
  return match.time;
}

export interface ReusableTimeline {
  readonly duration: number;
  readonly tracks: readonly TimelineTrack[];
  readonly cues: readonly TimelineCue[];
}

/** Freezes a timeline as a serializable template that can be scoped and time-shifted. */
export function reusableTimeline(source: AnimationTimeline): ReusableTimeline {
  return {
    duration: source.duration,
    tracks: source.tracks.map((entry) => ({ ...entry, keyframes: [...entry.keyframes] })),
    cues: [...(source.cues ?? [])],
  };
}

/** Instantiates a reusable timeline under a target prefix and at a new start time. */
export function useTimeline(
  template: ReusableTimeline,
  options: { readonly prefix?: string; readonly at?: number; readonly speed?: number } = {},
): AnimationTimeline {
  const prefix = options.prefix?.replace(/:+$/, "") ?? "";
  const at = Math.max(0, options.at ?? 0);
  const speed = Math.max(1e-6, options.speed ?? 1);
  const scoped = (value: string): string => (prefix.length === 0 ? value : `${prefix}:${value}`);
  const tracks = template.tracks.map((entry) => ({
    ...entry,
    id: scoped(entry.id),
    target: scoped(entry.target),
    keyframes: entry.keyframes.map((frame) => ({ ...frame, time: at + frame.time / speed })),
  }));
  const cues = template.cues.map((entry) => ({
    name: scoped(entry.name),
    time: at + entry.time / speed,
  }));
  return {
    duration: at + template.duration / speed,
    tracks,
    ...(cues.length === 0 ? {} : { cues }),
  };
}
