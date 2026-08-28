import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { startDevServer } from "../src/dev-server.js";
import { scaffoldFigure } from "../src/scaffold.js";

const created: string[] = [];

afterEach(async () => {
  await Promise.all(
    created.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("unified kineglyph CLI helpers", () => {
  it("scaffolds the concise surface and topology workflow", async () => {
    const root = await mkdtemp(join(tmpdir(), "kineglyph-create-"));
    created.push(root);
    const target = join(root, "figure");
    const result = await scaffoldFigure(target);
    expect(result.files).toEqual(["package.json", "figure.ts", "README.md"]);
    const source = await readFile(join(target, "figure.ts"), "utf8");
    expect(source).toContain("f.pipeline");
    expect(source).toContain("f.surface");
    await expect(scaffoldFigure(target)).rejects.toThrow("is not empty");
  });

  it("serves and transpiles a live TypeScript figure", async () => {
    const root = await mkdtemp(join(tmpdir(), "kineglyph-dev-"));
    created.push(root);
    const source = join(root, "figure.ts");
    await writeFile(
      source,
      'import type { SceneDefinition } from "@kineglyph/core";\nconst scene: SceneDefinition = {} as SceneDefinition;\nexport default scene;\n',
    );
    const server = await startDevServer({ scene: source, port: 0 });
    try {
      expect(await (await fetch(server.url)).text()).toContain("Kineglyph live preview");
      const module = await (await fetch(new URL("figure.js", server.url))).text();
      expect(module).not.toContain("import type");
      expect(module).toContain("export default scene");
    } finally {
      await server.close();
    }
  });
});
