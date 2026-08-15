import { describe, expect, it } from "vitest";
import { applyEasing, cubicBezier, spring } from "./easing.js";
import { createTimeline } from "./timeline.js";

describe("serializable easing", () => {
  it("keeps named curves stable and clamps their input", () => {
    expect(applyEasing("linear", -2)).toBe(0);
    expect(applyEasing("easeIn", 0.5)).toBe(0.25);
    expect(applyEasing("easeOut", 0.5)).toBe(0.75);
    expect(applyEasing("easeInOutCubic", 0.5)).toBe(0.5);
    expect(applyEasing("easeOutExpo", 2)).toBe(1);
    expect(applyEasing("easeOutBack", 0.8)).toBeGreaterThan(1);
  });

  it("evaluates CSS-like cubic Bézier curves deterministically", () => {
    const curve = cubicBezier(0.16, 1, 0.3, 1);
    expect(curve).toEqual({ type: "cubic-bezier", x1: 0.16, y1: 1, x2: 0.3, y2: 1 });
    expect(applyEasing(curve, 0)).toBe(0);
    expect(applyEasing(curve, 0.5)).toBeCloseTo(0.972, 2);
    expect(applyEasing(curve, 1)).toBe(1);
    expect(() => cubicBezier(-0.1, 0, 1, 1)).toThrow(/between 0 and 1/);
  });

  it("supports damped springs with exact endpoints and controllable overshoot", () => {
    const curve = spring({ frequency: 10.5, damping: 7 });
    expect(JSON.parse(JSON.stringify(curve))).toEqual(curve);
    expect(applyEasing(curve, 0)).toBe(0);
    expect(applyEasing(curve, 0.35)).toBeGreaterThan(1);
    expect(applyEasing(curve, 1)).toBe(1);
    expect(() => spring({ damping: -1 })).toThrow(/non-negative/);
  });

  it("uses the same easing vocabulary in random-access timelines", () => {
    const easing = cubicBezier(0.16, 1, 0.3, 1);
    const timeline = createTimeline({
      duration: 1000,
      segments: [{ id: "draw", start: 0, duration: 1000, easing }],
    });
    expect(timeline.seek(500).segments[0]?.easedProgress).toBeCloseTo(applyEasing(easing, 0.5), 8);
  });
});
