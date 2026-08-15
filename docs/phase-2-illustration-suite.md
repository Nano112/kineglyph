# Phase 2: illustration suite, interaction grammar, and portable output

## Mission

Turn the first Kineglyph vertical slice into a credible standalone system for authored technical
illustrations. Rebuild all eight existing Nucleation system illustrations as semantic, responsive,
animated Kineglyph scenes; broaden the primitive and edge grammar; add deterministic state-machine
interaction; and make the same scene practical in React, vanilla JavaScript, Blade templates,
static SVG, PNG, and GIF.

The result should feel closer to the compositional control of Motion Canvas than to a diagramming
widget, while remaining lightweight enough to embed as a live illustration in documentation and
product articles.

## Product boundary

Kineglyph is a deterministic technical-illustration compiler and live runtime. It is not a
drag-and-drop editor, a general graph-layout engine, a video editor, or a 3D renderer.

The semantic scene, state, and timeline remain the source of truth. Anime.js is a browser playback
backend. SVG, PNG, and GIF are outputs of the same resolved scene at exact times.

## Source material

The existing reference SVGs are read-only inputs under:

`/Users/harrison/RustroverProjects/Nucleation/docs/media/readme/`

Rebuild these eight concepts rather than copying their coordinates or markup:

1. `fast-generation/operation-map.svg`
2. `shapes-brushes/shape-brush-map.svg`
3. `sdf-and-fields/sdf-field-pipeline.svg`
4. `palettes-and-color/color-pipeline.svg`
5. `smart-simulation/choose-engine.svg`
6. `formats-and-io/format-pipeline.svg`
7. `bindings-and-languages/binding-pipeline.svg`
8. `meshing-and-rendering/render-pipeline.svg`

Do not modify Nucleation, Pock, Schematio, or any repository outside Kineglyph.

## Architecture requirements

### 1. General scene primitives

Evolve beyond pipeline-only nodes without creating an unconstrained canvas API. Provide a small,
typed, serializable hierarchy inspired by the useful parts of Motion Canvas:

- groups/layers;
- stack, row, grid, overlay, and absolute-within-parent layout;
- rect, circle, text, icon/motif, path, image/media, badge, legend, and callout marks;
- reusable components/recipes composed from primitives;
- stable caller-owned IDs and explicit z-order;
- semantic tokens rather than embedded product colours;
- wide and compact named layouts rather than non-uniform scaling.

If a full hierarchy would destabilize the existing pipeline API, add it incrementally behind a
clear resolved-scene contract and keep backwards compatibility.

### 2. Edge and connector grammar

Edges need first-class creative control. At minimum support:

- routes: straight, orthogonal/elbow, bezier/curve, and arc;
- heads and tails: none, arrow, triangle, dot, diamond, and bar;
- strokes: solid, dashed, dotted, and animated-flow variants;
- configurable width, tone, opacity, curvature/bend, corner radius, and routing side/ports;
- labels with start/middle/end placement and collision-safe offsets;
- one-way, two-way, branching, and merging connections;
- deterministic reveal progress and optional moving packets/pulses in live playback;
- accessible descriptions that do not expose decorative paths as redundant controls.

The SVG renderer must derive markers, paths, hit targets, and animations from typed edge data. Do
not hand-author unique SVG paths for each example unless the primitive is explicitly a custom path.

### 3. Signals and deterministic state machines

Add a small state-machine model suitable for interactive explanations:

- named states and typed/string events;
- deterministic transitions with optional guards expressed as serializable conditions;
- state entry/exit actions limited to scene variables, selection, or timeline seeks;
- derived signals/variables that can drive text, visibility, tone, progress, and geometry;
- random-access state resolution for tests and export;
- transition history optional in the live controller, never required for resolving a frame;
- invalid state/event definitions rejected with useful diagnostics.

