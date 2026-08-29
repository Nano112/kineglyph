# Nucleation build animations in Kineglyph — design

_2026-08-29 · status: approved direction, implementation in phases_

## Goal

Show Minecraft build animations authored with Nucleation's `BuildAnimation` inside Kineglyph
figures — on the drafting sheets in particular — with Kineglyph's annotations (callouts, leaders,
dimensions) following the blocks as they land. Both libraries stay independent: Nucleation never
imports Kineglyph; Kineglyph's core never imports Nucleation. One thin glue package,
`@kineglyph/nucleation`, is the only place that knows both.

Decisions taken with the author:

- The build is rendered as **textured WebGL** (three.js) on a Kineglyph live surface, with the
  drafting overlay drawn by Kineglyph on top from the same camera.
- **Animated GLB is the first interchange** (interactive 3D anywhere, `model-viewer`, Blender),
  and the live WASM engine is the second frame source (parametric sheets, no re-export).
- **Live editing** of an animation in the docs (edit the build script → the sheet updates) is a
  first-class requirement from the first shipped phase.
- Export: browser capture first (WebGL canvas + SVG overlay → PNG/GIF); native composite later.

## Facts the design rests on

Nucleation (`~/RustroverProjects/Nucleation`, 0.10.14):

- The timeline engine is in the WASM build: `BuildAnimation` (groups, effects, stagger, camera
  track, region operations), `frameJson(t)` is pure and deterministic and returns
  `{ time_ms, poses: [[groupId, Pose]], camera?: { yaw, pitch, zoom, target_offset }, gizmos }`.
  `Pose = { translate, rotate_deg, scale, pivot, opacity, tint, emissive }`; the model matrix is
  `translate · toPivot · rotate · scale · fromPivot`.
- Meshing works in WASM (`MeshJob`, `MeshResult`, `MultiMeshResult`). GPU rendering is native
  only (`rendering` feature, wgpu).
- `MeshResult.animatedGlbB64` exists but replays the *tick* timeline (set_block / piston events)
  through `schematic_mesher::export_animated_glb(atlas, &[AnimatedPiece])`, where `AnimatedPiece`
  carries a STEP scale track and a LINEAR translation track only. No rotation, no pose colour.
- `AnimationEffect` tweens: `rotateX/Y/Z`, `translateX/Y/Z`, `scale`, `opacity`, `tintR/G/B/A`,
  `emissiveR/G/B`. Camera: yaw, pitch, zoom, isometric = ortho at yaw 45°, pitch 35.264°;
  `compute_view_proj` in `src/rendering/camera.rs` is the reference for the overlay projection.
- Frames already carry `gizmos: GizmoLine[]` (`kind, start, end, color`) for operations when
  `setOperationGizmos` is on — the seed of the annotation hook.
- Docs examples are verified against the WASM package by `tools/verify-*-docs.sh`, which run
  `tools/package-npm.sh dist/npm` then Node scripts importing `dist/npm/index.mjs`.

Kineglyph:

- `bindLiveSurface` / `adaptLiveSurface` give an application-owned renderer the scene `time`,
  signals, and resize without remounting expensive runtimes; `modelViewerSurface` already mounts
  a GLB on an image node.
- The docs lab re-evaluates a live block on edit and calls `setScene` with the new
  `liveSurfaces`; `encodeRgbaGif` turns canvas frames into a GIF in the browser.
- The drafting toolkit (`drafting.callout`, `calloutLeader`, `bound`, `plate`, `sheet`) draws
  from signals; `deriveSignals` recomputes signals from variables per step.

## Architecture

```
Nucleation (Rust → WASM, agnostic)                 Kineglyph (agnostic)
────────────────────────────────                   ─────────────────────────────
BuildAnimation                                     drafting.* · bindLiveSurface
  ├─ frameJson(t)  → poses, camera, gizmos,        · deriveSignals · encodeRgbaGif
  │                  anchors (new)
  └─ toAnimatedGlb(pack) (new)
        nodes per group · TRS tracks                        ▲
        anchor nodes · extras.nucleation pose track         │ consumes only
                        │                                   │ FrameSource + anchors
                        ▼                                   │
              @kineglyph/nucleation (glue, the only package importing both)
                ├─ FrameSource contract  (t) → { poses, camera, anchors }
                ├─ fromAnimatedGlb(bytes)      (phase 2)
                ├─ fromBuildAnimation(anim)    (phase 3)
                ├─ buildSurface(...)           three.js live surface
                ├─ projectAnchors(...)         world → figure/sheet space
                └─ anchorSignals(...)          → drafting callouts follow blocks
```

