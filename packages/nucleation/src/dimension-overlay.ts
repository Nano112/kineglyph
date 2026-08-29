/**
 * Dimension lines between two anchors, drawn in the view: extension lines up from each anchor,
 * a dimension line between them, and a label with the distance in blocks — depth-tested, so
 * the blocks in front cover them the way they cover the leaders. The matching frame signal
 * `dimension.<from>.<to>` carries the distance for text on the sheet.
 */
import * as THREE from "three";
import { Line2 } from "three/addons/lines/Line2.js";
import { LineGeometry } from "three/addons/lines/LineGeometry.js";
import { LineMaterial } from "three/addons/lines/LineMaterial.js";
import type { Frame } from "./frame-source.js";
import type { Vec3 } from "./glb.js";
import { placedAnchor } from "./leaders.js";

export interface BuildDimension {
  readonly from: string;
  readonly to: string;
  /** How far above the anchors (blocks, world +Y) the dimension line runs. Default 0.6. */
  readonly offset?: number;
  /** Label text for a distance in blocks. Default two decimals + " bl". */
  readonly label?: (blocks: number) => string;
  /** Theme colour token or CSS colour. Default "text". */
  readonly tone?: string;
}

export interface DimensionOverlayOptions {
  readonly dimensions: readonly BuildDimension[];
  /** Line width in CSS pixels. Default 1.2. */
  readonly width?: number;
  readonly opacity?: number;
  /** Label height in CSS pixels. Default 11. */
  readonly fontPx?: number;
  readonly fontFamily?: string;
  /** Below this pose opacity or scale an anchor counts as not there yet. Default 0.5. */
  readonly threshold?: number;
}

interface DimensionObjects {
  readonly line: Line2;
  readonly material: LineMaterial;
  readonly label: THREE.Sprite;
  readonly labelMaterial: THREE.SpriteMaterial;
  readonly canvas: HTMLCanvasElement;
  text: string;
  color: string;
}

const key = (dimension: BuildDimension): string => `${dimension.from}→${dimension.to}`;

export class DimensionOverlay {
  readonly group = new THREE.Group();
  readonly #options: DimensionOverlayOptions;
  readonly #objects = new Map<string, DimensionObjects>();
  readonly #doc: Document;
  #colors: Readonly<Record<string, string>> = {};

