// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";
import { createTheme, resolveScene, type SceneDefinition } from "@kineglyph/core";
import {
  diffCanvasRegions,
  mountCanvasScene,
  preferredRenderer,
  renderCanvasScene,
} from "../src/canvas.js";

function scene(count = 3) {
  const definition: SceneDefinition = {
    schemaVersion: 2,
    id: "dense",
    title: "Dense marks",
    root: {
      id: "root",
      type: "group",
      layout: "grid",
      columns: 20,
      children: Array.from({ length: count }, (_, index) => ({
        id: `mark-${index}`,
        type: "rect" as const,
        width: 8,
        height: 8,
        fill: "accent" as const,
        label: `Mark ${index}`,
      })),
    },
  };
  return resolveScene(definition, { width: 600, theme: createTheme() });
}

function context(): CanvasRenderingContext2D {
  const noop = vi.fn();
  return {
    setTransform: noop,
    clearRect: vi.fn(),
    fillRect: noop,
    save: noop,
    restore: noop,
    translate: noop,
    rotate: noop,
    scale: noop,
    beginPath: noop,
    moveTo: noop,
    lineTo: noop,
    quadraticCurveTo: noop,
    rect: noop,
    clip: vi.fn(),
    closePath: noop,
    fill: noop,
    stroke: noop,
    ellipse: noop,
    fillText: noop,
  } as unknown as CanvasRenderingContext2D;
}

describe("high-density canvas renderer", () => {
  it("paints marks in one canvas and selects the renderer by density", () => {
    const canvas = document.createElement("canvas");
    const resolved = scene(900);
    const drawing = context();
    renderCanvasScene(canvas, resolved, { context: drawing, pixelRatio: 2 });
    expect(canvas.width).toBe(resolved.width * 2);
    // Canvas methods are intentionally detached spies in this test double.
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(drawing.fill).toHaveBeenCalled();
    expect(preferredRenderer(resolved)).toBe("canvas");
    expect(preferredRenderer(scene(2))).toBe("svg");
  });

  it("mounts a bounded accessible summary and exports an SVG fallback", () => {
    const host = document.createElement("div");
    const resolved = scene(8);
    const handle = mountCanvasScene(host, resolved, {
      context: context(),
      maxSummaryItems: 3,
    });
    expect(handle.summary?.children).toHaveLength(4);
    expect(handle.svg()).toContain("<svg");
    handle.destroy();
    expect(host.children).toHaveLength(0);
  });

  it("diffs stable ids and clips updates to changed regions", () => {
    const previous = scene(4);
    const next = {
      ...previous,
      nodes: previous.nodes.map((node, index) =>
        index === 1 ? { ...node, state: { ...node.state, opacity: 0.5 } } : node,
      ),
    };
    const regions = diffCanvasRegions(previous, next);
    expect(regions).toHaveLength(1);
    expect(regions[0]!.width).toBeLessThan(previous.width);

    const canvas = document.createElement("canvas");
    const drawing = context();
    renderCanvasScene(canvas, previous, { context: drawing, pixelRatio: 1 });
    renderCanvasScene(canvas, next, { context: drawing, pixelRatio: 1, regions });
    // Canvas methods are intentionally detached spies in this test double.
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(drawing.clip).toHaveBeenCalledTimes(1);
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(drawing.clearRect).toHaveBeenLastCalledWith(
      regions[0]!.x,
      regions[0]!.y,
      regions[0]!.width,
      regions[0]!.height,
    );
  });
});
