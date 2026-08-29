import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { parseSurfaceSpec, surfaceSubstitutes } from "../src/surfaces.js";

// A 1×1 PNG.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);
const dir = mkdtempSync(join(tmpdir(), "kineglyph-surfaces-"));
for (const index of [0, 1, 2])
  writeFileSync(join(dir, `build-${String(index).padStart(4, "0")}.png`), PNG);
writeFileSync(join(dir, "single.png"), PNG);
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe("surface substitutes", () => {
  it("parses nodeId=path", () => {
    expect(parseSurfaceSpec("view=frames/build-{frame}.png")).toEqual({
      nodeId: "view",
      path: "frames/build-{frame}.png",
    });
    expect(() => parseSurfaceSpec("view")).toThrow(/nodeId/);
  });

  it("picks the frame by time and holds the last one", () => {
    const at = surfaceSubstitutes([{ nodeId: "view", path: "build-{frame}.png" }], 12, dir);
    const first = at(0).view;
    expect(first?.startsWith("data:image/png;base64,")).toBe(true);
    expect(at(1000 / 12).view).toBe(first); // frame 1: same bytes, same URI
    expect(at(10_000).view).toBe(first); // clamped to the last frame
    expect(Object.keys(at(0))).toEqual(["view"]);
  });

  it("accepts printf patterns and single files", () => {
    expect(
      surfaceSubstitutes([{ nodeId: "v", path: "build-%04d.png" }], 12, dir)(0).v,
    ).toBeDefined();
    expect(
      surfaceSubstitutes([{ nodeId: "v", path: "single.png" }], 12, dir)(5000).v,
    ).toBeDefined();
    expect(() =>
      surfaceSubstitutes([{ nodeId: "v", path: "missing-{frame}.png" }], 12, dir),
    ).toThrow(/matched no files/);
  });
});