  constructor(options: DimensionOverlayOptions, doc: Document) {
    this.#options = options;
    this.#doc = doc;
    this.group.renderOrder = 11;
    for (const dimension of options.dimensions) {
      const material = new LineMaterial({
        color: 0x000000,
        linewidth: options.width ?? 1.2,
        transparent: true,
        opacity: options.opacity ?? 0.85,
        depthTest: true,
        depthWrite: false,
        alphaToCoverage: true,
      });
      const geometry = new LineGeometry();
      geometry.setPositions(new Array<number>(12).fill(0));
      const line = new Line2(geometry, material);
      line.visible = false;
      line.frustumCulled = false;
      const canvas = doc.createElement("canvas");
      const labelMaterial = new THREE.SpriteMaterial({
        map: new THREE.CanvasTexture(canvas),
        transparent: true,
        opacity: options.opacity ?? 0.85,
        depthTest: true,
        depthWrite: false,
      });
      const label = new THREE.Sprite(labelMaterial);
      label.visible = false;
      this.group.add(line, label);
      this.#objects.set(key(dimension), {
        line,
        material,
        label,
        labelMaterial,
        canvas,
        text: "",
        color: "",
      });
    }
  }

  setColors(colors: Readonly<Record<string, string>>): void {
    this.#colors = colors;
  }

  #paintLabel(objects: DimensionObjects, text: string, color: string): void {
    if (objects.text === text && objects.color === color) return;
    const scale = 2;
    const fontPx = (this.#options.fontPx ?? 11) * scale;
    const family = this.#options.fontFamily ?? "ui-monospace, SFMono-Regular, Menlo, monospace";
    const ctx = objects.canvas.getContext("2d");
    if (ctx === null) return;
    ctx.font = `600 ${fontPx}px ${family}`;
    const width = Math.ceil(ctx.measureText(text).width) + fontPx;
    objects.canvas.width = width;
    objects.canvas.height = Math.ceil(fontPx * 1.5);
    ctx.font = `600 ${fontPx}px ${family}`;
    ctx.textBaseline = "middle";
    ctx.textAlign = "center";
    ctx.fillStyle = color;
    ctx.fillText(text, width / 2, objects.canvas.height / 2);
    objects.labelMaterial.map?.dispose();
    objects.labelMaterial.map = new THREE.CanvasTexture(objects.canvas);
    objects.labelMaterial.needsUpdate = true;
    objects.text = text;
    objects.color = color;
  }

  update(
    frame: Frame,
    camera: THREE.Camera,
    viewport: { readonly width: number; readonly height: number },
  ): void {
    const threshold = this.#options.threshold ?? 0.5;
    const forward = new THREE.Vector3();
    camera.getWorldDirection(forward);
    for (const dimension of this.#options.dimensions) {
      const objects = this.#objects.get(key(dimension));
      if (objects === undefined) continue;
      const a = placedAnchor(frame, dimension.from, threshold);
      const b = placedAnchor(frame, dimension.to, threshold);
      if (a === undefined || b === undefined) {
        objects.line.visible = false;
        objects.label.visible = false;
        continue;
      }
      const offset = dimension.offset ?? 0.6;
      // A hair toward the camera so the lines clear the faces they start on.
      const lift = 0.05;
      const at = (p: Vec3, up: number): THREE.Vector3 =>
        new THREE.Vector3(
          p[0] - forward.x * lift,
          p[1] + up - forward.y * lift,
          p[2] - forward.z * lift,
        );
      const pa = at(a.world, 0);
      const pa2 = at(a.world, offset);
      const pb2 = at(b.world, offset);
      const pb = at(b.world, 0);
      objects.line.geometry.setPositions([
        pa.x,
        pa.y,
        pa.z,
        pa2.x,
        pa2.y,
        pa2.z,
        pb2.x,
        pb2.y,
        pb2.z,
        pb.x,
        pb.y,
        pb.z,
      ]);
      objects.line.computeLineDistances();
      objects.material.resolution.set(viewport.width, viewport.height);
      const color = this.#colors[dimension.tone ?? "text"] ?? dimension.tone ?? "#000";
      objects.material.color.set(color);
      const distance = Math.hypot(
        b.world[0] - a.world[0],
        b.world[1] - a.world[1],
        b.world[2] - a.world[2],
      );
      const text = dimension.label?.(distance) ?? `${distance.toFixed(2)} bl`;
      this.#paintLabel(objects, text, color);
      // The label sits above the dimension line's midpoint, sized in CSS pixels.
      const mid = pa2.clone().add(pb2).multiplyScalar(0.5);
      const ndc = mid.clone().project(camera);
      const fontPx = this.#options.fontPx ?? 11;
      const heightPx = fontPx * 1.5;
      const widthPx = (objects.canvas.width / objects.canvas.height) * heightPx;
      const centre = new THREE.Vector3(
        ndc.x,
        ndc.y + (heightPx / viewport.height) * 1.6,
        ndc.z,
      ).unproject(camera);
      const edge = new THREE.Vector3(
        ndc.x + (widthPx / viewport.width) * 2,
        ndc.y,
        ndc.z,
      ).unproject(camera);
      const worldWidth = centre.distanceTo(edge);
      objects.label.position.copy(centre);
      objects.label.scale.set(worldWidth, worldWidth * (heightPx / widthPx), 1);
      objects.line.visible = true;
      objects.label.visible = true;
    }
  }

  dispose(): void {
    for (const objects of this.#objects.values()) {
      objects.line.geometry.dispose();
      objects.material.dispose();
      objects.labelMaterial.map?.dispose();
      objects.labelMaterial.dispose();
    }
    this.#objects.clear();
    void this.#doc;
  }
}
