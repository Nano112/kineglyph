import { expect, it } from "vitest";
import * as core from "./index.js";

it("exports fully scoped Anatomy light and dark technical themes through the registry", () => {
  for (const [name, exportName, canvas] of [
    ["anatomy", "anatomyTheme", "#f2f2ef"],
    ["anatomy-dark", "anatomyDarkTheme", "#0b0b0b"],
  ] as const) {
    const theme = (core as unknown as Record<string, core.ThemeTokens>)[exportName];
    expect(theme).toBeDefined();
    expect(theme?.name).toBe(name);
    expect(theme?.colors.canvas).toBe(canvas);
    expect(core.glyphStyleThemes).toHaveProperty(name, theme);
    expect(core.declaredColorRoles(theme!)).toHaveLength(
      Object.keys(core.defaultTheme.colors).length,
    );
    expect(theme?.radii.lg).toBe(0);
    expect(theme?.strokes.hairline).toBe(0.6);
    expect(theme?.typography.body.family).toContain("monospace");
    expect(theme?.materials.raised.effects).toEqual(
      expect.arrayContaining([expect.objectContaining({ type: "shadow" })]),
    );
  }
});
