# Build a Minecraft solar system

A solar-system builder lets one example exercise nearly every useful boundary between Kineglyph
and Nucleation: a dependency graph, typed parameters, spatial sampling, per-cell state, orbital
guides, real Minecraft textures, staged construction, a downloadable schematic, and a browser-made
GIF. The entire instrument below is generated on the page; its Nucleation WASM runtime stays alive
while Kineglyph signals alter the model.

Each celestial body is a signed distance field (SDF). Nucleation samples its sphere or torus at
integer Minecraft coordinates, assigns a block from a small vanilla resource pack, and records the
accepted voxels in both a `Schematic` and `BuildAnimation`. Kineglyph supplies the explanatory
structure, controls, timeline, responsive surface, and export affordances around that domain model.

## 1. The whole build is one pipeline

_Animated explanation · responsive graph_

The recipe is short because the stages and connections carry intent. The graph changes orientation
at a narrow width; the labels, cards, and edge animation remain the same authored objects.

```kineglyph live id=minecraft-field-pipeline view=preview height=480
import { figure, instrumentTheme } from "kineglyph";

export const theme = instrumentTheme;

export default figure("minecraft-field-pipeline", {
  title: "From orbital model to Minecraft system",
  background: "transparent",
  hold: 500,
}, (f) => {
  const equation = f.tile({
    icon: "graph",
    eyebrow: "ORBIT MODEL",
    title: "Place bodies",
    body: "Resolve orbital distance, phase, and body scale.",
    tone: "info",
  });
  const volume = f.tile({
    icon: "cube",
    eyebrow: "SDF VOLUME",
    title: "Sample",
    body: "Evaluate spheres, a moon, and Saturn's torus.",
    tone: "accent",
  });
  const blocks = f.tile({
    icon: "blocks",
    eyebrow: "VOXELS",
    title: "Materialize",
    body: "Keep samples ≤ 0 and select a vanilla block texture.",
    tone: "success",
  });
  const render = f.tile({
    icon: "spark",
    eyebrow: "OUTPUTS",
    title: "Build + export",
    body: "Drive poses, save .schem, and encode a GIF.",
    tone: "warning",
  });

  const pipeline = f.pipeline([equation, volume, blocks, render], {
    direction: { wide: "horizontal", compact: "vertical", narrow: "vertical" },
    gap: 18,
    edge: { style: "flow", label: "sample" },
  });
  f.root(pipeline.root);
  f.sequence([
    f.reveal(equation, { duration: 260, offset: 8 }),
    [f.draw(pipeline.edges), f.reveal([volume, blocks, render], { stagger: 150 })],
    f.flow(pipeline.edges, { duration: 1800 }),
  ]);
});
```

## 2. Build the whole system in place

_Real Nucleation WASM · vanilla textures · live schematic and GIF generation_

The left plot is a top-down graph of the generated coordinate space. Every square is one Minecraft
cell at the selected Y slice: untouched space, a rejected SDF sample, an orbital guide, a queued
block, or an already placed block. The right plot projects the same `BuildAnimation.frameJson()`
poses into an isometric construction view.

The texture ZIP is only 22 KB because it contains the vanilla blockstates, models, and textures
used by this system. Nucleation decodes it through `ResourcePack`, and the renderer projects the
pack's actual RGBA pixels onto every visible cube. Change orbit spacing, body scale, slice, or
entrance effect; then download the current `.schem` or build GIF without leaving the page.

