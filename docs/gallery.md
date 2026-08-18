# Visual gallery

These are working Kineglyph scenes, not screenshots. Each one starts as the glyph alone with a
quiet **Edit figure** button underneath. Static figures also get a compact **Export** menu for a
transparent SVG or 2× PNG. Open the editor to change the source, then press **Run** (or
<kbd>⌘</kbd>/<kbd>Ctrl</kbd>+<kbd>Enter</kbd>). Everything runs locally in the browser, and this
Gerrymander-hosted page refreshes as the documentation changes on disk.

The mix is deliberate: some figures are static, some play an authored timeline, some respond to a
reader, and a few are small deterministic simulations. Those are separate capabilities; a figure
only pays for the behavior it actually uses.

Animations now wait at their first frame until roughly 6% of the figure enters the viewport, then
start after a 180 ms settle delay. The default is `autoplay: "in-view"`; use `autoplay: true` for an
immediate start, `false` for a finished still, or tune the trigger directly:

```ts
mountKineglyph(host, {
  scene,
  autoplay: "in-view",
  inView: { delay: 320, threshold: 0.12, rootMargin: "0px 0px -6%" },
});
```

## A responsive explanation

_Animated · no reader controls_

The same row becomes a readable stack in a narrow container. Change `layout`, `gap`, a tone, or an
edge label and the preview is re-resolved immediately.

```kineglyph live id=gallery-responsive view=preview height=430
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

_Animated data · marks remain inspectable_

`plot()` compiles ordinary records into the same scene primitives. Try changing a value, adding a
row, or switching `y` to a single series.

```kineglyph live id=gallery-plot view=preview height=500
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

_Static · no timeline or machine_

The nodes ask for roles—not CSS filters or renderer callbacks. A theme decides what “raised”,
“inset”, and “glass” mean, while SVG and raster exports retain deterministic fallbacks.

```kineglyph live id=gallery-materials view=preview height=430
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
});
```

## The connector is a sentence

_Animated · no reader controls_

Endpoints, route, marker, label, and packets are authored as data. Kineglyph measures the cards,
chooses ports, and keeps the verbs clear of the nouns.

```kineglyph live id=gallery-connectors view=preview height=440
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

_Interactive state machine · no timeline_

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

## The eclipse voice, with toy data

_Animated data story · no simulation_

This is the same black canvas, serif display type, pink gradient, value-first hierarchy, glow, and
rise motion as the eclipse chart. The live module exports its own theme beside the scene, so the
style remains local to this example.

```kineglyph live id=gallery-editorial-rockets view=preview height=560
import { editorialBarChart, editorialDarkTheme, figure } from "kineglyph";

export const theme = editorialDarkTheme;

const launches = [
  { hour: "8", rockets: 0 },
  { hour: "9", rockets: 3 },
  { hour: "10", rockets: 14 },
  { hour: "11", rockets: 8 },
  { hour: "12", rockets: 2 },
];

export default figure("cardboard-rocket-launches", { title: "Cardboard rockets before lunch" }, (f) => {
  const chart = f.add(editorialBarChart(launches, {
    id: "rocket-launches",
    x: "hour",
    y: "rockets",
    title: "Cardboard rockets before lunch",
    subtitle: "One ambitious Saturday · ages 7–9",
    axisLabel: "hour of the morning",
    zeroLabel: "still cutting fins",
  }));
  f.root(chart);
});
```

The recipe is still useful when most categories are zero: it treats absence as editorial copy
instead of drawing tiny, meaningless bars.

```kineglyph live id=gallery-editorial-dinosaurs view=preview height=540
import { editorialBarChart, editorialDarkTheme, figure } from "kineglyph";

export const theme = editorialDarkTheme;

export default figure("dinosaurs-under-sofa", { title: "Toy dinosaurs recovered" }, (f) => {
  const chart = f.add(editorialBarChart([
    { depth: "edge", dinosaurs: 0 },
    { depth: "1 ruler", dinosaurs: 2 },
    { depth: "2 rulers", dinosaurs: 9 },
    { depth: "arm's reach", dinosaurs: 4 },
  ], {
    id: "dinosaur-depth",
    x: "depth",
    y: "dinosaurs",
    title: "Toy dinosaurs recovered",
    subtitle: "The Great Sofa Excavation, 4:12–4:19 pm",
    axisLabel: "distance beneath the sofa",
    zeroLabel: "none",
  }));
  f.root(chart);
});
```

## Interactive simulation: binary counter automaton

_Interactive simulation · no authored timeline_

This is closer to a small instrument than a slide. **Step** advances a real machine variable,
**Back** reverses it, and **Reset** reconstructs the initial state. The register and transition
table are ordinary scene nodes bound to derived signals, so the same state remains serializable and
exportable.

```kineglyph live id=gallery-counter-automaton view=preview height=860
import { counterTerminalTheme, figure, material } from "kineglyph";

