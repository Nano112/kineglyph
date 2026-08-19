import type { ResolvedFillPaint, ResolvedNode, ResolvedScene } from "@kineglyph/core";
import { renderSvg } from "@kineglyph/svg";

export interface CanvasRenderOptions {
  readonly pixelRatio?: number;
  /** Dependency injection for workers, OffscreenCanvas, and deterministic tests. */
  readonly context?: CanvasRenderingContext2D;
  readonly clear?: boolean;
  /** Optional scene-space regions to clear and repaint; omit for a full render. */
  readonly regions?: readonly CanvasDirtyRegion[];
}

export interface CanvasDirtyRegion {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface CanvasDirtyRegionOptions {
  /** Extra scene pixels around changed geometry (default: 4). */
  readonly padding?: number;
  /** Collapse to a full repaint beyond this many merged regions (default: 64). */
  readonly maxRegions?: number;
  /** Collapse when merged dirty area exceeds this scene fraction (default: 0.6). */
  readonly maxAreaRatio?: number;
}

export interface CanvasMountOptions extends CanvasRenderOptions {
  /** Canvas becomes the default above this number of paintable nodes. */
  readonly threshold?: number;
  readonly summary?: "list" | false;
  readonly maxSummaryItems?: number;
}

export interface CanvasSceneHandle {
  readonly canvas: HTMLCanvasElement;
  readonly summary: HTMLOListElement | undefined;
  update(scene: ResolvedScene): void;
  /** Deterministic, accessible/exportable fallback from the same resolved scene. */
  svg(): string;
  destroy(): void;
}

function color(value: string | undefined, fallback = "transparent"): string {
  if (value === undefined || value === "none") return fallback;
  const variable = /^var\([^,]+,\s*([^)]+)\)$/.exec(value);
  return variable?.[1]?.trim() ?? value;
}

function fillPaint(
  context: CanvasRenderingContext2D,
  value: ResolvedFillPaint,
  node: ResolvedNode,
): string | CanvasGradient {
  if (typeof value === "string") return color(value);
  const fallback = color(value.stops[0]?.color, "transparent");
  let gradient: CanvasGradient | undefined;
  if (value.type === "linear-gradient" && context.createLinearGradient !== undefined) {
    const radians = (value.angle * Math.PI) / 180;
    const dx = Math.cos(radians) * node.width * 0.5;
    const dy = Math.sin(radians) * node.height * 0.5;
    const cx = node.x + node.width / 2;
    const cy = node.y + node.height / 2;
    gradient = context.createLinearGradient(cx - dx, cy - dy, cx + dx, cy + dy);
  } else if (value.type === "radial-gradient" && context.createRadialGradient !== undefined) {
    const cx = node.x + value.center[0] * node.width;
    const cy = node.y + value.center[1] * node.height;
    const fx = node.x + value.focalPoint[0] * node.width;
    const fy = node.y + value.focalPoint[1] * node.height;
    gradient = context.createRadialGradient(
      fx,
      fy,
      0,
      cx,
      cy,
      value.radius * Math.max(node.width, node.height),
    );
  }
  if (gradient === undefined) return fallback;
  for (const stop of value.stops) gradient.addColorStop(stop.at, color(stop.color));
  return gradient;
}

function roundedRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  const r = Math.max(0, Math.min(radius, width / 2, height / 2));
  context.beginPath();
  context.moveTo(x + r, y);
  context.lineTo(x + width - r, y);
  context.quadraticCurveTo(x + width, y, x + width, y + r);
  context.lineTo(x + width, y + height - r);
  context.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  context.lineTo(x + r, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - r);
  context.lineTo(x, y + r);
  context.quadraticCurveTo(x, y, x + r, y);
  context.closePath();
}

function paintShape(context: CanvasRenderingContext2D, node: ResolvedNode): void {
  const fill = fillPaint(context, node.appearance.fill, node);
  const stroke = color(node.appearance.stroke);
  if (fill !== "transparent") {
    context.fillStyle = fill;
    context.fill();
  }
  if (stroke !== "transparent" && node.appearance.strokeWidth > 0) {
    context.strokeStyle = stroke;
    context.lineWidth = node.appearance.strokeWidth;
    context.stroke();
  }
}

