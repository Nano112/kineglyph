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
});
