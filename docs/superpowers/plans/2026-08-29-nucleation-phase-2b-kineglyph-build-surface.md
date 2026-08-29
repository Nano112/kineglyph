# Nucleation Phase 2b — Kineglyph build surface — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Play a Nucleation animated GLB inside a Kineglyph figure on a textured three.js surface, with drafting callouts whose leaders follow the anchors as blocks land — live in the docs (editable) and correct in exported frames.

**Architecture:** (1) Core gains **frame signals**: `seekTimeline(scene, time, { signals })` overrides `bind.path` / `bind.text` / `bind.opacity` / `bind.hidden` on the seeked frame, and `frameSignals(time, signals)` is threaded through the animator, the web mount, the lab, and React. (2) A new package `@kineglyph/nucleation` parses the GLB node convention itself (`parseBuildGlb`), samples TRS tracks and anchors (`fromAnimatedGlb` → `FrameSource`), projects anchors through the same camera maths the renderer uses, and mounts a three.js surface via `bindLiveSurface`; it never imports `nucleation` — a docs block hands it GLB bytes from the WASM engine. (3) A docs page shows the beacon and the crafting nook as drafting sheets on `paperDraftingTheme`.

**Tech Stack:** TypeScript, three 0.185 (dependency of the new package only, bundled by vite like MathJax in `@kineglyph/math`), vitest (node), Chrome for the surface itself.

**Spec:** `docs/superpowers/specs/2026-08-29-nucleation-integration-design.md` — "`@kineglyph/nucleation`", "Live editing", "Docs deliverable". Phase 2a delivered the GLB contract (see `~/RustroverProjects/Nucleation/docs/features/animation.md` "Animated GLB").

## Global Constraints

- Kineglyph repo, branch `main` as the user has been working (commits go straight to `main` like the rest of this session; never commit the generated `CLAUDE.md`: `git reset -q CLAUDE.md` before every commit).
- Kineglyph core/web/anime stay Nucleation-agnostic: the only names they learn are `frameSignals` and `seek` overrides. `@kineglyph/nucleation` knows the GLB convention but not the `nucleation` package.
- The engine's block space is centre-at-integer (a block at `(x, y, z)` spans `x − 0.5 … x + 0.5`); GLB meshes, tracks, and anchors all use it. Nucleation's camera: `yaw`, `pitch` in degrees, orthographic isometric = yaw 45°, pitch 35.264°, `sphere_fit`, forward = `-(cos p sin y, sin p, cos p cos y)`; the camera track's `yaw`/`pitch` add to the base and `zoom` multiplies (`src/rendering/mod.rs:278`, `camera.rs:120`).
- GLB fixture for tests: copy `scratchpad/glbcheck/beacon.glb` (63 KB, validator-clean) to `packages/nucleation/test/fixtures/beacon.glb`; the native frames it must agree with are `~/RustroverProjects/Nucleation/tests/fixtures/build-animation/beacon.json` (copy to `packages/nucleation/test/fixtures/beacon-frames.json`).
- Docs load the engine from `docs/assets/nucleation/engine/` (gitignored copy of Nucleation `dist/npm`, synced by `scripts/sync-nucleation-engine.mjs`) and fall back to `https://cdn.jsdelivr.net/npm/nucleation@0.10.15/index.mjs` once that version is published; the vanilla pack for these builds is a trimmed `docs/assets/nucleation/build-pack.zip` (committed, must stay under 200 KB).
- Rebuild `core`, `anime`, `web`, `nucleation` dist and restart `gerry dev` before checking kineglyph.test (pagina prerenders with `packages/web/dist`).

---

### Task 1: Frame signals in core seek

**Files:**
- Modify: `packages/core/src/resolved.ts` (`ResolvedNode`: add `readonly bind?: Readonly<Record<string, string>>`)
- Modify: `packages/core/src/resolve.ts` (~line 226-350, where `node.bind` is read: copy `bind` onto the resolved node)
- Modify: `packages/core/src/seek.ts:360` (`seekTimeline` signature + override pass)
- Test: `packages/core/src/seek.test.ts` (exists; append)