function drawNode(context: CanvasRenderingContext2D, node: ResolvedNode): void {
  if (node.hidden || node.kind === "group" || node.state.opacity <= 0) return;
  context.save();
  context.globalAlpha = Math.min(1, Math.max(0, node.state.opacity));
  const cx = node.x + node.width / 2;
  const cy = node.y + node.height / 2;
  context.translate(cx + node.state.translateX, cy + node.state.translateY);
  context.rotate(((node.state.rotation ?? 0) * Math.PI) / 180);
  context.scale(node.state.scale, node.state.scale);
  context.translate(-cx, -cy);
  if (node.kind === "rect" || node.kind === "badge" || node.kind === "callout") {
    roundedRect(context, node.x, node.y, node.width, node.height, node.appearance.radius);
    paintShape(context, node);
  } else if (node.kind === "circle" || node.kind === "ellipse") {
    context.beginPath();
    context.ellipse(cx, cy, node.width / 2, node.height / 2, 0, 0, Math.PI * 2);
    paintShape(context, node);
  } else if (node.kind === "path" && node.path !== undefined && typeof Path2D !== "undefined") {
    const path = new Path2D(node.path.d);
    context.save();
    context.translate(node.x, node.y);
    context.scale(node.width / node.path.viewBox.width, node.height / node.path.viewBox.height);
    context.beginPath();
    const fill = fillPaint(context, node.appearance.fill, node);
    if (fill !== "transparent") {
      context.fillStyle = fill;
      context.fill(path);
    }
    const stroke = color(node.appearance.stroke);
    if (stroke !== "transparent") {
      context.strokeStyle = stroke;
      context.lineWidth =
        node.appearance.strokeWidth / Math.max(0.001, node.width / node.path.viewBox.width);
      context.stroke(path);
    }
    context.restore();
  }
  if (node.text !== undefined) {
    const text = node.text;
    context.fillStyle = color(text.color, "#111");
    context.font = `${text.fontWeight} ${text.fontSize}px ${text.fontFamily}`;
    context.textBaseline = "alphabetic";
    context.textAlign =
      text.align === "center" ? "center" : text.align === "end" ? "right" : "left";
    const x =
      text.align === "center"
        ? text.box.x + text.box.width / 2
        : text.align === "end"
          ? text.box.x + text.box.width
          : text.box.x;
    for (const [index, line] of text.lines.entries())
      context.fillText(line.text, x, text.box.y + text.fontSize + index * text.lineHeight);
  }
  context.restore();
}

function fullRegion(scene: ResolvedScene): CanvasDirtyRegion {
  return { x: 0, y: 0, width: scene.width, height: scene.height };
}

function normalizeRegion(
  region: CanvasDirtyRegion,
  scene: ResolvedScene,
  padding: number,
): CanvasDirtyRegion | undefined {
  const x = Math.max(0, region.x - padding);
  const y = Math.max(0, region.y - padding);
  const right = Math.min(scene.width, region.x + region.width + padding);
  const bottom = Math.min(scene.height, region.y + region.height + padding);
  return right <= x || bottom <= y ? undefined : { x, y, width: right - x, height: bottom - y };
}

function nodeRegion(node: ResolvedNode): CanvasDirtyRegion {
  const scale = Math.max(0, Math.abs(node.state.scale));
  const diagonal = Math.hypot(node.width * scale, node.height * scale);
  const rotated = (node.state.rotation ?? 0) % 180 !== 0;
  const width = rotated ? diagonal : node.width * scale;
  const height = rotated ? diagonal : node.height * scale;
  const centerX = node.x + node.width / 2 + node.state.translateX;
  const centerY = node.y + node.height / 2 + node.state.translateY;
  return { x: centerX - width / 2, y: centerY - height / 2, width, height };
}

function edgeRegion(edge: ResolvedScene["edges"][number]): CanvasDirtyRegion {
  const points = edge.samples ?? [edge.start, edge.end];
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return {
    x,
    y,
    width: Math.max(1, Math.max(...xs) - x),
    height: Math.max(1, Math.max(...ys) - y),
  };
}

