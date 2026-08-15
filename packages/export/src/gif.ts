import { createRequire } from "node:module";
import { availableParallelism } from "node:os";
import type { ResolvedScene } from "@kineglyph/core";
import type {
  GIFEncoder as GifEncoderFactory,
  GifEncoderInstance,
  GifPaletteColor,
  quantize as quantizeFunction,
} from "gifenc";
import { KineglyphExportError } from "./errors.js";
import type { PngExportOptions } from "./png.js";
import { assertNoLiveMedia, errorMessage, renderRaster } from "./raster.js";
import { buildSvgDocument, sceneDuration } from "./svg.js";

interface GifencModule {
  readonly GIFEncoder: typeof GifEncoderFactory;
  readonly quantize: typeof quantizeFunction;
}

// gifenc ships a CommonJS build with an `__esModule` marker; loading it through `require`
// yields the same export shape under Node, vitest, and bundlers.
const load = createRequire(import.meta.url);
const { GIFEncoder, quantize } = load("gifenc") as GifencModule;

export interface GifExportOptions extends Omit<PngExportOptions, "time"> {
  /** Sampling rate in frames per second (1–60). Defaults to 12. */
  readonly fps?: number;
  /** Extra time in milliseconds the final frame stays visible. Defaults to 800. */
  readonly holdLast?: number;
  /** Loop forever (default) or play once. */
  readonly loop?: boolean;
  /** Guard against runaway sizes; exceeding it raises `invalid-output`. Defaults to 600. */
  readonly maxFrames?: number;
}

/** Sampling plan derived from a scene's timeline and the requested frame rate. */
export interface GifFramePlan {
  /** Number of frames: `floor(duration × fps / 1000) + 1`. */
  readonly frameCount: number;
  /** Sample times in milliseconds; the last entry is always exactly the timeline duration. */
  readonly times: readonly number[];
  /** Per-frame delay in milliseconds, rounded to GIF's 10 ms resolution. */
  readonly frameDelay: number;
  /** Delay of the final frame (`frameDelay + holdLast`, rounded to 10 ms). */
  readonly lastDelay: number;
}

/**
 * Computes the GIF sampling plan.
 *
 * Frames are sampled every `1000 / fps` ms starting at t = 0, giving
 * `floor(duration × fps / 1000) + 1` frames. The final frame is always sampled at exactly
 * `duration`; when the duration is not a multiple of the frame period the last sample is snapped
 * forward (by less than one period) so the export always ends on the true final state.
 */
export function planGifFrames(
  duration: number,
  options: Pick<GifExportOptions, "fps" | "holdLast" | "maxFrames"> = {},
): GifFramePlan {
  const fps = options.fps ?? 12;
  if (typeof fps !== "number" || !Number.isFinite(fps) || fps < 1 || fps > 60) {
    throw new KineglyphExportError(
      "invalid-output",
      `fps must be a number between 1 and 60 (received ${String(fps)})`,
    );
  }
  const holdLast = options.holdLast ?? 800;
  if (typeof holdLast !== "number" || !Number.isFinite(holdLast) || holdLast < 0) {
    throw new KineglyphExportError(
      "invalid-output",
      `holdLast must be a finite number of milliseconds >= 0 (received ${String(holdLast)})`,
    );
  }
  const maxFrames = options.maxFrames ?? 600;
  if (typeof maxFrames !== "number" || !Number.isFinite(maxFrames) || maxFrames < 1) {
    throw new KineglyphExportError(
      "invalid-output",
      `maxFrames must be a number >= 1 (received ${String(maxFrames)})`,
    );
  }
  const frameCount = Math.floor((duration * fps) / 1000) + 1;
  if (frameCount > maxFrames) {
    throw new KineglyphExportError(
      "invalid-output",
      `${frameCount} frames would be rendered for a ${duration} ms timeline at ${fps} fps, exceeding maxFrames (${maxFrames}); lower fps, shorten the timeline, or raise maxFrames`,
    );
  }
  const times = Array.from({ length: frameCount }, (_, index) =>
    index === frameCount - 1 ? duration : (index * 1000) / fps,
  );
  const frameDelay = Math.round(100 / fps) * 10;
  const lastDelay = Math.min(655350, frameDelay + Math.round(holdLast / 10) * 10);
  return { frameCount, times, frameDelay, lastDelay };
}

/**
 * Renders a scene's timeline to an animated GIF by sampling `seekTimeline` at a fixed rate,
 * rasterizing each frame with resvg, and quantizing it with gifenc. Output bytes are
 * deterministic for a given scene, option set, and font set.
 */
export async function exportGif(
  scene: ResolvedScene,
  options: GifExportOptions = {},
): Promise<Uint8Array> {
  assertNoLiveMedia(scene);
  const plan = planGifFrames(sceneDuration(scene), options);
  const loop = options.loop ?? true;
  const encoder = GIFEncoder({ auto: true });
  let size: { width: number; height: number } | undefined;

  // resvg loads its font database on every call, so frames are rasterized in small parallel
  // batches (bounded by libuv's thread pool) and then encoded strictly in timeline order.
  const batchSize = Math.max(1, Math.min(4, availableParallelism()));
  for (let start = 0; start < plan.times.length; start += batchSize) {
    const batch = plan.times.slice(start, start + batchSize);
    const images = await Promise.all(
      batch.map((time) =>
        renderRaster(buildSvgDocument(scene, options, { raster: true, time }), options.fonts),
      ),
    );
    for (const [offset, image] of images.entries()) {
      const index = start + offset;
      const width = image.width;
      const height = image.height;
      if (width > 65535 || height > 65535) {
        throw new KineglyphExportError(
          "invalid-output",
          `GIF frames cannot exceed 65535px per side (received ${width}x${height})`,
        );
      }
      if (size === undefined) size = { width, height };
      else if (size.width !== width || size.height !== height) {
        throw new KineglyphExportError(
          "encoder",
          `frame ${index} rendered at ${width}x${height} but the GIF is ${size.width}x${size.height}`,
        );
      }
      const rgba = new Uint8Array(image.pixels);
      const delay = index === plan.frameCount - 1 ? plan.lastDelay : plan.frameDelay;
      try {
        writeGifFrame(encoder, rgba, width, height, { delay, repeat: loop ? 0 : -1 });
      } catch (error) {
        throw new KineglyphExportError("encoder", `gif encoding failed: ${errorMessage(error)}`, {
          cause: error,
        });
      }
    }
  }
  encoder.finish();
  return encoder.bytes();
}

