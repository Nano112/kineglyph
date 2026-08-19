import { createTheme, defaultTheme, type ThemeOverride, type ThemeTokens } from "./theme.js";

/**
 * Flat material roles shared by the professional presets.
 *
 * These themes get their character from proportion, type, colour, and line—not bloom, glass,
 * shader effects, or decorative blur. The `glass` role remains usable, but resolves to an honest
 * outlined surface so switching a scene to one of these presets never introduces an effect.
 */
const FLAT_MATERIALS: NonNullable<ThemeOverride["materials"]> = {
  flat: { fill: "canvas" },
  raised: { fill: "surfaceRaised", stroke: "border" },
  floating: { fill: "surfaceRaised", stroke: "accent", strokeWidth: 2 },
  inset: { fill: "surfaceMuted", stroke: "border" },
  glass: { fill: "surface", stroke: "border" },
};

interface TypeDirection {
  readonly family: string;
  readonly code?: string;
  readonly displaySize?: number;
  readonly displayWeight?: number;
  readonly titleWeight?: number;
  readonly bodySize?: number;
  readonly labelSpacing?: number;
}

function typeDirection(direction: TypeDirection): NonNullable<ThemeOverride["typography"]> {
  const family = direction.family;
  const code = direction.code ?? defaultTheme.typography.code.family;
  const bodySize = direction.bodySize ?? 15;
  return {
    label: {
      ...defaultTheme.typography.label,
      family,
      size: 11,
      weight: 700,
      letterSpacing: direction.labelSpacing ?? 0.8,
    },
    caption: { ...defaultTheme.typography.caption, family, size: 12, lineHeight: 17 },
    body: { ...defaultTheme.typography.body, family, size: bodySize, lineHeight: bodySize + 7 },
    bodyStrong: {
      ...defaultTheme.typography.bodyStrong,
      family,
      size: bodySize,
      lineHeight: bodySize + 7,
    },
    title: {
      ...defaultTheme.typography.title,
      family,
      size: 23,
      lineHeight: 29,
      weight: direction.titleWeight ?? 700,
    },
    display: {
      ...defaultTheme.typography.display,
      family,
      size: direction.displaySize ?? 42,
      lineHeight: (direction.displaySize ?? 42) + 5,
      weight: direction.displayWeight ?? 750,
    },
    code: { ...defaultTheme.typography.code, family: code, size: 13, lineHeight: 18 },
  };
}

function professionalTheme(override: ThemeOverride): ThemeTokens {
  return createTheme({
    ...override,
    declareColors: "all",
    materials: { ...FLAT_MATERIALS, ...override.materials },
  });
}

/**
 * Kineglyph's own visual language: warm drawing paper, ink-black geometry, and one teal pulse.
 *
 * It comes from the animated wordmark rather than from generic application chrome. The palette is
 * deliberately broad enough for charts and state diagrams, but the accent remains scarce so a
 * moving packet or selected mark still reads as the event in the picture.
 */
export const kineglyphTheme: ThemeTokens = professionalTheme({
  name: "kineglyph",
  colors: {
    canvas: "#efede6",
    surface: "#f7f5ee",
    surfaceRaised: "#fffdf6",
    surfaceMuted: "#e4e1d8",
    text: "#171916",
    textMuted: "#676a64",
    accent: "#008f7a",
    accentContrast: "#f7f5ee",
    info: "#316c7a",
    success: "#34705b",
    warning: "#9b6a20",
    danger: "#a8423e",
    connector: "#252824",
    border: "#bdbbb3",
    chart1: "#008f7a",
    chart2: "#316c7a",
    chart3: "#b07a25",
    chart4: "#6b5a8b",
    chart5: "#a8423e",
    chart6: "#777b74",
    chartPositive: "#34705b",
    chartNegative: "#a8423e",
    chartNeutral: "#858881",
  },
  spacing: { xs: 4, sm: 8, md: 16, lg: 24, xl: 34, "2xl": 48 },
  radii: { sm: 3, md: 6, lg: 10, pill: 9999 },
  typography: typeDirection({
    family: '"Geist Mono", "SFMono-Regular", Menlo, monospace',
    code: '"Geist Mono", "SFMono-Regular", Menlo, monospace',
    displaySize: 48,
    displayWeight: 700,
    titleWeight: 700,
    bodySize: 14,
    labelSpacing: 0.9,
  }),
  motion: { fast: 110, normal: 260, slow: 620, easing: "easeInOut" },
  strokes: { hairline: 1, thin: 1.25, regular: 1.75, bold: 3 },
  ornament: { grid: "none", surface: "flat", lineCap: "round", eyebrow: false },
});

