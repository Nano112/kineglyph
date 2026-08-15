export type EasingName = "linear" | "easeIn" | "easeOut" | "easeInOut";
export type TimelinePhase = "before" | "active" | "after";
export type SeekDirection = "forward" | "backward" | "none";

export interface TimelineSegment<T = unknown> {
  readonly id: string;
  readonly start: number;
  readonly duration: number;
  readonly easing?: EasingName;
  readonly data?: T;
}

export interface TimelineMarker<T = unknown> {
  readonly id: string;
  readonly time: number;
  readonly data?: T;
}

export interface TimelineDefinition<TSegment = unknown, TMarker = unknown> {
  readonly duration?: number;
  readonly segments?: readonly TimelineSegment<TSegment>[];
  readonly markers?: readonly TimelineMarker<TMarker>[];
}

export interface SegmentSnapshot<T> {
  readonly id: string;
  readonly start: number;
  readonly end: number;
  readonly phase: TimelinePhase;
  readonly localTime: number;
  readonly progress: number;
  readonly easedProgress: number;
  readonly data: T | undefined;
}

export interface TimelineSnapshot<TSegment> {
  readonly time: number;
  readonly duration: number;
  readonly progress: number;
  readonly segments: readonly SegmentSnapshot<TSegment>[];
  readonly active: readonly SegmentSnapshot<TSegment>[];
}

export interface SeekResult<TSegment, TMarker> extends TimelineSnapshot<TSegment> {
  readonly previousTime: number;
  readonly direction: SeekDirection;
  readonly crossedMarkers: readonly TimelineMarker<TMarker>[];
}

function assertTime(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0)
    throw new RangeError(`${label} must be a finite, non-negative number`);
}

function clamp(value: number, lower: number, upper: number): number {
  return Math.min(upper, Math.max(lower, value));
}

function ease(name: EasingName, progress: number): number {
  switch (name) {
    case "easeIn":
      return progress * progress;
    case "easeOut":
      return 1 - (1 - progress) ** 2;
    case "easeInOut":
      return progress < 0.5 ? 2 * progress * progress : 1 - (-2 * progress + 2) ** 2 / 2;
    case "linear":
      return progress;
  }
}

export class Timeline<TSegment = unknown, TMarker = unknown> {
  readonly duration: number;
  readonly segments: readonly TimelineSegment<TSegment>[];
  readonly markers: readonly TimelineMarker<TMarker>[];

  constructor(definition: TimelineDefinition<TSegment, TMarker>) {
    const inputSegments = definition.segments ?? [];
    const inputMarkers = definition.markers ?? [];
    const ids = new Set<string>();

    inputSegments.forEach((segment, index) => {
      if (segment.id.length === 0) throw new Error("segment ids must not be empty");
      if (ids.has(segment.id)) throw new Error(`duplicate timeline id: ${segment.id}`);
      ids.add(segment.id);
      assertTime(segment.start, `segments[${index}].start`);
      assertTime(segment.duration, `segments[${index}].duration`);
    });
    inputMarkers.forEach((marker, index) => {
      if (marker.id.length === 0) throw new Error("marker ids must not be empty");
      if (ids.has(marker.id)) throw new Error(`duplicate timeline id: ${marker.id}`);
      ids.add(marker.id);
      assertTime(marker.time, `markers[${index}].time`);
    });

    const naturalDuration = Math.max(
      0,
      ...inputSegments.map((segment) => segment.start + segment.duration),
      ...inputMarkers.map((marker) => marker.time),
    );
    const duration = definition.duration ?? naturalDuration;
    assertTime(duration, "duration");
    if (duration < naturalDuration)
      throw new RangeError(`duration must be at least ${naturalDuration}`);

    // Stable sorting is made explicit with original index as a final tie-breaker.
    this.segments = inputSegments
      .map((segment, index) => ({ segment, index }))
      .sort((a, b) => a.segment.start - b.segment.start || a.index - b.index)
      .map(({ segment }) => ({ ...segment }));
    this.markers = inputMarkers
      .map((marker, index) => ({ marker, index }))
      .sort((a, b) => a.marker.time - b.marker.time || a.index - b.index)
      .map(({ marker }) => ({ ...marker }));
    this.duration = duration;
  }

  seek(time: number): TimelineSnapshot<TSegment> {
    if (!Number.isFinite(time)) throw new RangeError("seek time must be finite");
    const currentTime = clamp(time, 0, this.duration);
    const segments = this.segments.map((segment): SegmentSnapshot<TSegment> => {
      const end = segment.start + segment.duration;
      const phase: TimelinePhase =
        currentTime < segment.start
          ? "before"
          : segment.duration === 0
            ? currentTime === segment.start
              ? "active"
              : "after"
            : currentTime >= end
              ? "after"
              : "active";
      const progress =
        segment.duration === 0
          ? currentTime < segment.start
            ? 0
            : 1
          : clamp((currentTime - segment.start) / segment.duration, 0, 1);
      return {
        id: segment.id,
        start: segment.start,
        end,
        phase,
        localTime: clamp(currentTime - segment.start, 0, segment.duration),
        progress,
        easedProgress: ease(segment.easing ?? "linear", progress),
        data: segment.data,
      };
    });
    return {
      time: currentTime,
      duration: this.duration,
      progress: this.duration === 0 ? 1 : currentTime / this.duration,
      segments,
      active: segments.filter((segment) => segment.phase === "active"),
    };
  }

  markersBetween(from: number, to: number): readonly TimelineMarker<TMarker>[] {
    if (!Number.isFinite(from) || !Number.isFinite(to))
      throw new RangeError("marker range times must be finite");
    const start = clamp(from, 0, this.duration);
    const end = clamp(to, 0, this.duration);
    if (end > start)
      return this.markers.filter((marker) => marker.time > start && marker.time <= end);
    if (end < start)
      return [...this.markers]
        .reverse()
        .filter((marker) => marker.time < start && marker.time >= end);
    return [];
  }

  cursor(initialTime = 0): TimelineCursor<TSegment, TMarker> {
    return new TimelineCursor(this, initialTime);
  }
}

export class TimelineCursor<TSegment = unknown, TMarker = unknown> {
  #time: number;

  constructor(
    readonly timeline: Timeline<TSegment, TMarker>,
    initialTime = 0,
  ) {
    this.#time = timeline.seek(initialTime).time;
  }

  get time(): number {
    return this.#time;
  }

  seek(time: number): SeekResult<TSegment, TMarker> {
    const previousTime = this.#time;
    const snapshot = this.timeline.seek(time);
    this.#time = snapshot.time;
    const direction: SeekDirection =
      this.#time > previousTime ? "forward" : this.#time < previousTime ? "backward" : "none";
    return {
      ...snapshot,
      previousTime,
      direction,
      crossedMarkers: this.timeline.markersBetween(previousTime, this.#time),
    };
  }
}

export function createTimeline<TSegment = unknown, TMarker = unknown>(
  definition: TimelineDefinition<TSegment, TMarker>,
): Timeline<TSegment, TMarker> {
  return new Timeline(definition);
}