**Interfaces:**
- Produces:
  ```ts
  export interface SeekOptions { readonly signals?: Readonly<Record<string, VariableValue>> }
  export function seekTimeline(scene: ResolvedScene, requestedTime: number, options?: SeekOptions): ResolvedFrame
  ```
  After tracks are applied, for each node with `bind`: `bind.path` in `signals` → `path.d = String(value)`; `bind.text` → `text.lines = [{ ...lines[0], text: String(value) }]` (single line; multi-line bound text keeps its first line's metrics); `bind.opacity` → `state.opacity *= clamp(Number(value), 0, 1)`; `bind.hidden` → `hidden = truthy(value)`. Nodes without a matching key are untouched (same object identity).

- [ ] **Step 1: Failing test**

```ts
describe("frame signals", () => {
  it("overrides bound path, text, opacity and hidden at seek time", () => {
    const scene = figure("frame-signals", { title: "t", signals: { d: "M 0 0 L 10 10", label: "start", fade: 1, gone: false } }, (f) => {
      const p = f.path("M 0 0 L 10 10", { id: "leader", bind: { path: "d", opacity: "fade" } });
      const t = f.text("start", { id: "readout", bind: { text: "label", hidden: "gone" } });
      f.root(f.stack([p, t]));
    });
    const resolved = resolveScene(scene(), { width: 400 });
    const frame = seekTimeline(resolved, 0, { signals: { d: "M 1 2 L 3 4", label: "landed", fade: 0.5, gone: true } });
    const leader = frame.nodes.find((n) => n.id === "leader")!;
    const readout = frame.nodes.find((n) => n.id === "readout")!;
    expect(leader.path?.d).toBe("M 1 2 L 3 4");
    expect(leader.state.opacity).toBeCloseTo(0.5);
    expect(readout.text?.lines[0]?.text).toBe("landed");
    expect(readout.hidden).toBe(true);
    const plain = seekTimeline(resolved, 0);
    expect(plain.nodes.find((n) => n.id === "leader")?.path?.d).toBe("M 0 0 L 10 10");
  });
});
```

Use the figure builder's actual path/text helpers (`f.path` exists for path marks; check `packages/core/src/figure.ts` for the text helper name — `f.text(...)` in `drafting.text` wraps `f.label`/`f.text`).

- [ ] **Step 2:** Run `npx vitest run packages/core/src/seek.test.ts` → FAIL (`bind` not carried / option ignored).
- [ ] **Step 3:** Implement: in `resolve.ts` where the effective node is assembled (the object that spreads `text`/`path`, ~line 300-350) add `...(node.bind === undefined ? {} : { bind: node.bind })`. In `seek.ts` add `SeekOptions`, and after `updateNode` map over nodes applying the overrides in a small `applyFrameSignals(node, signals)` helper (return the same node when nothing applies). Export `SeekOptions` from `packages/core/src/index.ts`.
- [ ] **Step 4:** `npx vitest run packages/core/src/seek.test.ts packages/core/src/resolve.test.ts` → PASS; `npm run typecheck` clean.
- [ ] **Step 5:** Commit: `feat(core): frame signals override bindings at seek time`.

---

### Task 2: `frameSignals` through anime, web, lab, React

**Files:**
- Modify: `packages/anime/src/index.ts` (`KineglyphSceneAnimatorOptions` + `#apply`, ~line 293 and 560)
- Modify: `packages/web/src/index.ts` (`MountOptions.frameSignals`, pass to the animator at ~759, and to `seekTimeline` in `toSvg` ~593 and `#render` ~705; `setScene` option like `deriveSignals` ~509-523)
- Modify: `packages/web/src/lab.ts` (accept `export const frameSignals` from a live block, validate it is a function, forward on mount and `setScene`, mirroring `deriveSignals` at ~330-360 and ~619-630)
- Modify: `packages/react/src/index.tsx` (`frameSignals?: MountOptions["frameSignals"]`)
- Test: `packages/web/test/frame-signals.test.ts` (new; pattern after `packages/web/test/derive-signals.test.ts`)

**Interfaces:**
- Produces: `MountOptions.frameSignals?: (time: number, signals: Variables) => Variables` — called for every rendered frame with the scene time (ms) and the current live signals; its result is passed as `seekTimeline`'s `signals`. Lab module export `frameSignals` with the same signature.

- [ ] **Step 1:** Failing test: mount a figure with a bound path and `frameSignals: (t) => ({ d: t > 500 ? "M 9 9 L 8 8" : "M 0 0 L 1 1" })`, seek to 0 and 1000 through the controller (`controller.seek(1000)` — confirm the method name in `KineglyphController`), and assert the stage's `<path data-node-id="leader">`'s shape `d` attribute changed. Run → FAIL.
- [ ] **Step 2:** Implement the threading. In the animator, `#apply(time)` becomes `seekTimeline(this.#scene, time, { signals: this.#frameSignals?.(time, this.#scene.signals ?? {}) })`. The web mount passes `(time, signals) => options.frameSignals(time, this.#signals)` so external `setSignals` values are visible.
- [ ] **Step 3:** `npx vitest run packages/web packages/anime` → PASS; typecheck clean.
- [ ] **Step 4:** Docs: `docs/authoring-api.md` — add a paragraph "Frame signals" after "Parametric figures": bound properties can also follow time; `frameSignals(time)` is evaluated at seek, so live playback and exported frames agree; it is how a live surface reports where things are.
- [ ] **Step 5:** Commit: `feat(web): frame signals drive bindings per frame`.

---

### Task 3: `@kineglyph/nucleation` — GLB parsing and frame source (no three.js yet)

**Files:**
- Create: `packages/nucleation/package.json`, `tsconfig.json`, `tsconfig.build.json`, `vite.config.ts`, `README.md` (copy `packages/math`'s shape; name `@kineglyph/nucleation`, description "Nucleation build animations on a Kineglyph live surface", deps `@kineglyph/core`, `@kineglyph/web`, `three ^0.185.1`; devDeps `vite`, `@types/three`)
- Create: `packages/nucleation/src/glb.ts`, `src/frame-source.ts`, `src/camera.ts`, `src/index.ts`
- Create: `packages/nucleation/test/glb.test.ts`, `test/frame-source.test.ts`, `test/camera.test.ts`, `test/fixtures/beacon.glb`, `test/fixtures/beacon-frames.json`
- Modify: root `package.json` workspaces/bootstrap order (after `web`), `packages/web/package.json` nothing (web does not depend on it; the docs import it lazily via `loadBuildSurface` in Task 5).

**Interfaces:**
- `glb.ts`:
  ```ts
  export interface GlbTrack<N extends 3 | 4> { readonly times: Float32Array; readonly values: Float32Array; readonly interpolation: "LINEAR" | "STEP" }
  export interface BuildGlbNode { readonly index: number; readonly name: string; readonly parent?: number; readonly children: readonly number[]; readonly translation: [number, number, number]; readonly rotation: [number, number, number, number]; readonly scale: [number, number, number]; readonly mesh?: number; readonly extras?: unknown; readonly tracks: { translation?: GlbTrack<3>; rotation?: GlbTrack<4>; scale?: GlbTrack<3> } }
  export interface BuildGlb { readonly json: unknown; readonly binary: Uint8Array; readonly root: number; readonly groups: readonly BuildGlbNode[]; readonly anchors: readonly BuildGlbNode[]; readonly nodes: readonly BuildGlbNode[]; readonly durationMs: number; readonly nucleation: { version: number; durationMs: number; fps: number; groups: number; camera: CameraTrack | null } }
  export function parseBuildGlb(bytes: Uint8Array | ArrayBuffer): BuildGlb
  ```
  Reads header/chunks, accessors (FLOAT scalar/vec3/vec4 only), animation channels by target node, node names, `extras.nucleation`. Throws when `nodes[0].name` does not start with `build:`.
- `frame-source.ts`:
  ```ts
  export interface Pose { readonly matrix: Float64Array /* 16, column-major */; readonly opacity: number; readonly tint: [r,g,b,a]; readonly emissive: [r,g,b,a] }
  export interface AnchorSample { readonly name: string; readonly group: number; readonly world: [number, number, number]; readonly opacity: number }
  export interface CameraPose { readonly yaw: number; readonly pitch: number; readonly zoom: number; readonly targetOffset: [number, number, number] }
  export interface Frame { readonly time: number; readonly poses: ReadonlyMap<number, Pose>; readonly anchors: readonly AnchorSample[]; readonly camera?: CameraPose }
  export interface FrameSource { readonly durationMs: number; readonly groups: number; readonly anchors: readonly { name: string; group: number }[]; readonly bounds: { min: [number,number,number]; max: [number,number,number] }; frame(timeMs: number): Frame }
  export function fromAnimatedGlb(glb: BuildGlb | Uint8Array | ArrayBuffer): FrameSource
  ```
  `frame(t)` samples each group's tracks (linear lerp / step; quaternion slerp with shortest path), composes `T·R·S` into a column-major matrix, reads `poseTrack` from extras (linear in time) for opacity/tint/emissive, transforms anchor local translations by the group matrix, samples the camera track. Bounds come from mesh POSITION accessor min/max across groups.
- `camera.ts`:
  ```ts
  export interface CameraConfig { readonly yaw: number; readonly pitch: number; readonly zoom: number; readonly projection: "orthographic" | "perspective"; readonly fovDeg: number; readonly sphereFit: boolean; readonly target?: [number,number,number] }
  export const ISOMETRIC: CameraConfig  // yaw 45, pitch 35.264, orthographic, fov 45, sphereFit true
  export function viewProjection(bounds, aspect, camera: CameraConfig): { view: Float64Array; projection: Float64Array; viewProjection: Float64Array }
  export function project(viewProjection: Float64Array, world: [number,number,number], viewport: { width: number; height: number }): { x: number; y: number; depth: number; visible: boolean }
  export function withPose(camera: CameraConfig, pose?: CameraPose): CameraConfig  // yaw+=, pitch+=, zoom*=
  ```
  A port of Nucleation's `compute_view_proj` (orthographic branch: half-extent = sphere radius / zoom; perspective: distance from sphere radius and fov). Read `~/RustroverProjects/Nucleation/src/rendering/camera.rs:100-200` for the exact maths and port both branches.

- [ ] **Step 1:** Failing tests: `parseBuildGlb(beacon.glb)` → 10 groups named `group:0…9`, one anchor `anchor:beacon` under `group:9` at `[0, 1.5, 0]`, `durationMs ≈ 2400`, `nucleation.camera.yaw.length === camera.times.length`. `fromAnimatedGlb(...).frame(450)`: the pose matrix of group 3 equals `beacon-frames.json.frames[1].poses[3][1].matrix` (flatten column-major, tolerance `2e-2` — the GLB tracks are sampled at 30 fps and linearly interpolated, so mid-frame values differ slightly from the exact native pose; tighten to `1e-4` at `t = 0` and `t = 2400` where samples are exact); `frame(2400).anchors[0].world ≈ [0, 1.5, 0]`; `frame(0).anchors[0].opacity` finite. Camera: `project` of the origin with `ISOMETRIC` on a 400×300 viewport lands at the centre; a point at `+x` moves right-and-down for yaw 45 (screen y grows downward) — assert signs.
- [ ] **Step 2:** Run `npx vitest run packages/nucleation` → FAIL (module missing).
- [ ] **Step 3:** Implement the three modules; keep `glb.ts` free of three.js (plain DataView/Float32Array).
- [ ] **Step 4:** PASS; `npm run typecheck`; `npm run lint`.
- [ ] **Step 5:** Commit: `feat(nucleation): parse animated build GLBs into a frame source`.

---

### Task 4: three.js surface, anchor projection, and frame-signal helper

**Files:**
- Create: `packages/nucleation/src/surface.ts`, `src/anchors.ts`
- Modify: `packages/nucleation/src/index.ts`
- Test: `packages/nucleation/test/anchors.test.ts` (node-only maths); the surface is verified in Chrome in Task 6.

**Interfaces:**
- `surface.ts`:
  ```ts
  export interface BuildSurfaceOptions {
    readonly glb: Uint8Array | ArrayBuffer | ((context: LiveSurfaceContext) => Uint8Array | ArrayBuffer | Promise<Uint8Array | ArrayBuffer>);
    readonly camera?: Partial<CameraConfig>;   // defaults to ISOMETRIC
    readonly interactive?: boolean;             // OrbitControls; default false
    readonly background?: string;               // CSS colour or "transparent" (default)
    readonly watch?: readonly string[];         // signals that rebuild the model (default: none)
    readonly onView?: (view: BuildView) => void;// called after every rendered frame
  }
  export interface BuildView { readonly time: number; readonly viewProjection: Float64Array; readonly viewport: { width: number; height: number }; readonly source: FrameSource }
  export function buildSurface(options: BuildSurfaceOptions): LiveSurfaceRenderer
  export interface BuildSurfaceHandle { readonly view: () => BuildView | undefined; readonly capture: () => HTMLCanvasElement | undefined }
  ```
  Implementation with `bindLiveSurface` (`includeTime: true`): `mount` creates a `WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true })` sized to the element (ResizeObserver), a `Scene`, an `AmbientLight` + `DirectionalLight` matching Nucleation's flat look; `apply` on `initial` or watched-signal change parses the GLB with `GLTFLoader.parse` (textures: `NearestFilter`, `colorSpace = SRGBColorSpace`) and builds a `Map<groupIndex, Object3D>` by node name; on every update it sets each group object's `matrix` from `source.frame(time).poses` (`matrixAutoUpdate = false`), material opacity from the pose (`transparent = true` when < 1), then the camera from `withPose(base, frame.camera)` and `viewProjection` (an `OrthographicCamera` or `PerspectiveCamera` fed the computed matrices via `projectionMatrix`/`matrixWorldInverse` so the overlay maths and the render agree), renders, and calls `onView`. With `interactive`, OrbitControls own the camera and `BuildView.viewProjection` is read back from the three camera.
- `anchors.ts`:
  ```ts
  export interface AnchorNote { readonly anchor: string; readonly x: number; readonly y: number; readonly side: "left" | "right" }  // sheet-space note head and which side the leader leaves from
  export interface AnchorSignalsOptions { readonly view: () => BuildView | undefined; readonly frame: { readonly x: number; readonly y: number; readonly width: number; readonly height: number }; readonly notes: readonly AnchorNote[] }
  export function anchorFrameSignals(options: AnchorSignalsOptions): (time: number) => Record<string, number | string>
  ```
  Maps each anchor's projected pixel position into sheet space (`frame` is the surface node's rectangle in sheet units, e.g. the plate the build sits on), returns `anchor.<name>.x`, `anchor.<name>.y`, `anchor.<name>.visible` (0/1: opacity ≥ 0.5, inside the frame, depth in front), and `leader.<name>` = `drafting.calloutLeader(note.x, note.y, note.side === "left" ? "top-right" : "top-left")(px, py)` or `""` when not visible. Before the surface has rendered (`view()` undefined) every leader is `""` and visible `0`.

- [ ] **Step 1:** Failing test for `anchorFrameSignals` with a fake `view()` returning a known `viewProjection` (identity-ish orthographic from `camera.ts`) and one anchor: leader string starts with `M`, visible 1, and flips to `""`/0 when the anchor is behind the camera or the pose opacity is 0.2.
- [ ] **Step 2:** Implement both files; `index.ts` exports everything plus types.
- [ ] **Step 3:** `npx vitest run packages/nucleation` PASS; `cd packages/nucleation && npm run build` produces `dist/index.js` (three bundled) — check size stays under 1.2 MB minified.
- [ ] **Step 4:** Commit: `feat(nucleation): three.js build surface and anchor frame signals`.

---

### Task 5: Lazy loader in web, engine + pack assets, docs page

**Files:**
- Create: `packages/web/src/nucleation.ts` (`loadBuildSurface(): Promise<typeof import("@kineglyph/nucleation")>` lazy import, like `math.ts`); export from `packages/web/src/index.ts`; add `@kineglyph/nucleation` to web's dependencies (lazy chunk only)
- Create: `scripts/sync-nucleation-engine.mjs` — copies `index.mjs`, `*.mjs`, `*.d.ts`, `nucleation.wasm`, `diplomat.config.mjs` from `$NUCLEATION_DIST` (default `~/RustroverProjects/Nucleation/dist/npm`) into `docs/assets/nucleation/engine/`; `.gitignore` that folder
- Create: `scripts/nucleation-pack.py` — builds `docs/assets/nucleation/build-pack.zip` from a full vanilla pack (`$NUCLEATION_PACK`, default `~/RustroverProjects/Nucleation/render_work/pack.zip`) for the block list `gold_block, beacon, spruce_planks, oak_planks, stripped_spruce_log, light_blue_stained_glass, crafting_table, chest, wall_torch` — copies `assets/minecraft/blockstates/<b>.json`, every model reachable through `model`/`parent` references, every texture they name (including `block/particle` and the chest entity texture if the pack renders chests from `entity/chest/normal.png`), plus `pack.mcmeta`; prints the size; fails over 200 KB
- Create: `docs/nucleation-builds.md`; modify `docs/article.yaml` (nav "Build animations" after "Drafting styles"), `README.md` (link)
- Modify: `packages/core/src/drafting-docs.test.ts` PAGES stays the two drafting pages (the new page needs the browser); add `docs/nucleation-builds.md` to a new `packages/nucleation/test/docs.test.ts` that only checks the page's blocks parse as modules (`new Function`-free syntax check via `acorn`? — use `vite`'s `parse` from `@babel`… simpler: `node --check` on the extracted block bodies with the same shim as the drafting test, importing `kineglyph` mocked to `{}` — assert no syntax errors).