```kineglyph live id=minecraft-solar-system-builder view=preview height=860
import {
  bindLiveSurface,
  downloadBytes,
  encodeRgbaGif,
  figure,
  instrumentTheme,
} from "kineglyph";

export const theme = instrumentTheme;
const asset = (name) => new URL(`../assets/nucleation/${name}`, location.href).href;
const loadNucleation = () => import(
  "https://cdn.jsdelivr.net/npm/nucleation@0.10.14/index.mjs"
);

const colors = {
  canvas: "#080d12",
  empty: "#111923",
  sample: "#283541",
  orbit: "#536877",
  queued: "#b28e52",
  placed: "#5cc8bd",
  text: "#edf4f3",
  muted: "#8d9ca7",
  line: "#34424e",
};

const textureForBlock = {
  "minecraft:sea_lantern": "minecraft:block/sea_lantern",
  "minecraft:calcite": "minecraft:block/calcite",
  "minecraft:blackstone": "minecraft:block/blackstone",
  "minecraft:yellow_terracotta": "minecraft:block/yellow_terracotta",
  "minecraft:orange_terracotta": "minecraft:block/orange_terracotta",
  "minecraft:oxidized_copper": "minecraft:block/oxidized_copper",
  "minecraft:weathered_copper": "minecraft:block/weathered_copper",
  "minecraft:red_sandstone": "minecraft:block/red_sandstone",
  "minecraft:cut_red_sandstone": "minecraft:block/cut_red_sandstone",
  "minecraft:end_stone_bricks": "minecraft:block/end_stone_bricks",
  "minecraft:purpur_block": "minecraft:block/purpur_block",
  "minecraft:prismarine": "minecraft:block/prismarine",
  "minecraft:dark_prismarine": "minecraft:block/dark_prismarine",
  "minecraft:amethyst_block": "minecraft:block/amethyst_block",
};

const planetSpecs = [
  { id: "mercury", label: "Mercury", orbit: 6, phase: -0.25, radius: 1.2, blocks: ["minecraft:blackstone"] },
  { id: "venus", label: "Venus", orbit: 9, phase: 0.85, radius: 1.55, blocks: ["minecraft:yellow_terracotta", "minecraft:orange_terracotta"] },
  { id: "earth", label: "Earth", orbit: 12, phase: 2.1, radius: 1.7, blocks: ["minecraft:oxidized_copper", "minecraft:weathered_copper", "minecraft:calcite"] },
  { id: "mars", label: "Mars", orbit: 15, phase: 3.0, radius: 1.4, blocks: ["minecraft:red_sandstone", "minecraft:cut_red_sandstone"] },
  { id: "jupiter", label: "Jupiter", orbit: 20, phase: 0.3, radius: 2.8, blocks: ["minecraft:orange_terracotta", "minecraft:yellow_terracotta", "minecraft:red_sandstone"] },
  { id: "saturn", label: "Saturn", orbit: 25, phase: 1.65, radius: 2.45, blocks: ["minecraft:end_stone_bricks", "minecraft:calcite"] },
  { id: "uranus", label: "Uranus", orbit: 30, phase: 2.65, radius: 1.95, blocks: ["minecraft:prismarine"] },
  { id: "neptune", label: "Neptune", orbit: 35, phase: -0.8, radius: 1.95, blocks: ["minecraft:amethyst_block", "minecraft:dark_prismarine"] },
];

const base64Bytes = (source) => {
  const raw = atob(source);
  return Uint8Array.from(raw, (character) => character.charCodeAt(0));
};

const makeEffect = (nucleation, name) => name === "spin"
  ? nucleation.AnimationEffect.spinIn(360, 0.72)
  : name === "pop"
    ? nucleation.AnimationEffect.popIn(260)
    : nucleation.AnimationEffect.dropAndPop(340, 6);

const materialFor = (body, x, y, z) => {
  if (body.id === "sun") return (x + y + z) % 7 === 0
    ? "minecraft:calcite"
    : "minecraft:sea_lantern";
  if (body.id === "earth" && Math.abs(y - body.center[1]) > body.radius * 0.62) {
    return "minecraft:calcite";
  }
  const stripe = Math.abs(Math.floor((y - body.center[1]) * 1.7));
  return body.blocks[(stripe + Math.abs(x + z)) % body.blocks.length];
};

const rebuild = (target, signals) => {
  const orbitScale = Number(signals.orbitScale ?? 0.9);
  const bodyScale = Number(signals.bodyScale ?? 1);
  const phase = Number(signals.phase ?? 0) * Math.PI / 180;
  const effect = String(signals.effect ?? "drop");
  const { Sdf, Schematic, BuildAnimation } = target.nucleation;
  const bodies = [{
    id: "sun", label: "Sun", center: [0, 0, 0], radius: 2.65 * bodyScale,
    orbit: 0, blocks: ["minecraft:sea_lantern", "minecraft:calcite"],
  }];
  for (const spec of planetSpecs) {
    const orbit = spec.orbit * orbitScale;
    const angle = spec.phase + phase * (9 / spec.orbit);
    bodies.push({
      ...spec,
      orbit,
      radius: spec.radius * bodyScale,
      center: [Math.round(Math.cos(angle) * orbit), 0, Math.round(Math.sin(angle) * orbit)],
    });
  }
  const earth = bodies.find((body) => body.id === "earth");
  bodies.splice(4, 0, {
    id: "moon", label: "Moon", orbit: earth.orbit + 2.4 * bodyScale,
    center: [
      earth.center[0] + Math.round(Math.cos(phase * 3) * Math.max(3, 3.1 * bodyScale)),
      0,
      earth.center[2] + Math.round(Math.sin(phase * 3) * Math.max(3, 3.1 * bodyScale)),
    ],
    radius: 0.82 * bodyScale, blocks: ["minecraft:calcite"], parent: "earth",
  });

  const voxelMap = new Map();
  const bounds = [];
  const addVolume = (body, field, radius, blockBody = body) => {
    const extent = Math.ceil(radius + 1);
    const [cx, cy, cz] = body.center;
    bounds.push({ body, cx, cy, cz, extent });
    for (let y = cy - extent; y <= cy + extent; y += 1) {
      for (let x = cx - extent; x <= cx + extent; x += 1) {
        for (let z = cz - extent; z <= cz + extent; z += 1) {
          if (field.evalAt(x, y, z) > 0) continue;
          const key = `${x}:${y}:${z}`;
          if (!voxelMap.has(key)) {
            voxelMap.set(key, {
              x, y, z, body: blockBody.id,
              block: materialFor(blockBody, x, y, z),
            });
          }
        }
      }
    }
  };

  for (const body of bodies) {
    const [cx, cy, cz] = body.center;
    addVolume(body, Sdf.sphere(body.radius).translate(cx, cy, cz), body.radius);
    if (body.id === "saturn") {
      const ringBody = {
        ...body, id: "saturn-ring", radius: body.radius * 1.85,
        blocks: ["minecraft:purpur_block"],
      };
      addVolume(
        ringBody,
        Sdf.torus(body.radius * 1.75, Math.max(0.3, bodyScale * 0.34)).translate(cx, cy, cz),
        body.radius * 2.15,
        ringBody,
      );
    }
  }

  const order = new Map(bodies.map((body, index) => [body.id, index]));
  order.set("saturn-ring", order.get("saturn") + 0.5);
  const voxels = [...voxelMap.values()].sort((a, b) =>
    order.get(a.body) - order.get(b.body)
      || a.y - b.y
      || Math.atan2(a.z, a.x) - Math.atan2(b.z, b.x)
  );
  const schematic = Schematic.create("kineglyph-solar-system");
  const animation = BuildAnimation.create("kineglyph-solar-system-build");
  animation.setDefaultEffect(makeEffect(target.nucleation, effect));
  animation.setStaggerTotalMs(2_350);
  for (const voxel of voxels) {
    schematic.setBlock(voxel.x, voxel.y, voxel.z, voxel.block);
    animation.setBlock(voxel.x, voxel.y, voxel.z, voxel.block);
  }
  target.bodies = bodies;
  target.bounds = bounds;
  target.orbits = planetSpecs.map((planet) => planet.orbit * orbitScale);
  target.limit = Math.ceil(36 * orbitScale + 4 * bodyScale);
  target.voxels = voxels;
  target.index = new Map(voxels.map((voxel, index) => [`${voxel.x}:${voxel.y}:${voxel.z}`, index]));
  target.schematic = schematic;
  target.animation = animation;
  target.duration = animation.durationMs();
  target.meta.textContent = `10 bodies · ${voxels.length.toLocaleString()} blocks · vanilla textures`;
};

const textureCanvas = (document, pack, textureName) => {
  const info = pack.getTextureInfo(textureName);
  const width = info.width;
  const height = Math.min(info.height, width);
  const pixels = base64Bytes(pack.getTexturePixelsB64(textureName));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  const image = context.createImageData(width, height);
  image.data.set(pixels.subarray(0, width * height * 4));
  context.putImageData(image, 0, 0);
  return canvas;
};

const drawFace = (g, texture, points, shade) => {
  const [p0, p1, p2, p3] = points;
  g.save();
  g.beginPath();
  g.moveTo(p0.x, p0.y); g.lineTo(p1.x, p1.y);
  g.lineTo(p2.x, p2.y); g.lineTo(p3.x, p3.y); g.closePath();
  g.clip();
  g.transform(
    (p1.x - p0.x) / texture.width,
    (p1.y - p0.y) / texture.width,
    (p3.x - p0.x) / texture.height,
    (p3.y - p0.y) / texture.height,
    p0.x,
    p0.y,
  );
  g.imageSmoothingEnabled = false;
  g.drawImage(texture, 0, 0);
  g.restore();
  g.fillStyle = shade;
  g.beginPath();
  g.moveTo(p0.x, p0.y); g.lineTo(p1.x, p1.y);
  g.lineTo(p2.x, p2.y); g.lineTo(p3.x, p3.y); g.closePath(); g.fill();
};

const drawCube = (g, x, y, size, scale, texture) => {
  const width = size * scale;
  const halfHeight = width * 0.25;
  const lift = width * 0.72;
  const top = { x, y: y - lift };
  const right = { x: x + width / 2, y: y - lift + halfHeight };
  const middle = { x, y: y - lift + halfHeight * 2 };
  const left = { x: x - width / 2, y: y - lift + halfHeight };
  const rightLow = { x: x + width / 2, y };
  const bottom = { x, y: y + halfHeight * 2 };
  const leftLow = { x: x - width / 2, y };
  drawFace(g, texture, [top, right, middle, left], "rgba(255,255,255,.11)");
  drawFace(g, texture, [left, middle, bottom, leftLow], "rgba(0,0,0,.13)");
  drawFace(g, texture, [middle, right, rightLow, bottom], "rgba(0,0,0,.3)");
};

const project = (x, y, z, tile, ox, oy) => ({
  x: ox + (x - z) * tile * 0.5,
  y: oy + (x + z) * tile * 0.25 - y * tile * 0.72,
});

const drawAsset = (target, time, canvas = target.canvas) => {
  const ratio = canvas === target.canvas ? Math.min(devicePixelRatio || 1, 2) : 1;
  const cssWidth = canvas === target.canvas ? Math.max(320, target.element.clientWidth) : canvas.width;
  const cssHeight = canvas === target.canvas ? Math.max(400, target.element.clientHeight) : canvas.height;
  const width = Math.round(cssWidth * ratio);
  const height = Math.round(cssHeight * ratio);
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  const g = canvas.getContext("2d", { willReadFrequently: true });
  g.setTransform(ratio, 0, 0, ratio, 0, 0);
  g.fillStyle = colors.canvas;
  g.fillRect(0, 0, cssWidth, cssHeight);
  const narrow = cssWidth < 700;
  const contentTop = narrow ? 112 : 86;
  const gridBox = narrow
    ? { x: 18, y: contentTop, width: cssWidth - 36, height: cssHeight * 0.28 }
    : { x: 24, y: contentTop, width: cssWidth * 0.38, height: cssHeight - contentTop - 38 };
  const buildBox = narrow
    ? { x: 18, y: cssHeight * 0.52, width: cssWidth - 36, height: cssHeight * 0.43 }
    : { x: cssWidth * 0.41, y: contentTop, width: cssWidth * 0.57, height: cssHeight - contentTop - 38 };
  const sceneTime = Math.max(0, Math.min(target.duration, time));
  const frame = JSON.parse(target.animation.frameJson(sceneTime));
  const poses = new Map(frame.poses);
  const sliceY = Math.round(Number(target.signals.sliceY ?? 0));
  const dimension = target.limit * 2 + 1;

  g.font = "600 12px ui-monospace, SFMono-Regular, Menlo, monospace";
  g.fillStyle = colors.text;
  g.fillText(`CELL STATE · Y ${sliceY >= 0 ? "+" : ""}${sliceY}`, gridBox.x, contentTop - 18);
  g.fillText(
    `BUILD FRAME · ${Math.round(sceneTime)} MS`,
    buildBox.x,
    narrow ? buildBox.y - 18 : contentTop - 18,
  );
  const cellSize = Math.min(gridBox.width, gridBox.height) / dimension;
  const gridWidth = cellSize * dimension;
  const gx = gridBox.x + (gridBox.width - gridWidth) / 2;
  const gy = gridBox.y + Math.max(0, (gridBox.height - gridWidth) / 2);
  for (let row = 0; row < dimension; row += 1) {
    for (let column = 0; column < dimension; column += 1) {
      const x = column - target.limit;
      const z = row - target.limit;
      const voxelIndex = target.index.get(`${x}:${sliceY}:${z}`);
      const sampled = target.bounds.some(({ cx, cy, cz, extent }) =>
        Math.abs(x - cx) <= extent && Math.abs(sliceY - cy) <= extent && Math.abs(z - cz) <= extent
      );
      const radial = Math.hypot(x, z);
      const onOrbit = sliceY === 0 && target.orbits.some((orbit) => Math.abs(radial - orbit) < 0.52);
      let fill = sampled ? colors.sample : onOrbit ? colors.orbit : colors.empty;
      if (voxelIndex !== undefined) {
        const pose = poses.get(voxelIndex);
        fill = Number(pose?.scale?.[0] ?? 0) > 0.06 ? colors.placed : colors.queued;
      }
      g.fillStyle = fill;
      g.fillRect(
        gx + column * cellSize + 0.45,
        gy + row * cellSize + 0.45,
        Math.max(0.8, cellSize - 0.9),
        Math.max(0.8, cellSize - 0.9),
      );
    }
  }

  g.save();
  g.beginPath();
  g.rect(buildBox.x, buildBox.y, buildBox.width, buildBox.height);
  g.clip();
  const tile = Math.min(10, buildBox.width / (target.limit * 1.15), buildBox.height / (target.limit * 0.72));
  const ox = buildBox.x + buildBox.width * 0.5;
  const oy = buildBox.y + buildBox.height * 0.53;
  g.strokeStyle = "rgba(83,104,119,.42)";
  g.lineWidth = 0.8;
  for (const radius of target.orbits) {
    g.beginPath();
    for (let step = 0; step <= 72; step += 1) {
      const angle = step / 72 * Math.PI * 2;
      const point = project(Math.cos(angle) * radius, 0, Math.sin(angle) * radius, tile, ox, oy);
      if (step === 0) g.moveTo(point.x, point.y); else g.lineTo(point.x, point.y);
    }
    g.stroke();
  }
  const visible = frame.poses
    .map(([index, pose]) => ({ index, pose, voxel: target.voxels[index] }))
    .filter(({ pose, voxel }) => voxel && Number(pose.scale?.[0] ?? 0) > 0.02)
    .sort((a, b) => {
      const ap = a.pose.pivot; const bp = b.pose.pivot;
      return ap[0] + ap[2] - bp[0] - bp[2] || ap[1] - bp[1];
    });
  for (const { pose, voxel } of visible) {
    const point = project(
      pose.pivot[0],
      pose.pivot[1] + pose.translate[1],
      pose.pivot[2],
      tile,
      ox,
      oy,
    );
    drawCube(
      g,
      point.x,
      point.y,
      tile,
      Math.min(1.15, pose.scale[0]),
      target.textures.get(voxel.block),
    );
  }
  if (!narrow && sceneTime > target.duration * 0.72) {
    g.font = "600 9px ui-monospace, SFMono-Regular, Menlo, monospace";
    g.fillStyle = colors.muted;
    for (const body of target.bodies.filter(({ id }) =>
      ["sun", "earth", "jupiter", "saturn", "neptune"].includes(id)
    )) {
      const point = project(
        body.center[0],
        body.center[1] + body.radius + 1.2,
        body.center[2],
        tile,
        ox,
        oy,
      );
      g.fillText(body.label.toUpperCase(), point.x + 5, point.y - 3);
    }
  }
  g.restore();

  const legend = [
    [colors.empty, "empty"], [colors.sample, "sample"], [colors.orbit, "orbit"],
    [colors.queued, "queued"], [colors.placed, "placed"],
  ];
  g.font = "500 11px ui-monospace, SFMono-Regular, Menlo, monospace";
  const columns = narrow ? 3 : 5;
  const legendWidth = narrow ? gridBox.width / 3 : Math.min(104, gridBox.width / 5);
  const legendY = cssHeight - (narrow ? 34 : 18);
  legend.forEach(([fill, label], index) => {
    const lx = gridBox.x + (index % columns) * legendWidth;
    const ly = legendY + Math.floor(index / columns) * 16;
    g.fillStyle = fill; g.fillRect(lx, ly - 9, 9, 9);
    g.fillStyle = colors.muted; g.fillText(label, lx + 14, ly);
  });
  target.lastTime = sceneTime;
};

const generateGif = async (target) => {
  target.gifButton.disabled = true;
  target.gifButton.textContent = "Encoding…";
  const canvas = document.createElement("canvas");
  canvas.width = 760;
  canvas.height = 500;
  const frameCount = 34;
  async function* frames() {
    for (let index = 0; index < frameCount; index += 1) {
      const time = target.duration * index / (frameCount - 1);
      drawAsset(target, time, canvas);
      yield {
        width: canvas.width,
        height: canvas.height,
        rgba: canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data,
        delay: index === frameCount - 1 ? 850 : 72,
      };
    }
  }
  const bytes = await encodeRgbaGif(frames(), { delay: 72, yieldEvery: 2, maxColors: 192 });
  downloadBytes(bytes, { filename: "minecraft-solar-system-build.gif", type: "image/gif" });
  target.gifButton.disabled = false;
  target.gifButton.textContent = "Generate GIF";
};

const solarSystemSurface = bindLiveSurface({
  watch: ["orbitScale", "bodyScale", "phase", "sliceY", "effect"],
  includeTime: true,
  async mount(context) {
    const shell = document.createElement("div");
    const canvas = document.createElement("canvas");
    const toolbar = document.createElement("div");
    const meta = document.createElement("output");
    const schemButton = document.createElement("button");
    const gifButton = document.createElement("button");
    shell.style.cssText = "position:relative;width:100%;height:100%;background:#080d12;overflow:hidden";
    canvas.style.cssText = "display:block;width:100%;height:100%";
    toolbar.style.cssText = "position:absolute;left:16px;right:16px;top:10px;display:flex;align-items:center;justify-content:flex-end;gap:7px;font:600 11px ui-monospace,monospace;z-index:1";
    meta.style.cssText = "color:#8d9ca7;margin-right:auto;white-space:nowrap";
    for (const button of [schemButton, gifButton]) {
      button.type = "button";
      button.style.cssText = "border:1px solid #40505d;background:#101820;color:#edf4f3;padding:6px 9px;border-radius:3px;font:600 11px ui-monospace,monospace;cursor:pointer;white-space:nowrap";
    }
    schemButton.textContent = "Download .schem";
    gifButton.textContent = "Generate GIF";
    toolbar.append(meta, schemButton, gifButton);
    shell.append(canvas, toolbar);
    context.element.append(shell);

    const [nucleation, packResponse] = await Promise.all([
      loadNucleation(),
      fetch(asset("solar-system-pack.zip")),
    ]);
    if (!packResponse.ok) throw new Error(`Could not load Minecraft textures (${packResponse.status})`);
    const packBytes = new Uint8Array(await packResponse.arrayBuffer());
    const pack = nucleation.ResourcePack.fromBytes(Array.from(packBytes));
    const textures = new Map();
    for (const [block, textureName] of Object.entries(textureForBlock)) {
      textures.set(block, textureCanvas(document, pack, textureName));
    }
    const target = {
      element: context.element, shell, canvas, toolbar, meta, schemButton, gifButton,
      nucleation, pack, textures, signals: context.signals, lastTime: 0,
      bodies: [], bounds: [], orbits: [], limit: 40, voxels: [], index: new Map(),
      schematic: null, animation: null, duration: 1,
    };
    schemButton.addEventListener("click", (event) => {
      event.stopPropagation();
      downloadBytes(base64Bytes(target.schematic.toSchematicB64()), {
        filename: "minecraft-solar-system.schem",
        type: "application/octet-stream",
      });
    });
    gifButton.addEventListener("click", (event) => {
      event.stopPropagation();
      void generateGif(target).catch((error) => {
        gifButton.disabled = false;
        gifButton.textContent = "Try GIF again";
        console.error(error);
      });
    });
    target.resize = new ResizeObserver(() => {
      const compact = context.element.clientWidth < 540;
      toolbar.style.flexWrap = compact ? "wrap" : "nowrap";
      meta.style.flex = compact ? "1 0 100%" : "0 0 auto";
      meta.style.marginRight = compact ? "0" : "auto";
      drawAsset(target, target.lastTime);
    });
    target.resize.observe(context.element);
    return target;
  },
  apply(target, update) {
    target.signals = update.signals;
    if (update.initial || update.changed.some((name) => ["orbitScale", "bodyScale", "phase", "effect"].includes(name))) {
      rebuild(target, update.signals);
    }
    const duration = update.scene.timeline?.duration || 3_000;
    drawAsset(target, target.duration * Math.min(1, update.time / duration));
  },
  destroy(target) {
    target.resize.disconnect();
  },
});

export const liveSurfaces = { "solar-system": solarSystemSurface };

export default figure("minecraft-solar-system-builder", {
  title: "Solar system builder",
  description: "Every grid cell, textured block, pose, and export comes from the live model.",
  background: "transparent",
  hold: 300,
}, (f) => {
  const surface = f.image(asset("field-observatory.png"), "Solar system builder fallback", {
    id: "solar-system",
    live: true,
    width: "fill",
    height: { wide: 620, compact: 690, narrow: 740 },
    label: "Minecraft solar system cell-state graph and textured build preview",
  });
  const readout = f.row([
    f.keyValue("bodies", "10"),
    f.keyValue("orbits", "90%", { valueBind: { text: "orbitLabel" } }),
    f.keyValue("scale", "100%", { valueBind: { text: "bodyLabel" } }),
    f.keyValue("phase", "0°", { valueBind: { text: "phaseLabel" } }),
    f.keyValue("slice", "Y 0", { valueBind: { text: "sliceLabel" } }),
  ], { gap: 12, width: "fill" });
  f.root(f.stack([surface, readout], { gap: 12, width: "fill" }));
  f.machine({
    initial: "ready",
    variables: { orbitScale: 0.9, bodyScale: 1, phase: 0, sliceY: 0, effect: "drop" },
    states: { ready: { on: {
      SET_ORBIT: { target: "ready", actions: [{ type: "set", var: "orbitScale", value: { fromEvent: true } }] },
      SET_BODY: { target: "ready", actions: [{ type: "set", var: "bodyScale", value: { fromEvent: true } }] },
      SET_PHASE: { target: "ready", actions: [{ type: "set", var: "phase", value: { fromEvent: true } }] },
      SET_SLICE: { target: "ready", actions: [{ type: "set", var: "sliceY", value: { fromEvent: true } }] },
      SET_EFFECT: { target: "ready", actions: [{ type: "set", var: "effect", value: { fromEvent: true } }] },
    } } },
    signals: {
      orbitLabel: { concat: [{ var: "orbitScale" }, "×"] },
      bodyLabel: { concat: [{ var: "bodyScale" }, "×"] },
      phaseLabel: { concat: [{ var: "phase" }, "°"] },
      sliceLabel: { concat: ["Y ", { var: "sliceY" }] },
    },
  });
  f.controls([
    { label: "Orbit spacing", kind: "range", event: "SET_ORBIT", bind: "orbitScale", min: 0.75, max: 1.15, step: 0.05, group: "system" },
    { label: "Body scale", kind: "range", event: "SET_BODY", bind: "bodyScale", min: 0.75, max: 1.3, step: 0.05, group: "system" },
    { label: "Orbital phase", kind: "range", event: "SET_PHASE", bind: "phase", min: 0, max: 360, step: 15, group: "system" },
    { label: "Slice Y", kind: "range", event: "SET_SLICE", bind: "sliceY", min: -4, max: 4, step: 1, group: "inspect" },
    { label: "Entrance", kind: "select", event: "SET_EFFECT", bind: "effect", options: [
      { label: "Drop + pop", value: "drop" },
      { label: "Spin", value: "spin" },
      { label: "Pop", value: "pop" },
    ], group: "motion" },
    { label: "Build playback", kind: "transport", transportStep: 180, group: "motion" },
  ]);
  f.sequence([f.rotate(surface, { from: 0, to: 0, duration: 3_000, easing: "linear" })]);
});
```

