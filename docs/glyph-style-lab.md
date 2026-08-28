# Glyph style laboratory

Three visual directions can share one semantic scene. `signalTheme` is flat, compact, and
schematic; `integrationTheme` adds a restrained cyan-to-blue hierarchy for hosts and adapters;
`instrumentTheme` uses graphite materials, bevel highlights, contact shadows, and one local
emitter. None of the themes changes geometry or content.

Most examples below deliberately repeat three scene structures under the flat Signal and physical
Instrument extremes; the host map adds Integration as a third direction. This is the useful test:
a theme is a system only when topology, layered cards, controls, motion, responsive layout, and
export all survive the swap.

| Theme              | Character                                      | Best fit                                  |
| ------------------ | ---------------------------------------------- | ----------------------------------------- |
| `signalTheme`      | grid, outline, icon tile, explicit signal path | CI, state machines, architecture, routing |
| `integrationTheme` | dark field, host gradient, fine link hierarchy | agents, adapters, client topology         |
| `instrumentTheme`  | depth, bevel, contact shadow, local emission   | controls, devices, physical systems       |

## A host and its integration surfaces

This compact topology takes the hierarchy from the reference—two upstream services, one dominant
host, and four client surfaces—without baking its composition into an image. Every chip is an
ordinary group, every line is a routable edge, and the centre gradient is a semantic material.

```kineglyph live id=style-integration-host view=preview height=430
import { figure, integrationTheme, material } from "kineglyph";

export const theme = integrationTheme;

export default figure("integration-agent-host", {
  title: "Agent host integration map",
  description: "Copilot and ACP feed one agent host, which serves IDE, web, CLI, and mobile clients.",
  background: "transparent",
}, (f) => {
  const chip = (id, icon, label, tone, position) => f.place(f.row([
    f.icon(icon, { id: `${id}-icon`, size: 14, tone }),
    f.code(label, { id: `${id}-label`, tone }),
  ], {
    id,
    gap: 5,
    padding: [6, 9],
    align: "center",
    justify: "center",
    width: "hug",
    minHeight: 30,
    frame: { fill: "canvas", stroke: tone, strokeWidth: 1, radius: 7 },
  }), position);

  const copilot = chip("copilot", "spark", "Copilot", "success", { x: 0.34, y: 0.08, anchor: "center" });
  const acp = chip("acp", "circuit", "ACP", "accent", { x: 0.66, y: 0.08, anchor: "center" });
  const host = f.place(f.stack([
    f.heading("Agent Host", { tone: "accentContrast", align: "center", width: "fill" }),
  ], {
    id: "agent-host",
    gap: 7,
    padding: [18, 24],
    align: "center",
    justify: "center",
    width: { wide: 280, compact: 248, narrow: 220 },
    height: { wide: 112, compact: 104, narrow: 96 },
    frame: material("floating"),
  }), { x: 0.5, y: 0.46, anchor: "center" });
  const ide = chip("ide", "code", "IDE", "info", { x: 0.13, y: 0.86, anchor: "center" });
  const web = chip("web", "graph", "Web", "info", { x: 0.38, y: 0.86, anchor: "center" });
  const cli = chip("cli", "settings", "CLI", "info", { x: 0.62, y: 0.86, anchor: "center" });
  const mobile = chip("mobile", "detect", "Mobile", "info", { x: 0.87, y: 0.86, anchor: "center" });
  const nodes = [copilot, acp, host, ide, web, cli, mobile];
  const field = f.coordinates(nodes, {
    width: "fill",
    height: { wide: 350, compact: 330, narrow: 310 },
  });
  const edges = [
    f.connect({ node: copilot, side: "bottom" }, { node: host, side: "top", offset: 0.34 }, { route: "curve", stroke: "dotted", tone: "success", head: "none" }),
    f.connect({ node: acp, side: "bottom" }, { node: host, side: "top", offset: 0.66 }, { route: "curve", stroke: "dotted", tone: "accent", head: "none" }),
    ...[ide, web, cli, mobile].map((client, index) => f.connect(
      { node: host, side: "bottom", offset: [0.16, 0.38, 0.62, 0.84][index] },
      { node: client, side: "top" },
      { route: "curve", stroke: "dashed", tone: "info", opacity: 0.82, head: "none" },
    )),
  ];
  f.root(f.panel([field], {
    id: "host-map-card",
    padding: { wide: 22, compact: 18, narrow: 14 },
    frame: material("flat"),
  }));
  f.sequence([[f.reveal(nodes, { stagger: 55, scale: 0.97 }), f.draw(edges, { stagger: 45 })]]);
});
```

## A routed verification glyph

The scene uses `f.tile()`, `f.gridPlane()`, and ordinary connectors. The green path is structure,
not hover affordance: nothing is marked interactive unless it actually handles an event.

