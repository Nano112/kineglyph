# Nucleation Phase 3 — Live engine source and parametric builds — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Drive the build surface from the live WASM engine (`frameJson(t)` — exact poses, opacity/tint/emissive, gizmo-capable) instead of the sampled GLB tracks, and show a parametric build sheet whose sliders rebuild the animation in-page.

**Architecture:** `fromBuildAnimation(engine, glb)` implements `FrameSource` over any object with `frameJson` / `durationMs` / `groupCount` / `anchorsJson` (duck-typed — the package still does not import `nucleation`); the GLB (still exported, for meshes and bounds) is parsed once. `buildSurface` gains `source?: (glb) => FrameSource` so the same renderer takes its poses from the live engine. The docs page gains a parametric beacon: `parametric()` sliders → `deriveSignals` echoes the parameters as signals → the surface `watch`es them, rebuilds the `BuildAnimation`, re-exports the GLB, and re-parses; frame signals keep the leaders attached.

**Tech Stack:** TypeScript, vitest (the native fixture frames double as a fake engine), Chrome.

**Spec:** design doc "`fromBuildAnimation` (phase 3)", "Live editing".

## Tasks

1. `packages/nucleation/src/live-source.ts`: `BuildEngine` interface + `fromBuildAnimation(engine, glb)`; `frame(t)` parses `frameJson(t)` (poses `[[group, pose]]` with `matrix` column-major, `scale`, `opacity`, `tint`, `emissive`; `anchors`; `camera`), clamps to `durationMs()`. Test with a fake engine that serves `beacon-frames.json` frames: matrices/anchors/camera equal the fixture exactly.
2. `buildSurface({ source })`: after parsing the GLB, `t.source = options.source?.(glb) ?? fromAnimatedGlb(glb)`. Export `fromBuildAnimation` and `BuildEngine`.
3. Docs: "Parametric beacon" block on `docs/nucleation-builds.md` — sliders `size` (base 1–3 blocks radius) and `step` (80–400 ms); model echoes `{ size, step, blocks }`; the surface's `glb` function rebuilds from `context.signals`, `watch: ["size", "step"]`, `source: (glb) => fromBuildAnimation(latest, glb)`; anchors BEACON + CORNER; readout of block count; timeline long enough for the slowest build.
4. Verify in Chrome (move a slider; build changes; leaders follow), tests/lint/typecheck, commit, push.
