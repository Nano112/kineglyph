# Kineglyph

```kineglyph live id=kineglyph-intro-mark view=preview height=230
import { figure, kineglyphTheme } from "kineglyph";

export const theme = kineglyphTheme;
export const loop = true;

export default figure("kineglyph-intro-mark", {
  title: "Kineglyph mark",
  description: "An ink signal moving through geometric stages into a teal result.",
  background: "canvas",
  hold: 700,
}, (f) => {
  const source = f.place(f.circle({ width: 16, height: 16, fill: "text", stroke: "none" }), {
    x: 0.06, y: 0.62, anchor: "center",
  });
  const ring = f.place(f.circle({ width: 64, height: 64, fill: "canvas", stroke: "text", strokeWidth: 2 }), {
    x: 0.28, y: 0.34, anchor: "center",
  });
  const orbit = f.place(f.circle({ width: 42, height: 42, fill: "none", stroke: "accent", strokeWidth: 2, dash: "dotted" }), {
    x: 0.28, y: 0.34, anchor: "center",
  });
  const bind = f.place(f.path("M7 0L59 10L52 62L0 51Z", { width: 59, height: 62 }, {
    width: 59, height: 62, fill: "canvas", stroke: "text", strokeWidth: 2,
  }), { x: 0.52, y: 0.5, anchor: "center" });
  const seek = f.place(f.path("M0 64L37 0L74 64Z", { width: 74, height: 64 }, {
    width: 74, height: 64, fill: "canvas", stroke: "text", strokeWidth: 2,
  }), { x: 0.76, y: 0.66, anchor: "center" });
  const output = f.place(f.circle({ width: 16, height: 16, fill: "accent", stroke: "none" }), {
    x: 0.94, y: 0.38, anchor: "center",
  });
  const line = f.spline([source, ring, bind, seek, output], {
    width: "100%",
    height: "100%",
    fill: "none",
    stroke: "text",
    strokeWidth: 2,
  });
  const kinetic = f.coordinates([line, source, ring, orbit, bind, seek, output], {
    width: "fill",
    height: { wide: 170, compact: 142, narrow: 112 },
    allowOverflow: true,
  });

  f.root(f.stack([kinetic], {
    padding: { wide: [24, 30], compact: [20, 20], narrow: [14, 10] },
    align: "center",
    width: "fill",
  }));
  f.sequence([
    f.reveal(source, { duration: 220 }),
    [f.progress(line, { duration: 1_500, easing: "linear" }), f.reveal([ring, orbit, bind, seek], { duration: 260, stagger: 300 })],
    f.reveal(output, { duration: 220, scale: 0.25 }),
    f.pulse(output, { duration: 520 }),
  ], { gap: 70 });
});
```

Kineglyph turns compact scene definitions into deterministic technical illustrations. The same
scene can be responsive, animated, interactive, themeable, rendered as SVG in a browser, or
exported reproducibly to PNG and GIF.

[Install Kineglyph](./getting-started.md), browse the [visual gallery](./gallery.md), or edit the
animated mark above directly in your browser. It uses the exported `kineglyphTheme`: warm drawing paper,
ink-black structure, and one teal pulse reserved for the active result.

Every live example waits until it enters the viewport, then plays after a short settle delay.
Choose **Edit figure** underneath when you want to change labels, tones, layout, data, or motion;
the result updates without reloading the page. The adjacent **Export** menu downloads the current
frame as SVG or PNG, or samples the complete deterministic timeline as GIF.

The live editor uses Pagina's unified `kineglyph` browser module. Application code imports the
published `@kineglyph/*` packages directly.

## Start with the authoring surface

New figures normally begin with `figure()` for explanatory diagrams or `plot()` for quantitative
graphics. Both compile to the same serializable `SceneDefinition`; `defineScene()` remains the
low-level escape hatch.

- [Authoring API](./authoring-api.md) explains the model and compact builders.
- [Cookbook](./cookbook.md) collects complete patterns for layouts, charts, motion, and machines.
- [Materials and effects](./materials-and-effects.md) separates semantic structure from visual
  direction.
- [Professional themes](./theme-gallery.md) applies seven restrained, production-ready visual systems
  to one responsive specimen.
- [Editorial infographic patterns](./infographic-patterns.md) exercises process narratives,
  activity matrices, convergence lanes, change streams, and before/after claims.

## Ship the same scene everywhere

Use the framework-neutral web runtime, the React binding, or static exports. Container-width
layouts select `wide`, `compact`, or `narrow` rather than shrinking a desktop drawing until its
labels become unreadable.

- [Embedding and theming](./embedding-and-theming.md) covers hydration and the CSS token contract.
- [Live data and microcharts](./live-data-and-microcharts.md) spans WebSocket-fed figures and
  runtime-free SVGs small enough for massive tables.
- [Architecture](./architecture.md) follows a scene through resolution, rendering, animation, and
  export.

## A complete architecture figure

This responsive binding diagram is authored entirely with `figure()`, semantic cards and
materials, adaptive connector ports, inspection metadata, and one timeline. On a wide canvas the
generator fans out into six explicit routes; compact layouts replace those routes with one clear
group handoff.

![A Rust core flowing through annotations and Diplomat into six generated language surfaces, with a direct Rust route.](./assets/examples/diplomat-surfaces.svg)

The same scene also exports to PNG and animated GIF without maintaining a second drawing.
