import { describe, expect, it } from "vitest";
import {
  ascentProfile,
  formatDuration,
  formatGrouped,
  groundTrack,
  hohmann,
  librationPoints,
  MU_EARTH_MOON,
  orbitState,
  R_EARTH,
  solveKepler,
} from "./orbital.js";

// Reference values are textbook figures for the same orbits the original wallpaper sheets drew
// (the sheets' hand-typed numbers were a few percent off; the physics here is exact two-body).

describe("hohmann", () => {
  it("computes the LEO 400 km → GEO transfer", () => {
    const t = hohmann(6778, 42164);
    expect(t.a).toBeCloseTo(24471, 0);
    expect(t.e).toBeCloseTo(0.723, 3);
    expect(t.v1).toBeCloseTo(7.669, 2);
    expect(t.v2).toBeCloseTo(3.075, 2);
    expect(t.dv1).toBeCloseTo(2.398, 2);
    expect(t.dv2).toBeCloseTo(1.457, 2);
    expect(t.dvTotal).toBeCloseTo(3.854, 2);
    expect(t.transferTime / 3600).toBeCloseTo(5.29, 1);
    expect(formatDuration(t.period1)).toBe("01h 32m 33s");
    expect(formatDuration(t.period2)).toBe("23h 56m 04s");
    expect(t.c3).toBeCloseTo(-16.29, 1);
  });

  it("is symmetric for a descending transfer", () => {
    const up = hohmann(6778, 42164);
    const down = hohmann(42164, 6778);
    expect(down.dvTotal).toBeCloseTo(up.dvTotal, 9);
    expect(down.e).toBeCloseTo(up.e, 9);
  });
});

describe("kepler", () => {
  it("solves Kepler's equation to machine precision", () => {
    for (const e of [0, 0.1, 0.5, 0.9, 0.99]) {
      for (let M = 0; M < Math.PI * 2; M += 0.37) {
        const E = solveKepler(M, e);
        expect(E - e * Math.sin(E)).toBeCloseTo(M, 10);
      }
    }
  });

  it("reproduces the Molniya-style elements sheet", () => {
    const a = 26560;
    const e = 0.6896;
    const state = orbitState(a, e, (-125 * Math.PI) / 180);
    expect(state.rp).toBeCloseTo(8244, 0);
    expect(state.ra).toBeCloseTo(44876, 0);
    expect(state.period / 3600).toBeCloseTo(11.97, 1);
    expect(state.gamma).toBeLessThan(0);
    expect(state.t).toBeGreaterThan(0);
    expect(state.t).toBeLessThan(state.period);
  });
});

describe("groundTrack", () => {
  it("propagates an ISS-like orbit", () => {
    const track = groundTrack({ inclination: 51.6386, altitude: 408, revolutions: 3.2 });
    expect(track.period / 60).toBeCloseTo(92.68, 1);
    expect(track.meanMotion).toBeCloseTo(15.54, 1);
    expect(track.nodalRegression).toBeCloseTo(-5.0, 0);
    expect(track.maxLatitude).toBeCloseTo(51.6386, 4);
    expect(track.nodes).toHaveLength(4);
    // Every sample stays inside the inclination envelope and the seam splits the track.
    for (const segment of track.segments)
      for (const [lon, lat] of segment) {
        expect(Math.abs(lat)).toBeLessThanOrEqual(51.64);
        expect(lon).toBeGreaterThanOrEqual(-180);
        expect(lon).toBeLessThan(180);
      }
    expect(track.segments.length).toBeGreaterThan(3);
  });

  it("keeps a geostationary track on the equator", () => {
    const track = groundTrack({ inclination: 0, altitude: 42164 - R_EARTH, revolutions: 1 });
    for (const segment of track.segments)
      for (const [, lat] of segment) expect(lat).toBeCloseTo(0, 9);
  });
});

describe("librationPoints", () => {
  it("reproduces the Earth–Moon collinear points from the primary", () => {
    const points = librationPoints(MU_EARTH_MOON);
    expect(points.l1).toBeCloseTo(0.84907, 4);
    expect(points.l2).toBeCloseTo(1.16783, 4);
    expect(points.l3).toBeCloseTo(-0.99291, 4);
    expect(points.l4.y).toBeCloseTo(0.86603, 5);
    expect(points.triangularStable).toBe(true);
    expect(points.stableLimit).toBeCloseTo(0.03852, 4);
    expect(points.jacobi.l1).toBeCloseTo(3.1883, 3);
    expect(points.jacobi.l2).toBeCloseTo(3.1722, 3);
    expect(points.jacobi.l4).toBeCloseTo(2.988, 3);
  });

  it("flags Routh instability for heavy secondaries", () => {
    expect(librationPoints(0.05).triangularStable).toBe(false);
  });
});

describe("ascentProfile", () => {
  it("rises vertically, then pitches over to a 200 km insertion", () => {
    const profile = ascentProfile({ targetAltitude: 200 });
    expect(profile.at(0).altitude).toBe(0);
    expect(profile.at(0).phi).toBe(0);
    expect(profile.at(1).altitude).toBeCloseTo(200, 9);
    expect(profile.insertionSpeed).toBeCloseTo(7.784, 3);
    expect(profile.samples).toHaveLength(401);
    let previous = -1;
    for (const sample of profile.samples) {
      expect(sample.altitude).toBeGreaterThanOrEqual(previous);
      previous = sample.altitude;
    }
  });
});

describe("formatting", () => {
  it("groups digits with spaces and keeps a true minus", () => {
    expect(formatGrouped(42164)).toBe(["42", "164"].join("\x20"));
    expect(formatGrouped(-15.802, 3)).toBe("−15.802");
    expect(formatGrouped(6778.4, 1)).toBe(["6", "778.4"].join("\x20"));
  });
});
