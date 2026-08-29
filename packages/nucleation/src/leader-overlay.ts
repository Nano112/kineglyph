/**
 * Leaders drawn inside the WebGL view: each callout's leader, from its anchor out to the edge
 * of the view, as a screen-space line lying in the camera-facing plane through the anchor and
 * depth-tested against the blocks — so a block in front of the anchor covers it and a block
 * behind does not. The sheet draws the rest of the leader outside the view (`embedded` in
 * `anchorFrameSignals`), and the two meet at the view's edge.
 */
import * as THREE from "three";
import { Line2 } from "three/addons/lines/Line2.js";
import { LineGeometry } from "three/addons/lines/LineGeometry.js";
import { LineMaterial } from "three/addons/lines/LineMaterial.js";
import type { AnchorNote, SheetRect } from "./anchors.js";
import { project } from "./camera.js";
import type { Frame } from "./frame-source.js";
import { leaderPolyline, placedAnchor } from "./leaders.js";

export interface LeaderOverlayOptions {
  /** The surface node's rectangle in sheet units (the same `frame` the frame signals use). */
  readonly frame: SheetRect;
  readonly notes: readonly AnchorNote[];
  /** Stroke width and dot radius in sheet units; defaults match `drafting.leader` (0.8, 3.6). */
  readonly width?: number;
  readonly dot?: number;
  readonly opacity?: number;
  /** Below this pose opacity or scale the anchor counts as not there yet. Default 0.5. */
  readonly threshold?: number;
  /**
   * How far toward the camera, in blocks, the leader's plane sits in front of its anchor.
   * Faces at the anchor's own depth (the top of the block it marks, its neighbours in the
   * same row) then leave the leader alone, while blocks clearly in front still cover it.
   * Default 0.35.
   */
  readonly lift?: number;
  /**
   * How much heavier the in-view half is than the sheet's hairline — a line drawn among the
   * blocks reads better with some weight. Default 1.75.
   */
  readonly weight?: number;
}

interface LeaderObjects {
  readonly line: Line2;
  readonly material: LineMaterial;
  readonly dot: THREE.Sprite;
  readonly dotMaterial: THREE.SpriteMaterial;
}

let discTexture: THREE.Texture | undefined;
function disc(doc: Document): THREE.Texture {
  if (discTexture !== undefined) return discTexture;
  const canvas = doc.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext("2d");
  if (ctx !== null) {
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(32, 32, 30, 0, Math.PI * 2);
    ctx.fill();
  }
  discTexture = new THREE.CanvasTexture(canvas);
  return discTexture;
}

export class LeaderOverlay {
  readonly group = new THREE.Group();
  readonly #options: LeaderOverlayOptions;
  readonly #objects = new Map<string, LeaderObjects>();
  #colors: Readonly<Record<string, string>> = {};
  #styleSource: ParentNode | undefined;

  constructor(options: LeaderOverlayOptions, doc: Document) {
    this.#options = options;
    this.group.renderOrder = 10;
    for (const note of options.notes) {
      const material = new LineMaterial({
        color: 0x000000,
        linewidth: 1,
        transparent: true,
        opacity: options.opacity ?? 0.75,
        depthTest: true,
        depthWrite: false,
        alphaToCoverage: true,
      });
      const geometry = new LineGeometry();
      geometry.setPositions([0, 0, 0, 0, 0, 0, 0, 0, 0]);
      const line = new Line2(geometry, material);
      line.visible = false;
      line.frustumCulled = false;
      const dotMaterial = new THREE.SpriteMaterial({
        map: disc(doc),
        color: 0x000000,
        transparent: true,
        opacity: options.opacity ?? 0.75,
        depthTest: true,
        depthWrite: false,
      });
      const dot = new THREE.Sprite(dotMaterial);
      dot.visible = false;
      this.group.add(line, dot);
      this.#objects.set(note.anchor, { line, material, dot, dotMaterial });
    }
  }

  /** Theme colours to resolve each note's `tone` against. */
  setColors(colors: Readonly<Record<string, string>>): void {
    this.#colors = colors;
  }

  /**
   * Where the sheet's own leader paths live. When the bound `leader.<anchor>` path is found,
   * its computed stroke colour, width, and opacity are used, so the two halves match exactly.
   */
  setStyleSource(root: ParentNode | undefined): void {
    this.#styleSource = root;
  }

