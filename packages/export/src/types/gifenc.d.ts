/**
 * Minimal ambient typings for `gifenc` (which ships no declarations).
 * Only the surface used by `@kineglyph/export` is described here.
 */
declare module "gifenc" {
  export type GifPaletteColor =
    readonly [number, number, number] | readonly [number, number, number, number];
  export type GifPalette = readonly GifPaletteColor[];
  export type GifPixelFormat = "rgb565" | "rgb444" | "rgba4444";

  export interface GifQuantizeOptions {
    readonly format?: GifPixelFormat;
    readonly oneBitAlpha?: boolean | number;
    readonly clearAlpha?: boolean;
    readonly clearAlphaThreshold?: number;
    readonly clearAlphaColor?: number;
    readonly useSqrt?: boolean;
  }

  export interface GifFrameOptions {
    readonly palette?: GifPalette;
    readonly first?: boolean;
    readonly transparent?: boolean;
    readonly transparentIndex?: number;
    /** Frame delay in milliseconds (encoded in 10 ms units). */
    readonly delay?: number;
    /** -1 = play once, 0 = loop forever, >0 = repeat count. */
    readonly repeat?: number;
    readonly colorDepth?: number;
    readonly dispose?: number;
  }

  export interface GifEncoderInstance {
    reset(): void;
    finish(): void;
    bytes(): Uint8Array;
    bytesView(): Uint8Array;
    writeHeader(): void;
    writeFrame(index: Uint8Array, width: number, height: number, options?: GifFrameOptions): void;
  }

  export interface GifEncoderOptions {
    readonly initialCapacity?: number;
    readonly auto?: boolean;
  }

  export function GIFEncoder(options?: GifEncoderOptions): GifEncoderInstance;
  export function quantize(
    rgba: Uint8Array | Uint8ClampedArray,
    maxColors: number,
    options?: GifQuantizeOptions,
  ): GifPaletteColor[];
  export function applyPalette(
    rgba: Uint8Array | Uint8ClampedArray,
    palette: GifPalette,
    format?: GifPixelFormat,
  ): Uint8Array;

  const gifenc: {
    readonly GIFEncoder: typeof GIFEncoder;
    readonly quantize: typeof quantize;
    readonly applyPalette: typeof applyPalette;
  };
  export default gifenc;
}
