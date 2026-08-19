import { describe, expect, it } from "vitest";
import {
  bytesToDataUri,
  exportApng,
  exportImageSequence,
  exportSpriteSheet,
  planFrameSequence,
} from "../src/index.js";
import { animatedScene, testFonts } from "./helpers.js";

function chunkNames(png: Uint8Array): string[] {
  const names: string[] = [];
  let offset = 8;
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  while (offset + 12 <= png.length) {
    const length = view.getUint32(offset);
    names.push(new TextDecoder().decode(png.subarray(offset + 4, offset + 8)));
    offset += 12 + length;
  }
  return names;
}

describe("additional export targets", () => {
  it("exports timestamped image sequences and sprite sheets", async () => {
    const scene = animatedScene(320);
    const plan = planFrameSequence(scene, { fps: 5 });
    const frames = await exportImageSequence(scene, { fps: 5, fonts: testFonts, scale: 0.2 });
    expect(frames).toHaveLength(plan.frameCount);
    expect(frames[0]?.filename).toBe("frame-0000.png");
    expect(String.fromCharCode(...(frames[0]?.png.subarray(1, 4) ?? []))).toBe("PNG");
    const sheet = await exportSpriteSheet(scene, { fps: 5, columns: 2, fonts: testFonts });
    expect(sheet.columns).toBe(2);
    expect(sheet.frames).toHaveLength(plan.frameCount);
    expect(sheet.svg).toContain("data:image/svg+xml;base64,");
    expect(bytesToDataUri(sheet.png, "image/png")).toMatch(/^data:image\/png;base64,/);
  });

  it("encodes a standards-shaped animated PNG", async () => {
    const apng = await exportApng(animatedScene(240), {
      fps: 5,
      fonts: testFonts,
      scale: 0.2,
      holdLast: 100,
    });
    expect([...apng.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    expect(chunkNames(apng)).toEqual(
      expect.arrayContaining(["IHDR", "acTL", "fcTL", "IDAT", "fdAT", "IEND"]),
    );
  });
});
