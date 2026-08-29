/**
 * Composite export: swap a live surface's static fallback image inside an exported SVG for a
 * snapshot of what the surface rendered. Everything else in the SVG — paper, plates, leaders
 * drawn on top of the surface — keeps its place and order.
 */
export type SurfaceSnapshots = ReadonlyMap<string, string>;

const XLINK = "http://www.w3.org/1999/xlink";

/** Replace `image[data-live]` fallbacks by node id with snapshot data URLs. */
export function composeSurfaceSnapshots(
  svg: string,
  snapshots: SurfaceSnapshots,
  doc: Document,
): string {
  if (snapshots.size === 0) return svg;
  const view = doc.defaultView;
  if (view === null) return svg;
  const parsed = new view.DOMParser().parseFromString(svg, "image/svg+xml");
  if (parsed.querySelector("parsererror") !== null) return svg;
  let changed = false;
  for (const [nodeId, snapshot] of snapshots) {
    const escaped = nodeId.replace(/["\\]/g, "\\$&");
    const image = parsed.querySelector(`[data-node-id="${escaped}"] image[data-live="true"]`);
    if (image === null) continue;
    image.setAttribute("href", snapshot);
    if (image.hasAttribute("xlink:href") || image.hasAttributeNS(XLINK, "href"))
      image.setAttributeNS(XLINK, "xlink:href", snapshot);
    changed = true;
  }
  return changed ? new view.XMLSerializer().serializeToString(parsed) : svg;
}
