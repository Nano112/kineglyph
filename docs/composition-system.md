# Composition that carries its own intent

Kineglyph now treats the boundary, topology, relationships, and responsive diagnostics of a figure
as authoring concepts—not decoration that every example must rebuild. The result is less layout
code, better narrow-screen behaviour, and one contract shared by the editor, web runtime, and
exporter.

## One outer boundary, four appearances

`f.surface()` marks the outer boundary of a complete figure. It can be visually bare, a raised
card, an inset work area, or an edge-to-edge bleed. `padding: "auto"` is the default and follows the
appearance responsively. Exporters can find this semantic boundary without guessing from a fill
colour.

```kineglyph live id=composition-surfaces view=preview height=390
import { figure, kineglyphTheme } from "kineglyph";

export const theme = kineglyphTheme;

export default figure("composition-surfaces", { title: "Four figure surfaces" }, (f) => {
  const sample = (name, appearance, tone) => {
    const card = f.card({ eyebrow: appearance.toUpperCase(), title: name, body: "Responsive chrome with semantic intent.", tone, compact: true });
    return f.surface(card, { appearance, label: `${name} surface` });
  };
  f.root(f.grid([
    sample("No chrome", "bare", "accent"),
    sample("Article card", "card", "info"),
    sample("Workbench", "inset", "warning"),
    sample("Edge to edge", "bleed", "success"),
  ], { columns: { wide: 2, compact: 2, narrow: 1 }, gap: 14 }));
});
```

Use `panel()` for a titled editorial region _inside_ a figure. Use `surface()` for the figure's
outer contract. This distinction also prevents the double-padding and nested-background problem
that used to appear in embeds.

## Topology recipes

Five recipes cover the shapes that recur in technical explanations:

- `f.pipeline(stages)` for sequential work;
- `f.fanOut(source, targets)` for one-to-many delivery;
- `f.hubMap({ host, upstream, clients })` for adapters and agent hosts;
- `f.feedbackLoop(stages)` for systems with a returning control path;
- `f.layeredArchitecture({ layers, connections })` for explicit application tiers.

They return `root`, `edges`, `ranks`, and a progressive `entrance` motion. Underneath, they use the
same responsive circuit ranking, port attachment, obstacle avoidance, and constant-speed packet
motion as `f.circuit()`.

```kineglyph live id=composition-hub-map view=preview height=470
import { figure, kineglyphTheme } from "kineglyph";

export const theme = kineglyphTheme;

export default figure("composition-hub-map", { title: "One host, several surfaces" }, (f) => {
  const grouped = { interactionGroup: "host-path" };
  const copilot = f.tile({ icon: "users", title: "Copilot", tone: "success", variant: "compact", ...grouped });
  const protocol = f.tile({ icon: "plug", title: "ACP", tone: "success", variant: "compact", ...grouped });
  const host = f.card({ eyebrow: "ROUTER", title: "Agent host", body: "One policy and tool boundary", tone: "info", ...grouped });
  const clients = ["IDE", "Web", "CLI", "Mobile"].map((title) =>
    f.tile({ icon: title === "CLI" ? "terminal" : "globe", title, variant: "compact", ...grouped })
  );
  const map = f.hubMap({ host, upstream: [copilot, protocol], clients }, {
    direction: "vertical",
    edge: { interactionGroup: "host-path", kind: "spline", stroke: "dotted", tone: "info" },
  });
  f.root(f.surface(map.root, { appearance: "card" }));
  f.sequence([map.entrance]);
});
```

The shared `interactionGroup` is also first-class. Inspecting any member marks related nodes and
edges with `data-related="true"`; a product can style that relationship or use the generic runtime
highlight. Hover remains opt-in—static marks do not pretend to be clickable.

## Interaction grammar

Author intent maps to runtime behaviour through named fields:

```ts
const point = f.circle({
  interactive: true,
  onActivate: "SELECT_POINT",
  onPointer: "MOVE_POINT",
  onDrag: "MOVE_POINT",
  focusGroup: true,
  inspect: { role: "Point", title: "Threshold", summary: "Drag or use the arrow keys." },
  interactionGroup: "threshold",
});
```

Pointer coordinates are normalized, keyboard drag uses the same event, focus groups use roving
arrow-key navigation, and inspection/tooltip ownership bubbles to the nearest semantic owner. The
same scene therefore works with a pointer, keyboard, touch target, or programmatic `inspect(id)`.

## Inspect the composition, not just the result

The live editor's **Inspect layout** button enables the composition debugger. Its independent
layers show the layout grid, every resolved node bound, named ports, routed edges, and doctor
findings. The header reports the active layout and resolved dimensions. This is especially useful
while dragging a preview through wide, compact, and narrow widths.

Applications can mount it directly:

```ts
const controller = mountKineglyph(host, {
  scene,
  theme,
  doctor: { layers: { grid: false, bounds: true, ports: true, edges: true } },
});

controller.setDoctor({ layers: { findings: false, ports: true } });
```

The debugger is development chrome; it never becomes part of an SVG, PNG, or GIF export.

## Tight export and portable embeds

Static export can retain the whole authored scene, crop to an `f.surface()`, or fit visible content:

```ts
const svg = exportSvg(resolved, {
  crop: "surface",
  cropPadding: 8,
  background: "transparent",
});
```

The browser runtime can serialize the _current_ machine and timeline state without remounting:

```ts
const current = controller.toSvg({ crop: "content", cropPadding: 6 });
```

For a CMS or documentation page, generate the host markup rather than hand-maintaining data
attributes:

```ts
createEmbedSnippet({
  source: "./figures/architecture.js",
  theme: "paper",
  autoplay: "in-view",
  controls: "auto",
  readout: "auto",
});
```

## A CLI for the ordinary loop

Install `@kineglyph/export` as a development dependency, then use one executable for the full local
loop:

```sh
npx kineglyph create my-figure
cd my-figure && npm install
npm run dev

npx kineglyph render figure.ts --format svg --out figure.svg --crop surface
npx kineglyph render figure.ts --format png --out figure.png --scale 2 --crop content
npx kineglyph doctor --scene figure.ts
```

`kineglyph dev` serves the self-contained web bundle, transpiles a local `.ts` figure with Node's
built-in type stripping, and reloads the preview over a tiny event stream whenever the source
changes. Its **Inspect layout** control uses the same debugger as the documentation editor. No
framework or build configuration is required for this authoring loop.
