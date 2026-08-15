import type {
  SemanticColorToken,
  SemanticRadiusToken,
  SemanticSpacingToken,
  SemanticTextStyle,
} from "./schema.js";
import type { ResolvedTheme } from "./resolved.js";
import type { Paint, Tone } from "./scene.js";

export interface FontToken {
  readonly family: string;
  readonly size: number;
  readonly lineHeight: number;
  readonly weight: number;
  readonly letterSpacing?: number;
}

export interface StrokeTokens {
  readonly hairline: number;
  readonly thin: number;
  readonly regular: number;
  readonly bold: number;
}

export interface MotionTokens {
  readonly fast: number;
  readonly normal: number;
  readonly slow: number;
  readonly easing?: "linear" | "easeIn" | "easeOut" | "easeInOut";
}

export interface OrnamentTokens {
  /** Draw a faint dot grid on the canvas. */
  readonly grid?: "none" | "dots" | "lines";
  /** Card treatment: flat surfaces, outlined frames, or soft glow. */
  readonly surface?: "flat" | "outlined" | "glow";
  readonly lineCap?: "round" | "square" | "butt";
  /** Uppercase small labels. */
  readonly eyebrow?: boolean;
}

export interface ThemeTokens {
  readonly name?: string;
  readonly colors: Readonly<Record<SemanticColorToken, string>>;
  readonly spacing: Readonly<Record<SemanticSpacingToken, number>>;
  readonly radii: Readonly<Record<SemanticRadiusToken, number>>;
  readonly typography: Readonly<Record<SemanticTextStyle, FontToken>>;
  readonly motion: MotionTokens;
  readonly strokes: StrokeTokens;
  readonly ornament: OrnamentTokens;
}

