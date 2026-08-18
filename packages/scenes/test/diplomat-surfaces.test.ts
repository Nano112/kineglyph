import { describe, expect, it } from "vitest";
import { resolveScene, validateScene } from "@kineglyph/core";
import { diplomatSurfacesScene, diplomatSurfacesTheme } from "../src/index.js";

describe("Diplomat surfaces architecture", () => {
  it("resolves cleanly across wide, compact, and narrow layouts", () => {
    expect(validateScene(diplomatSurfacesScene).diagnostics).toEqual([]);

    for (const width of [1_600, 820, 520]) {
      const resolved = resolveScene(diplomatSurfacesScene, {
        width,
        theme: diplomatSurfacesTheme,
      });
      expect(resolved.diagnostics, `${width}px`).toEqual([]);
    }
  });

  it("keeps the detailed fan-out on wide canvases and compresses it on smaller ones", () => {
    const wide = resolveScene(diplomatSurfacesScene, {
      width: 1_600,
      theme: diplomatSurfacesTheme,
    });
    const compact = resolveScene(diplomatSurfacesScene, {
      width: 820,
      theme: diplomatSurfacesTheme,
    });

    const fan = (scene: typeof wide) =>
      scene.edges.filter((edge) => edge.id.startsWith("diplomat-to-surface-"));
    const aggregate = (scene: typeof wide) =>
      scene.edges.find((edge) => edge.id === "diplomat-to-generated-surfaces");

    expect(fan(wide)).toHaveLength(6);
    expect(fan(wide).every((edge) => edge.hidden !== true)).toBe(true);
    expect(aggregate(wide)?.hidden).toBe(true);

    expect(fan(compact).every((edge) => edge.hidden === true)).toBe(true);
    expect(aggregate(compact)?.hidden).not.toBe(true);
  });
});
