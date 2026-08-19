import { describe, expect, it } from "vitest";
import { parseDoctorArgs } from "../src/doctor-cli.js";

describe("kineglyph doctor CLI", () => {
  it("accepts the subcommand form and responsive width overrides", () => {
    expect(
      parseDoctorArgs([
        "doctor",
        "--scene",
        "./scene.mjs#figure",
        "--json",
        "--fail-on",
        "warning",
        "--narrow",
        "360",
      ]),
    ).toEqual({
      scene: "./scene.mjs#figure",
      json: true,
      failOn: "warning",
      widths: { wide: 1200, compact: 720, narrow: 360 },
    });
  });

  it("rejects ambiguous CI thresholds and invalid widths", () => {
    expect(() => parseDoctorArgs(["doctor", "--scene", "a", "--fail-on", "info"])).toThrow(
      "--fail-on",
    );
    expect(() => parseDoctorArgs(["doctor", "--scene", "a", "--wide", "0"])).toThrow("--wide");
  });
});
