# Kineglyph roadmap

This is the product backlog for making Kineglyph the shortest path from an idea to a polished,
responsive, deterministic technical visual. Every capability is incomplete until it is both used
by Kineglyph's own documentation and explained from the public API outward.

> Completed on 2026-08-19. The checked dogfood and self-documentation items are part of the same
> implementation pass; the roadmap remains here as a shipped-capability index and design record.

## Now — authoring leverage

- [x] **Serializable expressions and formatting.** Add arithmetic, comparison, boolean, bitwise,
      numeric formatting, string formatting, and small collection expressions to state-machine
      signals without admitting callbacks into the scene IR.
  - [x] **Dogfood:** replace the lookup tables in the CPU bit counter, adders, and ALU examples.
  - [x] **Self-document:** expression reference, validation errors, recipes, and export examples.

- [x] **Keyed reactive scene updates.** Diff resolved scenes by stable id, patch compatible SVG
      nodes instead of replacing the full tree, and optionally interpolate live-data and machine
      transitions.
  - [x] **Dogfood:** make the live latency table and an interactive CPU figure update smoothly.
  - [x] **Self-document:** update semantics, transition options, lifecycle, and performance limits.

- [x] **Relational geometry.** Build on `f.spline()` with first-class node anchors, named ports,
      align/distribute constraints, leaders, brackets, and paths through authored nodes.
  - [x] **Dogfood:** express the Kineglyph mark and CPU signal paths without duplicated geometry.
  - [x] **Self-document:** geometry-reference cookbook and responsive-anchor diagnostics.

- [x] **Intrinsic fitting and local responsiveness.** Let coordinate/absolute figures hug their
      visible content, trim accidental gutters, and allow nested components to respond to their
      allocated width rather than only the root breakpoint.
  - [x] **Dogfood:** remove manual heights and empty bands from the CPU and gallery figures.
  - [x] **Self-document:** sizing model, `fit` recipes, overflow behavior, and breakpoint examples.

- [x] **Semantic controls and gestures.** Add buttons, toggles, sliders, ranges, radios, selects,
      pointer coordinates, dragging, hover/focus events, and simulation transport controls while
      preserving keyboard and assistive-technology behavior.
  - [x] **Dogfood:** directly manipulate bits, neural weights, counters, and simulation speed.
  - [x] **Self-document:** controls gallery, event payload contract, accessibility, and fallbacks.

- [x] **Customizable terminal primitives.** Expand terminal authoring with prompts, cursor styles,
      shell chrome, per-line spans, ANSI color/style preservation, wrapping/scroll policies,
      command status, selection, and controllable playback.
  - [x] **Dogfood:** rebuild the install terminal and asciinema examples using the public options.
  - [x] **Self-document:** authored terminals, asciicast v2/v3 fidelity, controls, and limitations.

- [x] **Code blocks and syntax highlighting.** Add an exportable code-block recipe with tokenized
      spans, bundled lightweight lexers, line numbers, line/range emphasis, diffs, annotations,
      themes, typing/reveal motion, and caller-supplied token streams for unsupported languages.
  - [x] **Dogfood:** replace documentation screenshots/plain code surfaces with live Kineglyph
        blocks, including a terminal/code comparison.
  - [x] **Self-document:** language support, custom tokenization, theming, motion, and export parity.

## Next — visual grammar

- [x] **Technical annotation primitives.** Dimension lines, rulers, braces, brackets, leader
      labels, measurement arrows, cross-sections, highlighted regions, coordinate grids, and ticks.
  - [x] **Dogfood:** annotate CPU word widths, bus sizes, memory ranges, and chart deltas.
  - [x] **Self-document:** annotation gallery plus placement/collision guidance.

- [x] **Circuit and signal grammar.** Named component ports, buses, nets, junctions, wire bridges,
      crossings, standard gates, active signal styling, propagation animation, and timing diagrams.
  - [x] **Dogfood:** rebuild every CPU adder/ALU/data-loop figure using semantic nets.
  - [x] **Self-document:** circuit cookbook, symbol/port reference, responsive layouts, and export.

- [x] **Diagram recipes.** Reusable state charts, sequence diagrams, neural networks, dataflow,
      dependency DAGs, convergence lanes, memory maps, registers, buffers, and comparison layouts.
  - [x] **Dogfood:** use each recipe in a real explanatory page rather than an isolated specimen.
  - [x] **Self-document:** one minimal recipe and one deeply customized recipe per family.

