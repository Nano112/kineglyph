# Nucleation Phase 2c — Composite export of live surfaces — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The lab's SVG / PNG / GIF exports of a figure with a live WebGL surface contain the rendered build (at the right time, with leaders in the right place) instead of the static fallback image.

**Architecture:** Generic to Kineglyph, no Nucleation knowledge. (1) A live-surface handle may implement `capture(time)` returning a `CanvasImageSource` or a data URL; `LiveSurfaceManager.snapshots(time)` collects them per node id. (2) The controller exposes `frameSvg(time, options)` (seek with frame signals + render) and `surfaceSnapshots(time)`; `composeSurfaceSnapshots(svg, snapshots)` swaps each `image[data-live]` fallback's `href` inside its node group for the snapshot. (3) The lab's export menu uses those for SVG, PNG, and every GIF frame. (4) `buildSurface` implements `capture(time)` by rendering that time into its preserved drawing buffer.

**Tech Stack:** TypeScript, jsdom tests (DOMParser/XMLSerializer), Chrome for the end-to-end check (download → view the PNG).

**Spec:** `docs/superpowers/specs/2026-08-29-nucleation-integration-design.md` — "Export" and "Live editing".

## Global Constraints

- Kineglyph `main`; never commit `CLAUDE.md`. Rebuild `web` + `nucleation` dist and restart `gerry dev` before the browser check.
- Snapshot order matters: capture surfaces at `time` **before** rendering the frame SVG, so frame signals that read the surface's last view (anchor leaders) see that time.
- Snapshots are PNG data URLs; a handle may return a data URL string directly (jsdom has no canvas), or an `HTMLCanvasElement` (converted with `toDataURL("image/png")`).

---

### Task 1: `capture` on surfaces and `snapshots` on the manager

**Files:** `packages/web/src/surfaces.ts`, `packages/web/test/surfaces.test.ts` (append)

- Add to `LiveSurfaceHandle`: `readonly capture?: (time: number) => CanvasImageSource | string | undefined | Promise<CanvasImageSource | string | undefined>;`
- Add to `FrameSurfaceAdapter` and `BoundSignalSurfaceAdapter`: `readonly capture?: (target: Target, time: number) => …same…` and forward it in `adaptLiveSurface` / `bindLiveSurface`.
- Add `LiveSurfaceManager.snapshots(time: number): Promise<ReadonlyMap<string, string>>` — for every mounted record whose handle has `capture`, await it; strings pass through; an `HTMLCanvasElement` becomes `toDataURL("image/png")`; other `CanvasImageSource`s are drawn onto a temporary canvas first; failures are reported through `onSurfaceError`-style logging (`console.warn`) and skipped.
- Test: mount a manager over a scene with one live image node and a renderer returning `{ capture: () => "data:image/png;base64,AAAA" }`; `await manager.snapshots(0)` → `Map { nodeId → that string }`; a renderer without `capture` yields an empty map.

### Task 2: `frameSvg`, `surfaceSnapshots`, and `composeSurfaceSnapshots` in web

**Files:** `packages/web/src/index.ts`, `packages/web/src/compose.ts` (new), `packages/web/test/compose.test.ts` (new)

- `composeSurfaceSnapshots(svg: string, snapshots: ReadonlyMap<string, string>, doc: Document): string` — parse with `DOMParser` (`image/svg+xml`), for each `[data-node-id="<id>"] image[data-live="true"]` set both `href` and `xlink:href` (if present) to the snapshot; return `XMLSerializer` output. Unknown ids are ignored; no snapshots → the input string unchanged.
- Controller: `frameSvg(time, options?: SvgRenderOptions): string` (seek with `#seekOptions(time)` + `renderSvg`), `surfaceSnapshots(time): Promise<ReadonlyMap<string, string>>` (delegates to the manager; empty when none). Declare both in the `KineglyphController` interface.
- Test: compose replaces the href inside the right group only; `frameSvg(1000)` on the frame-signals fixture contains `MOVED`.

### Task 3: Lab exports use them

**Files:** `packages/web/src/lab.ts`

- SVG/PNG export: `const snaps = await controller.surfaceSnapshots(controller.time)`, then `composeSurfaceSnapshots(controller.frameSvg(time, opts), snaps, doc)`; PNG rasterises that string. Confirm the controller exposes the current time (`controller.time` or the lab's own tracked time — read the existing SVG export handler around lab.ts:750-772 and reuse what it already uses).
- GIF: in `gifBlob`, take the controller instead of the bare scene; per frame `await controller.surfaceSnapshots(time)` then `controller.frameSvg(time, …)` composed. Keep the scale/palette code.
- Status text after export unchanged.

### Task 4: `buildSurface.capture(time)`

**Files:** `packages/nucleation/src/surface.ts`

- In the `bindLiveSurface` adapter add `capture(t, time) { applyPoses(t, time); return t.renderer.domElement; }` (the renderer was created with `preserveDrawingBuffer: true`). Because `applyPoses` updates `current` (the view), the anchor frame signals for the same `time` project through the captured camera.
- Docs: `docs/nucleation-builds.md` — one sentence under the beacon that the Export menu's PNG/GIF include the textured build.

### Task 5: Verify and ship

- `npx vitest run packages/web packages/nucleation`, lint, typecheck; rebuild `web` and `nucleation`; restart `gerry dev`.
- Chrome: on the beacon sheet click Export → PNG; open the newest file in `~/Downloads` with the Read tool and confirm the gold blocks and beacon are in the plate with the leaders on them. Then Export → GIF (a few seconds) and check the file exists and is > 100 KB.
- Commit `feat(web): composite export of live surfaces` and push.