interface FrameWriteOptions {
  readonly delay: number;
  readonly repeat: number;
}

/** GIF alpha is 1-bit: pixels below this coverage become fully transparent. */
const ALPHA_THRESHOLD = 128;

/**
 * Quantizes one RGBA frame and appends it to the encoder.
 *
 * Opaque frames are quantized directly. Frames with transparency reserve palette index 0 for
 * transparent pixels and quantize only the visible pixels, so translucent scenes keep the same
 * colour fidelity as opaque ones. Pixels are mapped to the palette with an exact per-colour
 * cache (gifenc's `applyPalette` caches by coarse histogram bin, which lets a single
 * anti-aliased pixel recolour every pure white pixel of a frame).
 */
function writeGifFrame(
  encoder: GifEncoderInstance,
  rgba: Uint8Array,
  width: number,
  height: number,
  options: FrameWriteOptions,
): void {
  const transparent = hasTransparency(rgba);
  let palette: GifPaletteColor[];
  if (transparent) {
    unpremultiply(rgba);
    const visible = visiblePixels(rgba);
    palette = [[0, 0, 0, 0], ...(visible.length === 0 ? [] : quantize(visible, 255))];
  } else {
    palette = quantize(rgba, 256);
  }
  const index = mapToPalette(rgba, palette, transparent ? 0 : -1);
  encoder.writeFrame(index, width, height, {
    palette,
    delay: options.delay,
    repeat: options.repeat,
    transparent,
    transparentIndex: 0,
  });
}

function hasTransparency(rgba: Uint8Array): boolean {
  for (let offset = 3; offset < rgba.length; offset += 4) {
    if ((rgba[offset] ?? 255) < 255) return true;
  }
  return false;
}

/** resvg returns premultiplied RGBA; GIF palettes expect straight colour. */
function unpremultiply(rgba: Uint8Array): void {
  for (let offset = 0; offset + 3 < rgba.length; offset += 4) {
    const alpha = rgba[offset + 3] ?? 0;
    if (alpha === 0 || alpha === 255) continue;
    for (let channel = 0; channel < 3; channel += 1) {
      const value = rgba[offset + channel] ?? 0;
      rgba[offset + channel] = Math.min(255, Math.round((value * 255) / alpha));
    }
  }
}

/** Copies the pixels that survive the 1-bit alpha threshold as fully opaque RGBA. */
function visiblePixels(rgba: Uint8Array): Uint8Array {
  let count = 0;
  for (let offset = 3; offset < rgba.length; offset += 4) {
    if ((rgba[offset] ?? 0) >= ALPHA_THRESHOLD) count += 1;
  }
  const visible = new Uint8Array(count * 4);
  let target = 0;
  for (let offset = 0; offset + 3 < rgba.length; offset += 4) {
    if ((rgba[offset + 3] ?? 0) < ALPHA_THRESHOLD) continue;
    visible[target] = rgba[offset] ?? 0;
    visible[target + 1] = rgba[offset + 1] ?? 0;
    visible[target + 2] = rgba[offset + 2] ?? 0;
    visible[target + 3] = 255;
    target += 4;
  }
  return visible;
}

/** Maps every pixel to its nearest palette entry (Euclidean RGB), caching by exact colour. */
function mapToPalette(
  rgba: Uint8Array,
  palette: readonly GifPaletteColor[],
  transparentIndex: number,
): Uint8Array {
  const index = new Uint8Array(rgba.length / 4);
  const cache = new Map<number, number>();
  for (let pixel = 0, offset = 0; offset + 3 < rgba.length; pixel += 1, offset += 4) {
    if (transparentIndex >= 0 && (rgba[offset + 3] ?? 0) < ALPHA_THRESHOLD) {
      index[pixel] = transparentIndex;
      continue;
    }
    const r = rgba[offset] ?? 0;
    const g = rgba[offset + 1] ?? 0;
    const b = rgba[offset + 2] ?? 0;
    const key = (r << 16) | (g << 8) | b;
    let nearest = cache.get(key);
    if (nearest === undefined) {
      nearest = nearestPaletteIndex(palette, r, g, b, transparentIndex);
      cache.set(key, nearest);
    }
    index[pixel] = nearest;
  }
  return index;
}

function nearestPaletteIndex(
  palette: readonly GifPaletteColor[],
  r: number,
  g: number,
  b: number,
  skip: number,
): number {
  let best = skip === 0 ? Math.min(1, palette.length - 1) : 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const [candidate, color] of palette.entries()) {
    if (candidate === skip) continue;
    const distance = (color[0] - r) ** 2 + (color[1] - g) ** 2 + (color[2] - b) ** 2;
    if (distance < bestDistance) {
      bestDistance = distance;
      best = candidate;
    }
  }
  return best;
}
