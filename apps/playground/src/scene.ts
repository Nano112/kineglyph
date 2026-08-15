import { createTheme, definePipeline, type ThemeTokens } from "@kineglyph/core";

export type ThemeName = "nucleation" | "pock" | "schematio";

export const themes: Readonly<Record<ThemeName, ThemeTokens>> = {
  nucleation: createTheme({
    colors: {
      canvas: "#0e1014",
      surface: "#161a21",
      surfaceRaised: "#1b2029",
      text: "#e4e7ec",
      textMuted: "#8a93a3",
      accent: "#5fd1bc",
      accentContrast: "#0e1014",
      success: "#72dec9",
      warning: "#f2cd87",
      danger: "#ff9b9b",
      connector: "#5fd1bc",
      border: "#333a47",
    },
    radii: { lg: 10, md: 6 },
    typography: {
      body: {
        family: '"Geist Mono", ui-monospace, monospace',
        size: 14,
        lineHeight: 21,
        weight: 450,
      },
      bodyStrong: {
        family: '"Geist Mono", ui-monospace, monospace',
        size: 15,
        lineHeight: 21,
        weight: 650,
      },
      label: {
        family: '"Geist Mono", ui-monospace, monospace',
        size: 11,
        lineHeight: 15,
        weight: 650,
        letterSpacing: 0.7,
      },
      title: {
        family: '"Geist Mono", ui-monospace, monospace',
        size: 22,
        lineHeight: 27,
        weight: 650,
        letterSpacing: -0.4,
      },
    },
    motion: { fast: 140, normal: 280, slow: 620 },
  }),
  pock: createTheme({
    colors: {
      canvas: "#060606",
      surface: "#0d0d0d",
      surfaceRaised: "#111612",
      text: "#e6fff5",
      textMuted: "#83a397",
      accent: "#10b981",
      accentContrast: "#04120c",
      success: "#34d399",
      warning: "#fbbf24",
      danger: "#fb7185",
      connector: "#34d399",
      border: "#1b3329",
    },
    radii: { lg: 18, md: 12 },
    typography: {
      body: {
        family: '"Space Grotesk", system-ui, sans-serif',
        size: 15,
        lineHeight: 22,
        weight: 450,
      },
      bodyStrong: {
        family: '"Space Grotesk", system-ui, sans-serif',
        size: 16,
        lineHeight: 22,
        weight: 650,
      },
      label: {
        family: '"JetBrains Mono", ui-monospace, monospace',
        size: 10,
        lineHeight: 14,
        weight: 650,
        letterSpacing: 1,
      },
      title: {
        family: '"Space Grotesk", system-ui, sans-serif',
        size: 24,
        lineHeight: 29,
        weight: 650,
        letterSpacing: -0.5,
      },
    },
    motion: { fast: 120, normal: 260, slow: 560 },
  }),
  schematio: createTheme({
    colors: {
      canvas: "#202126",
      surface: "#2d2d2d",
      surfaceRaised: "#383a42",
      text: "#f7f8f8",
      textMuted: "#b6b9c3",
      accent: "#db45f0",
      accentContrast: "#ffffff",
      success: "#a3f322",
      warning: "#ffba00",
      danger: "#ff647e",
      connector: "#e978fa",
      border: "#4a4d5a",
    },
    radii: { lg: 22, md: 14 },
    typography: {
      body: { family: '"Figtree", system-ui, sans-serif', size: 15, lineHeight: 22, weight: 450 },
      bodyStrong: {
        family: '"Figtree", system-ui, sans-serif',
        size: 16,
        lineHeight: 22,
        weight: 650,
      },
      label: {
        family: '"Figtree", system-ui, sans-serif',
        size: 11,
        lineHeight: 15,
        weight: 700,
        letterSpacing: 0.75,
      },
      title: {
        family: '"Figtree", system-ui, sans-serif',
        size: 25,
        lineHeight: 30,
        weight: 700,
        letterSpacing: -0.5,
      },
    },
    motion: { fast: 150, normal: 300, slow: 650 },
  }),
};