### Signal

```kineglyph live id=style-signal-route view=preview height=480
import { figure, material, signalTheme } from "kineglyph";

export const theme = signalTheme;

export default figure("signal-verification-route", { title: "Verification route", description: "A run fans out through three checks, converges on verification, and proceeds to inspection." }, (f) => {
  const run = f.place(f.tile({ icon: "arrow", label: "Run", tone: "text", size: 60 }), { x: 0.5, y: 0.03, anchor: "top" });
  const policy = f.place(f.tile({ icon: "shield", label: "Policy check", size: 60 }), { wide: { x: 0.22, y: 0.34, anchor: "center" }, compact: { x: 0.18, y: 0.34, anchor: "center" } });
  const graph = f.place(f.tile({ icon: "graph", label: "Dependency graph", size: 60 }), { x: 0.5, y: 0.34, anchor: "center" });
  const source = f.place(f.tile({ icon: "code", label: "Source check", size: 60 }), { wide: { x: 0.78, y: 0.34, anchor: "center" }, compact: { x: 0.82, y: 0.34, anchor: "center" } });
  const verify = f.place(f.tile({ icon: "shield", label: "Verified", active: true, size: 64 }), { x: 0.5, y: 0.67, anchor: "center" });
  const inspect = f.place(f.tile({ icon: "detect", label: "Inspect", tone: "text", size: 60 }), { x: 0.5, y: 0.97, anchor: "bottom" });
  const field = f.coordinates([run, policy, graph, source, verify, inspect], { height: { wide: 400, compact: 380, narrow: 360 }, width: "fill" });
  const grid = f.gridPlane({ columns: 14, rows: 10, height: { wide: 400, compact: 380, narrow: 360 }, lineOpacity: 0.18 });
  const edges = [
    f.connect(run, policy, { route: "curve", stroke: "dashed", head: "none" }),
    f.connect(run, graph, { route: "straight", stroke: "dashed", head: "none" }),
    f.connect(run, source, { route: "curve", stroke: "dashed", head: "none" }),
    f.connect(policy, verify, { route: "curve", stroke: "dashed", head: "none" }),
    f.connect(graph, verify, { route: "straight", stroke: "dashed", head: "none" }),
    f.connect(source, verify, { route: "curve", stroke: "dashed", head: "none" }),
    f.connect(verify, inspect, { route: "straight", stroke: "dashed", head: "none" }),
  ];
  f.root(f.overlay([grid, field], { width: "fill", minHeight: { wide: 400, compact: 380, narrow: 360 }, frame: material("flat") }));
  f.sequence([f.reveal([run, policy, graph, source], { stagger: 70 }), f.draw(edges, { stagger: 55 }), f.pulse(verify), f.reveal(inspect)]);
});
```

### Instrument

```kineglyph live id=style-instrument-route view=preview height=480
import { figure, instrumentTheme, material } from "kineglyph";

export const theme = instrumentTheme;

export default figure("instrument-verification-route", { title: "Verification route", description: "A run fans out through three checks, converges on verification, and proceeds to inspection." }, (f) => {
  const run = f.place(f.tile({ icon: "arrow", label: "Run", tone: "text", size: 60 }), { x: 0.5, y: 0.03, anchor: "top" });
  const policy = f.place(f.tile({ icon: "shield", label: "Policy check", size: 60 }), { wide: { x: 0.22, y: 0.34, anchor: "center" }, compact: { x: 0.18, y: 0.34, anchor: "center" } });
  const graph = f.place(f.tile({ icon: "graph", label: "Dependency graph", size: 60 }), { x: 0.5, y: 0.34, anchor: "center" });
  const source = f.place(f.tile({ icon: "code", label: "Source check", size: 60 }), { wide: { x: 0.78, y: 0.34, anchor: "center" }, compact: { x: 0.82, y: 0.34, anchor: "center" } });
  const verify = f.place(f.tile({ icon: "shield", label: "Verified", active: true, size: 64 }), { x: 0.5, y: 0.67, anchor: "center" });
  const inspect = f.place(f.tile({ icon: "detect", label: "Inspect", tone: "text", size: 60 }), { x: 0.5, y: 0.97, anchor: "bottom" });
  const field = f.coordinates([run, policy, graph, source, verify, inspect], { height: { wide: 400, compact: 380, narrow: 360 }, width: "fill" });
  const grid = f.gridPlane({ columns: 14, rows: 10, height: { wide: 400, compact: 380, narrow: 360 }, lineOpacity: 0.07 });
  const edges = [
    f.connect(run, policy, { route: "curve", stroke: "dashed", head: "none" }),
    f.connect(run, graph, { route: "straight", stroke: "dashed", head: "none" }),
    f.connect(run, source, { route: "curve", stroke: "dashed", head: "none" }),
    f.connect(policy, verify, { route: "curve", stroke: "dashed", head: "none" }),
    f.connect(graph, verify, { route: "straight", stroke: "dashed", head: "none" }),
    f.connect(source, verify, { route: "curve", stroke: "dashed", head: "none" }),
    f.connect(verify, inspect, { route: "straight", stroke: "dashed", head: "none" }),
  ];
  f.root(f.overlay([grid, field], { width: "fill", minHeight: { wide: 400, compact: 380, narrow: 360 }, frame: material("flat") }));
  f.sequence([f.reveal([run, policy, graph, source], { stagger: 70, scale: 0.96 }), f.draw(edges, { stagger: 55 }), f.pulse(verify), f.reveal(inspect)]);
});
```