### Nucleation additions (all in the Nucleation repo, no Kineglyph references)

1. **Anchors.** `BuildAnimation.addAnchor(name, x, y, z)` attaches a named world-space point to
   the group currently being recorded (or the last group when not inside `beginGroup`);
   `addAnchorToGroup(group, name, x, y, z)` for explicit placement. Every frame transforms
   anchors by their group's pose and reports `anchors: [{ name, group, world: [x, y, z],
   opacity }]`. `anchorsJson()` lists the declarations. Anchors are plain data; a renderer may
   draw hotspots, a docs tool may draw leaders — Nucleation does not care.
2. **Animated GLB from a build animation.** `BuildAnimation.toAnimatedGlbB64(pack, fps = 30)`:
   - one node per animation group, mesh from the group's schematic snapshot (the same snapshots
     the native renderer uses), named `group:<id>`;
   - TRS tracks sampled at `fps` from the timeline: translation LINEAR, rotation LINEAR
     (quaternion, from `rotate_deg` about the pose pivot — the pivot is folded into the
     translation track, exactly like `Pose::to_matrix`), scale LINEAR, with STEP keys where the
     effect is instantaneous. Constant runs are deduplicated so a 900-frame build does not carry
     900 identical keys;
   - anchor nodes: an empty child node `anchor:<name>` under its group node, positioned at the
     anchor's group-local coordinates — any glTF viewer can follow it;
   - `extras.nucleation` on each group node: `{ group, poseTrack: { times, opacity, tint,
     emissive } }` — the colour channels core glTF cannot animate. Viewers that ignore extras
     still play a valid TRS animation; viewers that read them get full fidelity;
   - a camera node with the camera track sampled the same way (yaw/pitch/zoom converted to a
     TRS orbit around the build centre), `extras.nucleation.camera = { yaw, pitch, zoom, ... }`;
   - one glTF animation named after the build, duration `durationMs()`.
   Implementation: extend `schematic_mesher::export_animated_glb` so `AnimatedPiece` grows
   optional rotation and LINEAR scale tracks plus `extras` and child anchor nodes (the mesher is
   the author's own crate; Nucleation bumps the pinned rev). The tick-timeline path keeps working.
3. **WASM parity suite.** `tests/node_build_animation_test.mjs` run by a new
   `tools/verify-build-animation.sh` (same shape as `verify-animation-docs.sh`): builds
   `dist/npm`, then the beacon and crafting-nook builds from `examples/readme/basics` and the
   `engine.mjs` example, asserting group counts, `durationMs`, sampled poses at fixed times
   (values pinned from the native engine), determinism (same `t` twice, out-of-order sampling),
   gizmos, anchors, and that the GLB parses (magic, JSON chunk lists the expected nodes,
   animations, and extras). Python parity for the same numbers via the existing
   `verify-basics-docs.sh` path.
4. **Docs.** `docs/features/animation.md` gains "Anchors" and "Animated GLB" sections documenting
   the node/extras convention as a public contract.

### `@kineglyph/nucleation` (new package in the Kineglyph monorepo)

Dependencies: `@kineglyph/core`, `@kineglyph/web`, `three` (dependency), `nucleation`
(peer dependency, only imported by `fromBuildAnimation`).

- `FrameSource` — `{ durationMs, groups, anchors: AnchorDeclaration[], frame(t): Frame,
  bounds }` where `Frame = { poses: Map<groupId, Pose>, camera?: CameraPose,
  anchors: AnchorSample[] }`. The contract is pure and time-indexed, mirroring `frameJson`.
- `fromAnimatedGlb(bytes | url)` — parses the GLB with three's `GLTFLoader`, reads the
  `group:`/`anchor:` node convention and `extras.nucleation`, and exposes a `FrameSource` whose
  `frame(t)` samples the `AnimationMixer` at `t` (no real-time playback; the surface seeks).
- `fromBuildAnimation(animation, { pack })` (phase 3) — meshes each group in WASM once,
  samples `frameJson(t)` per Kineglyph frame, no GLB round-trip.
- `buildSurface({ source, interactive, background, camera })` → `LiveSurfaceRenderer`: a
  three.js WebGL renderer mounted through `bindLiveSurface`; Kineglyph time drives the mixer
  or the pose application; the camera follows the source's camera track unless the viewer has
  grabbed it (`OrbitControls`, `interactive: true`), in which case the overlay projection uses
  the live camera — so callouts stay attached while the user orbits.
- `projectAnchors(source, t, camera, viewport)` — world → surface pixel coordinates, using the
  same maths as the renderer (and, for the scripted camera, matching Nucleation's
  `compute_view_proj`).
- `anchorSignals({ source, surface, sheetBox })` — a `deriveSignals`-compatible function that
  maps projected anchors into sheet coordinates and returns `{ "anchor.<name>.x", ".y",
  ".visible", leader path strings }` so `drafting.callout` leaders and `bind.path` layers follow
  blocks; anchors of not-yet-placed groups have `visible: 0`, and the callout fades with it.
- Export: `captureSurface(surface, t)` reads the WebGL canvas (`preserveDrawingBuffer`), and
  `exportBuildGif(figure, { fps })` composites canvas + rendered SVG overlay into RGBA frames for
  `encodeRgbaGif`. The lab export menu offers "PNG (composite)" and "GIF (composite)" for
  figures with a build surface; "Download GLB" hands out the animated GLB.

### Live editing

A docs live block is the authoring surface. Its module builds the `BuildAnimation` with the
WASM engine, exports the animated GLB in-page (`toAnimatedGlbB64`; meshing small builds in WASM
is well under a second), and hands `fromAnimatedGlb` to `buildSurface`. Editing the script
re-runs the module; `bindLiveSurface`'s `watch` keys on the GLB bytes, so a changed build swaps
the model without tearing down the renderer, while timeline-only frames never re-mesh. Phase 3
replaces the GLB round-trip with `fromBuildAnimation` for parametric sheets (a slider changing
the beacon height must not re-export a GLB per tick).

### Docs deliverable

`docs/nucleation-builds.md` ("Build animations"): the beacon and the crafting nook as drafting
sheets — the build surface inside a raised plate on `paperDraftingTheme`, callouts on anchors
(BEACON, CRAFTING TABLE, WINDOW…) whose leaders track the blocks, floor dimensions, a step table
plate listing groups and their entrance effects, a timeline scrubber (Kineglyph's own controls),
"Download .schem / GLB / GIF". A third block shows the same GLB in `model-viewer` to make the
"interactive anywhere" point.

## Phases

1. **Nucleation JS/WASM parity + anchors** — parity suite, anchors in engine/bridge/bindings
   (JS + Python), docs. Fix whatever the suite finds.
2. **Animated GLB + Kineglyph GLB surface** — mesher `AnimatedPiece` extension and rev bump,
   `toAnimatedGlbB64`, GLB tests; `@kineglyph/nucleation` with `fromAnimatedGlb`,
   `buildSurface`, `projectAnchors`, `anchorSignals`, browser-capture export; the docs page with
   beacon and nook, live-editable. Nucleation version bump + npm publish so the docs load a
   real package.
3. **Live engine source** — `fromBuildAnimation`, parametric beacon/nook sheets (height, size,
   effect) without GLB round-trips.
4. **Native composite export** — Nucleation `render_frames` + Kineglyph resvg overlay for the
   wallpaper/CLI path (`render-drafting-sheets.mjs` learns build sheets).

## Testing

- Nucleation: Rust unit tests for anchors and GLB assembly; the Node parity suite; docs
  verification scripts stay green.
- Kineglyph: `fromAnimatedGlb` against a fixture GLB committed under `packages/nucleation/test`
  (generated by phase 2, small); `projectAnchors` against known camera cases (isometric cube
  corners); `anchorSignals` produces finite values and `visible` flips when a group lands;
  docs regression test extended to the new page (no diagnostics, no overlaps, control sweeps).
  Browser verification on kineglyph.test for the surface itself (WebGL is not under vitest).

## Non-goals (now)

Block-state animation (redstone), fluids, entities; textured export from the CLI (phase 4 is a
follow-up); replacing `model-viewer` for the static workbench block.