const opacityTrack = (target: string, start: number, end: number) => ({
  id: `${target}-opacity`,
  target,
  property: "opacity" as const,
  keyframes: [
    { time: 0, value: 0 },
    { time: start, value: 0 },
    { time: end, value: 1, easing: "easeOut" as const },
  ],
});

const scaleTrack = (target: string, start: number, end: number) => ({
  id: `${target}-scale`,
  target,
  property: "scale" as const,
  keyframes: [
    { time: 0, value: 0.94 },
    { time: start, value: 0.94 },
    { time: end, value: 1, easing: "easeOut" as const },
  ],
});

const edgeTracks = (target: string, start: number, end: number) => [
  opacityTrack(target, start, start + 1),
  {
    id: `${target}-reveal`,
    target,
    property: "edgeReveal" as const,
    keyframes: [
      { time: 0, value: 0 },
      { time: start, value: 0 },
      { time: end, value: 1, easing: "easeInOut" as const },
    ],
  },
];

export const sdfPipeline = definePipeline({
  id: "nucleation-sdf-pipeline",
  title: "From field to schematic",
  description:
    "A scalar field becomes a signed-distance graph, a bounded solid, then a block schematic.",
  nodes: [
    {
      id: "scalar-field",
      label: "Scalar field",
      description: "Sample a continuous value at every point in space.",
      tone: "accent",
      interactive: true,
      metadata: { order: 1, motif: "field", expression: "f(p) → ℝ" },
    },
    {
      id: "sdf-graph",
      label: "SDF graph",
      description: "Compose primitives and operations into one distance function.",
      tone: "accent",
      interactive: true,
      metadata: { order: 2, motif: "graph", expression: "min(a, b)" },
    },
    {
      id: "bounded-shape",
      label: "Bounded shape",
      description: "The zero crossing separates filled space from empty space.",
      tone: "success",
      interactive: true,
      metadata: { order: 3, motif: "boundary", expression: "d(p) ≤ 0" },
    },
    {
      id: "schematic",
      label: "Schematic",
      description: "Sample the solid onto the Minecraft lattice and assign blocks.",
      tone: "warning",
      interactive: true,
      metadata: { order: 4, motif: "blocks", expression: "p → block" },
    },
  ],
  edges: [
    { id: "field-to-graph", from: "scalar-field", to: "sdf-graph" },
    { id: "graph-to-shape", from: "sdf-graph", to: "bounded-shape" },
    { id: "shape-to-blocks", from: "bounded-shape", to: "schematic" },
  ],
  timeline: {
    duration: 5_200,
    tracks: [
      opacityTrack("scalar-field", 100, 650),
      scaleTrack("scalar-field", 100, 650),
      ...edgeTracks("field-to-graph", 720, 1_300),
      opacityTrack("sdf-graph", 1_050, 1_650),
      scaleTrack("sdf-graph", 1_050, 1_650),
      ...edgeTracks("graph-to-shape", 1_780, 2_360),
      opacityTrack("bounded-shape", 2_080, 2_700),
      scaleTrack("bounded-shape", 2_080, 2_700),
      ...edgeTracks("shape-to-blocks", 2_820, 3_420),
      opacityTrack("schematic", 3_150, 3_820),
      scaleTrack("schematic", 3_150, 3_820),
      {
        id: "schematic-settle",
        target: "schematic",
        property: "progress",
        keyframes: [
          { time: 0, value: 0 },
          { time: 3_400, value: 0 },
          { time: 5_200, value: 1, easing: "easeOut" },
        ],
      },
    ],
  },
});

export const themeCopy: Readonly<Record<ThemeName, { label: string; note: string }>> = {
  nucleation: { label: "Nucleation", note: "Basalt / Vellum · precise, mineral, monospaced" },
  pock: { label: "Pock", note: "Black / emerald · secure, luminous, kinetic" },
  schematio: { label: "Schematio", note: "Graphite / fuchsia · soft, spatial, product-led" },
};