export const theme = counterTerminalTheme;

const values = Array.from({ length: 16 }, (_, value) => value);
const bitTones = ["chart1", "chart1", "chart2", "chart3", "chart4", "chart4", "chart5", "chart6"];
const cases = (bit) => Object.fromEntries(values.map((value) => [value, (value >> (7 - bit)) & 1 ? 1 : 0.13]));

export default figure("binary-counter-automaton", {
  title: "Eight-bit counter automaton",
  description: "A reversible finite-state counter with a live register and sixteen-state transition table.",
}, (f) => {
  const value = f.code("0", { id: "counter-value", textStyle: "display", bind: { text: "count" } });
  const heading = f.stack([
    f.eyebrow("8 BITS · 16 DISPLAYED STATES · DETERMINISTIC", { tone: "textMuted" }),
    f.row([value, f.title("decimal state", { tone: "textMuted" })], { gap: 16, align: "end" }),
  ], { gap: 6, width: "fill" });

  const register = f.grid(bitTones.map((tone, bit) => f.stack([
    f.code(`b${7 - bit}`, { tone: "textMuted" }),
    f.rect({ id: `register-bit-${bit}`, width: "fill", height: 34, radius: 6, fill: tone, bind: { opacity: `bit${bit}` } }),
  ], { gap: 5, align: "center", width: "fill" })), {
    id: "live-register", columns: { wide: 8, compact: 8, narrow: 4 }, gap: 7, width: "fill",
  });

  const rows = values.map((state) => {
    const cells = bitTones.map((tone, bit) => {
      const on = (state >> (7 - bit)) & 1;
      return f.rect({
        id: `state-${state}-bit-${bit}`, width: "fill", height: 22, radius: 5,
        fill: on ? tone : "surfaceMuted", opacity: on ? 1 : 0.72,
      });
    });
    return f.row([
      f.code(state.toString().padStart(2, "0"), { width: 26, tone: "textMuted" }),
      f.grid(cells, { columns: 8, gap: 6, width: "fill" }),
    ], {
      id: `counter-state-${state}`, gap: 10, padding: [4, 7], width: "fill",
      frame: { ...material("flat", { fill: "surface", stroke: "border" }), radius: 6 },
      bind: { highlight: `state${state}` },
    });
  });

  f.root(f.stack([
    heading,
    f.stack([f.eyebrow("LIVE REGISTER", { tone: "info" }), register], { gap: 9, width: "fill" }),
    f.stack([
      f.row([f.eyebrow("TRANSITION TABLE", { tone: "info" }), f.caption("0 dim · 1 active · MSB → LSB")], { justify: "between", width: "fill" }),
      f.stack(rows, { gap: 5, width: "fill" }),
    ], { gap: 9, width: "fill" }),
  ], { gap: 22, padding: { wide: 22, compact: 18, narrow: 14 }, width: "fill", frame: material("raised") }));

  f.machine({
    initial: "counting",
    variables: { count: 0 },
    states: {
      counting: { on: {
        STEP: [
          { target: "counting", guard: { var: "count", op: "lt", value: 15 }, actions: [{ type: "increment", var: "count" }] },
          { target: "counting", actions: [{ type: "set", var: "count", value: 0 }] },
        ],
        BACK: [
          { target: "counting", guard: { var: "count", op: "gt", value: 0 }, actions: [{ type: "increment", var: "count", by: -1 }] },
          { target: "counting", actions: [{ type: "set", var: "count", value: 15 }] },
        ],
      } },
    },
    signals: Object.fromEntries([
      ...values.map((state) => [`state${state}`, { when: { var: "count", op: "eq", value: state }, then: 1, else: 0 }]),
      ...bitTones.map((_, bit) => [`bit${bit}`, { match: { var: "count" }, cases: cases(bit), default: 0.13 }]),
    ]),
  });
  f.controls([
    { label: "Back", event: "BACK", group: "counter" },
    { label: "Step", event: "STEP", group: "counter" },
    { label: "Reset", kind: "reset", group: "counter" },
  ]);
});
```

## Interactive simulation: paper-plane wind tunnel

_Interactive simulation · discrete model_

The controls are authored in the scene, not bolted on by the page. Pick a launch angle and the
deterministic model highlights the predicted flight profile.

```kineglyph live id=gallery-plane-sim view=preview height=520
import { createTheme, figure, material } from "kineglyph";

