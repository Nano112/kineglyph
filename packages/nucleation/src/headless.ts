/**
 * A view without a renderer: the camera maths of `buildSurface` for a given viewport, so anchor
 * frame signals can be computed in Node — for the export CLI, where Nucleation's native renderer
 * supplies the pixels and Kineglyph composites the sheet.
 */
import { ISOMETRIC, cameraMatrices, withPose, type CameraConfig } from "./camera.js";
import type { FrameSource } from "./frame-source.js";
import type { BuildView } from "./surface.js";

export interface HeadlessViewOptions {
  readonly source: FrameSource;
  /** Base camera; the frame's camera track is applied on top (as the surface does). */
  readonly camera?: Partial<CameraConfig>;
  /** Pixel size of the rendered frames the view stands in for. */
  readonly viewport: { readonly width: number; readonly height: number };
}

/** A `view(time)` for `anchorFrameSignals` that mirrors what `buildSurface` would render. */
export function headlessView(options: HeadlessViewOptions): (time: number) => BuildView {
  const base: CameraConfig = { ...ISOMETRIC, ...options.camera };
  const aspect = options.viewport.width / options.viewport.height;
  return (time) => {
    const frame = options.source.frame(time);
    const config = withPose(base, frame.camera, options.source.bounds);
    const matrices = cameraMatrices(options.source.bounds, aspect, config);
    return {
      time: frame.time,
      viewProjection: matrices.viewProjection,
      viewport: options.viewport,
      source: options.source,
    };
  };
}
