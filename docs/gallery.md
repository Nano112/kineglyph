# Visual gallery

These are working Kineglyph scenes, not screenshots. Each one starts as only the finished glyph
with a quiet **Edit figure** button underneath. Open it to change the source, then press **Run** (or
<kbd>⌘</kbd>/<kbd>Ctrl</kbd>+<kbd>Enter</kbd>). Everything runs locally in the browser, and this
Gerrymander-hosted page refreshes as the documentation changes on disk.

## A responsive explanation

The same row becomes a readable stack in a narrow container. Change `layout`, `gap`, a tone, or an
edge label and the preview is re-resolved immediately.

```kineglyph live id=gallery-responsive view=preview height=430 autoplay=true
import { sceneFromSpec } from "kineglyph";

export default sceneFromSpec({
  version: 1,
  id: "responsive-explanation",
  title: "One definition, every container",
  description: "A semantic flow that changes arrangement instead of shrinking.",
  layout: "row",
  gap: 28,
  padding: 28,
  nodes: [
    { id: "author", kind: "box", title: "Author", body: "Structure and intent", tone: "accent" },
    { id: "resolve", kind: "box", title: "Resolve", body: "Width, theme, and state", tone: "info" },
    { id: "render", kind: "box", title: "Render", body: "SVG, web, PNG, or GIF", tone: "success" },
  ],
  edges: [
    { from: "author", to: "resolve", label: "measure", style: "flow" },
    { from: "resolve", to: "render", label: "draw", style: "flow" },
  ],
  timeline: "reveal",
});
```

## Data that stays data

`plot()` compiles ordinary records into the same scene primitives. Try changing a value, adding a
row, or switching `y` to a single series.

```kineglyph live id=gallery-plot view=preview height=500 autoplay=true
import { bar, figure, plot, plotRule } from "kineglyph";

const rows = [
  { operation: "parse", cold: 42, warm: 18 },
  { operation: "resolve", cold: 86, warm: 34 },
  { operation: "render", cold: 64, warm: 27 },
  { operation: "export", cold: 98, warm: 46 },
];

export default figure("gallery-build-times", { title: "Build time by operation" }, (f) => {
  const chart = f.add(plot(rows, {
    id: "build-times",
    title: "Milliseconds (illustrative)",
    x: "operation",
    y: ["cold", "warm"],
    marks: bar(),
    annotations: [plotRule({ y: 80, label: "interaction budget" })],
    axes: { y: { label: "ms" } },
    valueLabels: "auto",
    height: 300,
    motion: "auto",
  }));
  f.root(chart);
  f.sequence([f.reveal(chart)]);
});
```

## Semantic materials

The nodes ask for roles—not CSS filters or renderer callbacks. A theme decides what “raised”,
“inset”, and “glass” mean, while SVG and raster exports retain deterministic fallbacks.

```kineglyph live id=gallery-materials view=preview height=430 autoplay=true
import { figure, material } from "kineglyph";

export default figure("gallery-materials", { title: "Material roles" }, (f) => {
  const raised = f.card({
    eyebrow: "RAISED",
    title: "Primary surface",
    body: "Elevation comes from the active theme.",
    motif: "layers",
    tone: "accent",
    frame: material("raised"),
  });
  const inset = f.card({
    eyebrow: "INSET",
    title: "Measured region",
    body: "A quieter place for supporting values.",
    motif: "grid",
    tone: "info",
    frame: material("inset"),
  });
  const glass = f.card({
    eyebrow: "GLASS",
    title: "Live surface",
    body: "Browser effects keep a portable fallback.",
    motif: "spark",
    tone: "success",
    frame: material("glass"),
  });

  const row = f.flow([raised, inset, glass], { gap: 18, align: "stretch" });
  f.root(row);
  f.sequence([f.reveal([raised, inset, glass], { stagger: 120, scale: 0.96 })]);
});
```

## The connector is a sentence

Endpoints, route, marker, label, and packets are authored as data. Kineglyph measures the cards,
chooses ports, and keeps the verbs clear of the nouns.

```kineglyph live id=gallery-connectors view=preview height=440 autoplay=true
import { figure } from "kineglyph";

export default figure("gallery-connectors", { title: "Connector grammar" }, (f) => {
  const input = f.card({ title: "Scene", body: "Stable semantic ids", motif: "code" });
  const layout = f.card({ title: "Resolver", body: "Measured geometry", motif: "graph", tone: "info" });
  const output = f.card({ title: "Frame", body: "A deterministic result", motif: "spark", tone: "success" });

  const measure = f.connect(input, layout, {
    route: "orthogonal",
    head: "triangle",
    labels: [{ text: "measure" }],
  });
  const draw = f.connect(layout, output, {
    route: "curve",
    head: "arrow",
    style: "flow",
    packets: { count: 2 },
    labels: [{ text: "draw" }],
  });

  f.flow([input, layout, output], { gap: 72, align: "stretch" });
  f.sequence([
    f.reveal(input),
    [f.draw(measure), f.reveal(layout)],
    [f.draw(draw), f.reveal(output)],
    f.flow(draw),
  ]);
});
```

## Interaction is part of the scene

A small deterministic state machine changes bindings and controls without replacing the scene.
Use the buttons inside the figure, then edit a label or add another state.

```kineglyph live id=gallery-machine view=preview height=470
import { figure } from "kineglyph";

export default figure("gallery-machine", { title: "A stateful explanation" }, (f) => {
  const draft = f.card({
    title: "Draft",
    body: "Structure can still change.",
    motif: "code",
    bind: { highlight: "draftActive" },
  });
  const review = f.card({
    title: "Review",
    body: "Meaning and layout are checked together.",
    motif: "search",
    tone: "info",
    bind: { highlight: "reviewActive" },
  });
  const ship = f.card({
    title: "Ship",
    body: "One scene reaches every output.",
    motif: "spark",
    tone: "success",
    bind: { highlight: "shipActive" },
  });

  f.flow([draft, review, ship], { gap: 24, align: "stretch" });
  f.machine({
    initial: "draft",
    states: {
      draft: { on: { REVIEW: "review", SHIP: "ship" } },
      review: { on: { DRAFT: "draft", SHIP: "ship" } },
      ship: { on: { DRAFT: "draft", REVIEW: "review" } },
    },
    signals: {
      draftActive: { when: { state: "draft" }, then: 1, else: 0 },
      reviewActive: { when: { state: "review" }, then: 1, else: 0 },
      shipActive: { when: { state: "ship" }, then: 1, else: 0 },
    },
  });
  f.controls([
    { label: "Draft", event: "DRAFT", activeWhen: { state: "draft" }, group: "stage" },
    { label: "Review", event: "REVIEW", activeWhen: { state: "review" }, group: "stage" },
    { label: "Ship", event: "SHIP", activeWhen: { state: "ship" }, group: "stage" },
  ]);
});
```

## More complete outputs

The [architecture figure](./index.md#a-complete-architecture-figure) shows a larger authored
scene, and [materials and effects](./materials-and-effects.md#rebuild-the-comparison) includes the
same structure rendered in four deliberately different visual systems.
