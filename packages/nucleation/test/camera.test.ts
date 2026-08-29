import { describe, expect, it } from "vitest";
import { ISOMETRIC, cameraMatrices, project, withPose } from "../src/camera.js";

const bounds = { min: [-1.5, -0.5, -1.5] as const, max: [1.5, 1.5, 1.5] as const };
const viewport = { width: 400, height: 300 };

describe("camera", () => {
  it("frames the bounds centre at the viewport centre", () => {
    const { viewProjection } = cameraMatrices(bounds, 400 / 300, ISOMETRIC);
    const centre = project(viewProjection, [0, 0.5, 0], viewport);
    expect(centre.x).toBeCloseTo(200, 3);
    expect(centre.y).toBeCloseTo(150, 3);
    expect(centre.visible).toBe(true);
  });

  it("keeps the whole build inside the viewport and orients the axes like Nucleation", () => {
    const { viewProjection } = cameraMatrices(bounds, 400 / 300, ISOMETRIC);
    for (const corner of [
      [-1.5, -0.5, -1.5],
      [1.5, 1.5, 1.5],
      [1.5, -0.5, -1.5],
      [-1.5, 1.5, 1.5],
    ] as const) {
      expect(project(viewProjection, corner, viewport).visible).toBe(true);
    }
    const up = project(viewProjection, [0, 2, 0], viewport);
    const origin = project(viewProjection, [0, 0.5, 0], viewport);
    expect(up.y).toBeLessThan(origin.y);
    // At yaw 45° the camera sits at +x/+z looking back at the origin, so +x recedes to the right.
    const right = project(viewProjection, [1, 0.5, 0], viewport);
    expect(right.x).toBeGreaterThan(origin.x);
  });

  it("zoom magnifies and the perspective branch is finite", () => {
    const wide = cameraMatrices(bounds, 1, ISOMETRIC);
    const zoomed = cameraMatrices(bounds, 1, { ...ISOMETRIC, zoom: 2 });
    const square = { width: 300, height: 300 };
    const a = project(wide.viewProjection, [1, 0.5, 0], square).x - 150;
    const b = project(zoomed.viewProjection, [1, 0.5, 0], square).x - 150;
    expect(Math.abs(b)).toBeCloseTo(Math.abs(a) * 2, 3);
    const persp = cameraMatrices(bounds, 1, { ...ISOMETRIC, projection: "perspective" });
    const p = project(persp.viewProjection, [0, 0.5, 0], square);
    expect(p.visible).toBe(true);
    expect(p.x).toBeCloseTo(150, 3);
  });

  it("applies a frame's camera pose on top of the base", () => {
    const posed = withPose(
      ISOMETRIC,
      { yaw: -4, pitch: 2, zoom: 1.5, targetOffset: [0, 1, 0] },
      bounds,
    );
    expect(posed.yaw).toBeCloseTo(41);
    expect(posed.pitch).toBeCloseTo(37.264);
    expect(posed.zoom).toBeCloseTo(1.5);
    expect(posed.target).toEqual([0, 1.5, 0]);
  });
});