`bindLiveSurface()` is the bridge. It mounts Nucleation and the decoded resource pack once, applies
the initial signal snapshot before hiding the portable fallback, and coalesces later updates. The
controls therefore rebuild the schematic without reloading 15 MB of WASM or reparsing the texture
ZIP. `encodeRgbaGif()` accepts the same RGBA canvas frames shown in the browser, so the exported GIF
keeps the real Minecraft faces rather than substituting flat palette colours.

## 3. Scale the same pipeline to a production build

_Rendered Nucleation animation · quantitative chart_

The browser-built solar system deliberately stays small enough to regenerate instantly. The same
contract also handles a production artifact: this is Nucleation's real 2,515-block gyroid build,
paired with its block audit. On a phone, the two panes become a stack instead of shrinking labels
into unreadable pixels.

```kineglyph live id=minecraft-build-and-palette view=preview height=720
import { bar, figure, plot, studioTheme } from "kineglyph";

export const theme = studioTheme;
const asset = (name) => new URL(`../assets/nucleation/${name}`, location.href).href;
const palette = [
  { block: "Warped wart", count: 733 },
  { block: "Dark prismarine", count: 645 },
  { block: "Prismarine brick", count: 568 },
  { block: "Light blue", count: 522 },
  { block: "Sea lantern", count: 47 },
];

export default figure("minecraft-build-and-palette", {
  title: "Build animation and block audit",
  background: "transparent",
}, (f) => {
  const animation = f.image(asset("gyroid-bloom.gif"), "Gyroid assembling in Minecraft blocks", {
    width: "fill",
    height: { wide: 430, compact: 390, narrow: 340 },
    label: "Nucleation build animation",
  });
  const chart = f.add(plot(palette, {
    id: "block-palette",
    title: "Blocks in the saved schematic",
    x: "block",
    y: "count",
    marks: bar({ radius: 3 }),
    valueLabels: "always",
    axes: { y: { label: "blocks" } },
    height: 360,
    motion: "auto",
  }));
  f.root(f.flow([animation, chart], {
    gap: 18,
    align: "stretch",
    width: "fill",
  }));
  f.sequence([f.reveal(chart)]);
});
```

