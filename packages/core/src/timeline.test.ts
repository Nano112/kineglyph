import { describe, expect, it } from "vitest";
import { createTimeline } from "./timeline.js";

describe("Timeline", () => {
  it("sorts deterministically and computes segment phases and easing", () => {
    const timeline = createTimeline({
      duration: 10,
      segments: [
        { id: "later", start: 5, duration: 2 },
        { id: "fade", start: 1, duration: 4, easing: "easeIn" },
        { id: "parallel", start: 1, duration: 8 },
      ],
    });
    const snapshot = timeline.seek(3);

    expect(snapshot.time).toBe(3);
    expect(snapshot.progress).toBe(0.3);
    expect(snapshot.segments.map((segment) => segment.id)).toEqual(["fade", "parallel", "later"]);
    expect(snapshot.active.map((segment) => segment.id)).toEqual(["fade", "parallel"]);
    expect(snapshot.segments[0]).toMatchObject({
      phase: "active",
      localTime: 2,
      progress: 0.5,
      easedProgress: 0.25,
    });
    expect(snapshot.segments[2]).toMatchObject({ phase: "before", localTime: 0, progress: 0 });
  });

  it("clamps seeks and gives zero-duration segments a stable instant state", () => {
    const timeline = createTimeline({
      duration: 4,
      segments: [{ id: "cut", start: 2, duration: 0 }],
    });

    expect(timeline.seek(-10).time).toBe(0);
    expect(timeline.seek(1).segments[0]).toMatchObject({ phase: "before", progress: 0 });
    expect(timeline.seek(2).segments[0]).toMatchObject({ phase: "active", progress: 1 });
    expect(timeline.seek(3).segments[0]).toMatchObject({ phase: "after", progress: 1 });
    expect(timeline.seek(100).time).toBe(4);
  });

  it("reports crossed markers once per cursor interval in playback order", () => {
    const timeline = createTimeline({
      duration: 10,
      markers: [
        { id: "b", time: 5 },
        { id: "a", time: 2 },
        { id: "c", time: 5 },
        { id: "zero", time: 0 },
      ],
    });
    const cursor = timeline.cursor();

    const forward = cursor.seek(7);
    expect(forward.direction).toBe("forward");
    expect(forward.crossedMarkers.map((marker) => marker.id)).toEqual(["a", "b", "c"]);

    const backward = cursor.seek(1);
    expect(backward.direction).toBe("backward");
    expect(backward.crossedMarkers.map((marker) => marker.id)).toEqual(["c", "b", "a"]);
    expect(cursor.seek(1).crossedMarkers).toEqual([]);
  });

  it("derives duration and rejects definitions that truncate content", () => {
    expect(createTimeline({ segments: [{ id: "x", start: 2, duration: 3 }] }).duration).toBe(5);
    expect(() =>
      createTimeline({ duration: 4, segments: [{ id: "x", start: 2, duration: 3 }] }),
    ).toThrow(/at least 5/);
  });
});