- [x] **Expanded plots.** Full-size pie/donut, radial progress, histogram, distribution, range,
      box, confidence band, timeline/Gantt, Sankey/alluvial, treemap, and topology plots.
  - [x] **Dogfood:** add an editorial story and a dense dashboard specimen for every new family.
  - [x] **Self-document:** typed channel API, responsive behavior, interaction, and annotations.

- [x] **Keyed live plot data.** Add `setData`/data-source handles, incremental scale/mark updates,
      bounded history, streaming windows, and deterministic snapshot/export state.
  - [x] **Dogfood:** WebSocket latency, throughput, and activity-matrix examples.
  - [x] **Self-document:** backpressure, update batching, transitions, snapshots, and reconnection.

- [x] **Richer deterministic motion.** Rotation, color/fill, stroke width, radius, numeric text,
      compatible path morphing, layout transitions, follow-path, named cues, and reusable timelines.
  - [x] **Dogfood:** animate the Kineglyph mark, circuit signals, terminal typing, and chart changes.
  - [x] **Self-document:** property support matrix across web/SVG/PNG/GIF and reduced motion.

- [x] **Professional visual-quality guardrails.** Contrast, touch-target, text-density, effects
      budget, palette, typography hierarchy, line-language, and unwanted-glow audits.
  - [x] **Dogfood:** run every built-in theme and documentation figure through the audit.
  - [x] **Self-document:** theme author checklist and actionable diagnostic reference.

## Later — scale, tooling, and output

- [x] **High-density renderer.** Add a Canvas renderer over the resolved scene for thousands of
      marks, with an accessible SVG/DOM summary and deterministic SVG/raster fallback.
  - [x] **Dogfood:** a virtualized table and large chart matrix with live, distinct microcharts.
  - [x] **Self-document:** renderer selection, accessibility contract, limits, and benchmarks.

- [x] **Incremental and worker execution.** Move expensive resolve/plot work to workers, cache
      unchanged subtrees, support dirty-region updates, and coalesce high-frequency inputs.
  - [x] **Dogfood:** benchmark the live table, graph matrix, and a large automaton.
  - [x] **Self-document:** worker setup, serialization boundaries, cancellation, and profiling.

- [x] **Smaller delivery surfaces.** Split runtime-lite, plots, shaders, live surfaces, editor,
      exporters, and optional adapters so simple embeds do not download authoring tools.
  - [x] **Dogfood:** make the production docs load only the capabilities used on each page.
  - [x] **Self-document:** entry-point chooser, size budgets, and bundler examples.

- [x] **Developer overlay and `kineglyph doctor`.** Inspect bounds, padding, ids, anchors, ports,
      routes, signals, timelines, collisions, truncation, contrast, target size, and all breakpoints.
  - [x] **Dogfood:** make it available in every editable documentation figure.
  - [x] **Self-document:** overlay workflow, CLI output, CI mode, and diagnostic remediation.

- [x] **Documentation and visual regression harness.** Compile every live example, render
      wide/compact/narrow and reduced-motion states, test interactions, and compare SVG/PNG/GIF.
  - [x] **Dogfood:** gate Kineglyph's own documentation and themes in CI.
  - [x] **Self-document:** show consumers how to reuse the harness for application figures.

- [x] **Additional export targets.** APNG, WebM/MP4, image sequences, sprite sheets, clipboard,
      embeddable data URIs, and optional font subsetting/embedding in standalone SVG.
  - [x] **Dogfood:** publish downloadable examples from the animation and terminal pages.
  - [x] **Self-document:** determinism, codecs, transparency, font licensing, and compatibility.

## Product boundaries

- Keep the serializable scene, deterministic resolver, accessible SVG, and exact-time timeline as
  the shared source of truth.
- Prefer semantic grammars and composable recipes over a growing pile of fixed templates.
- Do not introduce arbitrary callbacks into exported scenes; application adapters remain explicit.
- Do not turn the runtime into a general video editor, 3D engine, or unconstrained graph-layout
  system.
- Default visual direction stays restrained and professional: no gratuitous glow or effect-heavy
  “AI” styling.
