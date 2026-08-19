import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { figure, kineglyphTheme, resolveScene } from "@kineglyph/core";
import { renderSvg } from "@kineglyph/svg";

export const glyph = figure(
  "simple-build-step",
  {
    title: "A tiny build pipeline",
    description: "Source data becomes a portable SVG through one render step.",
  },
  (f) => {
    const source = f.card({
      eyebrow: "INPUT",
      title: "source.ts",
      body: "Plain serializable data",
      motif: "code",
      compact: true,
    });
    const output = f.card({
      eyebrow: "OUTPUT",
      title: "glyph.svg",
      body: "Responsive vector output",
      motif: "spark",
      tone: "success",
      compact: true,
    });

    f.connect(source, output, { label: "render", head: "arrow" });
    f.root(
      f.graph([source, output], {
        style: "flow",
        direction: { wide: "horizontal", compact: "horizontal", narrow: "vertical" },
        layerGap: 40,
        padding: 20,
      }),
    );
  },
);

const entry = process.argv[1];
if (entry !== undefined && import.meta.url === pathToFileURL(resolve(entry)).href) {
  const resolved = resolveScene(glyph, { width: 640, theme: kineglyphTheme });
  const output = process.argv[2] ?? new URL("./simple-glyph.svg", import.meta.url);

  await writeFile(output, renderSvg(resolved), "utf8");
  console.log(`Wrote ${output instanceof URL ? output.pathname : output}`);
}
