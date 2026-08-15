// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { resolvePipeline, seekTimeline } from "@kineglyph/core";
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
    expect(node?.style.transform).toContain("scale(1)");
    expect(seekTimeline(scene, 48).nodes[0]?.state.opacity).toBe(1);

    animator.restart(false);
    expect(node?.style.opacity).toBe("0");
    expect(node?.style.transform).toContain("scale(0.94)");

    animator.play();
    await vi.waitFor(() => expect(node?.style.opacity).toBe("1"), { timeout: 1_000 });
    expect(node?.style.transform).toContain("scale(1)");
    animator.dispose();
  });
});
