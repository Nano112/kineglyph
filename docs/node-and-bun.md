# Generate glyphs with Node.js or Bun

Use this path when the result should be a file: an architecture diagram committed beside a README,
a chart generated during a documentation build, a social image, or a deterministic CI artifact.
There is no browser, canvas, framework, or dev server involved. A scene is ordinary ESM data; the
SVG renderer turns its resolved geometry into a string.

## The two-minute version

Create an empty directory and install the authoring core plus the SVG renderer:

```sh
mkdir first-glyph
cd first-glyph
npm init -y
npm install @kineglyph/core @kineglyph/svg
```

With Bun, the equivalent setup is:

```sh
mkdir first-glyph
cd first-glyph
bun init -y
bun add @kineglyph/core @kineglyph/svg
```

Save this as `glyph.mjs`. The `.mjs` suffix makes ESM explicit, so no `type` field or TypeScript
configuration is required.

```js
import { writeFile } from "node:fs/promises";
import { figure, kineglyphTheme, resolveScene } from "@kineglyph/core";
import { renderSvg } from "@kineglyph/svg";

const glyph = figure(
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

const resolved = resolveScene(glyph, { width: 640, theme: kineglyphTheme });
await writeFile("simple-glyph.svg", renderSvg(resolved), "utf8");

console.log("Wrote simple-glyph.svg");
```

Run it with either runtime:

```sh
node glyph.mjs
# or
bun glyph.mjs
```

The output is a standalone accessible SVG. Open it directly, use it in Markdown, or reference it
from HTML with `<img src="./simple-glyph.svg" alt="A tiny build pipeline">`.

## What the script produces

_Dogfood · this is the same scene structure used by the runnable Node/Bun example._

```kineglyph live id=node-bun-simple-glyph view=preview height=330
import { figure, kineglyphTheme } from "kineglyph";

export const theme = kineglyphTheme;

export default figure("node-bun-simple-glyph", {
  title: "A tiny build pipeline",
  description: "Source data becomes a portable SVG through one render step.",
}, (f) => {
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
  const edge = f.connect(source, output, { label: "render", head: "arrow" });

  f.root(f.graph([source, output], {
    style: "flow",
    direction: { wide: "horizontal", compact: "horizontal", narrow: "vertical" },
    layerGap: 40,
    padding: 20,
  }));
  f.sequence([f.reveal(source), f.draw(edge), f.reveal(output)]);
});
```

The runnable copy lives at `examples/node-bun/glyph.mjs`. It accepts an optional output path:

```sh
node examples/node-bun/glyph.mjs ./out/build-step.svg
bun examples/node-bun/glyph.mjs ./out/build-step.svg
```

## Width is an input, not a scale transform

Resolve the same definition again to produce a layout for another container:

```js
const desktop = resolveScene(glyph, { width: 960, theme: kineglyphTheme });
const phone = resolveScene(glyph, { width: 360, theme: kineglyphTheme });

await writeFile("glyph-wide.svg", renderSvg(desktop), "utf8");
await writeFile("glyph-narrow.svg", renderSvg(phone), "utf8");
```

At 360px the authored responsive direction changes to vertical. Text is measured and wrapped again,
connectors choose new endpoints, and groups receive new bounds. This is different from shrinking a
finished desktop SVG until its labels become unreadable.

## Add PNG or GIF output

Install the Node exporter when the build needs raster or animated files:

```sh
npm install @kineglyph/export
# or
bun add @kineglyph/export
```

The resolved scene remains the source of truth:

```js
import { exportGif, exportPng } from "@kineglyph/export";

await writeFile(
  "simple-glyph.png",
  await exportPng(resolved, {
    background: "theme",
    scale: 2,
  }),
);

await writeFile(
  "simple-glyph.gif",
  await exportGif(resolved, {
    background: "theme",
    fps: 12,
    holdLast: 600,
  }),
);
```

PNG and GIF use the same exact-time timeline as the browser runtime. For reproducible CI output,
provide repository-owned fonts and disable system-font discovery; see
[Tooling, scale, and output](./tooling-and-scale.md#fonts-transparency-and-reproducibility).
A scene without a timeline produces a one-frame GIF; add authored motion when the file should
animate.

## Keep scenes separate from build scripts

As a project grows, export the definition from `figures/build-step.mjs` and keep file policy in a
small build script:

```js
// figures/build-step.mjs
import { figure } from "@kineglyph/core";

export default figure("build-step", { title: "Build step" }, (f) => {
  // Author the scene here.
});
```

That module can be consumed by the CLI without writing a custom exporter:

```sh
npm install --save-dev @kineglyph/export
npx kineglyph-export svg --scene ./figures/build-step.mjs --out ./public/build-step.svg
npx kineglyph-export png --scene ./figures/build-step.mjs --out ./public/build-step.png --scale 2
```

Use `#namedExport` when a module contains several figures. The CLI also accepts themes, machine
states, timeline times, output sizes, layouts, GIF frame rates, and explicit fonts.

## Fast iteration

The shortest path is the bundled development CLI:

```sh
npx kineglyph create first-glyph
cd first-glyph
npm install
npm run dev
```

This opens a live-reloading TypeScript preview with an optional responsive composition debugger.
The generated project also includes `npm run render` and `npm run doctor`; it is intentionally
small enough to understand in one screen.

For an existing scene, run the server directly:

```sh
npx kineglyph dev ./figures/build-step.ts --port 4178
npx kineglyph render ./figures/build-step.ts --format svg --out ./public/build-step.svg --crop surface
```

The lower-level watch loop remains useful when a script produces several related files:

Both runtimes can rerun the generator whenever source files change:

```sh
node --watch glyph.mjs
# or
bun --watch glyph.mjs
```

Open the generated SVG beside the editor with a browser or image viewer that refreshes changed
files. For several outputs, export them all from one script so a save produces a coherent set.

## Which package do I need?

| Goal                         | Install                                          |
| ---------------------------- | ------------------------------------------------ |
| Author and generate SVG      | `@kineglyph/core`, `@kineglyph/svg`              |
| Compile charts               | add `@kineglyph/plot`                            |
| Generate PNG, GIF, or APNG   | add `@kineglyph/export`                          |
| Play or manipulate in a page | use `@kineglyph/web` instead of a file-only flow |

Continue with [Kineglyph in plain HTML](./plain-html.md) when the figure should stay live in the
reader's browser.
