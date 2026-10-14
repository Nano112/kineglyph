import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { resolveScene } from "./resolve.js";
import type { SceneDefinition } from "./scene.js";
import type { ThemeTokens } from "./theme.js";

const root = resolve(process.cwd(), "packages/core/src/zz-glyph-style-docs");
const blocks = [
  ...readFileSync("docs/glyph-style-lab.md", "utf8").matchAll(
    /```kineglyph live id=([^\s]+)[^\n]*\n([\s\S]*?)```/g,
  ),
].map(([, id, body]) => ({ id: id!, body: body! }));
beforeAll(() => {
  mkdirSync(root, { recursive: true });
});
afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});
async function load(block: (typeof blocks)[number]) {
  const file = resolve(root, `${block.id}.mjs`);
  writeFileSync(file, block.body.replace(/from "kineglyph"/g, 'from "../index.js"'));
  return (await import(/* @vite-ignore */ file)) as {
    default: SceneDefinition;
    theme: ThemeTokens;
  };
}
describe("glyph style lab", () => {
  it("compares Anatomy light and dark across all three specimens", () => {
    for (const theme of ["anatomy", "anatomy-dark"])
      for (const specimen of ["route", "fan", "console"])
        expect(blocks.map((b) => b.id)).toContain(`style-${theme}-${specimen}`);
  });
  for (const block of blocks) {
    it(`${block.id} resolves at desktop and phone widths`, async () => {
      const mod = await load(block);
      for (const width of [960, 640, 390, 320]) {
        const scene = resolveScene(mod.default, { width, theme: mod.theme });
        expect(scene.diagnostics ?? [], `${block.id} @${width}`).toEqual([]);
        if (block.id === "style-integration-host") {
          const chips = scene.nodes.filter((n) =>
            ["copilot", "acp", "agent-host", "ide", "web", "cli", "mobile"].includes(n.id),
          );
          expect(chips).toHaveLength(7);
          for (let i = 0; i < chips.length; i++) {
            for (const b of chips.slice(i + 1)) {
              const a = chips[i]!;
              const dx = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
              const dy = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
              expect(dx <= 0 || dy <= 0, `${a.id} overlaps ${b.id} @${width}`).toBe(true);
            }
          }
        }
        if (block.id.endsWith("console")) {
          const tiles = scene.nodes.filter((n) => n.metadata?.diagramRole === "tile-node");
          expect(tiles).toHaveLength(4);
          expect(tiles[0]!.y).toBeCloseTo(tiles[1]!.y);
          expect(tiles[2]!.y).toBeCloseTo(tiles[3]!.y);
          expect(tiles[1]!.x).toBeGreaterThan(tiles[0]!.x + tiles[0]!.width);
          const grid = scene.nodes.find((n) => n.id === tiles[0]!.parent)!;
          expect(tiles[0]!.width * 2 + 12).toBeCloseTo(grid.width);
          for (const tile of tiles) {
            expect(tile.x).toBeGreaterThanOrEqual(0);
            expect(tile.x + tile.width).toBeLessThanOrEqual(width);
          }
        }
      }
    });
  }
});
