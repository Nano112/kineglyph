import type { Rect } from "./schema.js";
import type { ResolvedScene } from "./resolved.js";

export type ResolvedSceneCrop = "scene" | "surface" | "content";

function union(rects: readonly Rect[]): Rect | undefined {
  if (rects.length === 0) return undefined;
  let left = Number.POSITIVE_INFINITY;
  let top = Number.POSITIVE_INFINITY;
  let right = Number.NEGATIVE_INFINITY;
  let bottom = Number.NEGATIVE_INFINITY;
  for (const rect of rects) {
    left = Math.min(left, rect.x);
    top = Math.min(top, rect.y);
    right = Math.max(right, rect.x + rect.width);
    bottom = Math.max(bottom, rect.y + rect.height);
  }
  return { x: left, y: top, width: Math.max(0, right - left), height: Math.max(0, bottom - top) };
}

/** Deterministic crop bounds shared by browser snapshots and static exporters. */
export function resolvedSceneBounds(
  scene: ResolvedScene,
  crop: ResolvedSceneCrop = "scene",
  padding = 0,
): Rect {
  const sceneRect: Rect = { x: 0, y: 0, width: scene.width, height: scene.height };
  if (crop === "scene") return sceneRect;
  const surface = scene.nodes.find((node) => !node.hidden && node.metadata.figureSurface === true);
  const contentRects: Rect[] = scene.nodes
    .filter((node) => !node.hidden && node.kind !== "group")
    .map(({ x, y, width, height }) => ({ x, y, width, height }));
  for (const edge of scene.edges) {
    if (edge.hidden) continue;
    const samples = edge.samples ?? [edge.start, edge.end];
    for (const point of samples) contentRects.push({ x: point.x, y: point.y, width: 0, height: 0 });
    for (const label of edge.labels ?? [])
      if (!label.hidden)
        contentRects.push({
          x:
            label.x -
            (label.anchor === "middle"
              ? label.width / 2
              : label.anchor === "end"
                ? label.width
                : 0),
          y: label.y - label.height / 2,
          width: label.width,
          height: label.height,
        });
  }
  const chosen =
    crop === "surface" && surface !== undefined
      ? { x: surface.x, y: surface.y, width: surface.width, height: surface.height }
      : (union(contentRects) ?? sceneRect);
  const inset = Number.isFinite(padding) ? Math.max(0, padding) : 0;
  return {
    x: chosen.x - inset,
    y: chosen.y - inset,
    width: Math.max(1, chosen.width + inset * 2),
    height: Math.max(1, chosen.height + inset * 2),
  };
}
