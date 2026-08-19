/** The small public surface Kineglyph uses from gifenc, which ships JavaScript without types. */
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

export interface GifencModule {
  GIFEncoder(options?: {
    readonly initialCapacity?: number;
    readonly auto?: boolean;
  }): GifEncoderInstance;
  quantize(rgba: Uint8Array | Uint8ClampedArray, maxColors: number): GifPaletteColor[];
  applyPalette(rgba: Uint8Array | Uint8ClampedArray, palette: GifPalette): Uint8Array;
}

/**
 * Keep the untyped third-party boundary inside the package instead of requiring every source-level
 * consumer (including Pagina's editor build) to discover an ambient declaration from our tsconfig.
 */
export async function loadGifenc(): Promise<GifencModule> {
  // @ts-expect-error gifenc publishes JavaScript without a declaration entry.
  return (await import("gifenc")) as GifencModule;
}
