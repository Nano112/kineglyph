import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const packages = ["core", "svg", "anime", "plot", "scenes", "web", "react", "export"];

describe("export conditions", () => {
  for (const name of packages) {
    it(`@kineglyph/${name} exposes a development condition pointing at src`, () => {
      const pkg = JSON.parse(readFileSync(resolve(root, "packages", name, "package.json"), "utf8"));
      const entry = pkg.exports["."];
      expect(entry.development, `${name} missing exports["."].development`).toMatch(/^\.\/src\/index\.tsx?$/);
      expect(existsSync(resolve(root, "packages", name, entry.development))).toBe(true);
      // condition order matters: development must come before import so Vite dev wins
      const keys = Object.keys(entry);
      expect(keys.indexOf("development")).toBeLessThan(keys.indexOf("import"));
    });
  }

  it("@kineglyph/web ./bundle exposes a development condition pointing at src/bundle.ts", () => {
    const pkg = JSON.parse(readFileSync(resolve(root, "packages/web/package.json"), "utf8"));
    const entry = pkg.exports["./bundle"];
    expect(entry.development).toBe("./src/bundle.ts");
    expect(entry.import).toBe("./dist/kineglyph-web.js");
    expect(existsSync(resolve(root, "packages/web/src/bundle.ts"))).toBe(true);
    // condition order matters: development must come before import so Vite dev wins
    const keys = Object.keys(entry);
    expect(keys.indexOf("development")).toBeLessThan(keys.indexOf("import"));
  });
});