[Download the generated `gyroid-bloom.schem`](../assets/nucleation/gyroid-bloom.schem).

## 4. Inspect a production result like an application

_Orbitable GLB · file tree · code · reusable window and panes_

This is one Kineglyph window. The left pane is structured project data; the right pane is an image
node whose browser surface becomes an orbitable GLB. SVG, PNG, and GIF exports keep the static
Nucleation render, while the live page gets camera controls. Try dragging the model.

```kineglyph live id=minecraft-model-workbench view=preview height=760
import { figure, modelViewerSurface, studioTheme } from "kineglyph";

export const theme = studioTheme;
const asset = (name) => new URL(`../assets/nucleation/${name}`, location.href).href;
if (!customElements.get("model-viewer")) {
  await import("https://ajax.googleapis.com/ajax/libs/model-viewer/4.3.1/model-viewer.min.js");
}

export const liveSurfaces = {
  "nucleation-model": modelViewerSurface({
    source: asset("nucleation-build.glb"),
    alt: "Orbitable Minecraft structure exported by Nucleation",
    cameraControls: true,
    autoRotate: false,
    attributes: { "shadow-intensity": "0.7", "camera-orbit": "35deg 68deg auto" },
  }),
};

export default figure("minecraft-model-workbench", {
  title: "Inspect a Nucleation build",
  background: "transparent",
}, (f) => {
  const files = f.fileTree([
    { name: "field", children: [
      { name: "gyroid.py", selected: true, status: "src", tone: "info" },
      { name: "palette.json", status: "5" },
    ]},
    { name: "output", children: [
      { name: "gyroid-bloom.schem", status: "2515", tone: "success" },
      { name: "nucleation-build.glb", status: "3D", tone: "warning" },
    ]},
  ], { root: "minecraft-sdf", density: "compact", frame: { fill: "none", stroke: "none" } });
  const code = f.codeBlock([
    "field = gyroid().intersection_with(Sdf.sphere(14.5))",
    "for x, y, z in integer_samples(field.bounds):",
    "  if field.eval_at(x, y, z) <= 0:",
    "    build.set_block(x, y, z, material(x, y, z))",
  ], {
    language: "text",
    title: "gyroid.py",
    chrome: "plain",
    lineNumbers: true,
    highlightLines: [3, 4],
    cursor: { line: 4, style: "bar" },
    typing: true,
    frame: { fill: "none", stroke: "none" },
  });
  const explorer = f.stack([files, code], { gap: 8, width: "fill" });
  const model = f.image(asset("field-observatory.png"), "Static model fallback", {
    id: "nucleation-model",
    live: true,
    width: "fill",
    height: { wide: 520, compact: 460, narrow: 360 },
    label: "Interactive GLB preview",
  });
  const panes = f.panes([
    { title: "Build plan", icon: "folder", content: explorer, minWidth: 250 },
    { title: "3D preview", icon: "cube", content: model, active: true, grow: 2 },
  ], { layout: { wide: "row", compact: "stack", narrow: "stack" }, paneGap: 6 });
  const app = f.window(panes, {
    title: "Nucleation inspector",
    icon: "cube",
    tabs: [{ label: "gyroid-bloom", active: true }],
    chromeEnd: [{ kind: "badge", text: "GLB", tone: "success" }],
    statusBar: [
      { kind: "label", text: "2,515 blocks" },
      { kind: "label", text: "31 × 31 × 31 bounds" },
    ],
  });
  f.root(app);
  f.sequence([
    f.reveal(app, { duration: 320, offset: 8 }),
    f.typewrite(code, { characterDuration: 7, lineDelay: 40 }),
  ]);
});
```

