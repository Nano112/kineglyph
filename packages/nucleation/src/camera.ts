/**
 * Nucleation's camera model, ported so the overlay projection and the WebGL render agree with
 * the native renderer's framing: an orbit given by `yaw` / `pitch` (degrees), a `zoom` factor,
 * orthographic or perspective projection, and bounds-based framing (`sphereFit` keeps the framing
 * rotation-invariant, which is what turntables want).
 *
 * Matrices are column-major `Float64Array(16)` in the OpenGL convention (clip = P · V · p), the
 * same layout three.js uses.
 */
import type { Bounds, Vec3 } from "./glb.js";

export interface CameraPose {
  readonly yaw: number;
  readonly pitch: number;
  readonly zoom: number;
  readonly targetOffset: Vec3;
}

export interface CameraConfig {
  /** Degrees, horizontal orbit. */
  readonly yaw: number;
  /** Degrees, elevation. */
  readonly pitch: number;
  /** > 1 magnifies. */
  readonly zoom: number;
  readonly projection: "orthographic" | "perspective";
  /** Vertical field of view in degrees (perspective only). */
  readonly fovDeg: number;
  readonly sphereFit: boolean;
  /** Orbit centre; defaults to the bounds centre. */
  readonly target?: Vec3;
}

/** Nucleation's `RenderConfig::isometric()`: orthographic at yaw 45°, pitch atan(1/√2). */
export const ISOMETRIC: CameraConfig = {
  yaw: 45,
  pitch: 35.264,
  zoom: 1,
  projection: "orthographic",
  fovDeg: 45,
  sphereFit: true,
};

export interface CameraMatrices {
  readonly view: Float64Array;
  readonly projection: Float64Array;
  readonly viewProjection: Float64Array;
  readonly eye: Vec3;
  readonly center: Vec3;
  readonly up: Vec3;
  /** Orthographic half extents (undefined for perspective). */
  readonly ortho?: {
    readonly halfWidth: number;
    readonly halfHeight: number;
    readonly near: number;
    readonly far: number;
  };
  readonly perspective?: { readonly fovDeg: number; readonly near: number; readonly far: number };
}

const DEG = Math.PI / 180;

