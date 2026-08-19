# Professional themes

Kineglyph includes seven complete themes with distinct typography, density, geometry, line weights,
motion, and semantic colours. None uses glow, blur, glass effects, or decorative gradients.

Each example uses the same release-review specimen, so only the theme changes. The data, hierarchy,
materials, responsive layout, inspection metadata, and motion remain fixed. Open **Edit figure** to
change a preset or adjust any token.

| Preset             | Style                              | Useful for                                     |
| ------------------ | ---------------------------------- | ---------------------------------------------- |
| `kineglyphTheme`   | warm paper, black ink, teal pulse  | product identity, technical explainers, covers |
| `swissTheme`       | hard alignment and editorial scale | reports, launch stories, explanatory graphics  |
| `ledgerTheme`      | warm stock and serif hierarchy     | finance, historical data, research summaries   |
| `blueprintTheme`   | measured lines and technical type  | architecture, networks, engineering diagrams   |
| `fieldManualTheme` | compact, utilitarian, durable      | operations, hardware, maintenance procedures   |
| `studioTheme`      | calm contemporary product language | dashboards, product docs, application flows    |
| `civicTheme`       | high-clarity public information    | service status, accessibility-first explainers |

## Kineglyph

_Warm paper · ink geometry · a single teal pulse_

This is the visual system derived from the animated Kineglyph wordmark. It keeps surfaces quiet and
uses teal for the active result rather than washing every connector in brand colour.

```kineglyph live id=theme-kineglyph view=preview height=470
import { figure, kineglyphTheme, material } from "kineglyph";

export const theme = kineglyphTheme;

export default figure("kineglyph-release", { title: "Release review" }, (f) => {
  const stages = [
    f.card({ eyebrow: "01", title: "COLLECT", body: "12 accepted changes", motif: "layers", tone: "info", compact: true, frame: material("raised") }),
    f.card({ eyebrow: "02", title: "VERIFY", body: "48 checks passing", motif: "grid", tone: "warning", compact: true, frame: material("raised") }),
    f.card({ eyebrow: "03", title: "PUBLISH", body: "Ready for readers", motif: "arrow-right", tone: "accent", compact: true, frame: material("floating") }),
  ];
  const facts = f.stack([
    f.keyValue("Build", "1842", { valueTone: "accent" }),
    f.keyValue("Median", "72 ms", { valueTone: "info" }),
    f.keyValue("Confidence", "96.4%", { valueTone: "success" }),
  ], { gap: 7, padding: 14, width: "fill", frame: material("inset") });
  const palette = f.row(["chart1", "chart2", "chart3", "chart4", "chart5", "chart6"].map((fill) =>
    f.rect({ width: "fill", height: 8, fill, stroke: "none", radius: 4 })
  ), { gap: 5, width: "fill" });
  f.root(f.stack([
    f.row([f.stack([f.eyebrow("RELEASE 24.8"), f.title("One decision, three proofs")], { gap: 4 }), f.code("READY", { tone: "accent" })], { justify: "between", align: "end", width: "fill" }),
    f.flow(stages, { gap: 12, align: "stretch", width: "fill" }),
    facts,
    palette,
  ], { gap: 16, padding: 18, width: "fill", frame: material("flat") }));
  f.sequence([f.reveal(stages, { stagger: 80 }), f.reveal(facts), f.reveal(palette)]);
});
```

## Swiss editorial

_Light · sharp corners · asymmetric type scale · red/blue discipline_

Large sans-serif headings provide the hierarchy. Black connectors establish structure, and red is
reserved for emphasis.

