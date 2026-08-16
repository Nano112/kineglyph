import { createTheme, defaultTheme, type ThemeTokens } from "@kineglyph/core";

export type ThemeName = "default" | "midnight" | "paper";

export const midnightTheme: ThemeTokens = createTheme({
  name: "midnight",
  colors: {
    canvas: "#101216",
    surface: "#16191e",
    surfaceRaised: "#1b1f25",
    surfaceMuted: "#13161a",
    text: "#e8eaed",
    textMuted: "#9299a3",
    accent: "#67cbbb",
    accentContrast: "#101216",
    info: "#7d8fd1",
    success: "#78c9a9",
    warning: "#dfbd79",
    danger: "#dc8c8c",
    connector: "#737b86",
    border: "#303640",
    chart1: "#67cbbb",
    chart2: "#8597d8",
    chart3: "#d59672",
    chart4: "#9fbd78",
    chart5: "#d58da2",
    chart6: "#aa9bd1",
    chartPositive: "#78c9a9",
    chartNegative: "#dc8c8c",
    chartNeutral: "#9299a3",
  },
  radii: { sm: 3, md: 6, lg: 8 },
  motion: { fast: 140, normal: 280, slow: 620, easing: "easeInOut" },
  strokes: { hairline: 1, thin: 1.15, regular: 1.5, bold: 2.25 },
});

export const paperTheme: ThemeTokens = createTheme({
  name: "paper",
  colors: {
    canvas: "#f4f1e9",
    surface: "#faf8f2",
    surfaceRaised: "#fffdf8",
    surfaceMuted: "#ece8de",
    text: "#25282d",
    textMuted: "#6e746f",
    accent: "#237f74",
    accentContrast: "#fffdf8",
    info: "#6475b7",
    success: "#4f9275",
    warning: "#a9792f",
    danger: "#b76060",
    connector: "#858b87",
    border: "#d4cfc4",
    chart1: "#4da99a",
    chart2: "#7f8fc7",
    chart3: "#c48765",
    chart4: "#91ad6c",
    chart5: "#c98297",
    chart6: "#9e90c0",
    chartPositive: "#4f9275",
    chartNegative: "#b76060",
    chartNeutral: "#858b87",
  },
  radii: { sm: 3, md: 6, lg: 8 },
  motion: { fast: 140, normal: 280, slow: 620, easing: "easeInOut" },
  strokes: { hairline: 1, thin: 1.15, regular: 1.5, bold: 2.25 },
});

export const themes: Readonly<Record<ThemeName, ThemeTokens>> = {
  default: defaultTheme,
  midnight: midnightTheme,
  paper: paperTheme,
};

export const themeNames: readonly ThemeName[] = ["default", "midnight", "paper"];

export const themeCopy: Readonly<Record<ThemeName, { label: string; note: string }>> = {
  default: { label: "Default", note: "Neutral semantic defaults" },
  midnight: { label: "Midnight", note: "Dark, restrained, high contrast" },
  paper: { label: "Paper", note: "Warm surface with print-like contrast" },
};

export function isThemeName(value: string): value is ThemeName {
  return value === "default" || value === "midnight" || value === "paper";
}
