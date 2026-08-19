/** Minimal browser-facing declarations for gifenc, which publishes JavaScript without types. */
declare module "gifenc" {
  export type GifPaletteColor =
    readonly [number, number, number] | readonly [number, number, number, number];
  export type GifPalette = readonly GifPaletteColor[];

  export interface GifFrameOptions {
    readonly palette?: GifPalette;
    readonly transparent?: boolean;
    readonly transparentIndex?: number;
    readonly delay?: number;
    readonly repeat?: number;
    readonly dispose?: number;
  }

  export interface GifEncoderInstance {
    finish(): void;
    bytes(): Uint8Array;
    writeFrame(index: Uint8Array, width: number, height: number, options?: GifFrameOptions): void;
  }

  export function GIFEncoder(options?: {
    readonly initialCapacity?: number;
    readonly auto?: boolean;
  }): GifEncoderInstance;
  export function quantize(
    rgba: Uint8Array | Uint8ClampedArray,
    maxColors: number,
  ): GifPaletteColor[];
  export function applyPalette(
    rgba: Uint8Array | Uint8ClampedArray,
    palette: GifPalette,
  ): Uint8Array;
}