```kineglyph live id=theme-swiss view=preview height=470
import { figure, material, swissTheme } from "kineglyph";

export const theme = swissTheme;

export default figure("swiss-release", { title: "Release review" }, (f) => {
  const stages = [
    f.card({ eyebrow: "01", title: "COLLECT", body: "12 accepted changes", motif: "layers", tone: "info", frame: material("raised") }),
    f.card({ eyebrow: "02", title: "VERIFY", body: "48 checks passing", motif: "grid", tone: "warning", frame: material("raised") }),
    f.card({ eyebrow: "03", title: "PUBLISH", body: "Ready for readers", motif: "arrow-right", tone: "success", frame: material("floating") }),
  ];
  const facts = f.stack([
    f.keyValue("Build", "1842", { valueTone: "accent" }),
    f.keyValue("Median", "72 ms", { valueTone: "info" }),
    f.keyValue("Confidence", "96.4%", { valueTone: "success" }),
  ], { gap: 7, padding: 14, width: "fill", frame: material("inset") });
  const palette = f.row(["chart1", "chart2", "chart3", "chart4", "chart5", "chart6"].map((fill) =>
    f.rect({ width: "fill", height: 8, fill, stroke: "none", radius: 0 })
  ), { gap: 4, width: "fill" });
  f.root(f.stack([
    f.row([f.stack([f.eyebrow("RELEASE 24.8"), f.title("One decision, three proofs")], { gap: 4 }), f.code("READY", { tone: "accent" })], { justify: "between", align: "end", width: "fill" }),
    f.flow(stages, { gap: 14, align: "stretch", width: "fill" }),
    facts,
    palette,
  ], { gap: 18, padding: 20, width: "fill", frame: material("flat") }));
  f.sequence([f.reveal(stages, { stagger: 80 }), f.reveal(facts), f.reveal(palette)]);
});
```

## Ledger

_Warm · serif hierarchy · fine rules · measured motion_

Ledger uses serif type, warm neutrals, and fine rules. It is designed to sit beside long-form prose
or financial tables.

```kineglyph live id=theme-ledger view=preview height=470
import { figure, ledgerTheme, material } from "kineglyph";

export const theme = ledgerTheme;

export default figure("ledger-release", { title: "Release review" }, (f) => {
  const stages = [
    f.card({ eyebrow: "01", title: "COLLECT", body: "12 accepted changes", motif: "layers", tone: "info", frame: material("raised") }),
    f.card({ eyebrow: "02", title: "VERIFY", body: "48 checks passing", motif: "grid", tone: "warning", frame: material("raised") }),
    f.card({ eyebrow: "03", title: "PUBLISH", body: "Ready for readers", motif: "arrow-right", tone: "success", frame: material("floating") }),
  ];
  const facts = f.stack([
    f.keyValue("Build", "1842", { valueTone: "accent" }),
    f.keyValue("Median", "72 ms", { valueTone: "info" }),
    f.keyValue("Confidence", "96.4%", { valueTone: "success" }),
  ], { gap: 7, padding: 14, width: "fill", frame: material("inset") });
  const palette = f.row(["chart1", "chart2", "chart3", "chart4", "chart5", "chart6"].map((fill) =>
    f.rect({ width: "fill", height: 8, fill, stroke: "none", radius: 0 })
  ), { gap: 4, width: "fill" });
  f.root(f.stack([
    f.row([f.stack([f.eyebrow("RELEASE 24.8"), f.title("One decision, three proofs")], { gap: 4 }), f.code("READY", { tone: "accent" })], { justify: "between", align: "end", width: "fill" }),
    f.flow(stages, { gap: 14, align: "stretch", width: "fill" }),
    facts,
    palette,
  ], { gap: 18, padding: 20, width: "fill", frame: material("flat") }));
  f.sequence([f.reveal(stages, { stagger: 80 }), f.reveal(facts), f.reveal(palette)]);
});
```

## Blueprint

_Dark · square geometry · monospaced notation · functional grid_

Blueprint uses cyan as drafting ink rather than emitted light. A measured grid, square line caps,
and zero-radius frames keep the construction precise.

