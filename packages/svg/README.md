# @kineglyph/svg

The SVG renderer for [Kineglyph](https://github.com/Nano112/kineglyph). It takes a `ResolvedScene`
from [`@kineglyph/core`](../core) and returns a string of SVG — no DOM, no browser, no side
effects, so the same call produces the same bytes in Node and in a page.

```bash
npm install @kineglyph/svg
```

```ts
import { resolveScene } from "@kineglyph/core";
import { renderToSvg } from "@kineglyph/svg";

const svg = renderToSvg(resolveScene(scene), { idPrefix: "fig-1", title: "How it fits together" });
```

Every generated DOM id is prefixed by `idPrefix`, which is what makes two figures safe to inline
into one document: without it, the second figure's gradients and markers would quietly win.

## What is in here

- `renderToSvg(scene, options)` / `renderSvg` — the whole figure, root element included.
- `renderMicroSvg(values, options)` — a standalone 16-pixel line, area, bar, pie, or donut chart
  with no scene runtime; useful for dense tables and status lists.
- `parseMicroValues("5,3,9")` — the compact comma/slash-delimited input accepted by microcharts.
- `wrapSvgText` — line breaking with the metrics the renderer actually uses, so a label you
  measure yourself lands where the renderer would have put it.
- `MOTIFS` / `motifShapes` — the built-in glyph set.
- The paint, dash, marker, and transform helpers ([`@kineglyph/anime`](../anime) drives the same
  attributes when it animates a scene, so both agree on what a "dashed edge" means).

Accessibility is not an option you switch on: the root carries `role`, an accessible name from the
scene's title, and a description, and interactive scenes render as `role="group"` rather than
`img`.

Microcharts are decorative by default because a table often already writes the value. Pass
`label` when the shape communicates information the surrounding text does not:

```ts
import { renderMicroSvg } from "@kineglyph/svg";

cell.innerHTML = renderMicroSvg([31, 28, 35, 42, 39], {
  type: "line",
  label: "Five recent latency samples",
});
```

## Licence

MIT — see [LICENSE](./LICENSE).
