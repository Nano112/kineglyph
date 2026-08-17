import { describe, expect, it } from "vitest";
import { defaultTheme, withFontFamily } from "./theme.js";
import { measureText } from "./text.js";

describe("withFontFamily", () => {
  it("re-fonts every prose style and leaves code monospaced", () => {
    const themed = withFontFamily(defaultTheme, "Figtree, sans-serif");

    expect(themed.typography.body.family).toBe("Figtree, sans-serif");
    expect(themed.typography.title.family).toBe("Figtree, sans-serif");
    expect(themed.typography.label.family).toBe("Figtree, sans-serif");
    // A code run in a proportional face is a different illustration.
    expect(themed.typography.code.family).toBe(defaultTheme.typography.code.family);
  });

  it("takes an explicit mono stack when the host has one", () => {
    expect(
      withFontFamily(defaultTheme, "Figtree", "Berkeley Mono, monospace").typography.code.family,
    ).toBe("Berkeley Mono, monospace");
  });

  it("changes nothing but the family", () => {
    const themed = withFontFamily(defaultTheme, "Figtree, sans-serif");

    expect(themed.colors).toEqual(defaultTheme.colors);
    expect(themed.radii).toEqual(defaultTheme.radii);
    expect(themed.typography.body.size).toBe(defaultTheme.typography.body.size);
    expect(themed.typography.body.lineHeight).toBe(defaultTheme.typography.body.lineHeight);
  });

  it("keeps measurement family-independent, which is what makes textLength safe", () => {
    // Metrics are per-glyph class estimates biased slightly wide, not the family's real advances.
    // Re-fonting therefore cannot desynchronise a text run from the box measured for it: the box
    // is the same box, and `textLength` holds the run inside it.
    const before = defaultTheme.typography.body;
    const after = withFontFamily(defaultTheme, "Figtree, sans-serif").typography.body;

    expect(measureText("Signed distance field", after)).toBe(
      measureText("Signed distance field", before),
    );
  });
});
