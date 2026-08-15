import { describe, expect, it } from "vitest";
import { material, noise, shader, shadow } from "./material.js";
import { resolveScene } from "./resolve.js";
import { defineScene } from "./scene.js";
import { createTheme } from "./theme.js";

describe("semantic materials", () => {
  it("keeps the default material system visually neutral", () => {
    const theme = createTheme();
    expect(theme.materials.raised.effects).toBeUndefined();
    expect(theme.materials.floating.effects).toBeUndefined();
    expect(theme.materials.inset.effects).toBeUndefined();
  });

  it("lets a theme reinterpret a role while local paint and effects remain explicit", () => {
    const theme = createTheme({
      colors: { text: "#302b24", accent: "#a16f93", chart2: "#9386b8" },
      materials: {
        raised: {
          fill: "surfaceRaised",
          radius: 22,
          effects: [shadow({ color: "text", opacity: 0.2, blur: 26, offset: [0, 12] })],
        },
      },
    });
    const scene = defineScene({
      schemaVersion: 2,
      id: "materials",
      title: "Materials",
      root: {
        id: "surface",
        type: "group",
        layout: "stack",
        padding: 16,
        frame: material("raised", {
          stroke: "accent",
          effects: [
            shadow({ color: "text", opacity: 0.18, blur: 24, offset: [0, 10] }),
            shader("frosted-glass", {
              uniforms: { refraction: 0.08 },
              fallback: [noise({ amount: 0.02, seed: 19 })],
            }),
          ],
        }),
        children: [
          {
            id: "sample",
            type: "rect",
            width: 80,
            height: 40,
            material: "inset",
            fill: "chart2",
          },
        ],
      },
    });

    const resolved = resolveScene(scene, { width: 320, theme });
    const surface = resolved.nodes.find((node) => node.id === "surface")?.appearance;
    expect(surface).toMatchObject({
      fill: theme.colors.surfaceRaised,
      stroke: "#a16f93",
      radius: 22,
    });
    expect(surface?.effects?.[0]).toEqual({
      type: "shadow",
      kind: "outer",
      color: "#302b24",
      opacity: 0.18,
      blur: 24,
      spread: 0,
      offset: [0, 10],
    });
    expect(surface?.effects?.[1]).toMatchObject({
      type: "shader",
      name: "frosted-glass",
      uniforms: { refraction: 0.08 },
      fallback: [{ type: "noise", amount: 0.02, seed: 19 }],
    });
    expect(resolved.nodes.find((node) => node.id === "sample")?.appearance.fill).toBe("#9386b8");
  });

  it("keeps helpers and shader intent JSON-serializable", () => {
    const style = material("glass", {
      blendMode: "screen",
      effects: [shader("liquid", { uniforms: { strength: 6, direction: [1, 0] } })],
    });
    expect(JSON.parse(JSON.stringify(style))).toEqual(style);
  });
});