export const theme = createTheme({
  name: "sky-lab",
  colors: { canvas: "#07111f", surface: "#0d1b2d", accent: "#ffcf5a", info: "#72c7ff", success: "#7ee2a8" },
});

export default figure("paper-plane-wind-tunnel", { title: "Paper-plane wind tunnel" }, (f) => {
  const low = f.card({
    title: "10° · skimmer", body: "Long range, low clearance", motif: "arrow-right",
    tone: "info", frame: material("raised"), bind: { highlight: "low" },
  });
  const balanced = f.card({
    title: "25° · cruiser", body: "Stable lift and a soft landing", motif: "spark",
    tone: "success", frame: material("floating"), bind: { highlight: "balanced" },
  });
  const steep = f.card({
    title: "40° · climber", body: "High arc, short landing", motif: "triangle",
    tone: "accent", frame: material("raised"), bind: { highlight: "steep" },
  });
  f.root(f.stack([
    f.stack([f.eyebrow("WIND: 8 KM/H · PAPER: 80 GSM", { tone: "info" }), f.title("Choose a launch angle")], { gap: 4 }),
    f.flow([low, balanced, steep], { gap: 18, align: "stretch" }),
  ], { gap: 22, width: "fill" }));
  f.machine({
    initial: "balanced",
    states: {
      low: { on: { BALANCED: "balanced", STEEP: "steep" } },
      balanced: { on: { LOW: "low", STEEP: "steep" } },
      steep: { on: { LOW: "low", BALANCED: "balanced" } },
    },
    signals: {
      low: { when: { state: "low" }, then: 1, else: 0 },
      balanced: { when: { state: "balanced" }, then: 1, else: 0 },
      steep: { when: { state: "steep" }, then: 1, else: 0 },
    },
  });
  f.controls([
    { label: "10°", event: "LOW", activeWhen: { state: "low" }, group: "launch angle" },
    { label: "25°", event: "BALANCED", activeWhen: { state: "balanced" }, group: "launch angle" },
    { label: "40°", event: "STEEP", activeWhen: { state: "steep" }, group: "launch angle" },
  ]);
});
```

## Interactive simulation: marble sorter

_Interactive simulation · discrete routing model_

This version uses the same machine primitive as a tiny routing simulation. Change the sampled
marble and the predicted chute updates without rebuilding the page or changing SVG by hand.

```kineglyph live id=gallery-marble-sim view=preview height=560
import { createTheme, figure, material } from "kineglyph";

export const theme = createTheme({
  name: "candy-sorter",
  colors: { canvas: "#130c1a", surface: "#21132d", accent: "#ff6ea9", info: "#68d5ff", warning: "#ffd45e", success: "#73e0ad" },
  radii: { sm: 12, md: 20, lg: 30 },
});

export default figure("marble-sorter", { title: "Pocket marble sorter" }, (f) => {
  const hopper = f.card({ title: "Hopper", body: "One marble enters", motif: "circle", frame: material("floating") });
  const camera = f.card({ title: "Colour eye", body: "Samples reflected light", motif: "search", tone: "info", frame: material("raised") });
  const rose = f.card({ title: "Rose chute", body: "Hue 330°–20°", motif: "circle", tone: "accent", bind: { highlight: "rose" } });
  const blue = f.card({ title: "Blue chute", body: "Hue 190°–250°", motif: "circle", tone: "info", bind: { highlight: "blue" } });
  const gold = f.card({ title: "Gold chute", body: "Hue 35°–65°", motif: "circle", tone: "warning", bind: { highlight: "gold" } });
  const bins = f.stack([rose, blue, gold], { gap: 12, width: "fill" });
  f.root(f.flow([hopper, camera, bins], { gap: 54, align: "center" }));
  f.connect(hopper, camera, { head: "arrow", labels: [{ text: "sample" }] });
  for (const bin of [rose, blue, gold]) f.connect(camera, bin, { route: "curve", head: "arrow" });
  f.machine({
    initial: "rose",
    states: {
      rose: { on: { BLUE: "blue", GOLD: "gold" } },
      blue: { on: { ROSE: "rose", GOLD: "gold" } },
      gold: { on: { ROSE: "rose", BLUE: "blue" } },
    },
    signals: {
      rose: { when: { state: "rose" }, then: 1, else: 0 },
      blue: { when: { state: "blue" }, then: 1, else: 0 },
      gold: { when: { state: "gold" }, then: 1, else: 0 },
    },
  });
  f.controls([
    { label: "Rose", event: "ROSE", activeWhen: { state: "rose" }, group: "sample marble" },
    { label: "Blue", event: "BLUE", activeWhen: { state: "blue" }, group: "sample marble" },
    { label: "Gold", event: "GOLD", activeWhen: { state: "gold" }, group: "sample marble" },
  ]);
});
```

## A toy factory fan-out

_Animated architecture · no reader controls_

The Diplomat composition still works as a general visual grammar: one source moves through a short
pipeline and fans into a family of outputs. Here it explains a completely fictional pocket-toy
factory instead of language bindings.

```kineglyph live id=gallery-toy-factory view=preview height=760
import { createTheme, cubicBezier, figure, linearGradient, material, shadow } from "kineglyph";

