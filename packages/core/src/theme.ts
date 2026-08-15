import type {
  SemanticColorToken,
  SemanticRadiusToken,
  SemanticSpacingToken,
  SemanticTextStyle,
} from "./schema.js";

export interface FontToken {
  readonly family: string;
  readonly size: number;
  readonly lineHeight: number;
  readonly weight: number;
  readonly letterSpacing?: number;
}

export interface ThemeTokens {
  readonly colors: Readonly<Record<SemanticColorToken, string>>;
  readonly spacing: Readonly<Record<SemanticSpacingToken, number>>;
  readonly radii: Readonly<Record<SemanticRadiusToken, number>>;
  readonly typography: Readonly<Record<SemanticTextStyle, FontToken>>;
  readonly motion: {
    readonly fast: number;
    readonly normal: number;
    readonly slow: number;
  };
}

/** Neutral defaults intended as a complete, renderer-independent semantic theme. */
export const defaultTheme: ThemeTokens = {
  colors: {
    canvas: "#f7f8fa",
    surface: "#ffffff",
    surfaceRaised: "#ffffff",
    text: "#15171a",
    textMuted: "#626973",
    accent: "#5b5ce2",
    accentContrast: "#ffffff",
    success: "#16835d",
    warning: "#b26200",
    danger: "#c9363e",
    connector: "#969da8",
    border: "#dfe2e7",
  },
  spacing: { none: 0, xs: 4, sm: 8, md: 16, lg: 24, xl: 32, "2xl": 48 },
  radii: { none: 0, sm: 4, md: 8, lg: 16, pill: 9999 },
  typography: {
    label: {
      family: "Inter, sans-serif",
      size: 12,
      lineHeight: 16,
      weight: 600,
      letterSpacing: 0.2,
    },
    body: { family: "Inter, sans-serif", size: 16, lineHeight: 24, weight: 400 },
    bodyStrong: { family: "Inter, sans-serif", size: 16, lineHeight: 24, weight: 600 },
    title: {
      family: "Inter, sans-serif",
      size: 24,
      lineHeight: 30,
      weight: 650,
      letterSpacing: -0.2,
    },
    display: {
      family: "Inter, sans-serif",
      size: 44,
      lineHeight: 48,
      weight: 700,
      letterSpacing: -0.8,
    },
    code: { family: "ui-monospace, monospace", size: 14, lineHeight: 20, weight: 450 },
  },
  motion: { fast: 120, normal: 240, slow: 480 },
};

export type ThemeOverride = {
  readonly colors?: Partial<ThemeTokens["colors"]>;
  readonly spacing?: Partial<ThemeTokens["spacing"]>;
  readonly radii?: Partial<ThemeTokens["radii"]>;
  readonly typography?: Partial<ThemeTokens["typography"]>;
  readonly motion?: Partial<ThemeTokens["motion"]>;
};

/** Applies shallow token overrides without mutating either input. */
export function createTheme(override: ThemeOverride = {}): ThemeTokens {
  return {
    colors: { ...defaultTheme.colors, ...override.colors },
    spacing: { ...defaultTheme.spacing, ...override.spacing },
    radii: { ...defaultTheme.radii, ...override.radii },
    typography: { ...defaultTheme.typography, ...override.typography },
    motion: { ...defaultTheme.motion, ...override.motion },
  };
}
