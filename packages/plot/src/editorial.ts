import { createTheme, type ThemeTokens } from "@kineglyph/core";

/**
 * A ready-to-use dark publication theme for data stories. It deliberately uses a portable serif
 * stack; pin the chosen face in an export preset when pixel-identical output matters.
 */
export const editorialDarkTheme: ThemeTokens = createTheme({
  name: "editorial-dark",
  colors: {
    canvas: "#000000",
    surface: "#050305",
    surfaceRaised: "#0b0709",
    surfaceMuted: "#181116",
    text: "#f7f3f5",
    textMuted: "#b9b2b6",
    accent: "#ff6f98",
    accentContrast: "#180009",
    info: "#ff9ab2",
    success: "#ff6f98",
    warning: "#ffd0dc",
    danger: "#d93467",
    connector: "#817a7e",
    border: "#777174",
    chart1: "#ff8aa8",
    chart2: "#ff5f8d",
    chart3: "#c92e61",
    chart4: "#ffd0dc",
    chart5: "#e34a79",
    chart6: "#9d214d",
    chartPositive: "#ff6f98",
    chartNegative: "#c92e61",
    chartNeutral: "#9d9699",
  },
  typography: {
    display: {
      family: 'Georgia, "Times New Roman", serif',
      size: 50,
      lineHeight: 58,
      weight: 700,
      letterSpacing: -0.6,
    },
    title: {
      family: 'Georgia, "Times New Roman", serif',
      size: 23,
      lineHeight: 31,
      weight: 400,
    },
    bodyStrong: {
      family: 'Georgia, "Times New Roman", serif',
      size: 24,
      lineHeight: 31,
      weight: 700,
    },
    body: {
      family: 'Georgia, "Times New Roman", serif',
      size: 18,
      lineHeight: 26,
      weight: 400,
    },
    caption: {
      family: 'Georgia, "Times New Roman", serif',
      size: 16,
      lineHeight: 23,
      weight: 400,
    },
    label: {
      family: 'Georgia, "Times New Roman", serif',
      size: 14,
      lineHeight: 20,
      weight: 600,
      letterSpacing: 0.15,
    },
  },
  radii: { sm: 4, md: 8, lg: 12 },
  ornament: { grid: "none", surface: "glow", lineCap: "round", eyebrow: false },
});
