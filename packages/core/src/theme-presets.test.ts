import { describe, expect, it } from "vitest";
import { figure } from "./figure.js";
import { material } from "./material.js";
import { resolveScene } from "./resolve.js";
import { declaredColorRoles, defaultTheme } from "./theme.js";
import {
  editorialCircuitTheme,
  glyphStyleThemes,
  integrationTheme,
  instrumentTheme,
  kineglyphTheme,
  professionalThemes,
  signalTheme,
} from "./theme-presets.js";

const specimen = figure("theme-specimen", { title: "Release review" }, (f) => {
  const cards = [
    f.card({ title: "Scope", body: "12 accepted changes", frame: material("raised") }),
    f.card({ title: "Checks", body: "48 of 48 passing", frame: material("raised") }),
    f.card({ title: "Decision", body: "Ready to publish", frame: material("floating") }),
  ];
  f.root(
    f.stack([f.heading("Release review"), f.flow(cards, { width: "fill", gap: 12 })], {
      width: "fill",
      padding: 18,
      gap: 18,
      frame: material("flat"),
    }),
  );
});

describe("professional theme presets", () => {
  it("exposes the animated wordmark direction as the Kineglyph theme", () => {
    expect(kineglyphTheme.name).toBe("kineglyph");
    expect(kineglyphTheme.colors.canvas).toBe("#efede6");
    expect(kineglyphTheme.colors.accent).toBe("#008f7a");
    expect(kineglyphTheme.ornament.surface).toBe("flat");
  });

  it("keeps every direction flat, fully scoped, and free of visual effects", () => {
    const allRoles = Object.keys(defaultTheme.colors);
    for (const theme of Object.values(professionalThemes)) {
      expect(declaredColorRoles(theme)).toHaveLength(allRoles.length);
      expect(theme.ornament.surface).not.toBe("glow");
      for (const material of Object.values(theme.materials))
        expect(material.effects ?? []).toEqual([]);
    }
  });

  it("gives every preset a distinct visual-system signature", () => {
    const signatures = Object.values(professionalThemes).map((theme) =>
      JSON.stringify({
        canvas: theme.colors.canvas,
        accent: theme.colors.accent,
        family: theme.typography.body.family,
        radius: theme.radii.lg,
        stroke: theme.strokes.regular,
        ornament: theme.ornament,
      }),
    );
    expect(new Set(signatures).size).toBe(signatures.length);
  });

  it("resolves the same responsive specimen under every preset", () => {
    for (const [name, theme] of Object.entries(professionalThemes)) {
      for (const width of [960, 390]) {
        const scene = resolveScene(specimen, { width, theme });
        const layoutProblems = (scene.diagnostics ?? []).filter((entry) =>
          ["overlap", "overflow", "text-truncated", "label-collision"].includes(entry.code),
        );
        expect(layoutProblems, `${name} at ${width}px`).toEqual([]);
      }
    }
  });
});

describe("glyph style themes", () => {
  it("keeps signal and integration flat while instrument remains physically layered", () => {
    expect(signalTheme.name).toBe("signal");
    expect(integrationTheme.name).toBe("integration");
    expect(instrumentTheme.name).toBe("instrument");
    expect(Object.keys(glyphStyleThemes)).toEqual(["signal", "integration", "instrument"]);
    for (const theme of [signalTheme, integrationTheme])
      for (const material of Object.values(theme.materials))
        expect(material.effects ?? []).toEqual([]);
    expect(integrationTheme.materials.floating.fill).toMatchObject({ type: "linear-gradient" });
    expect(
      instrumentTheme.materials.raised.effects?.some((effect) => effect.type === "shadow"),
    ).toBe(true);
    expect(instrumentTheme.materials.floating.effects).toHaveLength(3);
  });

  it("resolves the same semantic specimen in every direction", () => {
    for (const [name, theme] of Object.entries(glyphStyleThemes)) {
      for (const width of [960, 390]) {
        const scene = resolveScene(specimen, { width, theme });
        const problems = (scene.diagnostics ?? []).filter((entry) =>
          ["overlap", "overflow", "text-truncated", "label-collision"].includes(entry.code),
        );
        expect(problems, `${name} at ${width}px`).toEqual([]);
      }
    }
  });
});

describe("editorial circuit theme", () => {
  it("combines counter colour with restrained physical hierarchy and no coloured glow", () => {
    expect(editorialCircuitTheme.name).toBe("editorial-circuit");
    expect(editorialCircuitTheme.typography.display.family).toContain("ui-monospace");
    expect(editorialCircuitTheme.ornament.surface).toBe("outlined");
    expect(
      editorialCircuitTheme.materials.raised.effects?.some((effect) => effect.type === "shadow"),
    ).toBe(true);
    for (const material of Object.values(editorialCircuitTheme.materials))
      for (const effect of material.effects ?? [])
        if (effect.type === "shadow") expect(effect.color).not.toBe("accent");
  });
});