**Docs page content** (two live blocks + a model-viewer block):

Block 1 `nucleation-beacon`: imports `drafting as D, figure, loadBuildSurface, paperDraftingTheme, parametric`; loads the engine (`import(engineUrl)` with the local-first fallback described in Global Constraints) and the pack (`fetch(asset("build-pack.zip"))`); builds the beacon `BuildAnimation` exactly as the Nucleation fixture (step 140 ms, spin-in beacon, `addAnchor("beacon", 0, 1.5, 0)`, plus `addAnchorToGroup(0, "first-gold", -1, 0.5, -1)`), exports `toAnimatedGlbB64(pack, 30)`; `const build = buildSurface({ glb, camera: { yaw: 28, pitch: 24, zoom: 0.8 }, interactive: true, onView })`; `export const liveSurfaces = { "build-view": build }`; `export const frameSignals = anchorFrameSignals({ view, frame: PLATE, notes: NOTES })`; the figure: `D.sheet` on `paperDraftingTheme` with a raised plate `PLATE = { x: 360, y: 330, width: 1500, height: 1250 }` holding `f.image(asset("field-observatory.png"), "Beacon build", { id: "build-view", live: true, width: …, height: … })` positioned by `D.at`; two callouts (`BEACON`, `FIRST BLOCK`) with `bind: { path: "leader.beacon" }` leader layers and `bind: { opacity: "anchor.beacon.visible" }`; a step table plate (group id, block, effect) and a readout `T("placed")` bound to `frameSignals`' `placed` count (number of groups with opacity ≥ 0.99 at `t`); title block "Sheet B-01 · Beacon". Signals declared in figure metadata: every `leader.*`, `anchor.*.visible`, `placed`.

