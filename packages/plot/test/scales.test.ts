import { describe, expect, it } from "vitest";
import {
  bandScale,
  formatNumber,
  linearScale,
  niceTicks,
  resolveDomain,
  stackSeries,
  tickStep,
} from "../src/index.js";

describe("plot scales", () => {
  it("maps and inverts linear domains exactly", () => {
    const scale = linearScale([-10, 30], [1, 0]);
    expect(scale.map(-10)).toBe(1);
    expect(scale.map(10)).toBe(0.5);
    expect(scale.map(30)).toBe(0);
    expect(scale.invert(0.25)).toBe(20);
  });

  it("freezes band order and computes centred padding", () => {
    const scale = bandScale(["beta", "alpha", "gamma"], [0, 1], 0.25);
    expect(scale.domain).toEqual(["beta", "alpha", "gamma"]);
    expect(scale.step).toBeCloseTo(1 / 3);
    expect(scale.bandwidth).toBeCloseTo(0.25);
    expect(scale.band("alpha")).toEqual({
      start: 0.375,
      end: 0.625,
      width: 0.25,
      center: 0.5,
    });
    expect(scale.band("missing")).toBeUndefined();
  });

  it("uses deterministic 1-2-5 ticks and outward domains", () => {
    expect(tickStep(0, 97, 5)).toBe(20);
    expect(niceTicks(-0.3, 1.1, 5)).toEqual([-0.2, 0, 0.2, 0.4, 0.6, 0.8, 1]);
    expect(resolveDomain([2, 7], { domain: "auto-zero" })).toEqual([0, 7]);
    expect(resolveDomain([-8, -3], { domain: "auto" })).toEqual([-8, -3]);
    expect(resolveDomain([null, null])).toEqual([0, 1]);
    expect(resolveDomain([5], { nice: false })).toEqual([0, 5]);
  });

  it("stacks positive and negative values independently and preserves gaps", () => {
    expect(
      stackSeries([
        [3, -2, null],
        [4, -5, 1],
        [-1, 2, 2],
      ]),
    ).toEqual([
      [{ start: 0, end: 3 }, { start: 0, end: -2 }, null],
      [
        { start: 3, end: 7 },
        { start: -2, end: -7 },
        { start: 0, end: 1 },
      ],
      [
        { start: 0, end: -1 },
        { start: 0, end: 2 },
        { start: 1, end: 3 },
      ],
    ]);
  });

  it("formats labels without locale-dependent output", () => {
    expect(formatNumber(12_345.6)).toBe("12,345.6");
    expect(formatNumber(-1_250_000, { compact: true, prefix: "$" })).toBe("-$1.3M");
    expect(formatNumber(0.25, { digits: 2, suffix: "%" })).toBe("0.25%");
    expect(formatNumber(Number.NaN)).toBe("–");
  });
});
