import {
  alphaGradient,
  backdrop,
  createTheme,
  cubicBezier,
  figure,
  innerShadow,
  linearGradient,
  material,
  noise,
  shader,
  shadow,
  type SceneDefinition,
  type ThemeTokens,
} from "@kineglyph/core";
import { area, dot, line, plot, range } from "@kineglyph/plot";

const timings = [
  { pass: 0, latency: 18 },
  { pass: 1, latency: 27 },
  { pass: 2, latency: 43 },
  { pass: 3, latency: 58 },
  { pass: 4, latency: 66 },
  { pass: 5, latency: 62 },
  { pass: 6, latency: 67 },
];

const arrive = cubicBezier(0.16, 1, 0.3, 1);

/** One semantic composition deliberately rendered by several unrelated visual systems. */
export const materialDirectionsScene: SceneDefinition = figure(
  "material-directions",
  {
    title: "One scene, several material systems",
    description:
      "An illustrative latency trace and three information surfaces use semantic material roles rather than one fixed visual treatment.",
    metadata: { data: "illustrative", family: "materials", composition: "theme-comparison" },
    background: "canvas",
    breakpoints: { wide: 700, compact: 480 },
  },
  (f) => {
    const trend = f.add(
      plot(timings, {
        id: "material-trend",
        x: "pass",
        y: "latency",
        marks: [
          area({
            fill: alphaGradient("chart1", { from: 0.42, to: 0.015, angle: 90 }),
            fillOpacity: 1,
            curve: "monotone",
          }),
          line({ tone: "chart1", curve: "monotone" }),
          dot({ tone: "chart1", pointRadius: 3 }),
        ],
        annotations: [range({ y: [56, 70], tone: "success" })],
        axes: {
          x: { label: "Render pass", nice: false, ticks: { wide: 7, compact: 5, narrow: 4 } },
          y: { label: "Frame time (ms)", domain: [0, 80], nice: false },
        },
        grid: "y",
        legend: false,
        height: { wide: 230, compact: 210, narrow: 180 },
        duration: 1_150,
        easing: arrive,
      }),
    );

    const chart = f.stack([trend], {
      id: "chart-surface",
      width: "fill",
      grow: 1,
      padding: { wide: [20, 22], compact: 18, narrow: [16, 14] },
      frame: material("raised"),
    });

    const live = f.stack(
      [
        f.eyebrow("LIVE", { tone: "accent", id: "live-label" }),
        f.title("67 ms", { id: "live-value" }),
        f.caption("Current resolved frame", { id: "live-caption" }),
      ],
      {
        id: "live-surface",
        padding: [16, 18],
        gap: 4,
        frame: material("glass"),
      },
    );

    const exports = f.stack(
      [
        f.eyebrow("OUTPUT", { id: "output-label" }),
        f.heading("SVG · PNG · GIF", { id: "output-value" }),
        f.caption("One resolved scene", { id: "output-caption" }),
      ],
      {
        id: "output-surface",
        padding: [14, 18],
        gap: 3,
        frame: material("inset"),
      },
    );

    const state = f.stack(
      [
        f.eyebrow("STATE", { id: "state-label" }),
        f.heading("Seekable", { id: "state-value" }),
        f.caption("Deterministic at every time", { id: "state-caption" }),
      ],
      {
        id: "state-surface",
        padding: [14, 18],
        gap: 3,
        frame: material("floating"),
      },
    );

    const details = f.stack([live, exports, state], {
      id: "material-details",
      width: { wide: 230, compact: "fill" },
      gap: 12,
    });
    const content = f.flow([chart, details], {
      id: "material-content",
      width: "fill",
      align: "stretch",
      gap: { wide: 16, compact: 14 },
    });
    const heading = f.stack(
      [
        f.eyebrow("MATERIAL STUDY", { tone: "accent", id: "material-label" }),
        f.title("Same structure. Different physics.", { id: "material-title" }),
        f.caption("Paint, elevation and effects come from the theme.", {
          id: "material-caption",
        }),
      ],
      { id: "material-heading", gap: 4 },
    );
    const root = f.stack([heading, content], {
      id: "material-canvas",
      width: "fill",
      gap: { wide: 18, compact: 16 },
      padding: { wide: 24, compact: 20, narrow: [18, 16] },
      frame: material("flat", {
        fill: linearGradient(
          [
            { at: 0, color: "surface" },
            { at: 1, color: "canvas" },
          ],
          { angle: 125 },
        ),
      }),
    });
    f.root(root);
    f.sequence(
      [
        f.reveal(heading, { offset: 8, easing: arrive }),
        f.reveal(chart),
        f.reveal([live, exports, state], { stagger: 100, scale: 0.97, easing: arrive }),
      ],
      { gap: 80 },
    );
  },
);

