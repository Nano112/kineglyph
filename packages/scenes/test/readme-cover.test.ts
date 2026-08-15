import { resolveScene, seekTimeline, walkScene } from "@kineglyph/core";
import { describe, expect, it } from "vitest";
import { readmeCoverScene, readmeCoverTheme } from "../src/index.js";

function node(time: number, id: string) {
  const scene = resolveScene(readmeCoverScene, { width: 1400, theme: readmeCoverTheme });
  return seekTimeline(scene, time).nodes.find((entry) => entry.id === id);
}

describe("README cover", () => {
  it("contains only the name and tagline", () => {
    const copy: string[] = [];
    walkScene(readmeCoverScene.root, (entry) => {
      if (entry.type === "text") copy.push(entry.text);
    });
    expect(copy).toEqual(["Kineglyph", "Technical illustrations with a pulse."]);
  });

  it("resolves as a fixed 1400 by 480 composition without layout errors", () => {
    const scene = resolveScene(readmeCoverScene, { width: 1400, theme: readmeCoverTheme });
    expect(scene.width).toBe(1400);
    expect(scene.height).toBe(480);
    expect(scene.diagnostics?.filter((entry) => entry.severity === "error")).toEqual([]);
  });

  it("draws the line, moves its point, resolves the forms, and fades the kinetic group", () => {
    expect(node(0, "spline")?.state.progress).toBe(0);
    expect(node(0, "traveller")?.state.opacity).toBe(0);
    expect(node(1400, "traveller")?.state.translateX).toBeGreaterThan(180);
    expect(node(1400, "traveller")?.state.translateY).toBeLessThan(0);
    expect(node(3000, "spline")?.state.progress).toBe(1);
    expect(node(3000, "render-point")?.state.opacity).toBe(1);
    expect(node(6000, "kinetic")?.state.opacity).toBe(0);
  });
});
