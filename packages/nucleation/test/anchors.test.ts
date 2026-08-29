import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { anchorFrameSignals, anchorSignalDefaults } from "../src/anchors.js";
import { ISOMETRIC, cameraMatrices } from "../src/camera.js";
import { fromAnimatedGlb } from "../src/frame-source.js";
import type { BuildView } from "../src/surface.js";

const bytes = new Uint8Array(readFileSync(new URL("./fixtures/beacon.glb", import.meta.url)));
const source = fromAnimatedGlb(bytes);
const viewport = { width: 400, height: 300 };
const view: BuildView = {
  time: 0,
  viewProjection: cameraMatrices(source.bounds, 4 / 3, ISOMETRIC).viewProjection,
  viewport,
  source,
};
const frame = { x: 400, y: 300, width: 1600, height: 1200 };
const notes = [{ anchor: "beacon", x: 2100, y: 400, side: "top-left" as const }];

describe("anchorFrameSignals", () => {
  it("is hidden before the surface has rendered", () => {
    const signals = anchorFrameSignals({ view: () => undefined, frame, notes })(1000);
    expect(signals["leader.beacon"]).toBe("");
    expect(signals["anchor.beacon.visible"]).toBe(0);
    expect(signals.placed).toBe(0);
  });

  it("projects the anchor into sheet space once its block is there", () => {
    const at = anchorFrameSignals({ view: () => view, frame, notes });
    const before = at(0);
    expect(before["anchor.beacon.visible"]).toBe(0);
    expect(before["leader.beacon"]).toBe("");
    expect(before.groups).toBe(10);
    expect(before.placed).toBe(0);

    const after = at(2400);
    expect(after["anchor.beacon.visible"]).toBe(1);
    expect(String(after["leader.beacon"]).startsWith("M")).toBe(true);
    const x = Number(after["anchor.beacon.x"]);
    const y = Number(after["anchor.beacon.y"]);
    // The beacon's top sits above the centre of the framed build, inside the surface rectangle.
    expect(x).toBeGreaterThan(frame.x);
    expect(x).toBeLessThan(frame.x + frame.width);
    expect(y).toBeGreaterThan(frame.y);
    expect(y).toBeLessThan(frame.y + frame.height / 2);
    expect(after.placed).toBe(10);
  });

  it("declares matching defaults for figure metadata", () => {
    expect(Object.keys(anchorSignalDefaults(notes)).sort()).toEqual(
      Object.keys(anchorFrameSignals({ view: () => view, frame, notes })(0)).sort(),
    );
  });
});
