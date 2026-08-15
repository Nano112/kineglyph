import type { FillPaint, Paint } from "./scene.js";

/** Semantic surface roles. Themes decide whether a role is flat, physical, glassy, or something else. */
export type MaterialToken = "flat" | "raised" | "floating" | "inset" | "glass";

export type BlendMode =
  | "normal"
  | "multiply"
  | "screen"
  | "overlay"
  | "soft-light"
  | "hard-light"
  | "color-dodge"
  | "color-burn"
  | "difference"
  | "exclusion";

export interface ShadowEffect {
  readonly type: "shadow";
  readonly kind?: "outer" | "inner";
  readonly color?: Paint;
  readonly opacity?: number;
  readonly blur?: number;
  readonly spread?: number;
  readonly offset?: readonly [x: number, y: number];
}

export interface BlurEffect {
  readonly type: "blur";
  readonly radius: number;
}

/** Browser renderers can sample content behind the surface; static renderers use its fallback. */
export interface BackdropEffect {
  readonly type: "backdrop";
  readonly blur?: number;
  readonly saturation?: number;
  readonly brightness?: number;
}

/** Deterministic procedural grain. `seed` freezes the texture across frames and exports. */
export interface NoiseEffect {
  readonly type: "noise";
  readonly amount?: number;
  readonly scale?: number;
  readonly seed?: number;
  readonly monochrome?: boolean;
}

export type PortableMaterialEffect = ShadowEffect | BlurEffect | BackdropEffect | NoiseEffect;

export type ShaderName = "frosted-glass" | "iridescence" | "liquid" | "grain";
export type ShaderUniform = number | readonly [number, number] | readonly [number, number, number];

/**
 * Named shader intent rather than arbitrary source code. WebGPU/WebGL renderers may execute the
 * preset; SVG and raster renderers consume the explicit deterministic fallback.
 */
export interface ShaderEffect {
  readonly type: "shader";
  readonly name: ShaderName;
  readonly uniforms?: Readonly<Record<string, ShaderUniform>>;
  readonly fallback?: readonly PortableMaterialEffect[];
}

export type MaterialEffect = PortableMaterialEffect | ShaderEffect;

/** Concrete material properties. Local node paint wins over material paint. */
export interface MaterialDefinition {
  readonly fill?: FillPaint;
  readonly stroke?: Paint;
  readonly strokeWidth?: number;
  readonly radius?: number;
  readonly opacity?: number;
  readonly effects?: readonly MaterialEffect[];
  readonly blendMode?: BlendMode;
}

/** A semantic material role plus optional local overrides. */
export interface MaterialStyle extends MaterialDefinition {
  readonly material?: MaterialToken;
}

export type MaterialRef = MaterialToken | MaterialStyle;

/** Build a material style without introducing renderer-specific callbacks or source strings. */
export function material(
  role: MaterialToken = "flat",
  overrides: MaterialDefinition = {},
): MaterialStyle {
  return { material: role, ...overrides };
}

export function shadow(options: Omit<ShadowEffect, "type"> = {}): ShadowEffect {
  return { type: "shadow", ...options };
}

export function innerShadow(options: Omit<ShadowEffect, "type" | "kind"> = {}): ShadowEffect {
  return { type: "shadow", kind: "inner", ...options };
}

export function blur(radius: number): BlurEffect {
  return { type: "blur", radius };
}

export function backdrop(options: Omit<BackdropEffect, "type"> = {}): BackdropEffect {
  return { type: "backdrop", ...options };
}

export function noise(options: Omit<NoiseEffect, "type"> = {}): NoiseEffect {
  return { type: "noise", ...options };
}

export function shader(
  name: ShaderName,
  options: {
    readonly uniforms?: ShaderEffect["uniforms"];
    readonly fallback?: ShaderEffect["fallback"];
  } = {},
): ShaderEffect {
  return {
    type: "shader",
    name,
    ...(options.uniforms === undefined ? {} : { uniforms: options.uniforms }),
    ...(options.fallback === undefined ? {} : { fallback: options.fallback }),
  };
}
