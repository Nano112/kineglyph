// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createTheme,
  resolvePipeline,
  resolveScene,
  seekTimeline,
  type SceneDefinition,
} from "@kineglyph/core";
import { renderSvg } from "@kineglyph/svg";
import { KineglyphSceneAnimator } from "../src/index.js";

afterEach(() => {
  document.body.replaceChildren();
});

describe("KineglyphSceneAnimator terminal state", () => {
  it("seeks named cues without repeating their timestamps in transport code", () => {
    const scene = resolvePipeline(
      {
        id: "named-cue",
        title: "Named cue",
        nodes: [{ id: "visible", label: "Visible" }],
        edges: [],
        timeline: {
          duration: 100,
          cues: [{ name: "emphasis", time: 60 }],
          tracks: [
            {
              id: "visible-opacity",
              target: "visible",
              property: "opacity",
              keyframes: [
                { time: 0, value: 0 },
                { time: 100, value: 1 },
              ],
            },
          ],
        },
      },
      { width: 390, layout: "stacked" },
    );
    const root = document.createElement("div");
    root.innerHTML = '<svg><g data-node-id="visible"></g></svg>';
    document.body.append(root);
    const animator = new KineglyphSceneAnimator({ root, scene });
    animator.seekCue("emphasis");
    expect(animator.time).toBe(60);
    expect(root.querySelector<SVGGElement>('[data-node-id="visible"]')?.style.opacity).toBe("0.6");
    expect(() => animator.seekCue("missing")).toThrow(/unknown timeline cue/);
    animator.dispose();
  });

  it("renders the terminal rotation immediately under reduced motion", () => {
    const scene = resolvePipeline(
      {
        id: "reduced-rotation",
        title: "Reduced rotation",
        nodes: [{ id: "needle", label: "Needle" }],
        edges: [],
        timeline: {
          duration: 500,
          tracks: [
            {
              id: "needle-turn",
              target: "needle",
              property: "rotation",
              keyframes: [
                { time: 0, value: -30 },
                { time: 500, value: 135 },
              ],
            },
          ],
        },
      },
      { width: 390, layout: "stacked" },
    );
    const root = document.createElement("div");
    root.innerHTML = '<svg><g data-node-id="needle"></g></svg>';
    document.body.append(root);

    const animator = new KineglyphSceneAnimator({ root, scene, reducedMotion: true });
    const needle = root.querySelector<SVGGElement>('[data-node-id="needle"]');
    expect(animator.time).toBe(500);
    expect(needle?.style.transform).toContain("rotate(135deg)");
    animator.seek(0);
    expect(needle?.style.transform).toContain("rotate(135deg)");
    animator.dispose();
  });

  it("can repeat a deterministic scene timeline", async () => {
    const scene = resolvePipeline(
      {
        id: "looping-runtime",
        title: "Looping runtime",
        nodes: [{ id: "visible", label: "Visible" }],
        edges: [],
        timeline: {
          duration: 32,
          tracks: [
            {
              id: "visible-opacity",
              target: "visible",
              property: "opacity",
              keyframes: [
                { time: 0, value: 0 },
                { time: 32, value: 1 },
              ],
            },
          ],
        },
      },
      { width: 390, layout: "stacked" },
    );
    const root = document.createElement("div");
    root.innerHTML = '<svg><g data-node-id="visible"></g></svg>';
    document.body.append(root);
    const animator = new KineglyphSceneAnimator({ root, scene, loop: true });

    animator.play();
    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(animator.playing).toBe(true);
    expect(animator.time).toBeLessThan(32);
    animator.dispose();
  });

  it("keeps the completed DOM frame visible and allows replay", async () => {
    const scene = resolvePipeline(
      {
        id: "terminal-runtime",
        title: "Terminal runtime",
        nodes: [{ id: "visible", label: "Visible" }],
        edges: [],
        timeline: {
          duration: 48,
          tracks: [
            {
              id: "visible-opacity",
              target: "visible",
              property: "opacity",
              keyframes: [
                { time: 0, value: 0 },
                { time: 48, value: 1 },
              ],
            },
            {
              id: "visible-scale",
              target: "visible",
              property: "scale",
              keyframes: [
                { time: 0, value: 0.94 },
                { time: 48, value: 1 },
              ],
            },
          ],
        },
      },
      { width: 390, layout: "stacked" },
    );
    const root = document.createElement("div");
    root.innerHTML = '<svg><g data-node-id="visible"></g></svg>';
    document.body.append(root);
    const node = root.querySelector<SVGGElement>('[data-node-id="visible"]');
    expect(node).not.toBeNull();

    const animator = new KineglyphSceneAnimator({ root, scene });
    animator.play();
    await vi.waitFor(() => expect(node?.style.opacity).toBe("1"), { timeout: 1_000 });
    await new Promise((resolve) => setTimeout(resolve, 80));

    expect(node?.style.opacity).toBe("1");
    expect(node?.style.transform).toBe("none");
    expect(seekTimeline(scene, 48).nodes[0]?.state.opacity).toBe(1);

    animator.restart(false);
    expect(node?.style.opacity).toBe("0");
    expect(node?.style.transform).toContain("scale(0.94)");

    animator.play();
    await vi.waitFor(() => expect(node?.style.opacity).toBe("1"), { timeout: 1_000 });
    expect(node?.style.transform).toBe("none");
    animator.dispose();
  });

  it("keeps packet trails moving after the finite entrance timeline completes", async () => {
    const scene = resolveScene(
      {
        schemaVersion: 2,
        id: "ambient-flow",
        title: "Ambient flow",
        root: {
          id: "root",
          type: "group",
          layout: "coordinates",
          width: 320,
          height: 120,
          children: [
            {
              id: "a",
              type: "circle",
              radius: 8,
              width: 16,
              height: 16,
              position: { x: 0.1, y: 0.5, anchor: "center" },
            },
            {
              id: "b",
              type: "circle",
              radius: 8,
              width: 16,
              height: 16,
              position: { x: 0.9, y: 0.5, anchor: "center" },
            },
          ],
        },
        edges: [
          {
            id: "live",
            from: "a",
            to: "b",
            head: "none",
            packets: { count: 1, period: 120, trail: true },
            signal: { value: true },
          },
        ],
        timeline: {
          duration: 20,
          tracks: [
            {
              id: "draw",
              target: "live",
              property: "progress",
              keyframes: [
                { time: 0, value: 0 },
                { time: 20, value: 1 },
              ],
            },
          ],
        },
      },
      { width: 320, theme: createTheme() },
    );
    const root = document.createElement("div");
    root.innerHTML = renderSvg(seekTimeline(scene, 0), { idPrefix: "ambient" });
    document.body.append(root);
    const animator = new KineglyphSceneAnimator({ root, scene });
    animator.play();
    await new Promise((resolve) => setTimeout(resolve, 70));
    const trace = root.querySelector<SVGPathElement>('[data-edge-trace="live"]');
    expect(trace).not.toBeNull();
    const first = trace?.getAttribute("stroke-dashoffset");
    await vi.waitFor(() => expect(trace?.getAttribute("stroke-dashoffset")).not.toBe(first), {
      timeout: 1_000,
    });
    expect(animator.playing).toBe(false);
    animator.pause();
    const paused = trace?.getAttribute("stroke-dashoffset");
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(trace?.getAttribute("stroke-dashoffset")).toBe(paused);
    animator.dispose();
  });

  it("starts ambient flow from a restored terminal frame", async () => {
    const scene = resolveScene(
      {
        schemaVersion: 2,
        id: "restored-flow",
        title: "Restored flow",
        root: {
          id: "root",
          type: "group",
          layout: "coordinates",
          width: 320,
          height: 120,
          children: [
            {
              id: "a",
              type: "circle",
              radius: 8,
              width: 16,
              height: 16,
              position: { x: 0.1, y: 0.5, anchor: "center" },
            },
            {
              id: "b",
              type: "circle",
              radius: 8,
              width: 16,
              height: 16,
              position: { x: 0.9, y: 0.5, anchor: "center" },
            },
          ],
        },
        edges: [
          {
            id: "live",
            from: "a",
            to: "b",
            head: "none",
            packets: { count: 1, period: 120, trail: true },
            signal: { value: true },
          },
        ],
        timeline: {
          duration: 20,
          tracks: [
            {
              id: "draw",
              target: "live",
              property: "progress",
              keyframes: [
                { time: 0, value: 0 },
                { time: 20, value: 1 },
              ],
            },
          ],
        },
      },
      { width: 320, theme: createTheme() },
    );
    const root = document.createElement("div");
    root.innerHTML = renderSvg(seekTimeline(scene, scene.timeline?.duration ?? 0), {
      idPrefix: "restored",
    });
    document.body.append(root);
    const animator = new KineglyphSceneAnimator({
      root,
      scene,
      initialTime: scene.timeline?.duration ?? 0,
      ambientFlow: true,
    });
    const trace = root.querySelector<SVGPathElement>('[data-edge-trace="live"]');
    const first = trace?.getAttribute("stroke-dashoffset");
    await vi.waitFor(() => expect(trace?.getAttribute("stroke-dashoffset")).not.toBe(first), {
      timeout: 1_000,
    });
    expect(animator.time).toBe(scene.timeline?.duration);
    animator.dispose();
  });

  it("updates character-reveal text while preserving the full source in metadata", () => {
    const definition: SceneDefinition = {
      schemaVersion: 2,
      id: "typed",
      title: "Typed",
      root: {
        id: "root",
        type: "group",
        children: [{ id: "command", type: "text", text: "npm test", reveal: "characters" }],
      },
      timeline: {
        duration: 100,
        tracks: [
          {
            id: "type",
            target: "command",
            property: "progress",
            keyframes: [
              { time: 0, value: 0 },
              { time: 100, value: 1 },
            ],
          },
        ],
      },
    };
    const scene = resolveScene(definition, { width: 300, theme: createTheme() });
    const root = document.createElement("div");
    root.innerHTML =
      '<svg><g data-node-id="command"><text data-text-of="command" data-text-reveal="characters"><tspan data-full-text="npm test" data-line-width="80"></tspan></text></g></svg>';
    document.body.append(root);
    const animator = new KineglyphSceneAnimator({ root, scene });
    animator.seek(50);
    expect(root.querySelector("tspan")?.textContent).toBe("npm ");
    animator.seek(100);
    expect(root.querySelector("tspan")?.textContent).toBe("npm test");
    animator.dispose();
  });
});
