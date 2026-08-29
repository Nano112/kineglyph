# Build animations

_Nucleation builds on drafting paper_

[Nucleation](https://github.com/Schem-at/Nucleation) records a Minecraft build as a deterministic
timeline — groups of blocks with entrance effects, a camera track — and exports it as an
**animated GLB**: one textured node per group, translation / rotation / scale keyframes, and
named **anchors** as child nodes. Kineglyph plays that GLB on a three.js live surface inside a
drafting sheet, and its callouts follow the anchors: every frame, `@kineglyph/nucleation`
projects the anchors through the camera and hands the leader paths to the figure as
[frame signals](./authoring-api.md#frame-signals), so a label lands with the block it names — in
playback and in exported frames alike.

Neither side knows the other. Nucleation writes glTF plus `extras.nucleation`; Kineglyph reads
that convention through a small package and never imports the engine. The pages below load the
WASM engine in the browser, build the animation from a script you can edit, and export the GLB
in-page: change the build, and the sheet follows.

## Beacon

The Nucleation "basics" beacon: nine gold blocks in loop order, then a spinning beacon. Two
anchors are recorded — the top of the beacon, and the first gold block placed — and the sheet's
leaders track them as the blocks drop in. Drag the build to orbit it; the leaders stay attached.
The Export menu's PNG and GIF include the textured build: the surface renders each export frame
and takes the place of its static fallback image in the sheet.

```kineglyph live id=nucleation-beacon view=preview height=640
import { drafting as D, figure, loadBuildSurface, paperDraftingTheme } from "kineglyph";

export const theme = paperDraftingTheme;
const asset = (name) => new URL(`../assets/nucleation/${name}`, location.href).href;
const build = await loadBuildSurface();

// The engine: a local sync of the Nucleation npm package when present, the published one otherwise.
async function loadEngine() {
  try {
    return await import(asset("engine/index.mjs"));
  } catch {
    return await import("https://cdn.jsdelivr.net/npm/nucleation@0.10.15/index.mjs");
  }
}
const nucleation = await loadEngine();
const { AnimationEffect, BuildAnimation, ResourcePack } = nucleation;
const packBytes = new Uint8Array(await (await fetch(asset("build-pack.zip"))).arrayBuffer());
const pack = ResourcePack.fromBytes(Array.from(packBytes));

// The build script — edit it and the sheet re-exports the GLB.
const animation = BuildAnimation.create("beacon");
animation.setStepMs(140);
for (let x = -1; x <= 1; x += 1) {
  for (let z = -1; z <= 1; z += 1) animation.setBlock(x, 0, z, "minecraft:gold_block");
}
animation.withEffect(AnimationEffect.spinIn(680, 1)).setBlock(0, 1, 0, "minecraft:beacon");
animation.addAnchor("beacon", 0, 1.5, 0);
animation.addAnchorToGroup(0, "first-gold", -1, 0.5, -1);
const orbit = AnimationEffect.create(2_400);
orbit.addTween("rotateY", -4, 4, "inOutSine");
animation.animateCamera(orbit, 0);
const glb = Uint8Array.from(atob(animation.toAnimatedGlbB64(pack, 30)), (c) => c.charCodeAt(0));

// Sheet layout: a raised plate holds the build view; notes sit in the right column.
const PLATE = { x: 330, y: 330, width: 1440, height: 1240 };
const VIEW = { x: PLATE.x + 36, y: PLATE.y + 36, width: PLATE.width - 72, height: PLATE.height - 72 };
const NOTES = [
  { anchor: "beacon", x: 2000, y: 420, side: "top-left", tone: "accent" },
  { anchor: "first-gold", x: 2000, y: 1180, side: "top-left", tone: "info" },
];
const surface = build.buildSurface({
  glb,
  camera: { yaw: 28, pitch: 24, zoom: 0.8 },
  interactive: true,
  // The in-view part of each leader is drawn in the scene, depth-tested against the blocks.
  leaders: { frame: VIEW, notes: NOTES },
});
export const liveSurfaces = { "build-view": surface };
const anchors = build.anchorFrameSignals({ view: surface.view, frame: VIEW, notes: NOTES, embedded: true });
export const frameSignals = (time) => {
  const s = anchors(time);
  return { ...s, placedLabel: `${s.placed} / ${s.groups} groups placed` };
};
const signals = { ...build.anchorSignalDefaults(NOTES), placedLabel: "0 / 10 groups placed" };

export default figure("nucleation-beacon", {
  title: "Beacon build",
  description: "A Nucleation build animation on drafting paper; the callouts follow the blocks.",
  background: "canvas",
  padding: 0,
  hold: 900,
  signals,
}, (f) => {
  const { layer: L } = D.bound(f, signals);
  const plate = D.plate(f, PLATE.x, PLATE.y, PLATE.width, PLATE.height, { id: "build-plate", seed: 9 });
  const view = f.image(asset("field-observatory.png"), "Beacon build, textured", {
    id: "build-view",
    live: true,
    fit: "cover",
    position: D.at(VIEW.x, VIEW.y),
    width: `${(VIEW.width / 2880) * 100}%`,
    height: `${(VIEW.height / 1800) * 100}%`,
  });
  const leaders = NOTES.map((n) =>
    L(`leader.${n.anchor}`, { fill: "none", stroke: n.tone, strokeWidth: 0.8, opacity: 0.75 }),
  );
  const notes = [
    D.callout(f, 2000, 420, ["BEACON", "spin-in · 680 ms", "anchor (0, 1.5, 0)"], { id: "beacon-note", tone: "accent" }).node,
    D.callout(f, 2000, 1180, ["FIRST GOLD BLOCK", "group 0 · drop & pop", "anchor (−1, 0.5, −1)"], { id: "first-note", tone: "info" }).node,
  ];
  const rows = [["00–08", "gold_block", "drop & pop"], ["09", "beacon", "spin-in 680"], ["cam", "yaw −4° → 4°", "2.4 s"]];
  const table = [
    ...D.plate(f, 2000, 660, 790, 76 + rows.length * 54, { id: "steps", seed: 9 }),
    D.layer(f, D.line(2000, 716, 2790, 716), { id: "steps-rule", strokeWidth: 0.7, opacity: 0.3 }),
    D.text(f, "STEPS", 2024, 688, "left", { style: "label", tone: "textMuted" }),
    ...rows.flatMap(([g, block, effect], i) => [
      D.text(f, g, 2024, 750 + i * 54, "left", { style: "code", tone: "textMuted" }),
      D.text(f, block, 2200, 750 + i * 54, "left", { style: "code", tone: "text" }),
      D.text(f, effect, 2766, 750 + i * 54, "right", { style: "code", tone: "textMuted" }),
    ]),
  ];
  const readout = D.text(f, signals.placedLabel, 2000, 1560, "top-left", { id: "placed", style: "code", tone: "success", bind: { text: "placedLabel" } });

  f.root(D.sheet(f, {
    id: "sheet",
    title: "Beacon",
    subtitle: "Nucleation build animation  /  10 groups  ·  2 anchors",
    ident: "Sheet B-01",
    seed: 9,
    titleBlock: { title: "B-01 — Beacon", rows: [["Engine", "Nucleation WASM"], ["Export", "animated GLB · 30 fps"], ["Drawn", "Kineglyph"]] },
    layers: [...plate, view, ...leaders, ...notes, ...table, readout],
  }));

  // The build plays on the sheet's clock; keep the timeline at least as long as the build.
  f.sequence([
    f.reveal([...plate, view], { duration: 320 }),
    f.reveal([...notes, ...table, readout], { duration: 2_600, stagger: 120 }),
  ], { gap: 0 });
});
```

## Crafting nook

The "basics" crafting nook: a five-by-five floor as one group, two walls with windows as one
group, then the crafting table, the chest, and the torches. Three anchors: the table's top, the
front window, and a torch.

```kineglyph live id=nucleation-nook view=preview height=640
import { drafting as D, figure, loadBuildSurface, paperDraftingTheme } from "kineglyph";

export const theme = paperDraftingTheme;
const asset = (name) => new URL(`../assets/nucleation/${name}`, location.href).href;
const build = await loadBuildSurface();

async function loadEngine() {
  try {
    return await import(asset("engine/index.mjs"));
  } catch {
    return await import("https://cdn.jsdelivr.net/npm/nucleation@0.10.15/index.mjs");
  }
}
const { AnimationEffect, BuildAnimation, ResourcePack } = await loadEngine();
const packBytes = new Uint8Array(await (await fetch(asset("build-pack.zip"))).arrayBuffer());
const pack = ResourcePack.fromBytes(Array.from(packBytes));

const animation = BuildAnimation.create("crafting_nook");
animation.setStepMs(520);
animation.beginGroup();
for (let x = 0; x < 5; x += 1) {
  for (let z = 0; z < 5; z += 1) animation.setBlock(x, 0, z, "minecraft:spruce_planks");
}
animation.endGroup();
animation.beginGroup();
for (const y of [1, 2, 3]) {
  for (let x = 0; x < 5; x += 1) {
    const block = x === 2 && y === 2 ? "minecraft:light_blue_stained_glass"
      : x === 0 || x === 4 ? "minecraft:stripped_spruce_log[axis=y]" : "minecraft:oak_planks";
    animation.setBlock(x, y, 0, block);
  }
  for (let z = 1; z < 5; z += 1) {
    const block = z === 2 && y === 2 ? "minecraft:light_blue_stained_glass"
      : z === 4 ? "minecraft:stripped_spruce_log[axis=y]" : "minecraft:oak_planks";
    animation.setBlock(0, y, z, block);
  }
}
animation.addAnchor("window", 2, 2, 0);
animation.endGroup();
animation.withEffect(AnimationEffect.spinIn(620, 1)).setBlock(1, 1, 1, "minecraft:crafting_table");
animation.addAnchor("crafting-table", 1, 1.5, 1);
animation.setBlock(3, 1, 1, "minecraft:chest[facing=south]");
animation.beginGroup();
animation.setBlock(4, 2, 1, "minecraft:wall_torch[facing=south]");
animation.setBlock(1, 2, 4, "minecraft:wall_torch[facing=east]");
animation.addAnchor("torch", 4, 2, 1);
animation.endGroup();
const orbit = AnimationEffect.create(3_000);
orbit.addTween("rotateY", -5, 6, "inOutSine");
animation.animateCamera(orbit, 0);
const glb = Uint8Array.from(atob(animation.toAnimatedGlbB64(pack, 30)), (c) => c.charCodeAt(0));

const PLATE = { x: 330, y: 330, width: 1440, height: 1240 };
const VIEW = { x: PLATE.x + 36, y: PLATE.y + 36, width: PLATE.width - 72, height: PLATE.height - 72 };
const NOTES = [
  { anchor: "crafting-table", x: 2000, y: 420, side: "top-left", tone: "accent" },
  { anchor: "window", x: 2000, y: 700, side: "top-left", tone: "info" },
  { anchor: "torch", x: 2000, y: 980, side: "top-left", tone: "warning" },
];
const surface = build.buildSurface({
  glb,
  camera: { yaw: 35, pitch: 28, zoom: 0.92 },
  interactive: true,
  leaders: { frame: VIEW, notes: NOTES },
});
export const liveSurfaces = { "build-view": surface };
const anchors = build.anchorFrameSignals({ view: surface.view, frame: VIEW, notes: NOTES, embedded: true });
export const frameSignals = (time) => {
  const s = anchors(time);
  return { ...s, placedLabel: `${s.placed} / ${s.groups} groups placed` };
};
const signals = { ...build.anchorSignalDefaults(NOTES), placedLabel: "0 / 5 groups placed" };

export default figure("nucleation-nook", {
  title: "Crafting nook build",
  description: "Grouped construction steps with anchors on the table, a window, and a torch.",
  background: "canvas",
  padding: 0,
  hold: 900,
  signals,
}, (f) => {
  const { layer: L } = D.bound(f, signals);
  const plate = D.plate(f, PLATE.x, PLATE.y, PLATE.width, PLATE.height, { id: "build-plate", seed: 14 });
  const view = f.image(asset("field-observatory.png"), "Crafting nook build, textured", {
    id: "build-view",
    live: true,
    fit: "cover",
    position: D.at(VIEW.x, VIEW.y),
    width: `${(VIEW.width / 2880) * 100}%`,
    height: `${(VIEW.height / 1800) * 100}%`,
  });
  const leaders = NOTES.map((n) => L(`leader.${n.anchor}`, { fill: "none", stroke: n.tone, strokeWidth: 0.8, opacity: 0.75 }));
  const notes = [
    D.callout(f, 2000, 420, ["CRAFTING TABLE", "spin-in · 620 ms", "anchor (1, 1.5, 1)"], { id: "table-note", tone: "accent" }).node,
    D.callout(f, 2000, 700, ["WINDOW", "wall group · 1 step", "anchor (2, 2, 0)"], { id: "window-note", tone: "info" }).node,
    D.callout(f, 2000, 980, ["WALL TORCH", "last group", "anchor (4, 2, 1)"], { id: "torch-note", tone: "warning" }).node,
  ];
  const readout = D.text(f, signals.placedLabel, 2000, 1300, "top-left", { id: "placed", style: "code", tone: "success", bind: { text: "placedLabel" } });

  f.root(D.sheet(f, {
    id: "sheet",
    title: "Crafting nook",
    subtitle: "Nucleation build animation  /  5 groups  ·  3 anchors",
    ident: "Sheet B-02",
    seed: 14,
    titleBlock: { title: "B-02 — Nook", rows: [["Engine", "Nucleation WASM"], ["Step", "520 ms"], ["Drawn", "Kineglyph"]] },
    layers: [...plate, view, ...leaders, ...notes, readout],
  }));
  f.sequence([
    f.reveal([...plate, view], { duration: 320 }),
    f.reveal([...notes, readout], { duration: 3_000, stagger: 160 }),
  ], { gap: 0 });
});
```

## Parametric beacon

The build script is a function of two sliders. Each change re-records the animation with the
WASM engine, re-exports the GLB for the meshes, and hands the surface a **live source**: poses
come straight from the engine's `frameJson(t)` rather than the GLB's sampled tracks.

```kineglyph live id=nucleation-parametric view=preview height=640
import { drafting as D, figure, loadBuildSurface, paperDraftingTheme, parametric } from "kineglyph";

export const theme = paperDraftingTheme;
const asset = (name) => new URL(`../assets/nucleation/${name}`, location.href).href;
const build = await loadBuildSurface();

async function loadEngine() {
  try {
    return await import(asset("engine/index.mjs"));
  } catch {
    return await import("https://cdn.jsdelivr.net/npm/nucleation@0.10.15/index.mjs");
  }
}
const { AnimationEffect, BuildAnimation, ResourcePack } = await loadEngine();
const packBytes = new Uint8Array(await (await fetch(asset("build-pack.zip"))).arrayBuffer());
const pack = ResourcePack.fromBytes(Array.from(packBytes));

// The build as a function of its parameters.
function record(radius, stepMs) {
  const animation = BuildAnimation.create("beacon_parametric");
  animation.setStepMs(stepMs);
  for (let x = -radius; x <= radius; x += 1) {
    for (let z = -radius; z <= radius; z += 1) animation.setBlock(x, 0, z, "minecraft:gold_block");
  }
  animation.withEffect(AnimationEffect.spinIn(680, 1)).setBlock(0, 1, 0, "minecraft:beacon");
  animation.addAnchor("beacon", 0, 1.5, 0);
  animation.addAnchorToGroup(0, "corner", -radius, 0.5, -radius);
  const orbit = AnimationEffect.create(animation.durationMs() + 400);
  orbit.addTween("rotateY", -6, 6, "inOutSine");
  animation.animateCamera(orbit, 0);
  return animation;
}
const glbOf = (animation) =>
  Uint8Array.from(atob(animation.toAnimatedGlbB64(pack, 30)), (c) => c.charCodeAt(0));

const params = parametric(
  {
    radius: { value: 1, label: "Base radius (blocks)", min: 1, max: 2, step: 1 },
    step: { value: 140, label: "Step (ms)", min: 60, max: 240, step: 20 },
  },
  (v) => ({
    baseRadius: v.radius,
    stepMs: v.step,
    blocksLabel: `${(2 * v.radius + 1) ** 2} gold blocks · step ${v.step} ms`,
  }),
  { group: "build" },
);
export const deriveSignals = params.deriveSignals;

let latest = record(1, 140);
const PLATE = { x: 330, y: 330, width: 1440, height: 1240 };
const VIEW = { x: PLATE.x + 36, y: PLATE.y + 36, width: PLATE.width - 72, height: PLATE.height - 72 };
const NOTES = [
  { anchor: "beacon", x: 2000, y: 420, side: "top-left", tone: "accent" },
  { anchor: "corner", x: 2000, y: 1180, side: "top-left", tone: "info" },
];
const surface = build.buildSurface({
  // Rebuilt whenever a watched signal changes; the live source reads the same engine object.
  glb: (context) => {
    latest = record(Number(context.signals.baseRadius ?? 1), Number(context.signals.stepMs ?? 140));
    return glbOf(latest);
  },
  watch: ["baseRadius", "stepMs"],
  source: (glb) => build.fromBuildAnimation(latest, glb),
  camera: { yaw: 28, pitch: 24, zoom: 0.8 },
  interactive: true,
  // The in-view part of each leader is drawn in the scene, depth-tested against the blocks.
  leaders: { frame: VIEW, notes: NOTES },
});
export const liveSurfaces = { "build-view": surface };
const anchors = build.anchorFrameSignals({ view: surface.view, frame: VIEW, notes: NOTES, embedded: true });
export const frameSignals = (time) => {
  const s = anchors(time);
  return { ...s, placedLabel: `${s.placed} / ${s.groups} groups placed` };
};
const signals = {
  ...params.signals,
  ...build.anchorSignalDefaults(NOTES),
  placedLabel: "0 / 10 groups placed",
};

export default figure("nucleation-parametric", {
  title: "Parametric beacon build",
  description: "Sliders re-record the build; the live engine drives every frame.",
  background: "canvas",
  padding: 0,
  hold: 900,
  signals,
}, (f) => {
  const { layer: L, text: T } = D.bound(f, signals);
  const plate = D.plate(f, PLATE.x, PLATE.y, PLATE.width, PLATE.height, { id: "build-plate", seed: 21 });
  const view = f.image(asset("field-observatory.png"), "Parametric beacon build, textured", {
    id: "build-view",
    live: true,
    fit: "cover",
    position: D.at(VIEW.x, VIEW.y),
    width: `${(VIEW.width / 2880) * 100}%`,
    height: `${(VIEW.height / 1800) * 100}%`,
  });
  const leaders = NOTES.map((n) =>
    L(`leader.${n.anchor}`, { fill: "none", stroke: n.tone, strokeWidth: 0.8, opacity: 0.75 }),
  );
  const notes = [
    D.callout(f, 2000, 420, ["BEACON", "spin-in · 680 ms", "anchor (0, 1.5, 0)"], { id: "beacon-note", tone: "accent" }).node,
    D.callout(f, 2000, 1180, ["CORNER BLOCK", "group 0 · first placed", "anchor (−r, 0.5, −r)"], { id: "corner-note", tone: "info" }).node,
  ];
  const readouts = [
    T("blocksLabel", 2000, 760, "top-left"),
    D.text(f, signals.placedLabel, 2000, 820, "top-left", { id: "placed", style: "code", tone: "success", bind: { text: "placedLabel" } }),
  ];

  f.root(D.sheet(f, {
    id: "sheet",
    title: "Parametric beacon",
    subtitle: "Live engine source  /  sliders re-record the build",
    ident: "Sheet B-03",
    seed: 21,
    titleBlock: { title: "B-03 — Parametric", rows: [["Source", "frameJson(t)"], ["Meshes", "animated GLB"], ["Drawn", "Kineglyph"]] },
    layers: [...plate, view, ...leaders, ...notes, ...readouts],
  }));
  // Long enough for the slowest build (26 groups × 240 ms plus the spin-in).
  f.sequence([
    f.reveal([...plate, view], { duration: 320 }),
    f.reveal([...notes, ...readouts], { duration: 7_000, stagger: 120 }),
  ], { gap: 0 });
  params.install(f);
});
```

## The same GLB, anywhere

The file the sheets play is ordinary glTF. Here it is in Google's `<model-viewer>`, animation
and all — the anchors are empty child nodes, so any tool that reads glTF can find them.

```kineglyph live id=nucleation-glb-anywhere view=preview height=520
import { figure, modelViewerSurface, paperDraftingTheme } from "kineglyph";

export const theme = paperDraftingTheme;
const asset = (name) => new URL(`../assets/nucleation/${name}`, location.href).href;
if (!customElements.get("model-viewer")) {
  await import("https://ajax.googleapis.com/ajax/libs/model-viewer/4.3.1/model-viewer.min.js");
}
async function loadEngine() {
  try {
    return await import(asset("engine/index.mjs"));
  } catch {
    return await import("https://cdn.jsdelivr.net/npm/nucleation@0.10.15/index.mjs");
  }
}
const { AnimationEffect, BuildAnimation, ResourcePack } = await loadEngine();
const packBytes = new Uint8Array(await (await fetch(asset("build-pack.zip"))).arrayBuffer());
const pack = ResourcePack.fromBytes(Array.from(packBytes));
const animation = BuildAnimation.create("beacon");
animation.setStepMs(140);
for (let x = -1; x <= 1; x += 1) {
  for (let z = -1; z <= 1; z += 1) animation.setBlock(x, 0, z, "minecraft:gold_block");
}
animation.withEffect(AnimationEffect.spinIn(680, 1)).setBlock(0, 1, 0, "minecraft:beacon");
animation.addAnchor("beacon", 0, 1.5, 0);
const glb = Uint8Array.from(atob(animation.toAnimatedGlbB64(pack, 30)), (c) => c.charCodeAt(0));

export const liveSurfaces = {
  "beacon-model": modelViewerSurface({
    source: glb,
    alt: "The beacon build as an animated GLB",
    cameraControls: true,
    attributes: { autoplay: "", "shadow-intensity": "0.6", "camera-orbit": "35deg 65deg auto" },
  }),
};

export default figure("nucleation-glb-anywhere", {
  title: "Animated GLB in model-viewer",
  description: "The exported build plays in any glTF viewer.",
  background: "transparent",
  hold: 300,
}, (f) => {
  const model = f.image(asset("field-observatory.png"), "Static fallback", {
    id: "beacon-model",
    live: true,
    width: "fill",
    height: { wide: 460, compact: 400, narrow: 320 },
    label: "Animated GLB in model-viewer",
  });
  f.root(f.stack([model], { gap: 0 }));
  f.sequence([f.reveal(model, { duration: 300 })]);
});
```

## Native export

The browser exports above capture the WebGL surface. Nucleation's native renderer produces the
same frames without a browser, and the export CLI composes the sheet around them:
`examples/nucleation-native/build.py` records the beacon build in Python, writes
`out/frames/beacon-0000.png …` with `render_frames` (transparent background, the sheet's camera)
and the animated GLB; `examples/nucleation-native/sheet.mjs` is the same drafting layout with
`headlessView` projecting the GLB's anchors through that camera; then

```sh
kineglyph-export gif --scene sheet.mjs#default --theme sheet.mjs#theme \
  --frame-signals sheet.mjs#frameSignals --surface build-view=out/frames/beacon-{frame}.png \
  --fps 30 --out out/beacon-sheet.gif
```

drops each native frame into the `build-view` node and applies the anchor signals per frame.
`npm run render:build-sheet` runs both steps (`NUCLEATION_PACK` and `NUCLEATION_PYTHON` pick the
resource pack and the Python with `nucleation` installed).

## How it fits together

- **Nucleation** — `BuildAnimation` records groups, effects, and anchors; `toAnimatedGlbB64(pack, fps)`
  writes the GLB (`docs/features/animation.md` in the Nucleation repository documents the node
  convention and `extras.nucleation`).
- **`@kineglyph/nucleation`** — `fromAnimatedGlb` samples the GLB into a frame source;
  `buildSurface` renders it with three.js on Kineglyph's clock; `anchorFrameSignals` projects the
  anchors into sheet space as frame signals, through a surface's view or a `headlessView` of the
  same camera. With `leaders` on the surface and `embedded` on the signals, the part of a leader
  inside the view is drawn in the scene itself — depth-tested, so a block in front of the anchor
  covers it — and the sheet's path takes over at the view's edge. It never imports the engine.
- **Kineglyph** — `frameSignals` (a `mountKineglyph` option, a live-block export, or the React
  prop) applies those values to bound paths and text at seek time, so playback and exports agree.

The engine loaded above comes from `docs/assets/nucleation/engine/` when
`node scripts/sync-nucleation-engine.mjs` has copied a Nucleation build there, and from jsDelivr
otherwise; `python3 scripts/nucleation-pack.py` trims a vanilla resource pack down to the blocks
these builds use.