export type MaterialDirection = "paper" | "glass" | "terminal" | "publication";

export const materialDirectionThemes: Readonly<Record<MaterialDirection, ThemeTokens>> = {
  paper: createTheme({
    name: "material-paper",
    colors: {
      canvas: "#ede8dd",
      surface: "#f6f0e4",
      surfaceRaised: "#fffaf0",
      surfaceMuted: "#e5ddcf",
      text: "#2a2923",
      textMuted: "#716d62",
      accent: "#a16f93",
      accentContrast: "#fffaf0",
      info: "#789fc0",
      success: "#739d7d",
      warning: "#c39a55",
      danger: "#c77d77",
      connector: "#9c978a",
      border: "#d0c7b7",
      chart1: "#6fae9e",
      chart2: "#9386b8",
      chart3: "#d18a73",
      chart4: "#c8aa60",
      chart5: "#c78496",
      chart6: "#7f9eba",
      chartPositive: "#739d7d",
      chartNegative: "#c77d77",
      chartNeutral: "#9c978a",
    },
    radii: { sm: 7, md: 12, lg: 18 },
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
      caption: {
        family: '"Geist Mono", ui-monospace, monospace',
        size: 12,
        lineHeight: 17,
        weight: 450,
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
      },
      display: {
        family: '"Geist Mono", ui-monospace, monospace',
        size: 36,
        lineHeight: 40,
        weight: 700,
      },
      code: {
        family: '"Geist Mono", ui-monospace, monospace',
        size: 13,
        lineHeight: 18,
        weight: 500,
      },
    },
    materials: {
      flat: { fill: "surface" },
      raised: {
        fill: "surfaceRaised",
        stroke: "border",
        effects: [
          shadow({ color: "text", opacity: 0.14, blur: 24, spread: 1, offset: [0, 10] }),
          noise({ amount: 0.015, scale: 0.9, seed: 31 }),
        ],
      },
      floating: {
        fill: "surfaceRaised",
        stroke: "border",
        effects: [shadow({ color: "text", opacity: 0.17, blur: 30, offset: [0, 14] })],
      },
      inset: {
        fill: "surfaceMuted",
        stroke: "border",
        effects: [innerShadow({ color: "text", opacity: 0.09, blur: 7, offset: [0, 2] })],
      },
      glass: {
        fill: linearGradient(
          [
            { at: 0, color: "surfaceRaised", opacity: 0.82 },
            { at: 1, color: "surface", opacity: 0.52 },
          ],
          { angle: 125 },
        ),
        stroke: "border",
        effects: [
          backdrop({ blur: 12, saturation: 1.08 }),
          noise({ amount: 0.012, seed: 17 }),
          shadow({ color: "text", opacity: 0.1, blur: 20, offset: [0, 8] }),
        ],
      },
    },
  }),
  glass: createTheme({
    name: "material-glass",
    colors: {
      canvas: "#111528",
      surface: "#19203a",
      surfaceRaised: "#283253",
      surfaceMuted: "#141a31",
      text: "#f2f5ff",
      textMuted: "#aab2cf",
      accent: "#8ae8ff",
      accentContrast: "#101426",
      info: "#82a8ff",
      success: "#7ce8bd",
      warning: "#ffd58a",
      danger: "#ff91ad",
      connector: "#8090bd",
      border: "#66739d",
      chart1: "#83e2f5",
      chart2: "#a996ff",
      chart3: "#ff9fbd",
      chart4: "#ffdc89",
      chart5: "#80efc5",
      chart6: "#77a9ff",
      chartPositive: "#7ce8bd",
      chartNegative: "#ff91ad",
      chartNeutral: "#8090bd",
    },
    radii: { sm: 10, md: 18, lg: 26 },
    materials: {
      flat: {
        fill: linearGradient(
          [
            { at: 0, color: "surface" },
            { at: 1, color: "canvas" },
          ],
          { angle: 135 },
        ),
      },
      raised: {
        fill: linearGradient(
          [
            { at: 0, color: "surfaceRaised", opacity: 0.72 },
            { at: 1, color: "surface", opacity: 0.44 },
          ],
          { angle: 118 },
        ),
        stroke: "border",
        effects: [
          backdrop({ blur: 22, saturation: 1.2 }),
          shader("iridescence", {
            uniforms: { strength: 0.16 },
            fallback: [noise({ amount: 0.055, scale: 0.38, seed: 29, monochrome: false })],
          }),
          shadow({ color: "canvas", opacity: 0.5, blur: 34, offset: [0, 16] }),
        ],
      },
      floating: {
        fill: linearGradient(
          [
            { at: 0, color: "chart2", opacity: 0.38 },
            { at: 1, color: "surface", opacity: 0.42 },
          ],
          { angle: 145 },
        ),
        stroke: "chart2",
        effects: [
          backdrop({ blur: 26, saturation: 1.24 }),
          shader("liquid", {
            uniforms: { strength: 2.5, frequency: 0.016, seed: 23 },
          }),
          shadow({ color: "canvas", opacity: 0.6, blur: 36, offset: [0, 18] }),
        ],
      },
      inset: {
        fill: "surfaceMuted",
        stroke: "border",
        effects: [innerShadow({ color: "canvas", opacity: 0.45, blur: 12, offset: [0, 4] })],
      },
      glass: {
        fill: linearGradient(
          [
            { at: 0, color: "accent", opacity: 0.24 },
            { at: 1, color: "surfaceRaised", opacity: 0.34 },
          ],
          { angle: 125 },
        ),
        stroke: "accent",
        effects: [
          backdrop({ blur: 28, saturation: 1.3, brightness: 1.06 }),
          shader("frosted-glass", {
            uniforms: { refraction: 0.08, grain: 0.024 },
            fallback: [noise({ amount: 0.026, scale: 0.55, seed: 17 })],
          }),
          shadow({ color: "canvas", opacity: 0.55, blur: 38, offset: [0, 18] }),
        ],
      },
    },
  }),
  terminal: createTheme({
    name: "material-terminal",
    colors: {
      canvas: "#080b09",
      surface: "#0c110e",
      surfaceRaised: "#101712",
      surfaceMuted: "#090e0b",
      text: "#d8ffe6",
      textMuted: "#78a887",
      accent: "#48e681",
      accentContrast: "#071009",
      info: "#58c7ff",
      success: "#48e681",
      warning: "#d7d969",
      danger: "#ff697c",
      connector: "#3e7952",
      border: "#275238",
      chart1: "#48e681",
      chart2: "#58c7ff",
      chart3: "#d7d969",
      chart4: "#c982ff",
      chart5: "#ff697c",
      chart6: "#86a5ff",
      chartPositive: "#48e681",
      chartNegative: "#ff697c",
      chartNeutral: "#78a887",
    },
    radii: { sm: 0, md: 0, lg: 0, pill: 0 },
    strokes: { hairline: 1, thin: 1, regular: 1.5, bold: 2 },
    ornament: { grid: "lines", surface: "outlined", lineCap: "square", eyebrow: true },
    materials: {
      flat: { fill: "canvas", stroke: "border" },
      raised: { fill: "surface", stroke: "border", effects: [] },
      floating: { fill: "surfaceRaised", stroke: "accent", effects: [] },
      inset: { fill: "surfaceMuted", stroke: "border", effects: [] },
      glass: { fill: "surface", stroke: "accent", effects: [] },
    },
  }),
  publication: createTheme({
    name: "material-publication",
    colors: {
      canvas: "#f5efdf",
      surface: "#fff9e9",
      surfaceRaised: "#fffdf4",
      surfaceMuted: "#f1dfb8",
      text: "#191815",
      textMuted: "#625e55",
      accent: "#f04f35",
      accentContrast: "#fffdf4",
      info: "#225de6",
      success: "#1e8f66",
      warning: "#e0a51b",
      danger: "#d92d3d",
      connector: "#191815",
      border: "#191815",
      chart1: "#225de6",
      chart2: "#f04f35",
      chart3: "#e0a51b",
      chart4: "#1e8f66",
      chart5: "#c24ba5",
      chart6: "#5748c7",
      chartPositive: "#1e8f66",
      chartNegative: "#d92d3d",
      chartNeutral: "#625e55",
    },
    radii: { sm: 2, md: 3, lg: 4 },
    strokes: { hairline: 1.5, thin: 2, regular: 2.5, bold: 4 },
    materials: {
      flat: { fill: "surface" },
      raised: {
        fill: "surfaceRaised",
        stroke: "border",
        strokeWidth: 2,
        effects: [shadow({ color: "text", opacity: 1, blur: 0, offset: [7, 7] })],
      },
      floating: {
        fill: "warning",
        stroke: "border",
        strokeWidth: 2,
        effects: [shadow({ color: "text", opacity: 1, blur: 0, offset: [6, 6] })],
      },
      inset: {
        fill: "surfaceMuted",
        stroke: "border",
        strokeWidth: 2,
        effects: [],
      },
      glass: {
        fill: "accent",
        stroke: "border",
        strokeWidth: 2,
        blendMode: "multiply",
        effects: [shadow({ color: "text", opacity: 1, blur: 0, offset: [5, 5] })],
      },
    },
  }),
};
