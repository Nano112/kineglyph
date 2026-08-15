import { describe, expect, it } from "vitest";
import { alphaGradient, defineScene, linearGradient, radialGradient } from "./scene.js";
import { resolveScene } from "./resolve.js";
import { createTheme } from "./theme.js";

describe("gradient fills", () => {
  it("keeps gradient geometry while resolving semantic stop colours and alpha", () => {
    const theme = createTheme({ colors: { chart1: "#123456", chart2: "#abcdef" } });
    const scene = defineScene({
      schemaVersion: 2,
      id: "paint",
      title: "Paint",
      root: {
        id: "root",
        type: "group",
        layout: "row",
        children: [
          {
            id: "linear",
            type: "rect",
            width: 100,
            height: 50,
            fill: linearGradient(
              [
                { at: 1, color: "chart2", opacity: 0 },
                { at: 0, color: "chart1", opacity: 0.8 },
              ],
              { angle: 35 },
            ),
          },
          {
            id: "radial",
            type: "circle",
            radius: 25,
            fill: radialGradient(
              [
                { at: 0, color: "chart2" },
                { at: 1, color: "chart1", opacity: 0 },
              ],
              { center: [0.4, 0.3], radius: 0.7 },
            ),
          },
        ],
      },
    });

    const resolved = resolveScene(scene, { width: 320, theme });
    expect(resolved.nodes.find((node) => node.id === "linear")?.appearance.fill).toEqual({
      type: "linear-gradient",
      angle: 35,
      spread: "pad",
      stops: [
        { at: 0, color: "#123456", opacity: 0.8 },
        { at: 1, color: "#abcdef", opacity: 0 },
      ],
    });
    expect(resolved.nodes.find((node) => node.id === "radial")?.appearance.fill).toMatchObject({
      type: "radial-gradient",
      center: [0.4, 0.3],
      focalPoint: [0.4, 0.3],
      radius: 0.7,
    });
  });

  it("provides a concise solid-to-transparent helper", () => {
    expect(alphaGradient("accent", { from: 0.5, angle: 90 })).toEqual({
      type: "linear-gradient",
      angle: 90,
      stops: [
        { at: 0, color: "accent", opacity: 0.5 },
        { at: 1, color: "accent", opacity: 0 },
      ],
    });
  });
});