function normalize(v: Vec3): Vec3 {
  const length = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / length, v[1] / length, v[2] / length];
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function sub(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

/** Column-major multiply `a · b`. */
export function multiply(a: Float64Array, b: Float64Array): Float64Array {
  const out = new Float64Array(16);
  for (let column = 0; column < 4; column += 1) {
    for (let row = 0; row < 4; row += 1) {
      let sum = 0;
      for (let k = 0; k < 4; k += 1) sum += (a[k * 4 + row] ?? 0) * (b[column * 4 + k] ?? 0);
      out[column * 4 + row] = sum;
    }
  }
  return out;
}

export function lookAt(eye: Vec3, center: Vec3, up: Vec3): Float64Array {
  const f = normalize(sub(center, eye));
  const s = normalize(cross(f, up));
  const u = cross(s, f);
  const m = new Float64Array(16);
  m[0] = s[0];
  m[4] = s[1];
  m[8] = s[2];
  m[1] = u[0];
  m[5] = u[1];
  m[9] = u[2];
  m[2] = -f[0];
  m[6] = -f[1];
  m[10] = -f[2];
  m[12] = -dot(s, eye);
  m[13] = -dot(u, eye);
  m[14] = dot(f, eye);
  m[15] = 1;
  return m;
}

export function orthographic(
  left: number,
  right: number,
  bottom: number,
  top: number,
  near: number,
  far: number,
): Float64Array {
  const m = new Float64Array(16);
  m[0] = 2 / (right - left);
  m[5] = 2 / (top - bottom);
  m[10] = -2 / (far - near);
  m[12] = -(right + left) / (right - left);
  m[13] = -(top + bottom) / (top - bottom);
  m[14] = -(far + near) / (far - near);
  m[15] = 1;
  return m;
}

export function perspective(
  fovDeg: number,
  aspect: number,
  near: number,
  far: number,
): Float64Array {
  const f = 1 / Math.tan((fovDeg * DEG) / 2);
  const m = new Float64Array(16);
  m[0] = f / aspect;
  m[5] = f;
  m[10] = (far + near) / (near - far);
  m[11] = -1;
  m[14] = (2 * far * near) / (near - far);
  return m;
}

/** Apply a frame's camera pose on top of a base configuration (yaw/pitch add, zoom multiplies). */
export function withPose(
  camera: CameraConfig,
  pose: CameraPose | undefined,
  bounds: Bounds,
): CameraConfig {
  if (pose === undefined) return camera;
  const base = camera.target ?? centerOf(bounds);
  const offset = pose.targetOffset;
  const target: Vec3 = [base[0] + offset[0], base[1] + offset[1], base[2] + offset[2]];
  return {
    ...camera,
    yaw: camera.yaw + pose.yaw,
    pitch: camera.pitch + pose.pitch,
    zoom: camera.zoom * pose.zoom,
    target,
  };
}

export function centerOf(bounds: Bounds): Vec3 {
  return [
    (bounds.min[0] + bounds.max[0]) / 2,
    (bounds.min[1] + bounds.max[1]) / 2,
    (bounds.min[2] + bounds.max[2]) / 2,
  ];
}

function corners(bounds: Bounds): Vec3[] {
  const { min, max } = bounds;
  return [
    [min[0], min[1], min[2]],
    [max[0], min[1], min[2]],
    [min[0], max[1], min[2]],
    [max[0], max[1], min[2]],
    [min[0], min[1], max[2]],
    [max[0], min[1], max[2]],
    [min[0], max[1], max[2]],
    [max[0], max[1], max[2]],
  ];
}

/** Port of Nucleation's `compute_view_proj`: frame `bounds` for `aspect` with `camera`. */
export function cameraMatrices(
  bounds: Bounds,
  aspect: number,
  camera: CameraConfig,
): CameraMatrices {
  const center = camera.target ?? centerOf(bounds);
  const yaw = camera.yaw * DEG;
  const pitch = camera.pitch * DEG;
  const dir = normalize([
    -(Math.cos(pitch) * Math.sin(yaw)),
    -Math.sin(pitch),
    -(Math.cos(pitch) * Math.cos(yaw)),
  ]);
  const forward = dir;
  const right = normalize(cross(forward, [0, 1, 0]));
  const up = cross(right, forward);
  const box = corners(bounds);
  const safeAspect = aspect > 0 && Number.isFinite(aspect) ? aspect : 1;
  let radius = 0;
  for (const corner of box) {
    const rel = sub(corner, center);
    radius = Math.max(radius, Math.hypot(rel[0], rel[1], rel[2]));
  }

  if (camera.projection === "perspective") {
    const fov = camera.fovDeg * DEG;
    const halfY = fov / 2;
    const halfX = Math.atan(Math.tan(halfY) * safeAspect);
    let distance = 1;
    if (camera.sphereFit) {
      const halfMin = Math.min(halfX, halfY);
      distance = Math.max(1, radius / Math.max(Math.sin(halfMin), 1e-4));
    } else {
      for (const corner of box) {
        const rel = sub(corner, center);
        const projRight = Math.abs(dot(rel, right));
        const projUp = Math.abs(dot(rel, up));
        const depth = -dot(rel, forward);
        distance = Math.max(
          distance,
          projRight / Math.tan(halfX) + depth,
          projUp / Math.tan(halfY) + depth,
        );
      }
    }
    distance /= Math.max(camera.zoom, 1e-3);
    const eye: Vec3 = [
      center[0] - dir[0] * distance,
      center[1] - dir[1] * distance,
      center[2] - dir[2] * distance,
    ];
    const view = lookAt(eye, center, [0, 1, 0]);
    const near = distance * 0.01;
    const far = distance * 10;
    const projection = perspective(camera.fovDeg, safeAspect, near, far);
    return {
      view,
      projection,
      viewProjection: multiply(projection, view),
      eye,
      center,
      up: [0, 1, 0],
      perspective: { fovDeg: camera.fovDeg, near, far },
    };
  }

  let extH = 0;
  let extV = 0;
  let extDepth = 0;
  for (const corner of box) {
    const rel = sub(corner, center);
    extH = Math.max(extH, Math.abs(dot(rel, right)));
    extV = Math.max(extV, Math.abs(dot(rel, up)));
    extDepth = Math.max(extDepth, Math.abs(dot(rel, forward)));
  }
  const fitted = camera.sphereFit
    ? Math.max(radius / Math.min(safeAspect, 1), 0.5)
    : Math.max(Math.max(extV, extH / safeAspect), 0.5);
  const halfHeight = (fitted * 1.1) / Math.max(camera.zoom, 1e-3);
  const halfWidth = halfHeight * safeAspect;
  const standoff = extDepth + extH + extV + 1;
  const eye: Vec3 = [
    center[0] - dir[0] * standoff,
    center[1] - dir[1] * standoff,
    center[2] - dir[2] * standoff,
  ];
  const view = lookAt(eye, center, [0, 1, 0]);
  const near = 0.01;
  const far = standoff * 2 + 1;
  const projection = orthographic(-halfWidth, halfWidth, -halfHeight, halfHeight, near, far);
  return {
    view,
    projection,
    viewProjection: multiply(projection, view),
    eye,
    center,
    up: [0, 1, 0],
    ortho: { halfWidth, halfHeight, near, far },
  };
}

export interface Projected {
  /** Pixels from the viewport's top-left. */
  readonly x: number;
  readonly y: number;
  /** Normalised device depth (−1 near … 1 far). */
  readonly depth: number;
  /** In front of the camera and inside the viewport. */
  readonly visible: boolean;
}

/** World point → viewport pixels through a view-projection matrix. */
export function project(
  viewProjection: Float64Array,
  world: Vec3,
  viewport: { readonly width: number; readonly height: number },
): Projected {
  const m = viewProjection;
  const x = world[0];
  const y = world[1];
  const z = world[2];
  const cx = (m[0] ?? 0) * x + (m[4] ?? 0) * y + (m[8] ?? 0) * z + (m[12] ?? 0);
  const cy = (m[1] ?? 0) * x + (m[5] ?? 0) * y + (m[9] ?? 0) * z + (m[13] ?? 0);
  const cz = (m[2] ?? 0) * x + (m[6] ?? 0) * y + (m[10] ?? 0) * z + (m[14] ?? 0);
  const cw = (m[3] ?? 0) * x + (m[7] ?? 0) * y + (m[11] ?? 0) * z + (m[15] ?? 0);
  if (!(cw > 1e-9)) return { x: NaN, y: NaN, depth: NaN, visible: false };
  const nx = cx / cw;
  const ny = cy / cw;
  const nz = cz / cw;
  const px = (nx * 0.5 + 0.5) * viewport.width;
  const py = (1 - (ny * 0.5 + 0.5)) * viewport.height;
  const visible = nx >= -1 && nx <= 1 && ny >= -1 && ny <= 1 && nz >= -1 && nz <= 1;
  return { x: px, y: py, depth: nz, visible };
}
