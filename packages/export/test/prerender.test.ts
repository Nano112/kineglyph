import { describe, expect, it } from "vitest";
import { prerender, rewriteImports } from "../src/prerender.js";
import { createTheme, defaultTheme } from "@kineglyph/core";

/** Visibly different from `defaultTheme` so per-theme output can be told apart. */
const darkTheme = createTheme({
  name: "dark",
  colors: { canvas: "#0b0f17", surface: "#131a26", text: "#f2f5fa", accent: "#7dd3fc" },
});

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

  it("rewrites re-export specifiers", () => {
    const out = rewriteImports(`export { a } from "./z.mjs";`, (s) => `URL(${s})`);
    expect(out).toContain(`from "URL(./z.mjs)"`);
  });
});

describe("prerender", () => {
  it("renders one SVG per theme from an inline module", async () => {
    const results = await prerender(SCENE, {
      themes: [
        { name: "light", tokens: defaultTheme },
        { name: "dark", tokens: darkTheme },
      ],
      width: 640,
    });
    expect(results.map((r) => r.theme)).toEqual(["light", "dark"]);
    for (const r of results) {
      expect(r.svg.startsWith("<?xml") || r.svg.startsWith("<svg")).toBe(true);
      expect(r.svg).toContain("Hello");
      expect(r.width).toBeGreaterThan(0);
    }
    // each theme really is rendered with its own tokens, not just labelled differently
    expect(results[0]!.svg).not.toBe(results[1]!.svg);
    expect(results[1]!.svg).toContain("#f2f5fa");
  });

  it("rejects a module without a default FigureSource export", async () => {
    await expect(
      prerender(`export const nope = 1;`, { themes: [{ name: "light", tokens: defaultTheme }] }),
    ).rejects.toThrow(/default export/);
  });

  it("resolves relative imports against baseUrl", async () => {
    // Write a helper module to a temp dir and import it relatively.
    const fsPromises = await import("node:fs/promises");
    const { tmpdir } = await import("node:os");
    const path = await import("node:path");
    const { pathToFileURL } = await import("node:url");
    const dir = await fsPromises.mkdtemp(path.join(tmpdir(), "kg-prerender-"));
    await fsPromises.writeFile(path.join(dir, "helper.mjs"), `export const TITLE = "From helper";`);
    const src = `
      import { defineScene, stack, heading } from "kineglyph";
      import { TITLE } from "./helper.mjs";
      export default defineScene({ schemaVersion: 2, id: "rel", title: TITLE,
        root: stack("r", [heading("h", TITLE)], { padding: 8, width: "fill" }) });`;
    const [r] = await prerender(src, {
      themes: [{ name: "light", tokens: defaultTheme }],
      baseUrl: pathToFileURL(path.join(dir, "scene.mjs")).href,
    });
    expect(r?.svg).toContain("From helper");
  });
});
