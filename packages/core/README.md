# `@kineglyph/core`

Typed scene, theme, layout, timeline, and material primitives. Scenes are plain serialisable data:
`defineScene()` validates a definition, the recipes (`stack`, `row`, `heading`, `caption`, `code`,
`card`, `panel`, …) compose it, `resolveFigure()` lays it out for a width and theme, and
`seekTimeline()` produces a frame that any renderer can draw.

Seven restrained, effect-free theme presets are included for figures that need an immediate visual
direction without becoming a palette exercise:

```ts
import {
  blueprintTheme,
  civicTheme,
  fieldManualTheme,
  kineglyphTheme,
  ledgerTheme,
  professionalThemes,
  studioTheme,
  swissTheme,
} from "@kineglyph/core";

const theme = professionalThemes.blueprint;
```

Each preset changes the full system—type, spacing, radii, stroke weights, motion, ornament, and
semantic colour roles. Their material roles are deliberately flat: no glow, blur, glass effect, or
shader fallback is introduced when a scene switches themes.

Four additional themes exercise more opinionated glyph languages:

```ts
import {
  editorialCircuitTheme,
  glyphStyleThemes,
  integrationTheme,
  instrumentTheme,
  signalTheme,
} from "@kineglyph/core";

const schematic = signalTheme; // grid, outline, explicit signal paths
const integration = integrationTheme; // dark host maps, restrained cyan-to-blue hierarchy
const physical = instrumentTheme; // graphite depth, contact shadows, local emission
const editorialCircuit = editorialCircuitTheme; // inked signal channels, restrained card depth
const selected = glyphStyleThemes.instrument;
```

The same scene can switch between them. `tileNode()`, `port()`, `gridPlane()`, and `cardFan()` (or
`f.tile()`, `f.port()`, `f.gridPlane()`, and `f.cardFan()`) provide the matching portable
compositions without coupling the scene to a particular theme. Labelled tiles hug measured content and
offer icon, compact-horizontal, and centred-labelled variants plus a bindable detail line.
`f.circuit(nodes, connections)` infers responsive ranks from a netlist and returns its root, edges,
ranks, and a progressive `entrance` motion. The entrance draws the wires entering a rank while its
nodes reveal, so loading never exposes disconnected holes. Gates automatically face right in horizontal circuits and down in vertical
circuits; named `in-0`, `in-1`, and `out` ports sit on the exact visible pin endpoints and are
assigned from netlist order. Every node can declare named ports, targeted with
`{ node, port: "name" }`, while an explicit responsive `orientation` can override automatic gate
direction. Circuit ranks auto-fit their columns from allocated width, and their
wires avoid nodes by default and receive a wider canvas casing that keeps crossings legible;
`avoid: "nodes-and-edges"` also reserves prior lanes. `f.wire()` includes signal, bus, control,
data, clock, feedback, optional, packet-bearing flow, and obstacle-routed spline presets. Flow and
spline wires include a short animated ink trail by default; customize it with
`packets: { count, speed, period, trail, trailLength, trailWidth, trailOpacity }`. Prefer `speed` for
constant pixels-per-second motion across differently sized routes; an explicit `period` deliberately
synchronises whole-edge loops and takes precedence. The trail follows the
same resolved route as the wire, continues after an entrance sequence finishes, pauses with the
figure, and seeks deterministically for SVG/PNG/GIF export. Use
`signal: { onTone, offTone }` with `bind: { signal }` for live/inactive nets without separate tone
and packet expressions. Every node also accepts responsive static
`rotation`; animation and SVG/PNG/GIF export resolve the same centre-origin transform.

`f.logicCircuit({ inputs, gates, outputs })` is the concise Boolean layer over `f.circuit()`. Named
gate inputs form the netlist; the helper creates toggleable terminals, expressions, signal-bound
wires, output values, a state machine, and the same progressive entrance. Multi-target
`f.circuit()` connections share their source port by default instead of inserting a surprise layout
node; pass an explicit `junction` when the contact itself should be visible.

## Files, terminals, and asciinema recordings

`figure()` includes recursive file trees and structured terminals. Commands can be revealed with a
seekable character-level timeline, and `asciicast()` accepts the newline-delimited asciicast v2 and
v3 formats.

```ts
import { asciicast, figure } from "@kineglyph/core";

const cast = [
  '{"version":3,"term":{"cols":80,"rows":12}}',
  '[0.2,"o","$ npm test\\r\\n"]',
  '[0.4,"o","42 tests passed\\r\\n"]',
].join("\n");

const scene = figure("project", { title: "Project and build" }, (f) => {
  const files = f.fileTree(
    [{ name: "src", children: [{ name: "index.ts" }, { name: "figure.ts" }] }],
    { root: "demo" },
  );
  const recording = f.add(asciicast(cast, { id: "tests" }));
  f.root(f.flow([files, recording], { gap: 18 }));
  f.sequence([f.reveal(files), f.reveal(recording)]);
});
```

The asciicast renderer is transcript-oriented rather than a full terminal emulator. It handles
common cursor movement, carriage return, backspace, tabs, line erasure, and clear-screen sequences
while keeping the output lightweight, responsive, inspectable, and exportable as ordinary SVG.

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
