import { describe, expect, it } from "vitest";
import { createTheme } from "./theme.js";
import { resolveScene, polylinePath } from "./resolve.js";
import { seekTimeline } from "./seek.js";
import {
  fragmentNodeIds,
  mergeFragments,
  scopeFragment,
  shiftTracks,
  tracksDuration,
  type SceneFragment,
} from "./fragment.js";
import type { SceneDefinition } from "./scene.js";

const theme = createTheme();

const chartLike: SceneDefinition = {
  schemaVersion: 2,
  id: "coords",
  title: "Coordinate space",
  root: {
    id: "root",
    type: "group",
    layout: "stack",
    gap: 8,
    children: [
      { id: "heading", type: "text", text: "Coordinates" },
      {
        id: "area",
        type: "group",
        layout: "coordinates",
        height: { wide: 200, compact: 120 },
        width: "fill",
        children: [
          {
            id: "bar-a",
            type: "rect",
            position: { x: 0.1, y: 1, anchor: "bottom-left" },
            width: "20%",
            height: "60%",
            fill: "chart1",
            revealAnchor: "bottom",
            interactive: true,
            label: "A",
            inspect: {
              role: "Bar",
              title: "A",
              fields: [{ label: "Value", value: "60" }],
            },
          },
          {
            id: "bar-b",
            type: "rect",
            position: { x: 0.4, y: 1, anchor: "bottom-left" },
            width: "20%",
            height: "100%",
            fill: "chart2",
          },
          {
            id: "line",
            type: "polyline",
            position: { x: 0, y: 0 },
            width: "100%",
            height: "100%",
            points: [
              [0, 1],
              [0.5, 0.25],
              [1, 0.5],
            ],
            curve: "monotone",
            stroke: "chart3",
          },
          {
            id: "tick",
            type: "text",
            text: "50",
            position: { x: 1, y: 0.5, anchor: "right" },
          },
        ],
      },
    ],
  },
  timeline: {
    duration: 1000,
    tracks: [
      {
        id: "grow-a",
        target: "bar-a",
        property: "revealY",
        keyframes: [
          { time: 0, value: 0 },
          { time: 1000, value: 1 },
        ],
      },
      {
        id: "draw-line",
        target: "line",
        property: "progress",
        keyframes: [
          { time: 0, value: 0 },
          { time: 1000, value: 1 },
        ],
      },
    ],
  },
};

describe("coordinate space, percent lengths, and polylines", () => {
  it("places children by fractions of the box and never reports intentional overlap", () => {
    const wide = resolveScene(chartLike, { width: 1024, theme });
    const area = wide.nodes.find((node) => node.id === "area");
    const barA = wide.nodes.find((node) => node.id === "bar-a");
    const barB = wide.nodes.find((node) => node.id === "bar-b");
    const tick = wide.nodes.find((node) => node.id === "tick");
    expect(area?.height).toBe(200);
    expect(barA?.width).toBeCloseTo((area?.width ?? 0) * 0.2, 3);
    expect(barA?.height).toBeCloseTo(120, 3);
    expect(barA?.x).toBeCloseTo((area?.x ?? 0) + (area?.width ?? 0) * 0.1, 3);
    expect((barA?.y ?? 0) + (barA?.height ?? 0)).toBeCloseTo((area?.y ?? 0) + 200, 3);
    expect(barB?.height).toBeCloseTo(200, 3);
    expect((tick?.x ?? 0) + (tick?.width ?? 0)).toBeCloseTo((area?.x ?? 0) + (area?.width ?? 0), 3);
    expect(wide.diagnostics?.filter((entry) => entry.code === "overlap")).toEqual([]);
    const compact = resolveScene(chartLike, { width: 700, theme });
    expect(compact.nodes.find((node) => node.id === "area")?.height).toBe(120);
    expect(compact.nodes.find((node) => node.id === "bar-a")?.height).toBeCloseTo(72, 3);
  });

  it("emits polylines as absolute paths with monotone curves and structured inspection", () => {
    const resolved = resolveScene(chartLike, { width: 1024, theme });
    const line = resolved.nodes.find((node) => node.id === "line");
    expect(line?.kind).toBe("path");
    expect(line?.path?.d.startsWith("M 0 ")).toBe(true);
    expect(line?.path?.d).toContain("C ");
    expect(line?.path?.viewBox.width).toBeCloseTo(line?.width ?? 0, 3);
    expect(line?.appearance.stroke).toBe(theme.colors.chart3);
    const barA = resolved.nodes.find((node) => node.id === "bar-a");
    expect(barA?.inspect?.role).toBe("Bar");
    expect(barA?.revealAnchor).toBe("bottom");
    expect(
      polylinePath(
        {
          points: [
            [0, 0],
            [1, 1],
          ],
          space: "px",
          curve: "step",
        },
        10,
        10,
      ),
    ).toBe("M 0 0 L 1 0 L 1 1");
    expect(
      polylinePath(
        {
          points: [
            [0, 1],
            [1, 0],
          ],
          baseline: 1,
        },
        100,
        50,
      ),
    ).toBe("M 0 50 L 100 0 L 100 50 L 0 50 Z");
  });

  it("drives anchored reveals and path progress through the timeline", () => {
    const resolved = resolveScene(chartLike, { width: 1024, theme });
    const mid = seekTimeline(resolved, 500);
    expect(mid.nodes.find((node) => node.id === "bar-a")?.state.revealY).toBeCloseTo(0.5, 5);
    expect(mid.nodes.find((node) => node.id === "line")?.state.progress).toBeCloseTo(0.5, 5);
    expect(
      seekTimeline(resolved, 1000).nodes.find((node) => node.id === "bar-a")?.state.revealY,
    ).toBe(1);
  });
});

describe("fragments", () => {
  const fragment: SceneFragment = {
    nodes: [
      {
        id: "card",
        type: "group",
        children: [{ id: "title", type: "text", text: "Hello" }],
      },
      { id: "note", type: "text", text: "Note" },
    ],
    edges: [{ id: "card-note", from: "card", to: { node: "note", side: "left" } }],
    tracks: [
      {
        id: "card:opacity",
        target: "card",
        property: "opacity",
        keyframes: [
          { time: 0, value: 0 },
          { time: 400, value: 1 },
        ],
      },
    ],
    controls: [{ id: "go", label: "Go", event: "GO" }],
    summary: "A card and a note.",
  };

  it("scopes every id and shifts motion deterministically", () => {
    const scoped = scopeFragment(fragment, "chart");
    expect(fragmentNodeIds(scoped)).toEqual(["chart:card", "chart:title", "chart:note"]);
    expect(scoped.edges?.[0]).toMatchObject({
      id: "chart:card-note",
      from: "chart:card",
      to: { node: "chart:note", side: "left" },
    });
    expect(scoped.tracks?.[0]).toMatchObject({ id: "chart:card:opacity", target: "chart:card" });
    expect(scoped.controls?.[0]?.id).toBe("chart:go");
    // Scoping is idempotent and the original is untouched.
    expect(scopeFragment(scoped, "chart")).toEqual(scoped);
    expect(fragment.nodes[0]?.id).toBe("card");
    const shifted = shiftTracks(fragment.tracks ?? [], 250);
    expect(shifted[0]?.keyframes.map((frame) => frame.time)).toEqual([250, 650]);
    expect(tracksDuration(shifted)).toBe(650);
    const merged = mergeFragments(scopeFragment(fragment, "a"), scopeFragment(fragment, "b"));
    expect(fragmentNodeIds(merged)).toHaveLength(6);
    expect(merged.summary).toBe("A card and a note. A card and a note.");
  });
});