/** International editorial graphics: hard alignment, restrained primaries, generous whitespace. */
export const swissTheme: ThemeTokens = professionalTheme({
  name: "swiss",
  colors: {
    canvas: "#f0eee8",
    surface: "#faf9f5",
    surfaceRaised: "#ffffff",
    surfaceMuted: "#e2e0da",
    text: "#151515",
    textMuted: "#5e615f",
    accent: "#d23b2d",
    accentContrast: "#ffffff",
    info: "#1958a6",
    success: "#22724d",
    warning: "#a96400",
    danger: "#b72f36",
    connector: "#272727",
    border: "#a7a7a2",
    chart1: "#1958a6",
    chart2: "#d23b2d",
    chart3: "#d1a316",
    chart4: "#22724d",
    chart5: "#7b4c8e",
    chart6: "#59616d",
    chartPositive: "#22724d",
    chartNegative: "#b72f36",
    chartNeutral: "#777b79",
  },
  spacing: { xs: 5, sm: 10, md: 18, lg: 28, xl: 40, "2xl": 60 },
  radii: { sm: 0, md: 1, lg: 2, pill: 9999 },
  typography: typeDirection({
    family: "Arial, Helvetica, sans-serif",
    displaySize: 46,
    displayWeight: 800,
    titleWeight: 750,
    labelSpacing: 1.2,
  }),
  strokes: { hairline: 1, thin: 1, regular: 2, bold: 4 },
  ornament: { grid: "none", surface: "flat", lineCap: "butt", eyebrow: true },
});

/** A financial ledger translated to the screen: warm stock, serif hierarchy, fine rules. */
export const ledgerTheme: ThemeTokens = professionalTheme({
  name: "ledger",
  colors: {
    canvas: "#e9e1d2",
    surface: "#f7f1e6",
    surfaceRaised: "#fffaf0",
    surfaceMuted: "#ded4c3",
    text: "#211e1a",
    textMuted: "#665f55",
    accent: "#713434",
    accentContrast: "#fffaf0",
    info: "#365f7d",
    success: "#436c4d",
    warning: "#94691d",
    danger: "#973f3f",
    connector: "#554f47",
    border: "#b7aa97",
    chart1: "#365f7d",
    chart2: "#713434",
    chart3: "#9a762c",
    chart4: "#436c4d",
    chart5: "#78577d",
    chart6: "#746c61",
    chartPositive: "#436c4d",
    chartNegative: "#973f3f",
    chartNeutral: "#81786c",
  },
  spacing: { xs: 3, sm: 7, md: 14, lg: 22, xl: 30, "2xl": 44 },
  radii: { sm: 0, md: 2, lg: 3, pill: 9999 },
  typography: typeDirection({
    family: '"Iowan Old Style", "Palatino Linotype", Georgia, serif',
    displaySize: 43,
    displayWeight: 650,
    titleWeight: 650,
    bodySize: 16,
    labelSpacing: 0.5,
  }),
  motion: { fast: 150, normal: 300, slow: 560, easing: "easeInOut" },
  strokes: { hairline: 0.75, thin: 1, regular: 1.25, bold: 2 },
  ornament: { grid: "none", surface: "outlined", lineCap: "butt", eyebrow: false },
});

/** A measured engineering drawing: navy ground, cyan notation, square geometry. */
export const blueprintTheme: ThemeTokens = professionalTheme({
  name: "blueprint",
  colors: {
    canvas: "#071a2b",
    surface: "#0b2236",
    surfaceRaised: "#102b42",
    surfaceMuted: "#0a1f31",
    text: "#eef7fb",
    textMuted: "#a5bdc8",
    accent: "#55b9df",
    accentContrast: "#071a2b",
    info: "#72a7ef",
    success: "#68bd9a",
    warning: "#d8b85d",
    danger: "#df7f80",
    connector: "#7daec1",
    border: "#31566a",
    chart1: "#55b9df",
    chart2: "#72a7ef",
    chart3: "#d8b85d",
    chart4: "#68bd9a",
    chart5: "#bd8cdb",
    chart6: "#94a7b4",
    chartPositive: "#68bd9a",
    chartNegative: "#df7f80",
    chartNeutral: "#7daec1",
  },
  spacing: { xs: 4, sm: 8, md: 14, lg: 20, xl: 28, "2xl": 40 },
  radii: { sm: 0, md: 0, lg: 0, pill: 0 },
  typography: typeDirection({
    family: "ui-monospace, SFMono-Regular, Menlo, monospace",
    code: "ui-monospace, SFMono-Regular, Menlo, monospace",
    displaySize: 38,
    displayWeight: 650,
    titleWeight: 600,
    bodySize: 14,
    labelSpacing: 1.1,
  }),
  motion: { fast: 100, normal: 220, slow: 420, easing: "linear" },
  strokes: { hairline: 1, thin: 1, regular: 1.5, bold: 2 },
  ornament: { grid: "lines", surface: "outlined", lineCap: "square", eyebrow: true },
});

