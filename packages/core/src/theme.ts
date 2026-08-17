import type {
  SemanticColorToken,
  SemanticRadiusToken,
  SemanticSpacingToken,
  SemanticTextStyle,
} from "./schema.js";
import type { Easing } from "./easing.js";
import type {
  MaterialDefinition,
  MaterialEffect,
  MaterialRef,
  MaterialToken,
  PortableMaterialEffect,
} from "./material.js";
import type {
  ResolvedFillPaint,
  ResolvedGradientStop,
  ResolvedMaterialDefinition,
  ResolvedMaterialEffect,
  ResolvedPortableMaterialEffect,
  ResolvedTheme,
} from "./resolved.js";
import type { FillPaint, Paint, Tone } from "./scene.js";

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
  readonly easing?: Easing;
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
  readonly materials: Readonly<Record<MaterialToken, MaterialDefinition>>;
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
  materials: {
    flat: {},
    raised: {
      fill: "surfaceRaised",
      stroke: "border",
    },
    floating: {
      fill: "surfaceRaised",
      stroke: "border",
    },
    inset: {
      fill: "surfaceMuted",
      stroke: "border",
    },
    glass: {
      fill: {
        type: "linear-gradient",
        angle: 120,
        stops: [
          { at: 0, color: "surfaceRaised", opacity: 0.78 },
          { at: 1, color: "surface", opacity: 0.42 },
        ],
      },
      stroke: "border",
      effects: [{ type: "backdrop", blur: 12, saturation: 1.08 }],
    },
  },
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
  readonly materials?: Partial<ThemeTokens["materials"]>;
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
    materials: { ...(base.materials ?? defaultTheme.materials), ...override.materials },
  };
}

/**
 * The same theme, drawn in another font stack.
 *
 * A figure is laid out once and shipped as fixed geometry, so the family that lays it out has to
 * be the family that draws it — a page cannot re-font a diagram after the fact without pulling the
 * text away from the boxes measured for it. An embedder that knows the font its pages actually use
 * (a browser can read it off the document; a build can be told) passes it through here *before*
 * resolving, and the whole figure is laid out and labelled in that font.
 *
 * Metrics themselves are family-independent by design (see `measureText`): the estimates are
 * per-glyph classes biased slightly wide, so `textLength` stretches spacing rather than squashing
 * glyphs for any face narrower than the estimate. Changing the family therefore changes what is
 * drawn and how it wraps only through the monospace split, and never desynchronises text from the
 * box that was measured for it.
 *
 * `mono` defaults to the theme's existing code family, because a code run in a proportional face
 * is not the same illustration.
 */
