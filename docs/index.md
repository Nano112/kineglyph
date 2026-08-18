# Kineglyph

Kineglyph turns compact scene definitions into deterministic technical illustrations. The same
scene can be responsive, animated, interactive, themeable, rendered as SVG in a browser, or
exported reproducibly to PNG and GIF.

The example below is the documentation: edit its labels, tones, layout, or timeline and the
preview updates without reloading this page.

```kineglyph live id=first-live-figure view=split height=520
import { sceneFromSpec } from "kineglyph";

export default sceneFromSpec({
  version: 1,
  id: "first-live-figure",
  title: "From source to explanation",
  layout: "row",
  gap: 18,
  padding: 28,
  nodes: [
    { id: "source", kind: "box", title: "Scene", body: "Plain serializable data", tone: "accent" },
    { id: "layout", kind: "box", title: "Resolve", body: "Layout for this container", tone: "info" },
    { id: "render", kind: "box", title: "Render", body: "SVG, PNG, GIF, or web", tone: "success" },
  ],
  edges: [
    { from: "source", to: "layout", label: "measure", style: "flow" },
    { from: "layout", to: "render", label: "draw", style: "flow" },
  ],
  timeline: "reveal",
});
```

## Start with the authoring surface

New figures normally begin with `figure()` for explanatory diagrams or `plot()` for quantitative
graphics. Both compile to the same serializable `SceneDefinition`; `defineScene()` remains the
low-level escape hatch.

- [Authoring API](./authoring-api.md) explains the model and compact builders.
- [Cookbook](./cookbook.md) collects complete patterns for layouts, charts, motion, and machines.
- [Materials and effects](./materials-and-effects.md) separates semantic structure from visual
  direction.

## Ship the same scene everywhere

Use the framework-neutral web runtime, the React binding, or static exports. Container-width
layouts select `wide`, `compact`, or `narrow` rather than shrinking a desktop drawing until its
labels become unreadable.

- [Embedding and theming](./embedding-and-theming.md) covers hydration and the CSS token contract.
- [Architecture](./architecture.md) follows a scene through resolution, rendering, animation, and
  export.
