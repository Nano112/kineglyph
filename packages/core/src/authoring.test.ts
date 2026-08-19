import { describe, expect, it } from "vitest";
import { rotateTo, timeline } from "./authoring.js";

describe("motion authoring helpers", () => {
  it("authors serializable centre-rotation tracks and permits sequential turns", () => {
    const first = rotateTo("needle", 100, 600, -20, 40);
    const second = rotateTo("needle", 700, 1_200, 40, 180);

    expect(first).toEqual({
      id: "needle:rotation:100",
      target: "needle",
      property: "rotation",
      keyframes: [
        { time: 0, value: -20 },
        { time: 100, value: -20 },
        { time: 600, value: 40, easing: "easeInOut" },
      ],
    });
    expect(timeline([first, second])).toMatchObject({ duration: 1_200, tracks: [first, second] });
    expect(() => JSON.stringify(first)).not.toThrow();
  });
});
