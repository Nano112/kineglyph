# @kineglyph/scenes

Generic example scenes and themes used by the Kineglyph playground and test suite. Consumer
applications should keep their own catalogue beside their product code and pass it to the web
runtime explicitly.

```ts
import { catalogue, themes } from "@kineglyph/scenes";
import { mountKineglyph } from "@kineglyph/web";

mountKineglyph(element, {
  scene: catalogue[0].scene,
  theme: themes.paper,
});
```

The package deliberately contains no application, documentation-site, or customer-specific
scenes. Its small catalogue exercises diagrams, plots, responsive layouts, timelines, state
machines, and deterministic export.

## Authoring conventions

- Build scenes from `@kineglyph/core` primitives and semantic tokens.
- Express responsive values with `wide`, `compact`, and `narrow` variants.
- Keep data labelled as illustrative unless it comes from a published source.
- Give animated scenes a complete terminal frame and reduced-motion behavior.
- Put integration-specific live surfaces in the consuming application.

The tests resolve every example at desktop, tablet, and phone widths across all example themes,
then export the same definitions to SVG, PNG, and GIF.
