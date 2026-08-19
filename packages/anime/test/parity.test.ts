// @vitest-environment jsdom
/**
 * Live/export parity: the animator must drive the same DOM attributes the static renderer emits
 * for any frame — path progress (with authored dash patterns preserved), text line reveal,
 * centre-origin transforms, and anchored reveals — so browsers, PNG, and GIF agree at 0/50/100 %.
 */
import { afterEach, describe, expect, it } from "vitest";
import { createTheme, resolveScene, seekTimeline, type SceneDefinition } from "@kineglyph/core";
import { renderSvg } from "@kineglyph/svg";
import { KineglyphSceneAnimator } from "../src/index.js";

afterEach(() => {
  document.body.replaceChildren();
});

const theme = createTheme();

const definition: SceneDefinition = {
  schemaVersion: 2,
  id: "parity",
  title: "Parity",
  root: {
    id: "root",
    type: "group",
    layout: "stack",
    gap: 12,
    children: [
      {
        id: "para",
        type: "text",
        text: "First line of copy. Second line of copy. Third line of copy. Fourth line here.",
        width: 180,
      },
      {
        id: "line",
        type: "polyline",
        width: 240,
        height: 80,
        points: [
          [0, 1],
          [0.3, 0.2],
          [0.6, 0.6],
          [1, 0],
        ],
        curve: "monotone",
        dash: "dashed",
        stroke: "chart1",
        strokeWidth: 2,
      },
      {
        id: "box",
        type: "rect",
        width: 120,
        height: 40,
        fill: "chart2",
        revealAnchor: "bottom",
      },
      {
        id: "spinner",
        type: "rect",
        width: 52,
        height: 28,
        fill: "chart3",
      },
    ],
  },
  timeline: {
    duration: 1000,
    tracks: [
      {
        id: "t-progress",
        target: "para",
        property: "progress",
        keyframes: [
          { time: 0, value: 0 },
          { time: 1000, value: 1 },
        ],
      },
      {
        id: "l-progress",
        target: "line",
        property: "progress",
        keyframes: [
          { time: 0, value: 0 },
          { time: 1000, value: 1 },
        ],
      },
      {
        id: "b-scale",
        target: "box",
        property: "scale",
        keyframes: [
          { time: 0, value: 0.6 },
          { time: 1000, value: 1 },
        ],
      },
      {
        id: "b-tx",
        target: "box",
        property: "translateX",
        keyframes: [
          { time: 0, value: -30 },
          { time: 1000, value: 0 },
        ],
      },
      {
        id: "b-reveal",
        target: "box",
        property: "revealY",
        keyframes: [
          { time: 0, value: 0 },
          { time: 1000, value: 1 },
        ],
      },
      {
        id: "spinner-rotation",
        target: "spinner",
        property: "rotation",
        keyframes: [
          { time: 0, value: 0 },
          { time: 1000, value: 90 },
        ],
      },
    ],
  },
};

const resolved = resolveScene(definition, { width: 480, theme });

function mountAt(time: number): {
  live: HTMLElement;
  static: HTMLElement;
  animator: KineglyphSceneAnimator;
} {
  // Live: render frame 0 statically (as the web runtime does), then let the animator drive `time`.
  const live = document.createElement("div");
  live.innerHTML = renderSvg(seekTimeline(resolved, 0), { idPrefix: "live" });
  document.body.append(live);
  const animator = new KineglyphSceneAnimator({ root: live, scene: resolved });
  animator.applyFrame(time);
  // Static: what PNG/GIF export sees for the same time.
  const fixed = document.createElement("div");
  fixed.innerHTML = renderSvg(seekTimeline(resolved, time), { idPrefix: "static" });
  document.body.append(fixed);
  return { live, static: fixed, animator };
}

/** Reads an attribute and fails loudly when the selector matches nothing (null !== null parity). */
function attr(root: Element, selector: string, name: string): string | null {
  const target = root.querySelector(selector);
  if (target === null) throw new Error(`parity: no element matches ${selector}`);
  return target.getAttribute(name);
}

function numbers(value: string | null): number[] {
  return (value ?? "")
    .split(/[\s,]+/)
    .filter(Boolean)
    .map(Number);
}

function expectNumericParity(a: string | null, b: string | null, digits = 2): void {
  const left = numbers(a);
  const right = numbers(b);
  expect(left.length).toBe(right.length);
  left.forEach((value, index) => expect(value).toBeCloseTo(right[index] ?? NaN, digits));
}