## A fan of selectable specifications

`f.cardFan()` places ordinary nodes, assigns responsive positions, and rotates each around its own
centre. The middle card remains dominant as the container narrows. Static SVG, animation frames,
PNG, and GIF all use the same resolved rotation.

### Signal

```kineglyph live id=style-signal-fan view=preview height=410
import { figure, material, signalTheme } from "kineglyph";

export const theme = signalTheme;

export default figure("signal-specification-fan", { title: "Specification fan", description: "Three specification cards fan around the selected behaviour model." }, (f) => {
  const card = (id, eyebrow, title, body, active = false) => f.card({
    id, eyebrow, title, body, motif: active ? "graph" : "compare", tone: active ? "accent" : "textMuted",
    frame: material(active ? "floating" : "raised"),
    extras: [f.row([f.port({ tone: active ? "accent" : "border", active }), f.caption(active ? "selected" : "available")], { gap: 8, align: "center" })],
  });
  const cards = [
    card("contract", "INPUT", "Contract", "shape and invariants"),
    card("model", "MODEL", "Behaviour", "states and transitions", true),
    card("output", "OUTPUT", "Surface", "render and export"),
  ];
  const fan = f.cardFan(cards, { angle: 10, spread: 0.27, activeIndex: 1 });
  f.root(f.stack([f.eyebrow("ONE MODEL · THREE VIEWS", { align: "center", width: "fill" }), fan], { gap: 4, padding: [12, 18], width: "fill", frame: material("flat") }));
  f.sequence([f.reveal(cards, { stagger: 100, offset: 14, scale: 0.95 }), f.pulse(cards[1])]);
});
```

### Instrument

```kineglyph live id=style-instrument-fan view=preview height=410
import { figure, instrumentTheme, material } from "kineglyph";

export const theme = instrumentTheme;

export default figure("instrument-specification-fan", { title: "Specification fan", description: "Three specification cards fan around the selected behaviour model." }, (f) => {
  const card = (id, eyebrow, title, body, active = false) => f.card({
    id, eyebrow, title, body, motif: active ? "graph" : "compare", tone: active ? "accent" : "textMuted",
    frame: material(active ? "floating" : "raised"),
    extras: [f.row([f.port({ tone: active ? "accent" : "border", active }), f.caption(active ? "selected" : "available")], { gap: 8, align: "center" })],
  });
  const cards = [
    card("contract", "INPUT", "Contract", "shape and invariants"),
    card("model", "MODEL", "Behaviour", "states and transitions", true),
    card("output", "OUTPUT", "Surface", "render and export"),
  ];
  const fan = f.cardFan(cards, { angle: 10, spread: 0.27, activeIndex: 1 });
  f.root(f.stack([f.eyebrow("ONE MODEL · THREE VIEWS", { align: "center", width: "fill" }), fan], { gap: 4, padding: [12, 18], width: "fill", frame: material("flat") }));
  f.sequence([f.reveal(cards, { stagger: 100, offset: 14, scale: 0.95 }), f.pulse(cards[1])]);
});
```

## A compact control instrument

This final specimen mixes an inset dial, static responsive rotation, explicit ports, tiles, and a
responsive row-to-stack layout. It is a useful stress test because it contains both diagrammatic
structure and a small physical control surface.

### Signal

