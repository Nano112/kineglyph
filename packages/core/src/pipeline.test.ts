import { describe, expect, it } from "vitest";
import { definePipeline, resolvePipeline } from "./pipeline.js";
import { seekTimeline } from "./seek.js";

describe("pipeline resolution and random-access timeline", () => {
  const pipeline = definePipeline({
    id: "build",
    title: "Build pipeline",
    description: "Three deterministic stages",
    nodes: [
      { id: "source", label: "Source", tone: "accent", interactive: true },
      { id: "compile", label: "Compile" },
      { id: "ship", label: "Ship", tone: "success" },
    ],
    edges: [
      { id: "source-compile", from: "source", to: "compile" },
      { id: "compile-ship", from: "compile", to: "ship" },
    ],
    timeline: {
      duration: 1000,
      tracks: [
        {
          id: "source-in",
          target: "source",
          property: "opacity",
          keyframes: [
            { time: 0, value: 0 },
            { time: 400, value: 1, easing: "easeIn" },
          ],
        },
        {
          id: "flow",
          target: "source-compile",
          property: "edgeReveal",
          keyframes: [
            { time: 200, value: 0 },
            { time: 800, value: 1 },
          ],
        },
      ],
    },
  });

  it("produces stable renderer-facing nodes and edges", () => {
    const first = resolvePipeline(pipeline, { width: 800, layout: "wide" });
    const second = resolvePipeline(pipeline, { width: 800, layout: "wide" });

    expect(first).toEqual(second);
    expect(first.nodes.map((node) => node.id)).toEqual(["source", "compile", "ship"]);
    expect(first.edges[0]).toMatchObject({
      from: "source",
      to: "compile",
      directed: true,
      start: { x: 258.667, y: 88 },
      end: { x: 282.667, y: 88 },
    });
    expect(first.theme.semantic.surface).toBe("#ffffff");
  });

  it("evaluates the same frame regardless of seek history", () => {
    const scene = resolvePipeline(pipeline, { width: 800 });
    const at300First = seekTimeline(scene, 300);
    seekTimeline(scene, 900);
    const at300Again = seekTimeline(scene, 300);

    expect(at300Again).toEqual(at300First);
    expect(at300First.nodes[0]?.state.opacity).toBeCloseTo(0.5625);
    expect(at300First.edges[0]?.state.progress).toBeCloseTo(1 / 6);
    expect(seekTimeline(scene, 5000).time).toBe(1000);
  });

  it("retains a fully visible terminal frame after the timeline completes", () => {
    const scene = resolvePipeline(pipeline, { width: 800 });
    const terminal = seekTimeline(scene, scene.timeline?.duration ?? 0);

    expect(terminal.time).toBe(1000);
    expect(terminal.progress).toBe(1);
    expect(terminal.nodes.every((node) => node.state.opacity === 1)).toBe(true);
    expect(terminal.edges.every((edge) => edge.state.opacity === 1)).toBe(true);
    expect(terminal.edges.every((edge) => edge.state.progress === 1)).toBe(true);
  });

  it("rejects dangling edge references before resolution", () => {
    expect(() =>
      definePipeline({
        id: "bad",
        title: "Bad",
        nodes: [{ id: "a", label: "A" }],
        edges: [{ id: "missing", from: "a", to: "b" }],
      }),
    ).toThrow(/missing target node b/);
  });
});