export function withFontFamily(theme: ThemeTokens, family: string, mono?: string): ThemeTokens {
  const typography = Object.fromEntries(
    Object.entries(theme.typography).map(([style, font]) => [
      style,
      { ...font, family: style === "code" ? (mono ?? font.family) : family },
    ]),
  ) as ThemeTokens["typography"];
  return { ...theme, typography };
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

function gradientStops(
  stops: readonly { readonly at: number; readonly color: Paint; readonly opacity?: number }[],
  theme: ThemeTokens,
  fallback: string,
): readonly ResolvedGradientStop[] {
  const resolved = stops
    .map((stop) => ({
      at: Math.min(1, Math.max(0, Number.isFinite(stop.at) ? stop.at : 0)),
      color: paintColor(stop.color, theme, "fill", fallback),
      opacity: Math.min(1, Math.max(0, Number.isFinite(stop.opacity) ? (stop.opacity ?? 1) : 1)),
    }))
    .sort((a, b) => a.at - b.at);
  return resolved.length > 0
    ? resolved
    : [
        { at: 0, color: fallback, opacity: 1 },
        { at: 1, color: fallback, opacity: 1 },
      ];
}

/** Resolves semantic colours inside a fill while preserving its gradient geometry. */
export function resolveFillPaint(
  paint: FillPaint | undefined,
  theme: ThemeTokens,
  fallback: string,
): ResolvedFillPaint {
  if (paint === undefined || typeof paint === "string")
    return paintColor(paint, theme, "fill", fallback);
  if (paint.type === "linear-gradient")
    return {
      type: paint.type,
      stops: gradientStops(paint.stops, theme, fallback),
      angle: Number.isFinite(paint.angle) ? (paint.angle ?? 0) : 0,
      spread: paint.spread ?? "pad",
    };
  const center = paint.center ?? [0.5, 0.5];
  const focalPoint = paint.focalPoint ?? center;
  return {
    type: paint.type,
    stops: gradientStops(paint.stops, theme, fallback),
    center: [Math.min(1, Math.max(0, center[0])), Math.min(1, Math.max(0, center[1]))],
    focalPoint: [Math.min(1, Math.max(0, focalPoint[0])), Math.min(1, Math.max(0, focalPoint[1]))],
    radius: Math.max(0, Number.isFinite(paint.radius) ? (paint.radius ?? 0.5) : 0.5),
    spread: paint.spread ?? "pad",
  };
}

function finiteOr(value: number | undefined, fallback: number): number {
  return value !== undefined && Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function resolvePortableMaterialEffect(
  effect: PortableMaterialEffect,
  theme: ThemeTokens,
): ResolvedPortableMaterialEffect {
  switch (effect.type) {
    case "shadow":
      return {
        type: effect.type,
        kind: effect.kind ?? "outer",
        color: paintColor(effect.color ?? "text", theme, "fill", theme.colors.text),
        opacity: clamp(finiteOr(effect.opacity, 0.16), 0, 1),
        blur: Math.max(0, finiteOr(effect.blur, 16)),
        spread: finiteOr(effect.spread, 0),
        offset: [finiteOr(effect.offset?.[0], 0), finiteOr(effect.offset?.[1], 8)],
      };
    case "blur":
      return { type: effect.type, radius: Math.max(0, finiteOr(effect.radius, 0)) };
    case "backdrop":
      return {
        type: effect.type,
        blur: Math.max(0, finiteOr(effect.blur, 16)),
        saturation: Math.max(0, finiteOr(effect.saturation, 1)),
        brightness: Math.max(0, finiteOr(effect.brightness, 1)),
      };
    case "noise":
      return {
        type: effect.type,
        amount: clamp(finiteOr(effect.amount, 0.03), 0, 1),
        scale: Math.max(0.01, finiteOr(effect.scale, 0.8)),
        seed: Math.round(finiteOr(effect.seed, 1)),
        monochrome: effect.monochrome ?? true,
      };
  }
}

function defaultShaderFallback(effect: MaterialEffect): readonly PortableMaterialEffect[] {
  if (effect.type !== "shader") return [];
  switch (effect.name) {
    case "frosted-glass":
      return [
        { type: "backdrop", blur: 18, saturation: 1.16 },
        { type: "noise", amount: 0.025, scale: 0.7, seed: 17 },
      ];
    case "iridescence":
      return [{ type: "noise", amount: 0.08, scale: 0.42, seed: 29, monochrome: false }];
    case "liquid":
      return [
        { type: "blur", radius: 0.7 },
        { type: "noise", amount: 0.045, scale: 0.3, seed: 41 },
      ];
    case "grain":
      return [{ type: "noise", amount: 0.035, scale: 0.9, seed: 7 }];
  }
}

function resolveMaterialEffect(effect: MaterialEffect, theme: ThemeTokens): ResolvedMaterialEffect {
  if (effect.type !== "shader") return resolvePortableMaterialEffect(effect, theme);
  const fallback = effect.fallback ?? defaultShaderFallback(effect);
  return {
    type: effect.type,
    name: effect.name,
    uniforms: effect.uniforms ?? {},
    fallback: fallback.map((entry) => resolvePortableMaterialEffect(entry, theme)),
  };
}

/** Resolves a semantic material role and its local overrides into renderer-ready data. */
export function resolveMaterial(
  reference: MaterialRef | undefined,
  theme: ThemeTokens,
): ResolvedMaterialDefinition {
  if (reference === undefined) return {};
  const local = typeof reference === "string" ? {} : reference;
  const role = typeof reference === "string" ? reference : reference.material;
  const base = role === undefined ? {} : theme.materials[role];
  const effects = local.effects ?? base.effects;
  const merged: MaterialDefinition = {
    ...base,
    ...local,
    ...(effects === undefined ? {} : { effects }),
  };
  return {
    ...(merged.fill === undefined
      ? {}
      : { fill: resolveFillPaint(merged.fill, theme, theme.colors.surface) }),
    ...(merged.stroke === undefined
      ? {}
      : { stroke: paintColor(merged.stroke, theme, "stroke", "none") }),
    ...(merged.strokeWidth === undefined
      ? {}
      : { strokeWidth: Math.max(0, finiteOr(merged.strokeWidth, 0)) }),
    ...(merged.radius === undefined ? {} : { radius: Math.max(0, finiteOr(merged.radius, 0)) }),
    ...(merged.opacity === undefined ? {} : { opacity: clamp(finiteOr(merged.opacity, 1), 0, 1) }),
    ...(merged.effects === undefined
      ? {}
      : { effects: merged.effects.map((effect) => resolveMaterialEffect(effect, theme)) }),
    ...(merged.blendMode === undefined ? {} : { blendMode: merged.blendMode }),
  };
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
