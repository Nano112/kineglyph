import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

// The build-animation page needs a browser (WebGL, the WASM engine); what can be checked here is
// that every live block is a well-formed ES module with top-level await, and that its figure ids
// and exports follow the page's contract.
const source = readFileSync(resolve(process.cwd(), "docs/nucleation-builds.md"), "utf8");
const blocks = [...source.matchAll(/```kineglyph live id=([^\s]+)[^\n]*\n([\s\S]*?)```/g)].map(
  ([, id, body]) => ({ id: id as string, body: body as string }),
);

describe("nucleation-builds docs", () => {
  it("documents the beacon, the nook, and the GLB-anywhere block", () => {
    expect(blocks.map((block) => block.id)).toEqual([
      "nucleation-beacon",
      "nucleation-nook",
      "nucleation-glb-anywhere",
    ]);
  });

  it("every block parses as an ES module", () => {
    const dir = mkdtempSync(join(tmpdir(), "kineglyph-nucleation-docs-"));
    try {
      for (const block of blocks) {
        const file = join(dir, `${block.id}.mjs`);
        writeFileSync(file, block.body);
        expect(() =>
          execFileSync(process.execPath, ["--check", file], { stdio: "pipe" }),
        ).not.toThrow();
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("the sheets export a surface and frame signals and declare their signals", () => {
    for (const block of blocks.slice(0, 2)) {
      expect(block.body).toContain("export const liveSurfaces");
      expect(block.body).toContain("export const frameSignals");
      expect(block.body).toContain("anchorSignalDefaults(NOTES)");
      expect(block.body).toContain('id: "build-view"');
    }
  });
});
