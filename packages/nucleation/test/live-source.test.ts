import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseBuildGlb } from "../src/glb.js";
import { fromBuildAnimation, type BuildEngine } from "../src/live-source.js";

const glb = parseBuildGlb(
  new Uint8Array(readFileSync(new URL("./fixtures/beacon.glb", import.meta.url))),
);
interface Fixture {
  readonly durationMs: number;
  readonly groupCount: number;
  readonly anchors: readonly { name: string; group: number; local: number[] }[];
  readonly sampleTimesMs: readonly number[];
  readonly frames: readonly Record<string, unknown>[];
}
const fixture = JSON.parse(
  readFileSync(new URL("./fixtures/beacon-frames.json", import.meta.url), "utf8"),
) as Fixture;

/** The native fixture frames, served like the WASM engine would. */
const engine: BuildEngine = {
  frameJson: (t) => {
    const index = fixture.sampleTimesMs.findIndex((sample) => Math.abs(sample - t) < 1e-6);
    if (index === -1) throw new Error(`no fixture frame at ${t}`);
    return JSON.stringify(fixture.frames[index]);
  },
  durationMs: () => fixture.durationMs,
  groupCount: () => fixture.groupCount,
  anchorsJson: () => JSON.stringify(fixture.anchors),
};

describe("fromBuildAnimation", () => {
  const source = fromBuildAnimation(engine, glb);

  it("describes the build from the engine and the GLB", () => {
    expect(source.durationMs).toBe(2400);
    expect(source.groups).toBe(10);
    expect(source.anchors).toEqual([{ name: "beacon", group: 9 }]);
    expect(source.bounds).toEqual(glb.bounds);
  });

  it("returns the engine's exact poses, anchors, and camera", () => {
    const frame = source.frame(450);
    const raw = fixture.frames[1] as {
      poses: [number, { matrix: number[][]; opacity: number; scale: number[] }][];
      anchors: { world: number[]; opacity: number }[];
      camera: { yaw: number };
    };
    const [group, pose] = raw.poses[3]!;
    const ours = frame.poses.get(group)!;
    expect([...ours.matrix]).toEqual(pose.matrix.flat());
    expect(ours.opacity).toBe(pose.opacity);
    expect(ours.scale).toEqual(pose.scale);
    expect(frame.anchors[0]?.world).toEqual(raw.anchors[0]?.world);
    expect(frame.camera?.yaw).toBe(raw.camera.yaw);
    expect(frame.time).toBe(450);
  });

  it("clamps to the engine's duration", () => {
    expect(source.frame(99_999).time).toBe(2400);
    expect(source.frame(-5).time).toBe(0);
  });
});
