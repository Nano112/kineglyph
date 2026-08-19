// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createTheme,
  resolvePipeline,
  resolveScene,
  seekTimeline,
  type SceneDefinition,
} from "@kineglyph/core";
import { KineglyphSceneAnimator } from "../src/index.js";

afterEach(() => {
  document.body.replaceChildren();
});

describe("KineglyphSceneAnimator terminal state", () => {
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
