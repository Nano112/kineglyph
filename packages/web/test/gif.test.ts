import { describe, expect, it } from "vitest";
import { encodeRgbaGif } from "../src/gif.js";

function solid(red: number, green: number, blue: number): Uint8ClampedArray {
  return new Uint8ClampedArray([
    red,
    green,
    blue,
    255,
    red,
    green,
    blue,
    255,
    red,
    green,
    blue,
    255,
    red,
    green,
    blue,
    255,
  ]);
}

describe("encodeRgbaGif", () => {
  it("encodes synchronous RGBA frames into an owned GIF byte array", async () => {
    const bytes = await encodeRgbaGif(
      [
        { width: 2, height: 2, rgba: solid(20, 40, 60) },
        { width: 2, height: 2, rgba: solid(80, 100, 120), delay: 120 },
      ],
      { delay: 80, yieldEvery: 0 },
    );
    expect(new TextDecoder().decode(bytes.slice(0, 6))).toBe("GIF89a");
    expect(bytes.at(-1)).toBe(0x3b);
  });

  it("rejects empty streams and inconsistent frame dimensions", async () => {
    await expect(encodeRgbaGif([])).rejects.toThrow("at least one frame");
    await expect(
      encodeRgbaGif([
        { width: 2, height: 2, rgba: solid(0, 0, 0) },
        { width: 1, height: 4, rgba: solid(0, 0, 0) },
      ]),
    ).rejects.toThrow("same dimensions");
  });
});
