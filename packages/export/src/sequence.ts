import { Buffer } from "node:buffer";
import type { ResolvedScene } from "@kineglyph/core";
import { planGifFrames } from "./gif.js";
import { exportPng, type PngExportOptions } from "./png.js";
import { renderRaster } from "./raster.js";
import { buildSvgDocument, sceneDuration } from "./svg.js";

export interface FrameSequenceOptions extends Omit<PngExportOptions, "time"> {
  readonly fps?: number;
  readonly maxFrames?: number;
}

export interface ImageSequenceFrame {
  readonly index: number;
  readonly time: number;
  readonly png: Uint8Array;
  readonly filename: string;
}

export interface SpriteSheetOptions extends FrameSequenceOptions {
  readonly columns?: number;
  readonly gap?: number;
}

export interface SpriteSheetResult {
  readonly png: Uint8Array;
  readonly svg: string;
  readonly columns: number;
  readonly rows: number;
  readonly frames: readonly {
    readonly index: number;
    readonly time: number;
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  }[];
}

export function planFrameSequence(
  scene: ResolvedScene,
  options: Pick<FrameSequenceOptions, "fps" | "maxFrames"> = {},
) {
  return planGifFrames(sceneDuration(scene), {
    ...(options.fps === undefined ? {} : { fps: options.fps }),
    ...(options.maxFrames === undefined ? {} : { maxFrames: options.maxFrames }),
    holdLast: 0,
  });
}

/** Deterministic, timestamped PNG sequence suitable for encoders and sprite tooling. */
export async function exportImageSequence(
  scene: ResolvedScene,
  options: FrameSequenceOptions = {},
): Promise<readonly ImageSequenceFrame[]> {
  const plan = planFrameSequence(scene, options);
  const digits = Math.max(4, String(plan.frameCount - 1).length);
  return Promise.all(
    plan.times.map(async (time, index) => ({
      index,
      time,
      png: await exportPng(scene, { ...options, time }),
      filename: `frame-${String(index).padStart(digits, "0")}.png`,
    })),
  );
}

/** Renders the full timeline into one portable SVG and one PNG sprite sheet. */
export async function exportSpriteSheet(
  scene: ResolvedScene,
  options: SpriteSheetOptions = {},
): Promise<SpriteSheetResult> {
  const plan = planFrameSequence(scene, options);
  const columns = Math.max(1, Math.floor(options.columns ?? Math.ceil(Math.sqrt(plan.frameCount))));
  const rows = Math.ceil(plan.frameCount / columns);
  const gap = Math.max(0, options.gap ?? 0);
  const width = scene.width;
  const height = scene.height;
  const frames = plan.times.map((time, index) => ({
    index,
    time,
    x: (index % columns) * (width + gap),
    y: Math.floor(index / columns) * (height + gap),
    width,
    height,
  }));
  const images = frames
    .map((frame) => {
      const document = buildSvgDocument(scene, { ...options, time: frame.time }, { raster: false });
      const href = `data:image/svg+xml;base64,${Buffer.from(document.svg).toString("base64")}`;
      return `<image x="${frame.x}" y="${frame.y}" width="${width}" height="${height}" href="${href}"/>`;
    })
    .join("");
  const sheetWidth = columns * width + Math.max(0, columns - 1) * gap;
  const sheetHeight = rows * height + Math.max(0, rows - 1) * gap;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${sheetWidth}" height="${sheetHeight}" viewBox="0 0 ${sheetWidth} ${sheetHeight}">${images}</svg>`;
  const image = await renderRaster(
    {
      svg,
      size: { width: sheetWidth, height: sheetHeight },
      background: undefined,
      time: 0,
      hasText: true,
    },
    options.fonts,
  );
  return { png: new Uint8Array(image.asPng()), svg, columns, rows, frames };
}

export function bytesToDataUri(bytes: Uint8Array, mime: string): string {
  if (!/^[-\w.+]+\/[-\w.+]+$/.test(mime)) throw new Error(`invalid MIME type ${mime}`);
  return `data:${mime};base64,${Buffer.from(bytes).toString("base64")}`;
}