/** Neutral defaults intended as a complete, renderer-independent semantic theme. */
export const defaultTheme: ThemeTokens = {
  name: "default",
  colors: {
    canvas: "#f7f8fa",
    surface: "#ffffff",
    surfaceRaised: "#ffffff",
    surfaceMuted: "#eef0f4",
    text: "#15171a",
    textMuted: "#626973",
    accent: "#5b5ce2",
    accentContrast: "#ffffff",
    info: "#2f7bd9",
    success: "#16835d",
    warning: "#b26200",
    danger: "#c9363e",
    connector: "#969da8",
    border: "#dfe2e7",
    chart1: "#5b5ce2",
    chart2: "#2f7bd9",
    chart3: "#b26200",
    chart4: "#16835d",
    chart5: "#c9363e",
    chart6: "#7a8290",
    chartPositive: "#16835d",
    chartNegative: "#c9363e",
    chartNeutral: "#969da8",
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
    caption: { family: "Inter, sans-serif", size: 12, lineHeight: 16, weight: 400 },
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
  motion: { fast: 120, normal: 240, slow: 480, easing: "easeOut" },
  strokes: { hairline: 1, thin: 1.5, regular: 2, bold: 3 },
  ornament: { grid: "none", surface: "outlined", lineCap: "round", eyebrow: true },
};

export type ThemeOverride = {
  readonly name?: string;
  readonly colors?: Partial<ThemeTokens["colors"]>;
  readonly spacing?: Partial<ThemeTokens["spacing"]>;
  readonly radii?: Partial<ThemeTokens["radii"]>;
  readonly typography?: Partial<ThemeTokens["typography"]>;
  readonly motion?: Partial<ThemeTokens["motion"]>;
  readonly strokes?: Partial<ThemeTokens["strokes"]>;
  readonly ornament?: Partial<ThemeTokens["ornament"]>;
};

/** Applies shallow token overrides without mutating either input. */
export function createTheme(
  override: ThemeOverride = {},
  base: ThemeTokens = defaultTheme,
): ThemeTokens {
  return {
    ...(override.name === undefined
      ? base.name === undefined
        ? {}
        : { name: base.name }
      : { name: override.name }),
    colors: { ...base.colors, ...override.colors },
    spacing: { ...base.spacing, ...override.spacing },
    radii: { ...base.radii, ...override.radii },
    typography: { ...base.typography, ...override.typography },
    motion: { ...base.motion, ...override.motion },
    strokes: { ...(base.strokes ?? defaultTheme.strokes), ...override.strokes },
    ornament: { ...(base.ornament ?? defaultTheme.ornament), ...override.ornament },
  };
}

const TONES: ReadonlySet<string> = new Set<Tone>([
  "neutral",
  "accent",
  "success",
  "warning",
  "danger",
  "info",
  "muted",
]);

export function isTone(value: string): value is Tone {
  return TONES.has(value);
}

/** Resolves a semantic tone to its theme colour. Neutral maps to the connector/border colour. */
export function toneColor(
  tone: Tone,
  theme: ThemeTokens,
  purpose: "stroke" | "fill" | "text" = "stroke",
): string {
  switch (tone) {
    case "accent":
      return theme.colors.accent;
    case "success":
      return theme.colors.success;
    case "warning":
      return theme.colors.warning;
    case "danger":
      return theme.colors.danger;
    case "info":
      return theme.colors.info;
    case "muted":
      return purpose === "text" ? theme.colors.textMuted : theme.colors.border;
    case "neutral":
      return purpose === "text"
        ? theme.colors.text
        : purpose === "fill"
          ? theme.colors.surface
          : theme.colors.border;
  }
}

/** Resolves a paint (tone, colour token, or "none") to a concrete colour string. */
export function paintColor(
  paint: Paint | undefined,
  theme: ThemeTokens,
  purpose: "stroke" | "fill" | "text",
  fallback: string,
): string {
  if (paint === undefined) return fallback;
  if (paint === "none") return "none";
  if (isTone(paint)) return toneColor(paint, theme, purpose);
  const token = theme.colors[paint as SemanticColorToken];
  return typeof token === "string" ? token : fallback;
}

/** Deterministic hex colour mixing; non-hex inputs fall back to whichever side dominates. */
export function mixColor(from: string, to: string, amount: number): string {
  const t = Math.min(1, Math.max(0, amount));
  if (t <= 0) return from;
  if (t >= 1) return to;
  const a = parseHex(from);
  const b = parseHex(to);
  if (a === undefined || b === undefined) return t < 0.5 ? from : to;
  const channel = (index: number): string =>
    Math.round((a[index] ?? 0) + ((b[index] ?? 0) - (a[index] ?? 0)) * t)
      .toString(16)
      .padStart(2, "0");
  return `#${channel(0)}${channel(1)}${channel(2)}`;
}

/** Hex colour with an alpha channel appended (0..1). Non-hex inputs are returned unchanged. */
export function withAlpha(color: string, alpha: number): string {
  const parsed = parseHex(color);
  if (parsed === undefined) return color;
  const a = Math.round(Math.min(1, Math.max(0, alpha)) * 255)
    .toString(16)
    .padStart(2, "0");
  return `#${parsed
    .slice(0, 3)
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("")}${a}`;
}

function parseHex(color: string): readonly [number, number, number] | undefined {
  const match = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(color.trim());
  if (match === null) return undefined;
  const hex = match[1] ?? "";
  if (hex.length === 3) {
    const [r, g, b] = hex.split("");
    return [parseInt(`${r}${r}`, 16), parseInt(`${g}${g}`, 16), parseInt(`${b}${b}`, 16)];
  }
  return [
    parseInt(hex.slice(0, 2), 16),
    parseInt(hex.slice(2, 4), 16),
    parseInt(hex.slice(4, 6), 16),
  ];
}

/** Concrete renderer-facing projection of the semantic tokens. */
export function projectTheme(tokens: ThemeTokens): ResolvedTheme {
  return {
    background: tokens.colors.canvas,
    foreground: tokens.colors.text,
    accent: tokens.colors.accent,
    fontFamily: tokens.typography.body.family,
    semantic: {
      background: tokens.colors.canvas,
      surface: tokens.colors.surface,
      foreground: tokens.colors.text,
      muted: tokens.colors.connector,
      accent: tokens.colors.accent,
    },
    node: {
      fill: tokens.colors.surface,
      stroke: tokens.colors.border,
      strokeWidth: 1,
      radius: tokens.radii.lg,
    },
    edge: { stroke: tokens.colors.connector, strokeWidth: 2 },
    text: {
      color: tokens.colors.text,
      fontFamily: tokens.typography.body.family,
      fontSize: tokens.typography.body.size,
    },
    tokens,
  };
}