describe("live playback matches static frames", () => {
  it.each([0, 500, 1000])("path progress and dash pattern at %i ms", (time) => {
    const { live, static: fixed, animator } = mountAt(time);
    const selector = '.kg-node-shape[data-shape-of="line"]';
    expect(live.querySelector(selector)?.tagName.toLowerCase()).toBe("path");
    expect(fixed.querySelector(selector)?.tagName.toLowerCase()).toBe("path");
    const liveDash = attr(live, selector, "stroke-dasharray");
    const staticDash = attr(fixed, selector, "stroke-dasharray");
    expectNumericParity(liveDash, staticDash);
    expectNumericParity(attr(live, selector, "pathLength"), attr(fixed, selector, "pathLength"));
    // Dashed pattern survives at every progress: more than one dash pair or a hidden stroke.
    const dashes = numbers(staticDash);
    if (time === 0) {
      // Fully hidden: a single gap the length of the whole path.
      expect(dashes.length).toBeGreaterThanOrEqual(2);
      expect(dashes[0]).toBe(0);
    } else {
      expect(dashes.length).toBeGreaterThanOrEqual(2);
      // Pattern alternates dash/gap: at least two positive dash lengths when partially revealed,
      // or the plain dashed pattern at 100 %.
      expect(dashes.filter((value) => value > 0).length).toBeGreaterThanOrEqual(2);
    }
    expect(attr(live, selector, "stroke-linecap")).toBe(attr(fixed, selector, "stroke-linecap"));
    animator.dispose();
  });

  it.each([0, 500, 1000])("text line reveal at %i ms", (time) => {
    const { live, static: fixed, animator } = mountAt(time);
    const opacities = (root: Element): (string | null)[] =>
      [...root.querySelectorAll('text[data-text-of="para"] tspan')].map((span) =>
        span.getAttribute("opacity"),
      );
    const liveSpans = opacities(live);
    expect(liveSpans.length).toBeGreaterThan(1);
    expect(liveSpans).toEqual(opacities(fixed));
    if (time === 0) expect(liveSpans.every((value) => value === "0")).toBe(true);
    if (time === 1000) expect(liveSpans.every((value) => value === null)).toBe(true);
    animator.dispose();
  });

  it("intermediate transforms and anchored reveals share centre-origin geometry", () => {
    const { live, static: fixed, animator } = mountAt(500);
    const liveBox = live.querySelector<SVGElement>('[data-node-id="box"]');
    const staticBox = fixed.querySelector<SVGElement>('[data-node-id="box"]');
    expect(liveBox).not.toBeNull();
    expect(staticBox).not.toBeNull();
    // Static: transform="translate(tx ty) scale(s)"; live: CSS translate(txpx, typx) scale(s).
    const staticTransform = staticBox?.getAttribute("transform") ?? "";
    const staticNumbers = numbers(staticTransform.replace(/[a-z()]/g, " "));
    const liveTransform = liveBox?.style.transform ?? "";
    const liveNumbers = numbers(liveTransform.replace(/px|[a-z()]/g, " "));
    expect(staticNumbers).toHaveLength(3);
    expect(liveNumbers).toHaveLength(3);
    staticNumbers.forEach((value, index) =>
      expect(liveNumbers[index] ?? NaN).toBeCloseTo(value, 1),
    );
    expect(liveBox?.style.transformOrigin).toBe("0 0");
    // Scale 0.8 about the centre: translation must be non-zero (centre-origin), not identity.
    expect(Math.abs(staticNumbers[1] ?? 0)).toBeGreaterThan(0);
    // Reveal clip rect parity.
    const clip = '[data-reveal-clip="box"]';
    for (const name of ["x", "y", "width", "height"])
      expectNumericParity(attr(live, clip, name), attr(fixed, clip, name), 1);
    // Bottom-anchored: at 50 % the clip is half the box height and touches the bottom edge.
    const clipHeight = Number(attr(fixed, clip, "height"));
    const boxHeight = Number(attr(fixed, '.kg-node-shape[data-shape-of="box"]', "height"));
    expect(clipHeight).toBeCloseTo(boxHeight / 2, 1);
    animator.dispose();
  });

  it.each([0, 500, 1000])("rotation has live/static visual parity at %i ms", (time) => {
    const { live, static: fixed, animator } = mountAt(time);
    const liveSpinner = live.querySelector<SVGElement>('[data-node-id="spinner"]');
    const staticSpinner = fixed.querySelector<SVGElement>('[data-node-id="spinner"]');
    const node = seekTimeline(resolved, time).nodes.find((entry) => entry.id === "spinner");
    expect(liveSpinner).not.toBeNull();
    expect(staticSpinner).not.toBeNull();
    expect(node).toBeDefined();
    if (node === undefined) throw new Error("missing resolved spinner");

    const angle = node.state.rotation ?? 0;
    if (angle === 0) {
      expect(liveSpinner?.style.transform).toBe("none");
      expect(staticSpinner?.getAttribute("transform")).toBeNull();
      expect(liveSpinner?.style.transformOrigin).toBe("0 0");
    } else {
      expect(liveSpinner?.style.transform).toContain(`rotate(${angle}deg)`);
      expect(staticSpinner?.getAttribute("transform")).toContain(`rotate(${angle} `);
      expect(liveSpinner?.style.transformOrigin).toBe(
        `${node.x + node.width / 2}px ${node.y + node.height / 2}px`,
      );
    }
    animator.dispose();
  });

  it("keeps rich paint, geometry, numeric text, and path morphs in frame parity", () => {
    const richDefinition: SceneDefinition = {
      schemaVersion: 2,
      id: "rich-parity",
      title: "Rich parity",
      root: {
        id: "root",
        type: "group",
        layout: "coordinates",
        height: 240,
        children: [
          { id: "dial", type: "rect", position: { x: 0.1, y: 0.1 }, width: 80, height: 40 },
          { id: "count", type: "text", text: "0%", position: { x: 0.1, y: 0.5 }, width: 120 },
          {
            id: "morph",
            type: "path",
            d: "M 0 10 L 10 0 L 20 10 Z",
            viewBox: { width: 20, height: 20 },
            position: { x: 0.7, y: 0.5 },
            width: 60,
            height: 60,
          },
        ],
      },
      edges: [{ id: "rich-edge", from: "dial", to: "morph", route: "curve" }],
      timeline: {
        duration: 1_000,
        tracks: [
          {
            id: "fill",
            target: "dial",
            property: "fill",
            keyframes: [
              { time: 0, value: "#000000" },
              { time: 1_000, value: "#ffffff" },
            ],
          },
          {
            id: "stroke",
            target: "dial",
            property: "stroke",
            keyframes: [
              { time: 0, value: "#ff0000" },
              { time: 1_000, value: "#0000ff" },
            ],
          },
          {
            id: "width",
            target: "dial",
            property: "strokeWidth",
            keyframes: [
              { time: 0, value: 1 },
              { time: 1_000, value: 9 },
            ],
          },
          {
            id: "radius",
            target: "dial",
            property: "radius",
            keyframes: [
              { time: 0, value: 0 },
              { time: 1_000, value: 16 },
            ],
          },
          {
            id: "x",
            target: "dial",
            property: "x",
            keyframes: [
              { time: 0, value: 20 },
              { time: 1_000, value: 60 },
            ],
          },
          {
            id: "height",
            target: "dial",
            property: "height",
            keyframes: [
              { time: 0, value: 40 },
              { time: 1_000, value: 80 },
            ],
          },
          {
            id: "number",
            target: "count",
            property: "numericText",
            format: { suffix: "%" },
            keyframes: [
              { time: 0, value: 0 },
              { time: 1_000, value: 100 },
            ],
          },
          {
            id: "text-color",
            target: "count",
            property: "color",
            keyframes: [
              { time: 0, value: "#000000" },
              { time: 1_000, value: "#00ff00" },
            ],
          },
          {
            id: "path",
            target: "morph",
            property: "pathMorph",
            keyframes: [
              { time: 0, value: "M 0 10 L 10 0 L 20 10 Z" },
              { time: 1_000, value: "M 0 20 L 10 10 L 20 20 Z" },
            ],
          },
          {
            id: "edge-stroke",
            target: "rich-edge",
            property: "stroke",
            keyframes: [
              { time: 0, value: "#111111" },
              { time: 1_000, value: "#eeeeee" },
            ],
          },
          {
            id: "edge-width",
            target: "rich-edge",
            property: "strokeWidth",
            keyframes: [
              { time: 0, value: 1 },
              { time: 1_000, value: 7 },
            ],
          },
        ],
      },
    };
    const rich = resolveScene(richDefinition, { width: 500, theme });
    const live = document.createElement("div");
    live.innerHTML = renderSvg(seekTimeline(rich, 0), { idPrefix: "rich-live" });
    document.body.append(live);
    const animator = new KineglyphSceneAnimator({ root: live, scene: rich });
    animator.applyFrame(500);
    const fixed = document.createElement("div");
    fixed.innerHTML = renderSvg(seekTimeline(rich, 500), { idPrefix: "rich-fixed" });
    document.body.append(fixed);

    const dial = '.kg-node-shape[data-shape-of="dial"]';
    for (const name of ["x", "y", "width", "height", "rx", "fill", "stroke", "stroke-width"])
      expect(attr(live, dial, name)).toBe(attr(fixed, dial, name));
    expect(live.querySelector('text[data-text-of="count"]')?.getAttribute("fill")).toBe(
      fixed.querySelector('text[data-text-of="count"]')?.getAttribute("fill"),
    );
    expect(live.querySelector('text[data-text-of="count"] tspan')?.textContent).toBe("50%");
    expect(attr(live, '.kg-node-shape[data-shape-of="morph"]', "d")).toBe(
      attr(fixed, '.kg-node-shape[data-shape-of="morph"]', "d"),
    );
    expect(attr(live, '.kg-node-shape[data-shape-of="morph"]', "transform")).toBe(
      attr(fixed, '.kg-node-shape[data-shape-of="morph"]', "transform"),
    );
    for (const name of ["stroke", "stroke-width"])
      expect(attr(live, '[data-edge-id="rich-edge"]', name)).toBe(
        attr(fixed, '[data-edge-id="rich-edge"]', name),
      );
    animator.dispose();
  });
});
