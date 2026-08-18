import { describe, expect, it } from "vitest";
import {
  createTheme,
  declaredColorRoles,
  defaultTheme,
  inheritTheme,
  overrideTheme,
  withFontFamily,
} from "./theme.js";

/**
 * A theme carries two separate things and they are easy to confuse: the colours it would paint,
 * and the colours it insists on. `colors` is always complete, because a figure dropped on a page
 * that defines no tokens still has to be drawn. `declaredColors` is the smaller, deliberate list —
 * what this theme claims against its page — and it is what decides whether a figure follows the
 * article it sits in or holds its own palette against it.
 */
describe("declaring versus inheriting", () => {
  it("declares nothing by default, so a figure follows its page", () => {
    expect(declaredColorRoles(defaultTheme)).toEqual([]);
    expect(defaultTheme.declaredColors).toBeUndefined();
  });

  it("declares exactly the roles an override names", () => {
    const theme = createTheme({ colors: { accent: "#ff00ff" } });

    expect(declaredColorRoles(theme)).toEqual(["accent"]);
    // The other nineteen are still painted — as fallbacks, not as claims.
    expect(theme.colors.canvas).toBe(defaultTheme.colors.canvas);
    expect(Object.keys(theme.colors)).toHaveLength(Object.keys(defaultTheme.colors).length);
  });

  it("does not declare a role just because a non-colour token moved", () => {
    expect(declaredColorRoles(createTheme({ radii: { lg: 4 } }))).toEqual([]);
  });

  it("accumulates claims when themes are layered", () => {
    const base = createTheme({ colors: { accent: "#ff00ff" } });
    const layered = createTheme({ colors: { canvas: "#000000" } }, base);

    // Order is the default theme's, so the same claims always serialise the same way.
    expect(declaredColorRoles(layered)).toEqual(["canvas", "accent"]);
  });

  it("can claim a role whose literal it is happy to inherit from the base", () => {
    const theme = createTheme({ declareColors: ["surface"] });

    expect(declaredColorRoles(theme)).toEqual(["surface"]);
    expect(theme.colors.surface).toBe(defaultTheme.colors.surface);
  });

  it("claims the whole palette on request", () => {
    expect(declaredColorRoles(createTheme({ declareColors: "all" }))).toEqual(
      Object.keys(defaultTheme.colors),
    );
    expect(declaredColorRoles(overrideTheme(defaultTheme))).toEqual(
      Object.keys(defaultTheme.colors),
    );
  });

  it("lets an author write inheritance down rather than express it by omission", () => {
    const declared = createTheme({ colors: { accent: "#ff00ff" } });
    const following = inheritTheme(declared);

    expect(declaredColorRoles(following)).toEqual([]);
    // The palette survives: it is what draws the figure where the page supplies nothing.
    expect(following.colors.accent).toBe("#ff00ff");
    expect(inheritTheme(defaultTheme)).toBe(defaultTheme);
  });

  it("keeps its claims through a font swap", () => {
    const theme = withFontFamily(createTheme({ colors: { accent: "#ff00ff" } }), "Iowan Old Style");

    expect(declaredColorRoles(theme)).toEqual(["accent"]);
    expect(theme.typography.body.family).toBe("Iowan Old Style");
  });
});