Block 2 `nucleation-nook`: the crafting nook (fixture build) with anchors `crafting-table [1, 1.5, 1]`, `window [2, 2, 0]` (on the wall group), `torches [4, 2, 1]`; same sheet structure; `interactive: true`.

Block 3 `nucleation-glb-anywhere`: `modelViewerSurface({ source: () => glbBytes })` with the beacon GLB from block 1's builder (rebuilt in this block) — the "interactive anywhere" point, plus a "Download GLB" `f.button`/control if the figure API has one, else a note that the export menu offers it (Phase 2c).

Prose: what the page shows, the anchor contract, "edit the build script — the sheet re-exports the GLB in-page", and links to Nucleation's animation docs.

- [ ] **Step 1:** Write the scripts; run `python3 scripts/nucleation-pack.py` (prints size < 200 KB) and `node scripts/sync-nucleation-engine.mjs`; verify `ls docs/assets/nucleation/engine/nucleation.wasm`.
- [ ] **Step 2:** Write `loadBuildSurface`, the docs page, nav, README line.
- [ ] **Step 3:** `npx vitest run packages/nucleation packages/web` PASS; `npm run lint`; `npm run typecheck`; rebuild `core anime web nucleation` dist; restart `gerry dev` (kill the previous `pagina … dev docs` process first — see the session's earlier orphan).
- [ ] **Step 4:** Commit: `feat(docs): Nucleation build animations on drafting sheets`.

---

### Task 6: Browser verification and fixes

- [ ] **Step 1:** In Chrome open `https://kineglyph.test/nucleation-builds/`; wait; screenshot each sheet at rest and mid-animation (press play / scrub with the lab controls). Check: textured blocks visible on the paper plate, leaders end on the beacon top / first block as they land, callouts fade in with `visible`, the readout counts up, orbiting with the mouse keeps leaders attached.
- [ ] **Step 2:** Edit the block in the lab (change `setStepMs(140)` to `400`) and confirm the sheet re-exports and the timing changes without a page reload.
- [ ] **Step 3:** Read the console (`pattern: "error|nucleation|three"`) — no errors. Fix anything found; re-run the suites; commit `fix(nucleation): …` as needed.
- [ ] **Step 4:** Push `main`; update the memory file (`drafting-sheets.md`): Phase 2b state, engine sync script, pack script, frame signals gotcha (animator patches `d`/text, not layout).

## Self-review notes

- Spec coverage: FrameSource contract (Task 3), `fromAnimatedGlb` (3), `buildSurface` + `projectAnchors` (4, `camera.project`), `anchorSignals` → `anchorFrameSignals` (4), live editing (5: in-page GLB re-export on lab re-run), docs deliverable (5). `fromBuildAnimation` is Phase 3; browser-capture export is Phase 2c; CLI/native export Phase 4.
- Design deviation from the spec, recorded here: anchor positions reach callouts through **frame signals** (seek-time overrides) rather than `deriveSignals`/`setSignals`, because `setSignals` re-resolves and rebuilds the animator (unfit per frame) while seek-time overrides also make exported frames correct.
- The frame source samples the GLB tracks itself instead of using three's `AnimationMixer`, so the overlay maths, the render, and the tests share one implementation and the GLB parser is testable in node.
