# `@kineglyph/core`

Typed scene, theme, layout, timeline, and material primitives. Scenes are plain serialisable data:
`defineScene()` validates a definition, the recipes (`stack`, `row`, `heading`, `caption`, `code`,
`card`, `panel`, …) compose it, `resolveFigure()` lays it out for a width and theme, and
`seekTimeline()` produces a frame that any renderer can draw.

## Simple scenes from data (`sceneFromSpec`)

Most diagrams are a handful of labelled boxes with arrows between them. `SimpleSceneSpec` describes
exactly that much as JSON, so a form-based builder — a WYSIWYG editor, a CMS field, a generator —
can produce a figure and re-open it later without emitting code. `validateSpec()` checks untrusted
data and names every problem by its path (`nodes[2].kind`); `sceneFromSpec()` returns a normal
`SceneDefinition` and throws with those same messages when the spec is unusable.

```json
{
  "version": 1,
  "id": "formats",
  "title": "Formats and I/O",
  "layout": "stack",
  "gap": 16,
  "padding": 24,
  "background": "canvas",
  "nodes": [
    { "id": "intro", "kind": "heading", "text": "Detect, model, export" },
    { "id": "detail", "kind": "caption", "text": "Every parser converges on one model." },
    {
      "id": "outputs",
      "kind": "box",
      "title": "Outputs",
      "body": "Export is an explicit destination choice.",
      "tone": "accent",
      "layout": "row",
      "children": [
        { "id": "schem", "kind": "code", "text": ".schem" },
        { "id": "litematic", "kind": "code", "text": ".litematic" }
      ]
    }
  ],
  "edges": [
    { "from": "intro", "to": "detail", "label": "then" },
    { "from": "detail", "to": "outputs", "head": "arrow", "style": "flow" }
  ],
  "timeline": "reveal"
}
```

```ts
import { defaultTheme, resolveFigure, sceneFromSpec, validateSpec } from "@kineglyph/core";

const check = validateSpec(json); // { ok, errors: ["nodes[2].kind: expected one of …"] }
const scene = sceneFromSpec(json as SimpleSceneSpec);
const resolved = resolveFigure(scene, { width: 800, theme: defaultTheme });
```

- **Nodes** are `heading`, `caption`, `code`, `text` (body copy), or `box`. A box is a framed
  `material("flat")` group whose `title` is a heading, `body` a caption, and `children` are laid out
  by its own `layout` (`stack` or `row`). `tone` is a semantic paint (`accent`, `success`, `danger`,
  `info`, `warning`, `muted`, `neutral`, `text`, `textMuted`, `border`, `connector`).
- **Edges** connect node ids, route `straight`, carry an optional `label`, an `arrow` head by
  default, and a `solid`, `dashed`, or `flow` stroke; `flow` edges also carry packets.
- **Timeline** `reveal` (the default) fades each top-level node in turn and then draws the edges,
  matching the rhythm of the hand-authored catalogue scenes. `none` leaves the scene static.
- **Ids are deterministic**: the root group is `root`, a spec node `a` becomes `n:a` (with
  `n:a:title`, `n:a:body`, `n:a:children` inside a box), and the nth edge becomes `en:from:to`. The
  same spec always produces the same scene, so specs diff cleanly and round-trip through an editor.

Anything richer — state machines, controls, bindings, plots, coordinates — is authored with
`defineScene()` and the recipes; a spec is the small, data-shaped subset, not a replacement.
