import { deflateSync } from "node:zlib";
import type { ResolvedScene } from "@kineglyph/core";
import type { FrameSequenceOptions } from "./sequence.js";
import { planFrameSequence } from "./sequence.js";
import { assertNoLiveMedia, renderRaster } from "./raster.js";
import { buildSvgDocument } from "./svg.js";

export interface ApngExportOptions extends FrameSequenceOptions {
  readonly loop?: boolean;
  readonly holdLast?: number;
}

const signature = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);

function u32(value: number): Uint8Array {
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setUint32(0, value >>> 0);
  return bytes;
}

function concat(parts: readonly Uint8Array[]): Uint8Array {
  const output = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
}

let crcTable: Uint32Array | undefined;
function crc32(bytes: Uint8Array): number {
  crcTable ??= Uint32Array.from({ length: 256 }, (_, value) => {
    let current = value;
    for (let bit = 0; bit < 8; bit += 1)
      current = (current & 1) === 1 ? 0xedb88320 ^ (current >>> 1) : current >>> 1;
    return current >>> 0;
  });
  let crc = 0xffffffff;
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(name: string, data: Uint8Array): Uint8Array {
  const type = new TextEncoder().encode(name);
  const body = concat([type, data]);
  return concat([u32(data.length), body, u32(crc32(body))]);
}

function frameData(rgba: Uint8Array, width: number, height: number): Uint8Array {
  const rows = new Uint8Array(height * (width * 4 + 1));
  for (let row = 0; row < height; row += 1) {
    const target = row * (width * 4 + 1);
    rows[target] = 0;
    rows.set(rgba.subarray(row * width * 4, (row + 1) * width * 4), target + 1);
  }
  return new Uint8Array(deflateSync(rows, { level: 9 }));
}

function frameControl(sequence: number, width: number, height: number, delay: number): Uint8Array {
  const data = new Uint8Array(26);
  const view = new DataView(data.buffer);
  view.setUint32(0, sequence);
  view.setUint32(4, width);
  view.setUint32(8, height);
  view.setUint32(12, 0);
  view.setUint32(16, 0);
  view.setUint16(20, Math.max(1, Math.min(65535, Math.round(delay))));
  view.setUint16(22, 1000);
  data[24] = 0;
  data[25] = 0;
  return data;
}

/** Encodes deterministic RGBA frames as APNG without browser or native codec dependencies. */
export async function exportApng(
  scene: ResolvedScene,
  options: ApngExportOptions = {},
): Promise<Uint8Array> {
  assertNoLiveMedia(scene);
  const plan = planFrameSequence(scene, options);
  const rendered = await Promise.all(
    plan.times.map((time) =>
      renderRaster(buildSvgDocument(scene, { ...options, time }, { raster: true }), options.fonts),
    ),
  );
  const first = rendered[0];
  if (first === undefined) throw new Error("APNG needs at least one frame");
  const width = first.width;
  const height = first.height;
  const header = new Uint8Array(13);
  const headerView = new DataView(header.buffer);
  headerView.setUint32(0, width);
  headerView.setUint32(4, height);
  header[8] = 8;
  header[9] = 6;
  const animation = concat([u32(plan.frameCount), u32(options.loop === false ? 1 : 0)]);
  const chunks: Uint8Array[] = [signature, chunk("IHDR", header), chunk("acTL", animation)];
  let sequence = 0;
  for (const [index, image] of rendered.entries()) {
    if (image.width !== width || image.height !== height)
      throw new Error("APNG frame dimensions changed");
    const delay =
      index === rendered.length - 1 ? plan.frameDelay + (options.holdLast ?? 800) : plan.frameDelay;
    chunks.push(chunk("fcTL", frameControl(sequence++, width, height, delay)));
    const compressed = frameData(new Uint8Array(image.pixels), width, height);
    chunks.push(
      index === 0
        ? chunk("IDAT", compressed)
        : chunk("fdAT", concat([u32(sequence++), compressed])),
    );
  }
  chunks.push(chunk("IEND", new Uint8Array()));
  return concat(chunks);
}
