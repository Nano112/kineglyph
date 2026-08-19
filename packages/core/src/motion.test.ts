import { describe, expect, it } from "vitest";
import {
  cue,
  fillTo,
  followPath,
  layoutTo,
  morphPath,
  numericTextTo,
  radiusTo,
  reusableTimeline,
  strokeTo,
  strokeWidthTo,
  textColorTo,
  timeline,
  useTimeline,
} from "./authoring.js";
import { resolveScene } from "./resolve.js";
import type { SceneDefinition } from "./scene.js";
import { seekTimeline } from "./seek.js";
import { createTheme } from "./theme.js";

const fromPath = "M 0 10 L 10 0 L 20 10 Z";
const toPath = "M 0 20 L 10 10 L 20 20 Z";

describe("deterministic rich motion", () => {
  it("seeks paint, geometry, text, morph, and follow-path tracks", () => {
    const scene: SceneDefinition = {
      schemaVersion: 2,
      id: "rich-motion",
      title: "Rich motion",
      root: {
        id: "root",
        type: "group",
        layout: "coordinates",
        height: 220,
        children: [
          {
            id: "box",
            type: "rect",
            position: { x: 0, y: 0 },
            width: 80,
            height: 40,
            fill: "chart1",
          },
          { id: "number", type: "text", text: "0%", position: { x: 0.5, y: 0.1 }, width: 100 },
          {
            id: "shape",
            type: "path",
            d: fromPath,
            viewBox: { width: 20, height: 20 },
            position: { x: 0.5, y: 0.5 },
            width: 60,
            height: 60,
          },
          { id: "traveller", type: "circle", position: { x: 0.1, y: 0.8 }, radius: 8 },
        ],
      },
      timeline: timeline(
        [
          fillTo("box", 0, 1_000, "#000000", "#ffffff"),
          strokeTo("box", 0, 1_000, "#ff0000", "#0000ff"),
          strokeWidthTo("box", 0, 1_000, 1, 9),
          radiusTo("box", 0, 1_000, 0, 16),
          textColorTo("number", 0, 1_000, "#000000", "#00ff00"),
          numericTextTo("number", 0, 1_000, 0, 100, { suffix: "%" }),
          morphPath("shape", 0, 1_000, fromPath, toPath),
          layoutTo(
            "box",
            0,
            1_000,
            { x: 0, y: 0, width: 80, height: 40 },
            { x: 40, y: 20, width: 120, height: 60 },
          ),
          followPath(
            "traveller",
            0,
            1_000,
            [
              { x: 0, y: 0 },
              { x: 100, y: 0 },
              { x: 100, y: 100 },
            ],
            { orient: true },
          ),
        ],
        1_000,
        [cue("middle", 500)],
      ),
    };
    const resolved = resolveScene(scene, { width: 500, theme: createTheme() });
    const frame = seekTimeline(resolved, 500);
    const box = frame.nodes.find((node) => node.id === "box");
    const number = frame.nodes.find((node) => node.id === "number");
    const shape = frame.nodes.find((node) => node.id === "shape");
    const traveller = frame.nodes.find((node) => node.id === "traveller");

    expect(box).toMatchObject({ x: 20, y: 10, width: 100, height: 50 });
    expect(box?.appearance).toMatchObject({
      fill: "#808080",
      stroke: "#800080",
      strokeWidth: 5,
      radius: 8,
    });
    expect(number?.text?.color).toBe("#008000");
    expect(number?.text?.lines[0]?.text).toBe("75%");
    expect(shape?.path?.d).toBe("M 0 15 L 10 5 L 20 15 Z");
    expect(traveller?.state.translateX).toBe(100);
    expect(traveller?.state.translateY).toBe(0);
    expect(traveller?.state.rotation).toBe(90);
    expect(frame.timeline?.cues).toEqual([{ name: "middle", time: 500 }]);
  });

  it("scopes and time-scales reusable timelines with named cues", () => {
    const source = timeline([fillTo("box", 0, 800, "#000", "#fff")], 800, [cue("done", 800)]);
    const instance = useTimeline(reusableTimeline(source), { prefix: "card", at: 200, speed: 2 });
    expect(instance).toMatchObject({ duration: 600 });
    expect(instance.tracks[0]).toMatchObject({ id: "card:box:fill:0", target: "card:box" });
    expect(instance.tracks[0]?.keyframes.at(-1)?.time).toBe(600);
    expect(instance.cues).toEqual([{ name: "card:done", time: 600 }]);
  });

  it("rejects malformed named cues even in low-level scene data", () => {
    const base: SceneDefinition = {
      schemaVersion: 2,
      id: "bad-cue",
      title: "Bad cue",
      root: { id: "root", type: "group", children: [] },
      timeline: { duration: 100, tracks: [], cues: [{ name: "late", time: 101 }] },
    };
    expect(() => seekTimeline(resolveScene(base, { width: 300 }), 0)).toThrow(/outside/);
  });
});