```kineglyph live id=style-signal-console view=preview height=500
import { figure, material, signalTheme } from "kineglyph";

export const theme = signalTheme;

export default figure("signal-control-instrument", { title: "Control instrument", description: "An output dial sits beside four compact control tiles." }, (f) => {
  const dial = f.coordinates([
    f.circle({ position: { x: 0.5, y: 0.5, anchor: "center" }, radius: 72, fill: "surfaceMuted", stroke: "border", strokeWidth: 2 }),
    f.circle({ position: { x: 0.5, y: 0.5, anchor: "center" }, radius: 50, fill: "none", stroke: "accent", dash: "dotted" }),
    f.path("M 10 6 L 104 6", { width: 114, height: 12 }, { position: { x: 0.5, y: 0.5, anchor: "center" }, width: 114, height: 12, stroke: "accent", strokeWidth: 4, rotation: { wide: -28, compact: -18, narrow: -10 } }),
    f.circle({ position: { x: 0.5, y: 0.5, anchor: "center" }, radius: 8, fill: "accent", stroke: "canvas", strokeWidth: 3 }),
    f.labelAt("62%", { x: 0.5, y: 0.82, anchor: "center" }, { align: "center", tone: "text" }),
  ], { height: 220, width: "fill" });
  const readout = f.stack([f.eyebrow("OUTPUT LEVEL"), dial, f.row([f.port({ active: true }), f.code("LOCKED", { tone: "accent" })], { gap: 8, align: "center", justify: "center" })], { gap: 8, padding: 16, width: "fill", frame: material("inset") });
  const controls = f.grid([
    f.tile({ icon: "wave", title: "Shape", active: true }),
    f.tile({ icon: "filter", title: "Filter" }),
    f.tile({ icon: "clock", title: "Timing" }),
    f.tile({ icon: "export", title: "Output" }),
  ], { columns: { wide: 2, compact: 2, narrow: 1 }, gap: 12, width: "fill" });
  f.root(f.flow([readout, controls], { gap: 18, padding: 18, align: "stretch", width: "fill", frame: material("flat") }));
  f.sequence([f.reveal(readout), f.reveal(controls.children, { stagger: 80, scale: 0.96 })]);
});
```

### Instrument

```kineglyph live id=style-instrument-console view=preview height=500
import { figure, instrumentTheme, material } from "kineglyph";

export const theme = instrumentTheme;

export default figure("instrument-control-instrument", { title: "Control instrument", description: "An output dial sits beside four compact control tiles." }, (f) => {
  const dial = f.coordinates([
    f.circle({ position: { x: 0.5, y: 0.5, anchor: "center" }, radius: 72, fill: "surfaceMuted", stroke: "border", strokeWidth: 2 }),
    f.circle({ position: { x: 0.5, y: 0.5, anchor: "center" }, radius: 50, fill: "none", stroke: "accent", dash: "dotted" }),
    f.path("M 10 6 L 104 6", { width: 114, height: 12 }, { position: { x: 0.5, y: 0.5, anchor: "center" }, width: 114, height: 12, stroke: "accent", strokeWidth: 4, rotation: { wide: -28, compact: -18, narrow: -10 } }),
    f.circle({ position: { x: 0.5, y: 0.5, anchor: "center" }, radius: 8, fill: "accent", stroke: "canvas", strokeWidth: 3 }),
    f.labelAt("62%", { x: 0.5, y: 0.82, anchor: "center" }, { align: "center", tone: "text" }),
  ], { height: 220, width: "fill" });
  const readout = f.stack([f.eyebrow("OUTPUT LEVEL"), dial, f.row([f.port({ active: true }), f.code("LOCKED", { tone: "accent" })], { gap: 8, align: "center", justify: "center" })], { gap: 8, padding: 16, width: "fill", frame: material("inset") });
  const controls = f.grid([
    f.tile({ icon: "wave", title: "Shape", active: true }),
    f.tile({ icon: "filter", title: "Filter" }),
    f.tile({ icon: "clock", title: "Timing" }),
    f.tile({ icon: "export", title: "Output" }),
  ], { columns: { wide: 2, compact: 2, narrow: 1 }, gap: 12, width: "fill" });
  f.root(f.flow([readout, controls], { gap: 18, padding: 18, align: "stretch", width: "fill", frame: material("flat") }));
  f.sequence([f.reveal(readout, { scale: 0.98 }), f.reveal(controls.children, { stagger: 80, scale: 0.94 })]);
});
```

## The reusable surface

```ts
import {
  cardFan,
  glyphStyleThemes,
  gridPlane,
  integrationTheme,
  instrumentTheme,
  port,
  signalTheme,
  tileNode,
} from "@kineglyph/core";
```

- `signalTheme`, `integrationTheme`, and `instrumentTheme` are complete public theme tokens.
- `glyphStyleThemes.signal`, `.integration`, and `.instrument` make theme selection data-driven.
- `f.tile()` / `tileNode()` creates an icon-first semantic node.
- `f.port()` / `port()` creates a real signal or control connection point.
- `f.gridPlane()` / `gridPlane()` adds an exportable responsive construction grid.
- `f.cardFan()` / `cardFan()` layers any ordinary scene nodes; no renderer-specific transform is
  hidden inside the recipe.
- Every scene node accepts responsive `rotation`, resolved around its centre in SVG, PNG, GIF, and
  live browser playback.