```kineglyph live id=theme-blueprint view=preview height=470
import { blueprintTheme, figure, material } from "kineglyph";

export const theme = blueprintTheme;

export default figure("blueprint-release", { title: "Release review" }, (f) => {
  const stages = [
    f.card({ eyebrow: "01", title: "COLLECT", body: "12 accepted changes", motif: "layers", tone: "info", frame: material("raised") }),
    f.card({ eyebrow: "02", title: "VERIFY", body: "48 checks passing", motif: "grid", tone: "warning", frame: material("raised") }),
    f.card({ eyebrow: "03", title: "PUBLISH", body: "Ready for readers", motif: "arrow-right", tone: "success", frame: material("floating") }),
  ];
  const facts = f.stack([
    f.keyValue("Build", "1842", { valueTone: "accent" }),
    f.keyValue("Median", "72 ms", { valueTone: "info" }),
    f.keyValue("Confidence", "96.4%", { valueTone: "success" }),
  ], { gap: 7, padding: 14, width: "fill", frame: material("inset") });
  const palette = f.row(["chart1", "chart2", "chart3", "chart4", "chart5", "chart6"].map((fill) =>
    f.rect({ width: "fill", height: 8, fill, stroke: "none", radius: 0 })
  ), { gap: 4, width: "fill" });
  f.root(f.stack([
    f.row([f.stack([f.eyebrow("RELEASE 24.8"), f.title("One decision, three proofs")], { gap: 4 }), f.code("READY", { tone: "accent" })], { justify: "between", align: "end", width: "fill" }),
    f.flow(stages, { gap: 14, align: "stretch", width: "fill" }),
    facts,
    palette,
  ], { gap: 18, padding: 20, width: "fill", frame: material("flat") }));
  f.sequence([f.reveal(stages, { stagger: 80 }), f.reveal(facts), f.reveal(palette)]);
});
```

## Field manual

_Compact · olive stock · condensed labels · safety orange_

Field manual is made for procedures and equipment. It uses compact spacing, squared construction,
olive neutrals, and safety orange for operational notation.

```kineglyph live id=theme-field-manual view=preview height=470
import { fieldManualTheme, figure, material } from "kineglyph";

export const theme = fieldManualTheme;

export default figure("field-manual-release", { title: "Release review" }, (f) => {
  const stages = [
    f.card({ eyebrow: "01", title: "COLLECT", body: "12 accepted changes", motif: "layers", tone: "info", frame: material("raised") }),
    f.card({ eyebrow: "02", title: "VERIFY", body: "48 checks passing", motif: "grid", tone: "warning", frame: material("raised") }),
    f.card({ eyebrow: "03", title: "PUBLISH", body: "Ready for readers", motif: "arrow-right", tone: "success", frame: material("floating") }),
  ];
  const facts = f.stack([
    f.keyValue("Build", "1842", { valueTone: "accent" }),
    f.keyValue("Median", "72 ms", { valueTone: "info" }),
    f.keyValue("Confidence", "96.4%", { valueTone: "success" }),
  ], { gap: 7, padding: 14, width: "fill", frame: material("inset") });
  const palette = f.row(["chart1", "chart2", "chart3", "chart4", "chart5", "chart6"].map((fill) =>
    f.rect({ width: "fill", height: 8, fill, stroke: "none", radius: 0 })
  ), { gap: 4, width: "fill" });
  f.root(f.stack([
    f.row([f.stack([f.eyebrow("RELEASE 24.8"), f.title("One decision, three proofs")], { gap: 4 }), f.code("READY", { tone: "accent" })], { justify: "between", align: "end", width: "fill" }),
    f.flow(stages, { gap: 14, align: "stretch", width: "fill" }),
    facts,
    palette,
  ], { gap: 18, padding: 20, width: "fill", frame: material("flat") }));
  f.sequence([f.reveal(stages, { stagger: 80 }), f.reveal(facts), f.reveal(palette)]);
});
```

## Studio

_Light · cool neutrals · softer geometry · calm product hierarchy_

Studio uses cool neutrals, one blue accent, quiet surfaces, and moderate rounding. It suits product
documentation and application flows.

