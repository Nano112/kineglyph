import { describe, expect, it } from "vitest";
import { KineglyphExportError, exportGif, gifInfo, planGifFrames } from "../src/index.js";
import { animatedScene, staticScene, testFonts } from "./helpers.js";

const scene = animatedScene();
const fonts = testFonts;
const duration = scene.timeline?.duration ?? 0;

async function expectCode(
  promise: Promise<unknown>,
  code: KineglyphExportError["code"],
): Promise<void> {
  let caught: unknown;
  try {
    await promise;
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeInstanceOf(KineglyphExportError);
  expect((caught as KineglyphExportError).code).toBe(code);
}

/** Walks past the header, global colour table, and application extensions to the first GCE. */
function firstGraphicControlPacked(gif: Uint8Array): number {
  const packed = gif[10] ?? 0;
  let cursor = 13 + ((packed & 0x80) === 0 ? 0 : 3 * 2 ** ((packed & 0x07) + 1));
  while (gif[cursor] === 0x21) {
    if (gif[cursor + 1] === 0xf9) return gif[cursor + 3] ?? 0;
    cursor += 2;
    for (let size = gif[cursor] ?? 0; size !== 0; size = gif[cursor] ?? 0) cursor += size + 1;
    cursor += 1;
  }
  throw new Error("no graphic control extension before the first frame");
}

describe("planGifFrames", () => {
  it("samples floor(duration * fps / 1000) + 1 frames ending exactly at the duration", () => {
    const exact = planGifFrames(400, { fps: 10 });
    expect(exact.frameCount).toBe(5);
    expect(exact.times).toEqual([0, 100, 200, 300, 400]);
    expect(exact.frameDelay).toBe(100);
    expect(exact.lastDelay).toBe(900);

    const snapped = planGifFrames(450, { fps: 12, holdLast: 0 });
    expect(snapped.frameCount).toBe(Math.floor((450 * 12) / 1000) + 1);
    expect(snapped.times.at(-1)).toBe(450);
    expect(snapped.times.slice(0, -1)).toEqual([0, 1000 / 12, 2000 / 12, 3000 / 12, 4000 / 12]);
    expect(snapped.frameDelay).toBe(80);
    expect(snapped.lastDelay).toBe(80);

    const still = planGifFrames(0, { fps: 30 });
    expect(still.frameCount).toBe(1);
    expect(still.times).toEqual([0]);
    expect(still.frameDelay).toBe(30);
  });

  it("validates fps, holdLast, and maxFrames", () => {
    expect(() => planGifFrames(400, { fps: 0 })).toThrow(KineglyphExportError);
    expect(() => planGifFrames(400, { fps: 61 })).toThrow(KineglyphExportError);
    expect(() => planGifFrames(400, { holdLast: -1 })).toThrow(KineglyphExportError);
    expect(() => planGifFrames(400, { fps: 10, maxFrames: 4 })).toThrow(/lower fps/);
    try {
      planGifFrames(400, { fps: 10, maxFrames: 4 });
    } catch (error) {
      expect((error as KineglyphExportError).code).toBe("invalid-output");
    }
  });
});

describe("exportGif", () => {
  it("encodes every sampled frame with the expected delays and loop flag", async () => {
    const gif = await exportGif(scene, { fps: 10, fonts, scale: 0.5 });
    expect(String.fromCharCode(...gif.subarray(0, 6))).toBe("GIF89a");
    const info = gifInfo(gif);
    const expectedFrames = Math.floor((duration / 1000) * 10) + 1;
    expect(info.frameCount).toBe(expectedFrames);
    expect(info.width).toBe(Math.round(scene.width / 2));
    expect(info.height).toBe(Math.round(scene.height / 2));
    expect(info.delays.slice(0, -1)).toEqual(Array<number>(expectedFrames - 1).fill(100));
    expect(info.delays.at(-1)).toBe(100 + 800);
    expect(info.loop).toBe(true);
  });

  it("honours holdLast and loop", async () => {
    const gif = await exportGif(scene, { fps: 10, holdLast: 250, loop: false, fonts, scale: 0.25 });
    const info = gifInfo(gif);
    expect(info.delays.at(-1)).toBe(100 + 250);
    expect(info.loop).toBe(false);
  });

  it("is byte-for-byte deterministic", async () => {
    const first = await exportGif(scene, { fps: 10, fonts, scale: 0.5 });
    const second = await exportGif(scene, { fps: 10, fonts, scale: 0.5 });
    expect(Buffer.compare(first, second)).toBe(0);
  });

  it("produces a single frame for static scenes", async () => {
    const info = gifInfo(await exportGif(staticScene(), { fonts, scale: 0.25 }));
    expect(info.frameCount).toBe(1);
    expect(info.delays).toEqual([Math.round(100 / 12) * 10 + 800]);
  });

  it("supports transparent output", async () => {
    const gif = await exportGif(scene, { fps: 10, fonts, scale: 0.25, background: "transparent" });
    const info = gifInfo(gif);
    expect(info.frameCount).toBe(Math.floor((duration / 1000) * 10) + 1);
    // The first graphic control extension carries the transparency flag (bit 0 of packed byte).
    expect(firstGraphicControlPacked(gif) & 0x01).toBe(1);
    const opaque = await exportGif(scene, { fps: 10, fonts, scale: 0.25 });
    expect(firstGraphicControlPacked(opaque) & 0x01).toBe(0);
  });

  it("rejects invalid sampling settings", async () => {
    await expectCode(exportGif(scene, { fps: 0, fonts }), "invalid-output");
    await expectCode(exportGif(scene, { fps: 120, fonts }), "invalid-output");
    await expectCode(exportGif(scene, { fps: 60, maxFrames: 5, fonts }), "invalid-output");
    await expectCode(exportGif(scene, { width: 10, scale: 2, fonts }), "invalid-output");
  });

  it("parses GIF structure strictly", () => {
    expect(() => gifInfo(new Uint8Array([1, 2, 3]))).toThrow(TypeError);
  });
});
