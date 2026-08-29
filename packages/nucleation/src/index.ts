export { EMPTY_PATH, anchorFrameSignals, anchorSignalDefaults } from "./anchors.js";
export type { AnchorNote, AnchorSignalsOptions, SheetRect } from "./anchors.js";
export {
  ISOMETRIC,
  cameraMatrices,
  centerOf,
  lookAt,
  multiply,
  orthographic,
  perspective,
  project,
  withPose,
} from "./camera.js";
export type { CameraConfig, CameraMatrices, CameraPose, Projected } from "./camera.js";
export { composeMatrix, fromAnimatedGlb, transformPoint } from "./frame-source.js";
export type { AnchorSample, Frame, FrameSource, Pose } from "./frame-source.js";
export { parseBuildGlb, splitGlb } from "./glb.js";
export type {
  Bounds,
  BuildGlb,
  BuildGlbAnchor,
  BuildGlbGroup,
  BuildGlbNode,
  CameraTrack,
  GlbTrack,
  PoseTrack,
  Quat,
  Vec3,
} from "./glb.js";
export { headlessView } from "./headless.js";
export { clipOutside, leaderPolyline, placedAnchor, placedCount } from "./leaders.js";
export type { Point, Rect } from "./leaders.js";
export type { HeadlessViewOptions } from "./headless.js";
export { fromBuildAnimation } from "./live-source.js";
export type { BuildEngine } from "./live-source.js";
export { buildSurface } from "./surface.js";
export { LeaderOverlay } from "./leader-overlay.js";
export type { LeaderOverlayOptions } from "./leader-overlay.js";
export type { BuildSurface, BuildSurfaceOptions, BuildView, GlbBytes } from "./surface.js";
