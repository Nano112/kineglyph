import { describe, expect, it } from "vitest";
import { prerender, rewriteImports } from "../src/prerender.js";
import { defaultTheme } from "@kineglyph/core";

const SCENE = `
import { defineScene, stack, heading } from "kineglyph";
export default defineScene({
  schemaVersion: 2,
  id: "prerender-smoke",
  title: "Prerender smoke",
  root: stack("root", [heading("h", "Hello")], { padding: 16, width: "fill" }),
});
`;

describe("rewriteImports", () => {
  it("rewrites static, side-effect and dynamic imports but not strings elsewhere", () => {
    const src = `import { a } from "kineglyph";\nimport "./side.mjs";\nconst x = await import('../y.mjs');\nconst s = "kineglyph";`;
    const out = rewriteImports(src, (s) => `URL(${s})`);
    expect(out).toContain(`from "URL(kineglyph)"`);
    expect(out).toContain(`import "URL(./side.mjs)"`);
    expect(out).toContain(`import("URL(../y.mjs)")`);
    expect(out).toContain(`const s = "kineglyph"`);
  });
});

describe("prerender", () => {
  it("renders one SVG per theme from an inline module", async () => {
    const results = await prerender(SCENE, {
      themes: [
        { name: "light", tokens: defaultTheme },
        { name: "dark", tokens: defaultTheme },
      ],
      width: 640,
    });
    expect(results.map((r) => r.theme)).toEqual(["light", "dark"]);
    for (const r of results) {
      expect(r.svg.startsWith("<?xml") || r.svg.startsWith("<svg")).toBe(true);
      expect(r.svg).toContain("Hello");
      expect(r.width).toBeGreaterThan(0);
    }
  });

  it("rejects a module without a default FigureSource export", async () => {
    await expect(
      prerender(`export const nope = 1;`, { themes: [{ name: "light", tokens: defaultTheme }] }),
    ).rejects.toThrow(/default export/);
  });

  it("resolves relative imports against baseUrl", async () => {
    // Write a helper module to a temp dir and import it relatively.
    const { mkdtemp, writeFile } = await import("node:fs/promises");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const { pathToFileURL } = await import("node:url");
    const dir = await mkdtemp(join(tmpdir(), "kg-prerender-"));
    await writeFile(join(dir, "helper.mjs"), `export const TITLE = "From helper";`);
    const src = `
      import { defineScene, stack, heading } from "kineglyph";
      import { TITLE } from "./helper.mjs";
      export default defineScene({ schemaVersion: 2, id: "rel", title: TITLE,
        root: stack("r", [heading("h", TITLE)], { padding: 8, width: "fill" }) });`;
    const [r] = await prerender(src, {
      themes: [{ name: "light", tokens: defaultTheme }],
      baseUrl: pathToFileURL(join(dir, "scene.mjs")).href,
    });
    expect(r?.svg).toContain("From helper");
  });
});
