// @vitest-environment jsdom

import { createTheme, resolveScene, type SceneDefinition } from "@kineglyph/core";
import { describe, expect, it } from "vitest";
import { mountDoctorOverlay } from "../src/doctor.js";

describe("doctor overlay", () => {
  it("maps actionable findings back onto resolved bounds", () => {
    const definition: SceneDefinition = {
      schemaVersion: 2,
      id: "overlay",
      title: "Overlay",
      root: {
        id: "root",
        type: "group",
        children: [
          {
            id: "tiny",
            type: "rect",
            width: 20,
            height: 20,
            fill: "accent",
            interactive: true,
            ports: [{ id: "out", side: "right" }],
          },
        ],
      },
    };
    const scene = resolveScene(definition, { width: 600, theme: createTheme() });
    const stage = document.createElement("div");
    const overlay = mountDoctorOverlay(stage, scene);
    expect(stage.querySelector('[data-node-id="tiny"]')).not.toBeNull();
    expect(overlay.element.textContent).toContain("touch-target");
    expect(stage.querySelector('[data-port="out"]')).not.toBeNull();
    expect(overlay.element.textContent).toContain("· 600×");
    overlay.setLayers({ ports: false, grid: false });
    expect(stage.querySelector('[data-port="out"]')).toBeNull();
    expect(overlay.layers.ports).toBe(false);
    overlay.setVisible(false);
    expect(overlay.element.hidden).toBe(true);
    overlay.destroy();
  });
});
