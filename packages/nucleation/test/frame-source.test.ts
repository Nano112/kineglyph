import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { composeMatrix, fromAnimatedGlb, transformPoint } from "../src/frame-source.js";

const bytes = new Uint8Array(readFileSync(new URL("./fixtures/beacon.glb", import.meta.url)));
interface NativeFixture {
  readonly sampleTimesMs: readonly number[];
  readonly frames: readonly {
    readonly poses: readonly [
      number,
      { readonly matrix: readonly (readonly number[])[]; readonly opacity: number },
    ][];
    readonly anchors: readonly {
      readonly name: string;
      readonly world: readonly number[];
      readonly opacity: number;
    }[];
    readonly camera: { readonly yaw: number; readonly pitch: number; readonly zoom: number } | null;
  }[];
}
const native = JSON.parse(
  readFileSync(new URL("./fixtures/beacon-frames.json", import.meta.url), "utf8"),
) as NativeFixture;

function flatten(columns: readonly (readonly number[])[]): number[] {
  return columns.flatMap((column) => [...column]);
}

describe("fromAnimatedGlb", () => {
  const source = fromAnimatedGlb(bytes);

  it("describes the build", () => {
    expect(source.name).toBe("beacon");
    expect(source.groups).toBe(10);
    expect(source.durationMs).toBeCloseTo(2400, 3);
    expect(source.anchors).toEqual([{ name: "beacon", group: 9 }]);
  });

  it("matches the native engine at the sampled keyframes", () => {
    // t = 0 and t = 2400 fall exactly on GLB keys; 450 / 1000 / 1500 are between 30 fps samples,
    // so linear interpolation of the sampled tracks may differ slightly from the exact pose.
    native.sampleTimesMs.forEach((t, i) => {
      const exact = t === 0 || t === 2400;
      const tolerance = exact ? 1e-3 : 5e-2;
      const frame = source.frame(t);
      for (const [group, pose] of native.frames[i]!.poses) {
        const ours = frame.poses.get(group);
        expect(ours, `group ${group} @${t}`).toBeDefined();
        const expected = flatten(pose.matrix);
        for (let k = 0; k < 16; k += 1)
          expect(
            Math.abs((ours!.matrix[k] ?? 0) - (expected[k] ?? 0)),
            `group ${group} @${t} m[${k}]`,
          ).toBeLessThan(tolerance);
        expect(Math.abs(ours!.opacity - pose.opacity)).toBeLessThan(tolerance);
      }
      const anchor = frame.anchors[0]!;
      const expectedAnchor = native.frames[i]!.anchors[0]!;
      for (let c = 0; c < 3; c += 1)
        expect(Math.abs(anchor.world[c]! - expectedAnchor.world[c]!)).toBeLessThan(tolerance);
      const camera = native.frames[i]!.camera;
      if (camera !== null) {
        expect(Math.abs((frame.camera?.yaw ?? 0) - camera.yaw)).toBeLessThan(tolerance);
        expect(Math.abs((frame.camera?.zoom ?? 1) - camera.zoom)).toBeLessThan(tolerance);
      }
    });
  });

  it("clamps outside the timeline and stays pure", () => {
    const a = source.frame(450);
    source.frame(2000);
    const b = source.frame(450);
    expect([...a.poses.get(3)!.matrix]).toEqual([...b.poses.get(3)!.matrix]);
    expect(source.frame(-10).time).toBe(0);
    expect(source.frame(99999).time).toBeCloseTo(2400, 3);
  });
});

describe("matrices", () => {
  it("composes T·R·S and transforms points", () => {
    const m = composeMatrix([1, 2, 3], [0, Math.SQRT1_2, 0, Math.SQRT1_2], [2, 2, 2]);
    const p = transformPoint(m, [1, 0, 0]);
    // 90° about +Y maps +X to −Z; scaled by 2, then translated.
    expect(p[0]).toBeCloseTo(1, 5);
    expect(p[1]).toBeCloseTo(2, 5);
    expect(p[2]).toBeCloseTo(3 - 2, 5);
  });
});
