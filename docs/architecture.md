# Kineglyph architecture

## Product boundary

Kineglyph is an illustration compiler and runtime, not a free-form editor and not a general
graphics engine. It targets explanatory figures: pipelines, transformations, comparisons,
lifecycles, architecture diagrams, and domain adapters such as Nucleation build sequences.

The source of truth is semantic data. SVG markup, CSS animation state, and raster pixels are
outputs. This boundary prevents the authored figure from inheriting browser-specific coordinates,
font fallbacks, or timing behaviour.

## Resolution pipeline

```text
authoring schema + semantic theme + layout mode
                         |
                         v
             deterministic layout resolver
                         |
                         v
                 resolved scene graph
                    /           \
          seek(time)             renderer
              |                     |
        resolved frame       SVG / DOM / raster
```

The resolver is pure. Equal inputs must produce byte-equivalent resolved geometry. Interactivity
may select nodes or seek time, but it does not mutate the authored scene.

## Core invariants

1. Every scene, node, and edge has a stable caller-provided identifier.
2. Layout is computed from constraints and theme geometry; themes never contain node coordinates.
3. Wide and stacked modes are independently resolved. Consumers choose a mode instead of scaling
   an unsuitable aspect ratio.
4. Timeline evaluation is random-access. Rendering time `t` never depends on previously rendered
   frames.
5. A resolved scene contains finite geometry and refers only to existing node identifiers.
6. SVG output includes an accessible name and description. Interactive nodes are keyboard
   focusable and expose their semantic label.
7. Runtime animation is scoped to an owning root and disposed when that root unmounts.

## Themes

Theme tokens are semantic rather than component-specific. The initial contract separates:

- surfaces, rules, text, accent, and flow colours;
- display, body, and monospace font stacks;
- stroke, radius, spacing, and node sizing geometry;
- duration and easing motion policy.

Typography affects geometry. The initial resolver uses explicit font-size and average-character
metrics, while the browser wrapper may measure rendered labels and request a new resolution pass.
No renderer is allowed to silently change the font size to make a label fit. Production static
export will embed declared font files and resolve exact metrics before layout.

## Timeline model

Animation is represented as tracks targeting stable scene identifiers. Each track contains
keyframes and an interpolation policy. `seek(time)` clamps time, finds the surrounding keyframes,
and returns resolved opacity, translation, scale, and edge-reveal state.

Anime.js is an execution backend, not the timeline source of truth. The browser runtime compiles
tracks to Anime.js v4 for smooth playback, while scrubbing and export use the same pure seek model.
This keeps interactive playback and future raster frames visually equivalent.

## Responsive behaviour

Kineglyph chooses between named layout modes using actual container width. It never applies a
non-uniform transform to force a wide illustration into a narrow box. The SVG `viewBox` and CSS
`aspect-ratio` are updated together, and the stacked mode routes edges vertically.

## Package boundaries

- `core` has no DOM or framework dependency.
- `svg` serializes a resolved scene and frame without owning playback.
- `anime` owns DOM lookup, Anime.js compilation, playback, and cleanup inside one root element.
- `react` owns responsive observation, selection state, controls, and lifecycle composition.
- `export` will own resvg and video/frame adapters; it must not change layout semantics.

## Nucleation adapter direction

A later `@kineglyph/nucleation` package should translate Nucleation operation/frame data into two
possible layers:

1. lightweight symbolic block/region nodes for explanatory diagrams; and
2. synchronized rendered media produced by Nucleation for full 3D build sequences.

Kineglyph should orchestrate labels, callouts, and time while Nucleation remains responsible for
Minecraft rendering.

## Deferred work

- Exact embedded-font shaping for deterministic headless export.
- resvg-backed PNG/WebP/PDF output and frame-sequence/video encoders.
- Collision-aware arbitrary graph routing beyond the constrained pipeline recipe.
- A larger recipe catalogue and a Nucleation operation adapter.
- Authoring diagnostics for overlap, clipped text, and inaccessible contrast.
