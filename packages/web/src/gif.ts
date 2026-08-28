import { loadGifenc, type GifPalette } from "./gifenc.js";

export interface RgbaGifFrame {
  readonly width: number;
  readonly height: number;
  readonly rgba: Uint8Array | Uint8ClampedArray;
  /** Frame delay in milliseconds. Defaults to the encoder-level delay. */
  readonly delay?: number;
}

export interface RgbaGifOptions {
  readonly delay?: number;
  /** 0 repeats forever; a positive number is the repeat count. Defaults to 0. */
  readonly repeat?: number;
  readonly maxColors?: number;
  /** Optional stable palette for media whose semantic colours must not flicker between frames. */
  readonly palette?: GifPalette;
  /** Yield to the page after this many encoded frames. Defaults to 4; 0 disables yielding. */
  readonly yieldEvery?: number;
}

/**
 * Encodes browser-rendered RGBA frames without assuming how they were produced. A WebGL engine,
 * canvas simulation, video decoder, or WASM animation sampler can therefore generate a GIF using
 * the same lightweight encoder as the Kineglyph editor.
 */
export async function encodeRgbaGif(
  frames: Iterable<RgbaGifFrame> | AsyncIterable<RgbaGifFrame>,
  options: RgbaGifOptions = {},
): Promise<Uint8Array> {
  const delay = options.delay ?? 80;
  if (!Number.isFinite(delay) || delay <= 0)
    throw new TypeError("encodeRgbaGif: delay must be a finite positive number");
  const maxColors = options.maxColors ?? 256;
  if (!Number.isInteger(maxColors) || maxColors < 2 || maxColors > 256)
    throw new TypeError("encodeRgbaGif: maxColors must be an integer from 2 to 256");
  const yieldEvery = options.yieldEvery ?? 4;
  if (!Number.isInteger(yieldEvery) || yieldEvery < 0)
    throw new TypeError("encodeRgbaGif: yieldEvery must be a non-negative integer");

  const gifenc = await loadGifenc();
  const encoder = gifenc.GIFEncoder({ auto: true });
  let width: number | undefined;
  let height: number | undefined;
  let count = 0;
  for await (const frame of frames) {
    if (!Number.isInteger(frame.width) || frame.width <= 0)
      throw new TypeError("encodeRgbaGif: frame width must be a positive integer");
    if (!Number.isInteger(frame.height) || frame.height <= 0)
      throw new TypeError("encodeRgbaGif: frame height must be a positive integer");
    if (frame.rgba.length !== frame.width * frame.height * 4)
      throw new TypeError("encodeRgbaGif: RGBA byte length does not match the frame dimensions");
    width ??= frame.width;
    height ??= frame.height;
    if (frame.width !== width || frame.height !== height)
      throw new TypeError("encodeRgbaGif: every frame must use the same dimensions");
    const palette = options.palette ?? gifenc.quantize(frame.rgba, maxColors);
    encoder.writeFrame(gifenc.applyPalette(frame.rgba, palette), width, height, {
      palette,
      delay: frame.delay ?? delay,
      repeat: options.repeat ?? 0,
    });
    count += 1;
    if (yieldEvery > 0 && count % yieldEvery === 0)
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
  if (count === 0) throw new TypeError("encodeRgbaGif: at least one frame is required");
  encoder.finish();
  const source = encoder.bytes();
  const bytes = new Uint8Array(source.byteLength);
  bytes.set(source);
  return bytes;
}
