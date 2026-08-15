import { describe, expect, it } from "vitest";
import type { ResolvedScene } from "@kineglyph/core";
import { KineglyphExportError, exportPng, pngInfo } from "../src/index.js";
import { renderRaster } from "../src/raster.js";
import { buildSvgDocument } from "../src/svg.js";
import { animatedScene, testFonts } from "./helpers.js";

const scene = animatedScene();
const fonts = testFonts;
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

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

function withImageNode(base: ResolvedScene, extra: Record<string, unknown>): ResolvedScene {
  const node = {
    id: "camera",
    kind: "image",
    x: 0,
    y: 0,
    width: 40,
    height: 40,
    label: "Camera",
    appearance: { fill: "#fff", stroke: "#000", strokeWidth: 1, radius: 0 },
    state: { opacity: 1, translateX: 0, translateY: 0, scale: 1, progress: 1 },
    interactive: false,
    focusable: false,
    metadata: {},
    ...extra,
  };
  return { ...base, nodes: [...base.nodes, node as unknown as ResolvedScene["nodes"][number]] };
}

describe("exportPng", () => {
  it("writes a PNG whose dimensions follow the scene size and scale", async () => {
    // Default options: system fonts are loaded.
    const png = await exportPng(scene);
    expect([...png.subarray(0, 8)]).toEqual(PNG_SIGNATURE);
    expect(pngInfo(png)).toEqual({ width: scene.width, height: scene.height });

    const half = await exportPng(scene, { scale: 0.5, fonts });
    expect(pngInfo(half)).toEqual({
      width: Math.round(scene.width / 2),
      height: Math.round(scene.height / 2),
    });

    const boxed = await exportPng(scene, { width: 300, height: 300, fonts });
    expect(pngInfo(boxed)).toEqual({ width: 300, height: 300 });

    const byHeight = await exportPng(scene, { height: 90, fonts });
    expect(pngInfo(byHeight)).toEqual({
      width: Math.round((90 * scene.width) / scene.height),
      height: 90,
    });
  });

  it("is byte-for-byte deterministic", async () => {
    const [first, second] = await Promise.all([
      exportPng(scene, { scale: 0.5, fonts }),
      exportPng(scene, { scale: 0.5, fonts }),
    ]);
    expect(Buffer.compare(first, second)).toBe(0);
    const later = await exportPng(scene, { scale: 0.5, fonts });
    expect(Buffer.compare(first, later)).toBe(0);
  });

  it("paints theme colours (not black) once CSS variables are inlined", async () => {
    const document = buildSvgDocument(scene, {}, { raster: true });
    expect(document.svg).not.toContain("var(--");
    expect(document.svg).not.toContain("pathLength=");
    const image = await renderRaster(document, fonts);
    const first = scene.nodes[0];
    if (first === undefined) throw new Error("fixture has no nodes");
    const pixel = (x: number, y: number): number[] => {
      const offset = (Math.round(y) * image.width + Math.round(x)) * 4;
      return [...image.pixels.subarray(offset, offset + 4)];
    };
    // Node interior is the surface colour, canvas corner is the theme background.
    expect(pixel(first.x + 4, first.y + first.height / 2)).toEqual([255, 255, 255, 255]);
    expect(pixel(1, 1)).toEqual([0xf7, 0xf8, 0xfa, 255]);
  });

  it("supports transparent backgrounds", async () => {
    const document = buildSvgDocument(scene, { background: "transparent" }, { raster: true });
    const image = await renderRaster(document, fonts);
    expect([...image.pixels.subarray(0, 4)]).toEqual([0, 0, 0, 0]);
    expect(pngInfo(await exportPng(scene, { background: "transparent", fonts }))).toEqual({
      width: scene.width,
      height: scene.height,
    });
  });

  it("renders intermediate frames when a time is given", async () => {
    const start = await exportPng(scene, { time: 0, scale: 0.5, fonts });
    const end = await exportPng(scene, { scale: 0.5, fonts });
    expect(Buffer.compare(start, end)).not.toBe(0);
    await expectCode(exportPng(scene, { time: -5, fonts }), "invalid-time");
  });

  it("validates fonts before rendering", async () => {
    await expectCode(
      exportPng(scene, { fonts: { files: ["/definitely/missing/font.ttf"] } }),
      "missing-font",
    );
    await expectCode(exportPng(scene, { fonts: { loadSystemFonts: false } }), "missing-font");
  });

  it("rejects live media and contradictory output settings", async () => {
    await expectCode(
      exportPng(withImageNode(scene, { image: { live: true } }), { fonts }),
      "live-media",
    );
    await expectCode(
      exportPng(withImageNode(scene, { metadata: { live: true } }), { fonts }),
      "live-media",
    );
    // A static image node is fine.
    const staticImage = await exportPng(withImageNode(scene, { image: { live: false } }), {
      scale: 0.25,
      fonts,
    });
    expect(pngInfo(staticImage).width).toBeGreaterThan(0);
    await expectCode(exportPng(scene, { width: 100, scale: 2, fonts }), "invalid-output");
    await expectCode(exportPng(scene, { scale: 0, fonts }), "invalid-output");
  });

  it("parses PNG headers strictly", () => {
    expect(() => pngInfo(new Uint8Array([1, 2, 3]))).toThrow(TypeError);
  });
});