```kineglyph live id=theme-studio view=preview height=470
import { figure, material, studioTheme } from "kineglyph";

export const theme = studioTheme;

export default figure("studio-release", { title: "Release review" }, (f) => {
  const stages = [
    f.card({ eyebrow: "01", title: "COLLECT", body: "12 accepted changes", motif: "layers", tone: "info", frame: material("raised") }),
    f.card({ eyebrow: "02", title: "VERIFY", body: "48 checks passing", motif: "grid", tone: "warning", frame: material("raised") }),
    f.card({ eyebrow: "03", title: "PUBLISH", body: "Ready for readers", motif: "arrow-right", tone: "success", frame: material("floating") }),
  ];
  const facts = f.stack([
    f.keyValue("Build", "1842", { valueTone: "accent" }),
    f.keyValue("Median", "72 ms", { valueTone: "info" }),
    f.keyValue("Confidence", "96.4%", { valueTone: "success" }),
  ], { gap: 7, padding: 14, width: "fill", frame: material("inset") });
  const palette = f.row(["chart1", "chart2", "chart3", "chart4", "chart5", "chart6"].map((fill) =>
    f.rect({ width: "fill", height: 8, fill, stroke: "none", radius: 0 })
  ), { gap: 4, width: "fill" });
  f.root(f.stack([
    f.row([f.stack([f.eyebrow("RELEASE 24.8"), f.title("One decision, three proofs")], { gap: 4 }), f.code("READY", { tone: "accent" })], { justify: "between", align: "end", width: "fill" }),
    f.flow(stages, { gap: 14, align: "stretch", width: "fill" }),
    facts,
    palette,
  ], { gap: 18, padding: 20, width: "fill", frame: material("flat") }));
  f.sequence([f.reveal(stages, { stagger: 80 }), f.reveal(facts), f.reveal(palette)]);
});
```

## Civic

_High contrast · generous type · durable borders · public-information palette_

Civic prioritizes clarity at a distance. It uses larger type, stronger rules, and a blue-and-yellow
public-information palette without relying on colour alone for status.

```kineglyph live id=theme-civic view=preview height=470
import { civicTheme, figure, material } from "kineglyph";

export const theme = civicTheme;

export default figure("civic-release", { title: "Release review" }, (f) => {
  const stages = [
    f.card({ eyebrow: "01", title: "COLLECT", body: "12 accepted changes", motif: "layers", tone: "info", frame: material("raised") }),
    f.card({ eyebrow: "02", title: "VERIFY", body: "48 checks passing", motif: "grid", tone: "warning", frame: material("raised") }),
    f.card({ eyebrow: "03", title: "PUBLISH", body: "Ready for readers", motif: "arrow-right", tone: "success", frame: material("floating") }),
  ];
  const facts = f.stack([
    f.keyValue("Build", "1842", { valueTone: "accent" }),
    f.keyValue("Median", "72 ms", { valueTone: "info" }),
    f.keyValue("Confidence", "96.4%", { valueTone: "success" }),
  ], { gap: 7, padding: 14, width: "fill", frame: material("inset") });
  const palette = f.row(["chart1", "chart2", "chart3", "chart4", "chart5", "chart6"].map((fill) =>
    f.rect({ width: "fill", height: 8, fill, stroke: "none", radius: 0 })
  ), { gap: 4, width: "fill" });
  f.root(f.stack([
    f.row([f.stack([f.eyebrow("RELEASE 24.8"), f.title("One decision, three proofs")], { gap: 4 }), f.code("READY", { tone: "accent" })], { justify: "between", align: "end", width: "fill" }),
    f.flow(stages, { gap: 14, align: "stretch", width: "fill" }),
    facts,
    palette,
  ], { gap: 18, padding: 20, width: "fill", frame: material("flat") }));
  f.sequence([f.reveal(stages, { stagger: 80 }), f.reveal(facts), f.reveal(palette)]);
});
```

## Customize a preset

Every preset is an ordinary `ThemeTokens` value. Use one directly, layer a narrow override on top,
or switch it at runtime without changing the scene.

```ts
import { createTheme, professionalThemes } from "@kineglyph/core";

const houseTheme = createTheme(
  {
    name: "our-studio",
    colors: { accent: "#173ea5", chart2: "#a6472f" },
    radii: { lg: 12 },
  },
  professionalThemes.studio,
);

controller.setTheme(houseTheme);
```

Themes do not change scene structure. Content, responsive layout, state, and motion remain attached
to the figure when its theme changes.