function overlaps(a: CanvasDirtyRegion, b: CanvasDirtyRegion): boolean {
  return !(
    a.x + a.width < b.x ||
    b.x + b.width < a.x ||
    a.y + a.height < b.y ||
    b.y + b.height < a.y
  );
}

function union(a: CanvasDirtyRegion, b: CanvasDirtyRegion): CanvasDirtyRegion {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  const right = Math.max(a.x + a.width, b.x + b.width);
  const bottom = Math.max(a.y + a.height, b.y + b.height);
  return { x, y, width: right - x, height: bottom - y };
}

function mergeRegions(regions: readonly CanvasDirtyRegion[]): CanvasDirtyRegion[] {
  const merged: CanvasDirtyRegion[] = [];
  for (const initial of regions) {
    let next = initial;
    let index = 0;
    while (index < merged.length) {
      const candidate = merged[index]!;
      if (overlaps(next, candidate)) {
        next = union(next, candidate);
        merged.splice(index, 1);
        index = 0;
      } else index += 1;
    }
    merged.push(next);
  }
  return merged;
}

function changed<T>(previous: T | undefined, next: T | undefined): boolean {
  return JSON.stringify(previous) !== JSON.stringify(next);
}

/**
 * Finds the smallest safe repaint regions between resolved scenes using stable node and edge ids.
 * Theme/background/viewport changes deliberately request one full repaint.
 */
export function diffCanvasRegions(
  previous: ResolvedScene,
  next: ResolvedScene,
  options: CanvasDirtyRegionOptions = {},
): readonly CanvasDirtyRegion[] {
  if (
    previous.width !== next.width ||
    previous.height !== next.height ||
    changed(previous.background, next.background) ||
    changed(previous.theme, next.theme)
  )
    return [fullRegion(next)];
  const padding = Math.max(0, options.padding ?? 4);
  const regions: CanvasDirtyRegion[] = [];
  const collect = <T extends { readonly id: string }>(
    before: readonly T[],
    after: readonly T[],
    bounds: (value: T) => CanvasDirtyRegion,
  ): void => {
    const old = new Map(before.map((value) => [value.id, value]));
    const current = new Map(after.map((value) => [value.id, value]));
    for (const id of new Set([...old.keys(), ...current.keys()])) {
      const prior = old.get(id);
      const value = current.get(id);
      if (!changed(prior, value)) continue;
      for (const region of [prior, value]
        .filter((item): item is T => item !== undefined)
        .map(bounds)) {
        const normalized = normalizeRegion(region, next, padding);
        if (normalized !== undefined) regions.push(normalized);
      }
    }
  };
  collect(previous.nodes, next.nodes, nodeRegion);
  collect(previous.edges, next.edges, edgeRegion);
  const merged = mergeRegions(regions);
  const area = merged.reduce((sum, region) => sum + region.width * region.height, 0);
  if (
    merged.length > (options.maxRegions ?? 64) ||
    area / Math.max(1, next.width * next.height) > (options.maxAreaRatio ?? 0.6)
  )
    return [fullRegion(next)];
  return merged;
}

function drawScene(context: CanvasRenderingContext2D, scene: ResolvedScene): void {
  if (scene.background !== undefined && scene.background !== "transparent") {
    context.fillStyle = color(scene.background);
    context.fillRect(0, 0, scene.width, scene.height);
  }
  for (const edge of [...scene.edges].sort((a, b) => (a.z ?? 0) - (b.z ?? 0))) {
    if (edge.hidden || edge.state.opacity <= 0) continue;
    const samples = edge.samples ?? [edge.start, edge.end];
    if (samples.length < 2) continue;
    context.save();
    context.globalAlpha = edge.state.opacity;
    context.strokeStyle = color(edge.appearance.stroke, "#777");
    context.lineWidth = edge.appearance.strokeWidth;
    context.beginPath();
    context.moveTo(samples[0]!.x, samples[0]!.y);
    for (const point of samples.slice(1)) context.lineTo(point.x, point.y);
    context.stroke();
    context.restore();
  }
  for (const node of [...scene.nodes].sort((a, b) => (a.z ?? 0) - (b.z ?? 0)))
    drawNode(context, node);
}

