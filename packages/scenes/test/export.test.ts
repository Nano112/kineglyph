import { describe, expect, it } from "vitest";
import { resolveScene } from "@kineglyph/core";
import { exportGif, exportPng, exportSvg, gifInfo, pngInfo } from "@kineglyph/export";
import { catalogue, themes } from "../src/index.js";

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

describe("catalogue export", () => {
  for (const entry of catalogue) {
    it(`${entry.slug} exports to SVG, PNG, and GIF from the same semantic scene`, async () => {
      const resolved = resolveScene(entry.scene, { width: 820, theme: themes.paper });
      const svg = exportSvg(resolved);
      expect(svg.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
      expect(svg).toContain(`data-kineglyph-scene="${entry.scene.id}"`);
      expect(svg).toContain('class="kg-export-background"');

      const png = await exportPng(resolved, { scale: 0.5 });
      expect([...png.subarray(0, 8)]).toEqual(PNG_SIGNATURE);
      expect(pngInfo(png)).toEqual({ width: 410, height: Math.round(resolved.height * 0.5) });

      const duration = resolved.timeline?.duration ?? 0;
      expect(duration).toBeGreaterThan(0);
      const gif = await exportGif(resolved, { fps: 2, holdLast: 500, scale: 0.25 });
      expect(String.fromCharCode(...gif.subarray(0, 6))).toBe("GIF89a");
      const info = gifInfo(gif);
      expect(info.frameCount).toBe(Math.floor((duration * 2) / 1000) + 1);
      expect(info.width).toBe(205);
      expect(info.loop).toBe(true);
    }, 30_000);
  }
});
