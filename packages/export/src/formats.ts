/** Header information parsed from PNG bytes. */
export interface PngInfo {
  readonly width: number;
  readonly height: number;
}

/** Summary parsed from GIF bytes by walking its block structure. */
export interface GifInfo {
  readonly width: number;
  readonly height: number;
  readonly frameCount: number;
  /** Per-frame delays in milliseconds. */
  readonly delays: readonly number[];
  /** Whether a NETSCAPE/ANIMEXTS looping extension is present. */
  readonly loop: boolean;
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** Reads the IHDR dimensions of a PNG. Throws `TypeError` for non-PNG input. */
export function pngInfo(bytes: Uint8Array): PngInfo {
  if (bytes.length < 24 || PNG_SIGNATURE.some((byte, index) => bytes[index] !== byte)) {
    throw new TypeError("not a PNG: signature mismatch");
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (ascii(bytes, 12, 4) !== "IHDR") throw new TypeError("not a PNG: IHDR chunk missing");
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

/** Walks a GIF's blocks to count frames and read delays. Throws `TypeError` for malformed input. */
export function gifInfo(bytes: Uint8Array): GifInfo {
  const header = ascii(bytes, 0, 6);
  if (bytes.length < 13 || (header !== "GIF89a" && header !== "GIF87a")) {
    throw new TypeError("not a GIF: signature mismatch");
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const width = view.getUint16(6, true);
  const height = view.getUint16(8, true);
  const packed = byte(bytes, 10);
  let cursor = 13;
  if ((packed & 0x80) !== 0) cursor += 3 * 2 ** ((packed & 0x07) + 1);

  const delays: number[] = [];
  let loop = false;
  let pendingDelay = 0;
  let done = false;
  while (!done) {
    const introducer = byte(bytes, cursor);
    if (introducer === 0x3b) {
      done = true;
    } else if (introducer === 0x21) {
      const label = byte(bytes, cursor + 1);
      cursor += 2;
      if (label === 0xf9) {
        const size = byte(bytes, cursor);
        if (size !== 4) throw new TypeError("malformed GIF: bad graphic control extension");
        pendingDelay = view.getUint16(cursor + 2, true) * 10;
      } else if (label === 0xff) {
        const size = byte(bytes, cursor);
        const identifier = ascii(bytes, cursor + 1, size);
        if (identifier === "NETSCAPE2.0" || identifier === "ANIMEXTS1.0") loop = true;
      }
      cursor = skipSubBlocks(bytes, cursor);
    } else if (introducer === 0x2c) {
      cursor += 9;
      const flags = byte(bytes, cursor);
      cursor += 1;
      if ((flags & 0x80) !== 0) cursor += 3 * 2 ** ((flags & 0x07) + 1);
      cursor += 1; // LZW minimum code size
      cursor = skipSubBlocks(bytes, cursor);
      delays.push(pendingDelay);
      pendingDelay = 0;
    } else {
      throw new TypeError(
        `malformed GIF: unexpected block 0x${introducer.toString(16)} at ${cursor}`,
      );
    }
  }
  return { width, height, frameCount: delays.length, delays, loop };
}

function skipSubBlocks(bytes: Uint8Array, cursor: number): number {
  let position = cursor;
  for (;;) {
    const size = byte(bytes, position);
    position += 1;
    if (size === 0) return position;
    position += size;
  }
}

function byte(bytes: Uint8Array, index: number): number {
  const value = bytes[index];
  if (value === undefined) throw new TypeError(`malformed data: unexpected end at byte ${index}`);
  return value;
}

function ascii(bytes: Uint8Array, start: number, length: number): string {
  let text = "";
  for (let index = start; index < start + length && index < bytes.length; index += 1) {
    text += String.fromCharCode(bytes[index] ?? 0);
  }
  return text;
}
