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
    expect(signals["leader.beacon"]).toBe("M0 0");
    expect(signals["anchor.beacon.visible"]).toBe(0);
    expect(signals.placed).toBe(0);
  });

  it("projects the anchor into sheet space once its block is there", () => {
    const at = anchorFrameSignals({ view: () => view, frame, notes });
    const before = at(0);
    expect(before["anchor.beacon.visible"]).toBe(0);
    expect(before["leader.beacon"]).toBe("M0 0");
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

describe("headlessView", () => {
  it("projects like the surface would, per time", async () => {
    const { headlessView } = await import("../src/headless.js");
    const at = anchorFrameSignals({
      view: headlessView({ source, camera: { yaw: 28, pitch: 24, zoom: 0.8 }, viewport }),
      frame,
      notes,
    });
    const end = at(2400);
    expect(end["anchor.beacon.visible"]).toBe(1);
    expect(String(end["leader.beacon"]).startsWith("M")).toBe(true);
    expect(at(0)["anchor.beacon.visible"]).toBe(0);
  });
});

describe("leader geometry", () => {
  it("matches drafting.calloutLeader for both sides", async () => {
    const { drafting } = await import("@kineglyph/core");
    const { leaderPolyline, clipOutside } = await import("../src/leaders.js");
    for (const side of ["top-left", "top-right"] as const) {
      const points = leaderPolyline({ x: 2000, y: 420, side }, [900, 700]);
      const expected = drafting.calloutLeader(2000, 420, side)(900, 700);
      const [, turn, end] = points;
      expect(expected.startsWith(`M900 700 L${turn![0]} ${turn![1]} h${end![0] - turn![0]}`)).toBe(
        true,
      );
    }
    // Clipped to the outside of a view rect: the anchor→turn segment starts at the rect's edge.
    const rect = { x: 366, y: 366, width: 1368, height: 1168 };
    const path = clipOutside(leaderPolyline({ x: 2000, y: 420 }, [900, 700]), rect);
    expect(path?.startsWith("M1734 ")).toBe(true);
    expect(path?.endsWith("L1992 454")).toBe(true);
    // A polyline entirely inside the rect leaves nothing for the sheet.
    expect(
      clipOutside(
        [
          [400, 400],
          [500, 500],
        ],
        rect,
      ),
    ).toBeUndefined();
  });
});