  #sheetStyle(anchor: string): { color: string; widthPx: number; opacity: number } | undefined {
    const root = this.#styleSource;
    if (root === undefined) return undefined;
    const path = root.querySelector(`.kg-node-shape[data-shape-of="leader.${anchor}"]`);
    if (!(path instanceof SVGGraphicsElement)) return undefined;
    const view = path.ownerDocument.defaultView;
    if (view === null) return undefined;
    const computed = view.getComputedStyle(path);
    const scale = path.getScreenCTM()?.a ?? 1;
    const widthPx = Number.parseFloat(computed.strokeWidth) * scale;
    let opacity = Number.parseFloat(computed.opacity) * Number.parseFloat(computed.strokeOpacity);
    for (
      let node = path.parentElement;
      node !== null && node.tagName === "g";
      node = node.parentElement
    )
      opacity *= Number.parseFloat(view.getComputedStyle(node).opacity);
    if (!(widthPx > 0) || computed.stroke === "none") return undefined;
    return { color: computed.stroke, widthPx, opacity: Number.isFinite(opacity) ? opacity : 1 };
  }

  /**
   * Place every leader for a frame. `viewProjection` and `camera` must describe the render
   * about to happen; `viewport` is the canvas size in CSS pixels.
   */
  update(
    frame: Frame,
    viewProjection: Float64Array,
    camera: THREE.Camera,
    viewport: { readonly width: number; readonly height: number },
  ): void {
    const { frame: rect, notes } = this.#options;
    const threshold = this.#options.threshold ?? 0.5;
    const pxPerUnit = viewport.width / rect.width;
    const linePx = Math.max(1, (this.#options.width ?? 0.8) * pxPerUnit);
    const dotPx = Math.max(
      1,
      (this.#options.dot ?? 3.6) * pxPerUnit * (this.#options.weight ?? 1.75),
    );
    const lift = this.#options.lift ?? 0.35;
    const forward = new THREE.Vector3();
    camera.getWorldDirection(forward);
    const toWorld = (px: number, py: number, depth: number): THREE.Vector3 =>
      new THREE.Vector3(
        (px / viewport.width) * 2 - 1,
        1 - (py / viewport.height) * 2,
        depth,
      ).unproject(camera);
    for (const note of notes) {
      const objects = this.#objects.get(note.anchor);
      if (objects === undefined) continue;
      const sample = placedAnchor(frame, note.anchor, threshold);
      const projected =
        sample === undefined ? undefined : project(viewProjection, sample.world, viewport);
      if (sample === undefined || projected === undefined || !projected.visible) {
        objects.line.visible = false;
        objects.dot.visible = false;
        continue;
      }
      // The plane's depth: the anchor moved `lift` blocks toward the camera.
      const lifted: readonly [number, number, number] = [
        sample.world[0] - forward.x * lift,
        sample.world[1] - forward.y * lift,
        sample.world[2] - forward.z * lift,
      ];
      const depth = project(viewProjection, lifted, viewport).depth;
      // The polyline in sheet units, then in viewport pixels, then on the anchor's plane.
      const sheetAnchor: readonly [number, number] = [
        rect.x + (projected.x / viewport.width) * rect.width,
        rect.y + (projected.y / viewport.height) * rect.height,
      ];
      const positions: number[] = [];
      for (const [sx, sy] of leaderPolyline(note, sheetAnchor)) {
        const world = toWorld(
          ((sx - rect.x) / rect.width) * viewport.width,
          ((sy - rect.y) / rect.height) * viewport.height,
          depth,
        );
        positions.push(world.x, world.y, world.z);
      }
      objects.line.geometry.setPositions(positions);
      objects.line.computeLineDistances();
      const sheet = this.#sheetStyle(note.anchor);
      // A hairline thinner than a pixel is drawn one pixel wide at proportionally less opacity,
      // which is how the browser rasterises the sheet's half.
      const width = (sheet?.widthPx ?? linePx) * (this.#options.weight ?? 1.75);
      const opacity = (sheet?.opacity ?? this.#options.opacity ?? 0.75) * Math.min(1, width);
      objects.material.linewidth = Math.max(1, width);
      objects.material.opacity = opacity;
      objects.dotMaterial.opacity = opacity;
      objects.material.resolution.set(viewport.width, viewport.height);
      const color = sheet?.color ?? this.#colors[note.tone ?? "text"] ?? note.tone ?? "#000";
      objects.material.color.set(color);
      objects.dotMaterial.color.set(color);
      const centre = toWorld(projected.x, projected.y, depth);
      const edge = toWorld(projected.x + dotPx, projected.y, depth);
      const size = centre.distanceTo(edge) * 2;
      objects.dot.position.copy(centre);
      objects.dot.scale.set(size, size, 1);
      objects.line.visible = true;
      objects.dot.visible = true;
    }
  }

  dispose(): void {
    for (const objects of this.#objects.values()) {
      objects.line.geometry.dispose();
      objects.material.dispose();
      objects.dotMaterial.dispose();
    }
    this.#objects.clear();
  }
}
