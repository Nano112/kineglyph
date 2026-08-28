# Drafting sheets — design

Reproduce the Hohmann wallpaper series from `omarchy-themes/hohmann` as a reusable Kineglyph
drafting system, then rebuild the five sheets as animated, parametric figures on the docs site.

## Goals

- A `draftingTheme` preset: graphite paper, white drafting ink, colour reserved for annotation
  (amber burns/callouts → `accent`, live trajectory → `success`, swept area/halo → `info`).
- A `sketch` shader material: seeded fractal-noise displacement that gives strokes the
  hand-drawn wobble of the originals, portable to SVG/PNG/GIF export.
- Drafting primitives in `@kineglyph/core` (`drafting` namespace): sheet frame with index ticks,
  fine/coarse grid, header, title block, dimension lines, vectors, leaders, radial ticks,
  crosshairs, arcs/ellipses — all as deterministic path data in a 2880×1800 sheet space, plus
  `at(x, y, anchor)` for placing text in the same space.
- Orbital mechanics in `@kineglyph/core` (`orbital` namespace): Hohmann transfer, Keplerian
  state (Kepler's equation), ground-track propagation, CR3BP libration points, gravity-turn
  ascent — pure, unit-tested against the numbers baked into the Python originals.
- Parametric physics in the browser: a `deriveSignals(variables)` mount option in
  `@kineglyph/web` (forwarded from live-block `export const deriveSignals`) recomputes bound
  path/text signals after every machine step, so controls change real inputs and geometry,
  Δv, periods and callouts follow without restarting the timeline.
- `docs/drafting-sheets.md`: the five sheets, live, animated, with controls.

## Non-goals (follow-ups)

- Replacing the Python wallpaper build (`@kineglyph/scenes` export script).
- Trig in the signal expression language.

## Layout technique

A `coordinates` group with `fit: "content"`. Every geometry layer is a `path` mark with
`viewBox: 2880×1800`, `width: "fill"`, placed at (0, 0); the first such child fixes the group's
height to the sheet aspect, so text placed by `drafting.at(x, y)` (fractions of the same sheet)
lands exactly on the geometry at any container width. Stroke widths are screen pixels
(the renderer divides by the viewBox scale).

## Signals

Each sheet's figure builds its initial geometry from the same model function used by
`deriveSignals`, so static prerenders and the export CLI are correct without JavaScript.