/** Paints a resolved scene in one canvas with no per-mark DOM or listeners. */
export function renderCanvasScene(
  canvas: HTMLCanvasElement,
  scene: ResolvedScene,
  options: CanvasRenderOptions = {},
): void {
  const ratio = Math.max(
    0.25,
    options.pixelRatio ?? canvas.ownerDocument.defaultView?.devicePixelRatio ?? 1,
  );
  const pixelWidth = Math.max(1, Math.round(scene.width * ratio));
  const pixelHeight = Math.max(1, Math.round(scene.height * ratio));
  const resized = canvas.width !== pixelWidth || canvas.height !== pixelHeight;
  if (resized) {
    canvas.width = pixelWidth;
    canvas.height = pixelHeight;
  }
  canvas.style.width = `${scene.width}px`;
  canvas.style.height = `${scene.height}px`;
  const context = options.context ?? canvas.getContext("2d") ?? undefined;
  if (context === undefined) throw new Error("Canvas 2D is not available");
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  const regions = resized ? undefined : options.regions;
  if (regions !== undefined && regions.length === 0) return;
  if (regions !== undefined) {
    if (options.clear !== false)
      for (const region of regions)
        context.clearRect(region.x, region.y, region.width, region.height);
    context.save();
    context.beginPath();
    for (const region of regions) context.rect(region.x, region.y, region.width, region.height);
    context.clip();
    drawScene(context, scene);
    context.restore();
  } else {
    if (options.clear !== false) context.clearRect(0, 0, scene.width, scene.height);
    drawScene(context, scene);
  }
}

export function preferredRenderer(
  scene: ResolvedScene,
  options: Pick<CanvasMountOptions, "threshold"> = {},
): "svg" | "canvas" {
  return scene.nodes.length + scene.edges.length >= (options.threshold ?? 750) ? "canvas" : "svg";
}

function renderSummary(list: HTMLOListElement, scene: ResolvedScene, limit: number): void {
  list.replaceChildren();
  const meaningful = scene.nodes.filter(
    (node) =>
      !node.hidden && (node.interactive || node.inspect !== undefined || node.label.length > 0),
  );
  for (const node of meaningful.slice(0, limit)) {
    const item = list.ownerDocument.createElement("li");
    item.dataset.nodeId = node.id;
    item.textContent =
      node.description === undefined ? node.label : `${node.label}: ${node.description}`;
    list.append(item);
  }
  if (meaningful.length > limit) {
    const remainder = list.ownerDocument.createElement("li");
    remainder.textContent = `${meaningful.length - limit} additional marks; use the SVG fallback for the complete accessible scene.`;
    list.append(remainder);
  }
}

/** Mounts a high-density scene with a bounded DOM summary and deterministic SVG fallback. */
export function mountCanvasScene(
  element: HTMLElement,
  initial: ResolvedScene,
  options: CanvasMountOptions = {},
): CanvasSceneHandle {
  const canvas = element.ownerDocument.createElement("canvas");
  canvas.className = "kg-canvas-scene";
  canvas.setAttribute("role", "img");
  const summary = options.summary === false ? undefined : element.ownerDocument.createElement("ol");
  if (summary !== undefined) {
    summary.className = "kg-canvas-scene__summary";
    summary.setAttribute("aria-label", `${initial.title} scene contents`);
  }
  element.append(canvas, ...(summary === undefined ? [] : [summary]));
  let scene = initial;
  const update = (next: ResolvedScene): void => {
    const regions = diffCanvasRegions(scene, next);
    scene = next;
    canvas.setAttribute("aria-label", next.description ?? next.title);
    renderCanvasScene(canvas, next, { ...options, regions });
    if (summary !== undefined) renderSummary(summary, next, options.maxSummaryItems ?? 200);
  };
  update(initial);
  return {
    canvas,
    summary,
    update,
    svg: () => renderSvg(scene, { effects: "portable" }),
    destroy() {
      canvas.remove();
      summary?.remove();
    },
  };
}
