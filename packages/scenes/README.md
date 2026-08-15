# @kineglyph/scenes

The Kineglyph illustration catalogue: eight Nucleation figures authored as semantic scene
definitions, the three product themes (Nucleation, Pock, Schematio), and the recipes they share.

```ts
import { catalogue, findCatalogueEntry, themes } from "@kineglyph/scenes";

const entry = findCatalogueEntry("smart-simulation");
mountKineglyph(element, { scene: entry.scene, theme: themes.pock });
```

Every `CatalogueEntry` carries `slug`, `order`, `title`, `summary`, `concept`, `interaction`,
`animation`, `source` (the read-only reference asset it rebuilds), and the `scene` itself.

## The eight scenes

| Order | Slug                     | Concept                                                                 |
| ----- | ------------------------ | ----------------------------------------------------------------------- |
| 1     | `fast-generation`        | Workload shapes route to the correct bulk API; compare call overhead    |
| 2     | `shapes-and-brushes`     | Shape selects cells, brush assigns material, composition builds         |
| 3     | `sdf-and-fields`         | One scalar field drives displacement and material; branch and merge     |
| 4     | `palettes-and-color`     | Source colour → Oklab → filtered palette → nearest/gradient/ramp/dither |
| 5     | `smart-simulation`       | State-machine laboratory: intent + capabilities → recommended engine    |
| 6     | `formats-and-io`         | Detectors converge on one editable model, then fan out to formats       |
| 7     | `bindings-and-languages` | Rust core + bridge annotations generate six language surfaces           |
| 8     | `meshing-and-rendering`  | Schematic → mesh layers → portable data or native renderer              |

## Authoring conventions

- Scenes are `defineScene({...})` calls built from `@kineglyph/core` primitives and the recipes in
  `src/recipes.ts` (`card`, `panel`, `pill`, `eyebrow`, `heading`, `caption`, `code`, `motif`,
  `stack`, `row`, `grid`, `overlay`, `flow`, `rule`, `spacer`, `keyValue`).
- Named layouts: use `Responsive` values (`{ wide, compact, narrow }`) and the `flow` recipe (row
  on wide, stack otherwise); give compact layouts side gutters so U-turn routes have room.
- Colour comes only from tones (`accent`, `info`, `success`, `warning`, `danger`, `muted`,
  `neutral`) and semantic tokens; themes project everything else.
- Every scene has a title, a description, a purposeful timeline (`reveal`, `drawEdge`, `flow`,
  `highlight`, `pulse`, `progressTo`, `timeline` from core), a complete terminal frame, and at
  least one interaction: interactive nodes with descriptions and/or a state machine with
  `controls` (`activeWhen` marks the pressed state).
- Bindings (`bind: { text, hidden, tone, opacity, highlight, ... }`) read machine signals so one
  scene definition renders every state deterministically — including in static exports
  (`kineglyph-export png --state <id>`).

## Acceptance harness

`test/scenes.test.ts` resolves every scene at 1200 / 820 / 390 px in all three themes and
requires finite in-canvas geometry, no overlap / overflow / truncation diagnostics, deterministic
output, a complete terminal frame that differs from t = 0, real catalogue copy, working machine
events, and — across the catalogue — every route, at least four marker kinds, three stroke
styles, labels, packets, and a two-way edge. `test/export.test.ts` exports each scene to SVG, PNG,
and GIF. `scripts/preview.mjs` renders the whole catalogue (and the first machine states) into
one HTML page for visual review.
