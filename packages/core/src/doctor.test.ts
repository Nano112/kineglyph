import { describe, expect, it } from "vitest";
import { doctorScene } from "./doctor.js";
import type { SceneDefinition } from "./scene.js";

describe("kineglyph doctor", () => {
  it("audits every responsive layout with actionable findings", () => {
    const scene: SceneDefinition = {
      schemaVersion: 2,
      id: "doctor",
      title: "Doctor",
      root: {
        id: "root",
        type: "group",
        height: 600,
        children: [
          {
            id: "tiny",
            type: "rect",
            width: 20,
            height: 20,
            fill: "accent",
            interactive: true,
            label: "Tiny target",
          },
        ],
      },
    };
    const report = doctorScene(scene);
    expect(report.layouts.map((entry) => entry.layout)).toEqual(["wide", "compact", "narrow"]);
    expect(report.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "touch-target", nodeId: "tiny" }),
        expect.objectContaining({ code: "unused-gutter" }),
      ]),
    );
    expect(report.findings.every((entry) => entry.remedy.length > 0)).toBe(true);
  });
});
