import { mkdir, readdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

export interface ScaffoldResult {
  readonly directory: string;
  readonly files: readonly string[];
}

/** Creates a deliberately small TypeScript figure project. Existing non-empty folders are safe. */
export async function scaffoldFigure(directory = "kineglyph-figure"): Promise<ScaffoldResult> {
  const target = resolve(process.cwd(), directory);
  await mkdir(target, { recursive: true });
  const existing = await readdir(target);
  if (existing.length > 0) throw new Error(`${target} is not empty`);
  const files: Readonly<Record<string, string>> = {
    "package.json": `${JSON.stringify(
      {
        private: true,
        type: "module",
        scripts: {
          dev: "kineglyph dev figure.ts",
          render: "kineglyph render figure.ts --format svg --out figure.svg --crop surface",
          doctor: "kineglyph doctor --scene figure.ts",
        },
        dependencies: { "@kineglyph/core": "^0.3.1", "@kineglyph/web": "^0.3.1" },
        devDependencies: { "@kineglyph/export": "^0.4.1", typescript: "^5.9.3" },
      },
      undefined,
      2,
    )}\n`,
    "figure.ts": `import { figure, kineglyphTheme } from "@kineglyph/core";

export default figure({ title: "My first glyph" }, (f) => {
  const author = f.card({ title: "Author", body: "Structure and intent", tone: "accent" });
  const resolve = f.card({ title: "Resolve", body: "Container, theme, and state" });
  const render = f.card({ title: "Render", body: "SVG, PNG, GIF, or web", tone: "success" });
  const topology = f.pipeline([author, resolve, render]);
  f.root(f.surface(topology.root, { appearance: "card" }));
  f.sequence([topology.entrance]);
});

export { kineglyphTheme as theme };
`,
    "README.md": `# Kineglyph figure

\`npm run dev\` opens a live-reloading browser preview with the composition debugger available.
\`npm run render\` writes a tightly cropped SVG. \`npm run doctor\` audits all breakpoints.
`,
  };
  for (const [name, source] of Object.entries(files))
    await writeFile(resolve(target, name), source);
  return { directory: target, files: Object.keys(files) };
}
