import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseBuildGlb, splitGlb } from "../src/glb.js";

const bytes = new Uint8Array(readFileSync(new URL("./fixtures/beacon.glb", import.meta.url)));

describe("parseBuildGlb", () => {
  it("splits the container", () => {
    const { json, binary } = splitGlb(bytes);
    expect(Array.isArray(json.nodes)).toBe(true);
    expect(binary.byteLength).toBeGreaterThan(1000);
  });

  it("reads the build's groups, anchor, tracks, and extras", () => {
    const glb = parseBuildGlb(bytes);
    expect(glb.name).toBe("beacon");
    expect(glb.root.name).toBe("build:beacon");
    expect(glb.groups.map((group) => group.name)).toEqual(
      Array.from({ length: 10 }, (_, i) => `group:${i}`),
    );
    expect(glb.groups.every((group) => group.mesh !== undefined)).toBe(true);
    expect(glb.groups[9]?.blocks).toBe(1);
    expect(glb.anchors).toHaveLength(1);
    expect(glb.anchors[0]?.anchor).toBe("beacon");
    expect(glb.anchors[0]?.group).toBe(9);
    expect(glb.anchors[0]?.translation).toEqual([0, 1.5, 0]);
    expect(glb.groups[9]?.anchors[0]?.anchor).toBe("beacon");
    expect(glb.durationMs).toBeCloseTo(2400, 3);
    expect(glb.fps).toBe(30);
    const first = glb.groups[0]!;
    expect(first.tracks.translation?.stride).toBe(3);
    expect(first.tracks.scale?.interpolation).toBe("LINEAR");
    expect(first.tracks.translation?.times.length).toBeGreaterThan(1);
    expect(first.tracks.translation?.values.length).toBe(
      (first.tracks.translation?.times.length ?? 0) * 3,
    );
    expect(glb.camera?.yaw.length).toBe(glb.camera?.times.length);
    expect(glb.camera?.times.length).toBe(73);
  });

  it("reports the mesh bounds in the engine's block space", () => {
    const glb = parseBuildGlb(bytes);
    // Gold blocks at (-1..1, 0, -1..1) centred on their coordinates, beacon on top.
    expect(glb.bounds.min[0]).toBeCloseTo(-1.5, 2);
    expect(glb.bounds.min[1]).toBeCloseTo(-0.5, 2);
    expect(glb.bounds.max[0]).toBeCloseTo(1.5, 2);
    expect(glb.bounds.max[1]).toBeCloseTo(1.5, 1);
  });

  it("rejects containers that are not builds", () => {
    expect(() => parseBuildGlb(new Uint8Array([1, 2, 3]))).toThrow(/GLB/);
  });
});
