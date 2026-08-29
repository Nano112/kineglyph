# Nucleation native export

The beacon sheet from [docs/nucleation-builds.md](../../docs/nucleation-builds.md), rendered
without a browser: Nucleation's native renderer draws the build, the Kineglyph export CLI
composes the drafting sheet — callout leaders included — around its frames.

```sh
# Python with `nucleation` installed (pip install nucleation) and a resource pack zip.
NUCLEATION_PACK=/path/to/pack.zip NUCLEATION_PYTHON=/path/to/python \
  npm run render:build-sheet
```

- `build.py` — records the build (the same script the docs run in WASM), renders
  `out/frames/beacon-0000.png …` at 30 fps with a transparent background and the sheet's camera,
  and writes `out/beacon.glb`.
- `sheet.mjs` — the sheet as a CLI-loadable scene; `frameSignals` projects the GLB's anchors
  through `headlessView` with the same camera.
- `scripts/render-build-sheet.mjs` — runs both and writes `out/beacon-sheet-1200.png`,
  `out/beacon-sheet.svg`, and `out/beacon-sheet.gif` via `--frame-signals` and `--surface`.

Pass `--skip-frames` to the script to recompose without re-rendering.