`liveSurfaces` is part of the editable module contract. Change the model source, camera attributes,
fallback, panes, or theme and the preview is remounted through the normal hot-load path.

## 5. What belongs to which layer?

| Concern              | Kineglyph                                                      | Nucleation                                  |
| -------------------- | -------------------------------------------------------------- | ------------------------------------------- |
| Explain the pipeline | responsive nodes, edges, text, motion                          | supplies the domain stages                  |
| Explore parameters   | controls, state machine, bound signals, live-surface lifecycle | supplies body and orbit SDFs                |
| Use block materials  | presents material identity and texture status                  | decodes the vanilla resource-pack pixels    |
| Build Minecraft data | displays cell state, counts, and artifacts                     | evaluates fields and writes `.schem`        |
| Render construction  | projects frames and encodes the browser GIF                    | supplies deterministic animated block poses |
| Inspect 3D output    | aligns and manages the browser surface                         | exports GLB/glTF mesh data                  |
| Publish and export   | editable docs, SVG/PNG/GIF, responsive layouts                 | downloadable Minecraft artifact             |

That division is the useful one: Kineglyph does not pretend to be a voxel engine, and Nucleation
does not need to become a documentation UI. Portable scene nodes explain and frame the specialist
renderer, while live surfaces let the specialist output stay interactive.
