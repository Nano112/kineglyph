import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "vitest";
import { prerender } from "@kineglyph/export";
import { paperDraftingTheme, studioTheme } from "@kineglyph/web/bundle";

// Exercise the real editable modules with Node's actual globals, not browser shims.
const pages = {
  "nucleation-builds.md": [
    "nucleation-beacon",
    "nucleation-nook",
    "nucleation-parametric",
    "nucleation-glb-anywhere",
  ],
  "minecraft-sdf-guide.md": [
    "minecraft-solar-system-builder",
    "minecraft-build-and-palette",
    "minecraft-model-workbench",
  ],
};
for (const [page, ids] of Object.entries(pages)) {
  const url = new URL(`../docs/${page}`, import.meta.url);
  const markdown = await readFile(url, "utf8");
  const snippets = new Map(
    [...markdown.matchAll(/```kineglyph live id=(\S+)[^\n]*\n([\s\S]*?)```/g)].map((match) => [
      match[1],
      match[2],
    ]),
  );
  for (const id of ids) {
    test(`${id}: prerender preserves the image fallback without browser globals`, async () => {
      assert.equal(typeof window, "undefined");
      assert.equal(typeof location, "undefined");
      assert.equal(typeof customElements, "undefined");
      assert.ok(snippets.has(id));
      const results = await prerender(snippets.get(id), {
        baseUrl: url.href,
        widths: [480, 960],
        themes: [
          {
            name: "light",
            tokens: page.startsWith("nucleation") ? paperDraftingTheme : studioTheme,
          },
        ],
      });
      assert.equal(results.length, 2);
      const image =
        id === "minecraft-build-and-palette" ? "gyroid-bloom.gif" : "field-observatory.png";
      for (const result of results) {
        assert.ok(result.svg.includes(`../assets/nucleation/${image}`));
        assert.ok(result.inlineSvg.includes(`../assets/nucleation/${image}`));
        assert.ok(result.width > 0 && result.height > 0);
      }
    });
  }
}
