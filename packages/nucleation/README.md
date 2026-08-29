# @kineglyph/nucleation

Nucleation build animations inside Kineglyph figures.

[Nucleation](https://github.com/Schem-at/Nucleation) records Minecraft builds as a deterministic
timeline and exports them as an **animated GLB**: one textured node per construction group,
translation / rotation / scale keyframes, named anchor nodes, and `extras.nucleation` for what
glTF cannot animate (opacity, tint, emissive, and the camera track). This package reads that
convention and turns it into Kineglyph vocabulary:

- `parseBuildGlb(bytes)` — the node/track/extras reader (no three.js, runs in Node).
- `fromAnimatedGlb(bytes)` — a `FrameSource`: `frame(t)` samples every group's pose, every
  anchor's world position, and the camera pose, the same shape Nucleation's `frameJson(t)` reports.
- `cameraMatrices` / `project` — Nucleation's camera model (orbit, orthographic isometric or
  perspective, sphere-fit framing) so overlays and renders agree with the native renderer.
- `buildSurface(...)` — a three.js live surface for `f.image(..., { live: true })` that plays the
  frame source on Kineglyph's clock.
- `anchorFrameSignals(...)` — projected anchors as [frame signals](../../docs/authoring-api.md),
  so `drafting.callout` leaders land with the blocks they point at.

The package never imports `nucleation` itself: hand it GLB bytes, from the WASM engine in a page
or from a file.

```ts
import { fromAnimatedGlb } from "@kineglyph/nucleation";

const source = fromAnimatedGlb(await (await fetch("beacon.glb")).arrayBuffer());
const frame = source.frame(450);
frame.anchors[0]; // { name: "beacon", group: 9, world: [0, 1.5, 0], opacity: 1 }
```

See the Kineglyph docs page "Build animations" for the drafting-sheet examples.