/** Equipment manuals and field reports: compact typography, olive neutrals, safety orange. */
export const fieldManualTheme: ThemeTokens = professionalTheme({
  name: "field-manual",
  colors: {
    canvas: "#ddd4bf",
    surface: "#ebe3cf",
    surfaceRaised: "#f4ecd8",
    surfaceMuted: "#cfc4aa",
    text: "#24271f",
    textMuted: "#606456",
    accent: "#b64d25",
    accentContrast: "#1d211a",
    info: "#38627a",
    success: "#4e704a",
    warning: "#9b6c14",
    danger: "#9f3d32",
    connector: "#435044",
    border: "#858573",
    chart1: "#38627a",
    chart2: "#b64d25",
    chart3: "#9b6c14",
    chart4: "#4e704a",
    chart5: "#76556d",
    chart6: "#666b5d",
    chartPositive: "#4e704a",
    chartNegative: "#9f3d32",
    chartNeutral: "#747769",
  },
  spacing: { xs: 4, sm: 6, md: 12, lg: 18, xl: 24, "2xl": 36 },
  radii: { sm: 1, md: 2, lg: 3, pill: 3 },
  typography: typeDirection({
    family: '"Arial Narrow", "Roboto Condensed", Arial, sans-serif',
    displaySize: 40,
    displayWeight: 800,
    titleWeight: 750,
    bodySize: 14,
    labelSpacing: 1.3,
  }),
  motion: { fast: 90, normal: 180, slow: 360, easing: "easeOut" },
  strokes: { hairline: 1, thin: 1.25, regular: 2, bold: 3 },
  ornament: { grid: "none", surface: "outlined", lineCap: "square", eyebrow: true },
});

/** Contemporary product graphics: cool neutrals, decisive blue, softened but restrained corners. */
export const studioTheme: ThemeTokens = professionalTheme({
  name: "studio",
  colors: {
    canvas: "#f1f3f7",
    surface: "#f8f9fb",
    surfaceRaised: "#ffffff",
    surfaceMuted: "#e5e8ef",
    text: "#111827",
    textMuted: "#667085",
    accent: "#2847cf",
    accentContrast: "#ffffff",
    info: "#0877a8",
    success: "#187b56",
    warning: "#a85f00",
    danger: "#bf354c",
    connector: "#667085",
    border: "#cbd0dc",
    chart1: "#2847cf",
    chart2: "#0877a8",
    chart3: "#a85f00",
    chart4: "#187b56",
    chart5: "#a53d79",
    chart6: "#6652b8",
    chartPositive: "#187b56",
    chartNegative: "#bf354c",
    chartNeutral: "#87909f",
  },
  spacing: { xs: 4, sm: 8, md: 16, lg: 24, xl: 36, "2xl": 52 },
  radii: { sm: 6, md: 10, lg: 16, pill: 9999 },
  typography: typeDirection({
    family: '"Avenir Next", Inter, system-ui, sans-serif',
    displaySize: 44,
    displayWeight: 700,
    titleWeight: 650,
    bodySize: 15,
    labelSpacing: 0.35,
  }),
  motion: { fast: 120, normal: 240, slow: 480, easing: "easeOut" },
  strokes: { hairline: 1, thin: 1, regular: 1.5, bold: 2.5 },
  ornament: { grid: "none", surface: "flat", lineCap: "round", eyebrow: false },
});

/** Public-information graphics: generous type, strong blue/yellow hierarchy, durable contrast. */
export const civicTheme: ThemeTokens = professionalTheme({
  name: "civic",
  colors: {
    canvas: "#f4f2eb",
    surface: "#fbfaf6",
    surfaceRaised: "#ffffff",
    surfaceMuted: "#e2e5e8",
    text: "#14213d",
    textMuted: "#536079",
    accent: "#075ac8",
    accentContrast: "#ffffff",
    info: "#075ac8",
    success: "#26734d",
    warning: "#bd8300",
    danger: "#b72d3b",
    connector: "#34445f",
    border: "#9ba5b5",
    chart1: "#075ac8",
    chart2: "#d3a300",
    chart3: "#26734d",
    chart4: "#b72d3b",
    chart5: "#654ea3",
    chart6: "#4d6f87",
    chartPositive: "#26734d",
    chartNegative: "#b72d3b",
    chartNeutral: "#748094",
  },
  spacing: { xs: 4, sm: 10, md: 18, lg: 28, xl: 40, "2xl": 56 },
  radii: { sm: 3, md: 6, lg: 8, pill: 9999 },
  typography: typeDirection({
    family: '"Atkinson Hyperlegible", Verdana, system-ui, sans-serif',
    displaySize: 42,
    displayWeight: 700,
    titleWeight: 700,
    bodySize: 16,
    labelSpacing: 0.55,
  }),
  motion: { fast: 130, normal: 260, slow: 500, easing: "easeInOut" },
  strokes: { hairline: 1.25, thin: 1.5, regular: 2.25, bold: 3.5 },
  ornament: { grid: "none", surface: "outlined", lineCap: "round", eyebrow: true },
});

export type ProfessionalThemeName =
  "kineglyph" | "swiss" | "ledger" | "blueprint" | "fieldManual" | "studio" | "civic";

/** Curated presets for documentation galleries, product explainers, and exported figures. */
export const professionalThemes: Readonly<Record<ProfessionalThemeName, ThemeTokens>> = {
  kineglyph: kineglyphTheme,
  swiss: swissTheme,
  ledger: ledgerTheme,
  blueprint: blueprintTheme,
  fieldManual: fieldManualTheme,
  studio: studioTheme,
  civic: civicTheme,
};
