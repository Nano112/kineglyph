import { describe, expect, it } from "vitest";
import { createAnimationProgram, cueStatesAt } from "../src/index.js";

describe("animation program", () => {
  const program = createAnimationProgram({
    duration: 1_000,
    steps: [
      {
        id: "reveal-input",
        start: 100,
        duration: 400,
        easing: "easeOut",
        cue: { kind: "node-reveal", targetId: "input" },
      },
      {
        id: "draw-edge",
        start: 500,
        duration: 300,
        cue: { kind: "edge-reveal", targetId: "input-output" },
      },
    ],
  });

  it("is random-access and clamps seeks", () => {
    expect(cueStatesAt(program, 300)[0]?.progress).toBeCloseTo(0.75);
    expect(cueStatesAt(program, -100)[0]?.progress).toBe(0);
    expect(cueStatesAt(program, 9_000)[1]?.progress).toBe(1);
  });

  it("retains stable authored ordering", () => {
    expect(cueStatesAt(program, 600).map((state) => state.id)).toEqual([
      "reveal-input",
      "draw-edge",
    ]);
  });
});