const arrive = cubicBezier(0.16, 1, 0.3, 1);
export const theme = createTheme({
  name: "midnight-toy-factory",
  colors: {
    canvas: "#070b12", surface: "#0c1420", surfaceRaised: "#122033", text: "#f4f8ff",
    textMuted: "#8fa5bd", accent: "#56e39f", info: "#69b9ff", warning: "#ffd166",
    success: "#9ae6b4", border: "#233d55", connector: "#56e39f",
  },
  radii: { sm: 7, md: 13, lg: 20 },
  motion: { fast: 150, normal: 320, slow: 680, easing: arrive },
  materials: {
    raised: {
      fill: linearGradient([{ at: 0, color: "surfaceRaised" }, { at: 1, color: "surface" }], { angle: 135 }),
      stroke: "border",
      effects: [shadow({ color: "accent", opacity: 0.08, blur: 22, offset: [0, 9] })],
    },
  },
});

export default figure("pocket-toy-factory", {
  title: "One doodle, six pocket toys",
  breakpoints: { wide: 600, compact: 430 },
}, (f) => {
  const doodle = f.card({ eyebrow: "NAPKIN INPUT", title: "Tiny doodle", body: "A wobbly creature with two wheels.", motif: "spark", frame: material("raised") });
  const blueprint = f.card({ eyebrow: "SHAPE PASS", title: "Blueprint", body: "Rounds, tabs, axles, and safe edges.", motif: "grid", tone: "info", frame: material("raised") });
  const workshop = f.card({ eyebrow: "GENERATOR", title: "Toy-o-matic", body: "One idea becomes six play patterns.", motif: "cube", tone: "success", frame: material("floating") });
  const pipeline = f.stack([doodle, blueprint, workshop], { gap: 44, width: "fill" });
  const names = [
    ["WIND-UP", "Crab walker", "gear", "accent"],
    ["MAGNETIC", "Moon buggy", "circle", "info"],
    ["STACKABLE", "Pocket dragon", "layers", "success"],
    ["FLOATING", "Bath submarine", "ship", "warning"],
    ["ROLLING", "Acorn racer", "arrow-right", "accent"],
    ["GLOWING", "Night moth", "spark", "info"],
  ];
  const toys = names.map(([eyebrow, title, motif, tone], index) => f.card({
    id: `toy-${index + 1}`, eyebrow, title, motif, tone, compact: true,
    minHeight: 68, frame: material("raised"),
  }));
  const shelf = f.stack([f.eyebrow("SIX GENERATED PLAYTHINGS", { tone: "success" }), ...toys], { gap: 10, width: "fill" });
  f.root(f.stack([
    f.stack([f.eyebrow("POCKET FACTORY · BATCH 07", { tone: "accent" }), f.title("One doodle. Six ways to play.")], { gap: 5 }),
    f.flow([pipeline, shelf], { gap: 56, align: "center", width: "fill" }),
  ], { gap: 30, width: "fill" }));
  const sketch = f.connect({ node: doodle, side: "bottom" }, { node: blueprint, side: "top" }, { head: "arrow", labels: [{ text: "trace" }] });
  const build = f.connect({ node: blueprint, side: "bottom" }, { node: workshop, side: "top" }, { head: "arrow", labels: [{ text: "shape" }] });
  const branches = toys.map((toy) => f.connect(
    { node: workshop, side: "right" }, { node: toy, side: "left" },
    { route: "curve", head: "arrow", hidden: { compact: true } },
  ));
  const compactBranch = f.connect(
    { node: workshop, side: "bottom" }, { node: shelf, side: "top" },
    { head: "arrow", hidden: { wide: true, compact: false }, labels: [{ text: "six play patterns" }] },
  );
  f.sequence([
    f.reveal(doodle), [f.draw(sketch), f.reveal(blueprint)], [f.draw(build), f.reveal(workshop)],
    [f.draw([...branches, compactBranch], { stagger: 70 }), f.reveal(toys, { stagger: 70, scale: 0.97 })],
  ]);
});
```

## More complete outputs

The [architecture figure](./index.md#a-complete-architecture-figure) shows a larger authored
scene, and [materials and effects](./materials-and-effects.md#rebuild-the-comparison) includes the
same structure rendered in four deliberately different visual systems.