Create an interactive state-machine laboratory using the smart-placement/simulation illustration.
Readers should be able to choose an intent or capability and see the recommended engine/path,
explanation, and highlighted connectors change. Include reset and keyboard-operable controls.

### 4. Browser runtimes and Blade-friendly embedding

Keep `@kineglyph/react`, and add a framework-neutral package such as `@kineglyph/web` that offers:

- `mountKineglyph(element, options)` returning a disposable controller;
- play, pause, restart, seek, send(event), setTheme, inspect, and destroy methods;
- no React dependency;
- one or more practical ESM bundles suitable for Vite and ordinary `<script type="module">` use;
- a documented Blade example showing a scene mounted into a normal Laravel view;
- multiple figures on one page without ID, event, timeline, or style collisions;
- reduced-motion and keyboard behavior equivalent to the React wrapper.

Avoid requiring a custom build system inside a consumer beyond importing the package bundle.

### 5. Static and animated export

Finish `@kineglyph/export`:

- standalone SVG string/file;
- deterministic PNG via resvg;
- deterministic GIF generated by sampling the core timeline at explicit FPS;
- transparent or themed canvas backgrounds;
- width/height/scale controls without stretching;
- exact final-frame export and an explicit time option;
- a small Node CLI for `svg`, `png`, and `gif` outputs if it improves usability;
- clear errors for missing fonts, unsupported live-only media, or invalid output settings.

Use a maintained, license-compatible encoder. Keep raster/GIF dependencies outside core and browser
packages. Do not shell out to a globally installed binary for the normal library path.

### 6. Illustration catalogue

Create a gallery route/page listing all eight Nucleation illustrations. Each example must:

- be authored from Kineglyph semantic definitions, not imported legacy SVG;
- render in Nucleation, Pock, and Schematio themes;
- have a purposeful animation that explains the concept rather than merely fading everything in;
- expose at least one useful interaction: inspection, branching state, filtering, comparison,
  scrubbing, or step selection;
- resolve without overlap or clipped text at desktop, approximately 820px, and 390px containers;
- end in a complete, readable static state;
- export successfully to SVG and PNG; animated examples also export to GIF;
- include concise accessible title/description text.

Use these conceptual directions:

- Fast generation: workload shapes route to the correct bulk API; compare call overhead.
- Shapes and brushes: shape selects cells, brush assigns material, composition produces a build.
- SDF and fields: preserve and improve the existing first scene.
- Palettes and colour: source colour passes through filtering/matching into nearest, ramp, gradient,
  or dither outputs.
- Smart simulation: state-machine decision laboratory for shorthand, placement, circuits, and ticks.
- Formats and I/O: detectors converge on one editable model, then fan out to format families.
- Bindings: Rust core and bridge annotations generate language surfaces with shared semantics.
- Rendering: schematic data becomes meshes, camera/lighting, stills, interactive views, or frames.

### 7. Quality and verification

Add tests for:

- deterministic primitive and layout resolution;
- all edge route/marker styles and marker-ID isolation;
- state-machine validation, transition determinism, and rejected invalid definitions;
- browser runtime mounting two independent figures and disposing them cleanly;
- React StrictMode playback stability;
- terminal-frame persistence;
- static SVG canonical output;
- PNG signatures/dimensions and deterministic repeat output;
- GIF signatures, frame count/timing, and deterministic repeat output where the encoder permits;
- all eight scenes resolving at wide, 820px, and 390px with finite geometry and no detected node
  overlap or text outside declared content boxes;
- production builds and zero unhandled browser errors.

Run formatting, lint, strict typecheck, tests, production build, and dependency audit. Keep tests
quiet: no ignored React `act()` warnings or unexplained stderr.

### 8. Quantitative authoring and developer experience (scope addition)

Kineglyph must be a general technical-illustration runtime, not primarily a node/edge graph
library. In addition to the eight scenes:

- Add a typed data/plot layer as a **separate pure compiler** (`@kineglyph/plot`, no DOM, JSX, or
  chart-framework dependencies) that compiles deterministically into ordinary core scene IR:
  linear + band scales; axes, ticks, gridlines; grouped/stacked/diverging bars, line/area,
  dot/scatter, heatmap, sparkline; derived legends; semantic rules, ranges, and datum callouts.
  Charts are semantic data with field-name channels (never accessor callbacks) so scenes stay
  serializable; category order and domains are frozen; ids are stable and plot-prefixed; static
  SVG carries titles, summaries, and descriptions.
- Core gains only generic capabilities: a fractional `coordinates` layout and percent lengths,
  polyline marks, anchored `revealX`/`revealY` reveals, structured inspection
  (role/title/summary/fields), roving focus groups (one tab stop per series, arrow keys within),
  data-viz palette tokens, a `SceneFragment` composition contract with scoped ids, and static
  SVG / runtime transform-origin parity. Do not turn core into a chart grammar.
- Add a compact framework-neutral authoring surface: `figure()` (inferred stable ids, recipes,
  fragment composition, motion presets and sequencing, machines and controls, actionable
  diagnostics) plus `plot()`; keep `defineScene()` and raw nodes/edges as escape hatches. Lead
  public docs with `figure()`/`plot()` and add an authoring cookbook, a compile-checked example
  under 80 readable lines, and docs for TypeScript, vanilla, and Blade consumption.
- Add at least three non-flow gallery labs — a benchmark/comparison chart, a time-series
  line+area plot, and a heatmap or scatter view — at least one hybrid combining a chart with
  explanatory callouts or state controls; illustrative data must be labelled as such rather than
  forced into a Nucleation page where it would be quantitatively dishonest.
- Acceptance: exact scale/tick/stack geometry; empty, single, negative, and missing data; narrow
  label reduction; byte-identical SVG for equal input; start/mid/end random seeks; transform and
  export parity; structured inspector and keyboard navigation; isolated defs across several plots
  on one page; PNG/GIF outputs with genuinely differing frames; a compile-checked public example
  under 80 lines; a roughly 1000-visible-mark performance budget; and a line-count/complexity
  review of authored figures rather than only happy-path screenshots.
- Critique to honour: over-generalised graph-centric abstractions are a risk. The connector
  grammar stays an illustration tool (ports, routes, markers, labels) — no automatic graph layout,
  no force-directed routing; charts are not nodes joined by edges; the 400–800-line raw scenes
  demonstrate that the IR is not the default authoring API.

## Visual direction

The examples must feel authored, not generated by a generic flowchart package. Preserve hierarchy,
negative space, visual rhythm, and diagram-specific motifs. Theme projection may change typography,
corner geometry, stroke language, motion timing, and ornament as well as colour.

Use animation to reveal causality, flow, branching, comparison, or construction. Avoid indiscriminate
staggered fade-ins. Controls should be compact and article-friendly.

## Working protocol

- Work only on the current local Kineglyph feature branch.
- You may delegate independent packages or illustrations to subagents, but you own integration and
  must review their work.
- Commit coherent milestones locally with descriptive messages.
- Never create a remote, push, publish npm packages, deploy, or modify other repositories.
- Preserve the existing vertical slice and its tests unless a deliberate compatible migration is
  documented.
- Prefer complete, verified vertical behavior over broad stubs. A stub is acceptable only when
  explicitly documented and not presented as working.

## Definition of done

Phase 2 is done only when all eight scenes are visible in the gallery, interactive behavior works in
both React and the framework-neutral runtime, edge styles are visibly demonstrated, the simulation
state machine is usable, SVG/PNG/GIF files are produced from the same semantic scenes, the Blade
example is credible, the entire check suite is green, and a production-browser visual pass has no
obvious clipping, overlap, empty terminal frames, or squashed layouts — and, for the scope
addition, the plot compiler and `figure()` DSL ship with their acceptance tests, the three chart
labs are in the gallery, and the cookbook and sub-80-line example are compile-checked.
