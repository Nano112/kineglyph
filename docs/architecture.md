# Kineglyph architecture

## Product boundary

Kineglyph is a deterministic technical-illustration compiler and live runtime. It is not a
drag-and-drop editor, a general graph-layout engine, a video editor, or a 3D renderer. It targets
explanatory figures: pipelines, transformations, comparisons, decision laboratories, lifecycles,
and domain adapters such as Nucleation build sequences.

The semantic scene, its state machine, and its timeline are the source of truth. SVG markup, DOM
animation state, and raster pixels are outputs of the same resolved scene at exact times.

## Resolution pipeline

```text
scene definition (primitives + edges + timeline + machine)
        + semantic theme + container width (+ machine state)
                         |
                         v
        chooseLayout → named layout (wide | compact | narrow)
                         |
                         v
        buildView: responsive picks + signal bindings applied
                         |
                         v
        deterministic layout resolver (widths down, heights up, positions down)
                         |
                         v
        edge routing (ports, routes, markers, labels, packets)
                         |
                         v
                  resolved scene graph
                    /           \
          seek(time)             renderers
              |                     |
        resolved frame       SVG / DOM / PNG / GIF
```

The resolver is pure. Equal inputs produce byte-equivalent geometry. Interaction never mutates
the authored scene: a state-machine transition produces a new machine state, and the scene is
re-resolved for it.

## Core invariants

1. Every scene, node, edge, control, and timeline track has a stable caller-provided identifier.
2. Layout is computed from constraints and theme geometry; themes never contain coordinates.
3. `wide`, `compact`, and `narrow` layouts are independently resolved from container width and
   the scene's breakpoints. Consumers pick a mode; nothing is scaled non-uniformly.
4. Timeline evaluation is random-access. Rendering time `t` never depends on previous frames.
5. State machines are deterministic: `sendMachineEvent(machine, state, event)` is a pure function
   and any state can be constructed directly with `resolveMachineState`. History is optional in
   the live controller and never required to resolve a frame.
6. A resolved scene contains finite geometry and refers only to existing identifiers; the
   resolver reports overlap, overflow, and truncation as diagnostics.
7. SVG output carries explicit presentation attributes (fills, fonts, sizes) so static
   rasterisers that ignore CSS custom properties render the same picture as browsers.
8. Interactive nodes are keyboard-focusable and expose their semantic label; decorative edges are
   hidden from assistive technology; described edges are exposed as images.
9. Runtime animation and DOM ids are scoped to an owning root and disposed with it, so many
   figures can share a page.

## Scene primitives

`SceneDefinition` (schema version 2) is a typed, serializable tree:

- **Groups** with `stack`, `row`, `grid`, `overlay`, and `absolute` layouts, gap, padding, align,
  justify, columns, an optional frame, clipping, and children.
- **Marks**: `rect`, `circle`, `text`, `icon` (motif), `path` (custom geometry in a local view box),
  `image` (with a `live` flag that export refuses), `badge`, `legend`, `callout`.
- **Responsive values**: most numeric/enumerated properties accept `{ wide, compact, narrow }`
  maps; narrower layouts fall back to wider definitions.
- **Sizing**: numbers, `fill` (share available space by grow weight, flex-basis 0), or `hug`
  (content size). Rows allocate space with a deterministic flex algorithm; text wraps at its
  resolved width using explicit glyph-class metrics, so wrapping is identical everywhere.
- **Bindings**: `bind: { text, hidden, tone, opacity, highlight, progress, width, height }` read
  state-machine signals or variables.
- **Recipes** (`@kineglyph/scenes`): `card`, `panel`, `pill`, `eyebrow`, `flow`, and friends compose
  primitives so the catalogue reads as one system.

## Edge grammar

Edges are typed data: endpoints (node, side, offset, gap), a route (`straight`, `orthogonal`,
`curve`, `arc`), head and tail markers (`none`, `arrow`, `triangle`, `dot`, `diamond`, `bar`), a
stroke style (`solid`, `dashed`, `dotted`, `flow`), width, tone, opacity, curvature/bend, corner
radius, labels with start/middle/end placement, packets, an accessible description, and bindings.
The core computes ports (auto-distributing edges that share a node side), path geometry with
arc-length sampling, label boxes nudged away from nodes and kept inside the canvas, and packet
positions at a given time. The SVG renderer derives markers (ids scoped by root, kind, and
colour), dash/reveal patterns, hit targets, and CSS flow animation from that data; it never
hand-authors paths.

## Themes

Theme tokens are semantic: colours (including `info` and `surfaceMuted`), typography per text
style, spacing, radii, stroke weights, motion timing and easing, and ornament policy (grid,
surface treatment, line caps, uppercase eyebrows). Projection changes typography, corner
geometry, stroke language, motion, and ornament as well as colour. Highlight and tone changes are
computed as concrete colours in the resolver/renderer, so exports carry them.

## Timeline model

Animation is represented as tracks targeting stable ids. Properties: `opacity`, `translateX`,
`translateY`, `scale`, `progress`, `highlight` for nodes; `opacity`, `edgeReveal`/`progress`,
`highlight`, `flow` for edges. `seekTimeline` clamps time and evaluates keyframes with easing;
packet positions are recomputed from sampled geometry. Authoring helpers (`reveal`, `drawEdge`,
`flow`, `highlight`, `pulse`, `progressTo`, `timeline`) keep scenes purposeful and terse.

Anime.js is an execution backend, not the source of truth: `KineglyphSceneAnimator` owns the
clock inside one root, applies each frame from the pure model (opacity, transforms, dash
patterns, marker visibility, highlight colours, packet positions), and disposes cleanly.

## Runtimes

- `@kineglyph/web` — `mountKineglyph(element, options)` builds the shell (stage, readout, machine
  controls, playback controls, live region), observes the host width, resolves and renders,
  animates, wires inspection and activation, sends machine events, applies seek effects, and
  returns a controller (`play`, `pause`, `restart`, `seek`, `send`, `reset`, `setTheme`,
  `setScene`, `inspect`, `resize`, `on`, `destroy`). `autoMount()` mounts `[data-kineglyph]`
  elements; `dist/kineglyph-web.js` is a self-contained ESM bundle for pages without a bundler.
- `@kineglyph/react` — `KineglyphFigure` owns only the mount lifecycle and forwards a handle; it
  survives StrictMode effect replay because mount and destroy are symmetric.

## Export

`@kineglyph/export` produces a standalone SVG string, a deterministic PNG through resvg, and a
deterministic GIF by sampling the timeline at an explicit frame rate and encoding with gifenc.
Backgrounds are themed or transparent, sizes fit uniformly (never stretch), time defaults to the
final frame, and errors are explicit (`invalid-time`, `invalid-output`, `missing-font`,
`live-media`, `encoder`). Raster dependencies live only in this package. The
`kineglyph-export` CLI wraps the same functions.

## Package boundaries

- `core` has no DOM or framework dependency.
- `svg` serializes a resolved scene or frame without owning playback.
- `anime` owns DOM lookup, Anime.js compilation, playback, and cleanup inside one root element.
- `web` owns the figure shell, responsive observation, interaction, and lifecycle; `react` wraps it.
- `export` owns resvg and GIF encoding; it must not change layout semantics.
- `scenes` holds authored content and themes only.

## Deferred work

- Exact embedded-font shaping for byte-identical export across machines (explicit font files
  are supported; system-font fallback differs per machine).
- Collision-aware routing for arbitrary graphs beyond the constrained routes and port rules.
- A Nucleation operation/frame adapter and rendered-media synchronisation.
