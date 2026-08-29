/**
 * A time-indexed view of a build: `frame(t)` samples every group's pose (its column-major model
 * matrix plus opacity / tint / emissive), every anchor's world position, and the camera pose —
 * the same shape Nucleation's `frameJson(t)` reports, so a source backed by the live WASM engine
 * (a later phase) is interchangeable with one backed by an animated GLB.
 */
import type { CameraPose } from "./camera.js";
import {
  parseBuildGlb,
  type Bounds,
  type BuildGlb,
  type GlbTrack,
  type Quat,
  type Vec3,
} from "./glb.js";

export interface Pose {
  /** Column-major model matrix (16 numbers). */
  readonly matrix: Float64Array;
  readonly translation: Vec3;
  readonly rotation: Quat;
  readonly scale: Vec3;
  readonly opacity: number;
  readonly tint: readonly [number, number, number, number];
  readonly emissive: readonly [number, number, number, number];
}

export interface AnchorSample {
  readonly name: string;
  readonly group: number;
  readonly world: Vec3;
  readonly opacity: number;
}

export interface Frame {
  readonly time: number;
  readonly poses: ReadonlyMap<number, Pose>;
  readonly anchors: readonly AnchorSample[];
  readonly camera: CameraPose | undefined;
}

export interface FrameSource {
  readonly name: string;
  readonly durationMs: number;
  readonly groups: number;
  readonly anchors: readonly { readonly name: string; readonly group: number }[];
  readonly bounds: Bounds;
  frame(timeMs: number): Frame;
}

function segment(
  times: ArrayLike<number>,
  t: number,
): { readonly index: number; readonly mix: number } {
  const count = times.length;
  if (count === 0) return { index: 0, mix: 0 };
  const first = times[0] ?? 0;
  const last = times[count - 1] ?? first;
  if (t <= first || count === 1) return { index: 0, mix: 0 };
  if (t >= last) return { index: count - 1, mix: 0 };
  let low = 0;
  let high = count - 1;
  while (high - low > 1) {
    const mid = (low + high) >> 1;
    if ((times[mid] ?? 0) <= t) low = mid;
    else high = mid;
  }
  const a = times[low] ?? 0;
  const b = times[high] ?? a;
  const mix = b > a ? (t - a) / (b - a) : 0;
  return { index: low, mix };
}

function sampleVec3(track: GlbTrack | undefined, rest: Vec3, seconds: number): Vec3 {
  if (track === undefined || track.times.length === 0) return rest;
  const { index, mix } = segment(track.times, seconds);
  const at = (i: number, c: number): number => track.values[i * 3 + c] ?? 0;
  if (mix === 0 || track.interpolation === "STEP")
    return [at(index, 0), at(index, 1), at(index, 2)];
  const next = index + 1;
  return [
    at(index, 0) + (at(next, 0) - at(index, 0)) * mix,
    at(index, 1) + (at(next, 1) - at(index, 1)) * mix,
    at(index, 2) + (at(next, 2) - at(index, 2)) * mix,
  ];
}

function slerp(a: Quat, b: Quat, mix: number): Quat {
  let cosine = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
  let bx = b[0];
  let by = b[1];
  let bz = b[2];
  let bw = b[3];
  if (cosine < 0) {
    cosine = -cosine;
    bx = -bx;
    by = -by;
    bz = -bz;
    bw = -bw;
  }
  let ka = 1 - mix;
  let kb = mix;
  if (cosine < 0.9995) {
    const angle = Math.acos(Math.min(1, cosine));
    const sine = Math.sin(angle);
    ka = Math.sin((1 - mix) * angle) / sine;
    kb = Math.sin(mix * angle) / sine;
  }
  const x = ka * a[0] + kb * bx;
  const y = ka * a[1] + kb * by;
  const z = ka * a[2] + kb * bz;
  const w = ka * a[3] + kb * bw;
  const length = Math.hypot(x, y, z, w) || 1;
  return [x / length, y / length, z / length, w / length];
}

function sampleQuat(track: GlbTrack | undefined, rest: Quat, seconds: number): Quat {
  if (track === undefined || track.times.length === 0) return rest;
  const { index, mix } = segment(track.times, seconds);
  const at = (i: number): Quat => [
    track.values[i * 4] ?? 0,
    track.values[i * 4 + 1] ?? 0,
    track.values[i * 4 + 2] ?? 0,
    track.values[i * 4 + 3] ?? 1,
  ];
  if (mix === 0 || track.interpolation === "STEP") return at(index);
  return slerp(at(index), at(index + 1), mix);
}

function sampleScalarList(
  times: readonly number[],
  values: readonly number[],
  seconds: number,
  rest: number,
): number {
  if (times.length === 0 || values.length === 0) return rest;
  const { index, mix } = segment(times, seconds);
  const a = values[index] ?? rest;
  const b = values[index + 1] ?? a;
  return a + (b - a) * mix;
}

function sampleVectorList(
  times: readonly number[],
  values: readonly (readonly number[])[],
  seconds: number,
  rest: readonly [number, number, number, number],
): readonly [number, number, number, number] {
  if (times.length === 0 || values.length === 0) return rest;
  const { index, mix } = segment(times, seconds);
  const a = values[index] ?? rest;
  const b = values[index + 1] ?? a;
  const at = (list: readonly number[], c: number): number => list[c] ?? rest[c] ?? 0;
  return [
    at(a, 0) + (at(b, 0) - at(a, 0)) * mix,
    at(a, 1) + (at(b, 1) - at(a, 1)) * mix,
    at(a, 2) + (at(b, 2) - at(a, 2)) * mix,
    at(a, 3) + (at(b, 3) - at(a, 3)) * mix,
  ];
}

/** Column-major T · R · S. */
export function composeMatrix(translation: Vec3, rotation: Quat, scale: Vec3): Float64Array {
  const [x, y, z, w] = rotation;
  const xx = x * x;
  const yy = y * y;
  const zz = z * z;
  const xy = x * y;
  const xz = x * z;
  const yz = y * z;
  const wx = w * x;
  const wy = w * y;
  const wz = w * z;
  const [sx, sy, sz] = scale;
  const m = new Float64Array(16);
  m[0] = (1 - 2 * (yy + zz)) * sx;
  m[1] = 2 * (xy + wz) * sx;
  m[2] = 2 * (xz - wy) * sx;
  m[4] = 2 * (xy - wz) * sy;
  m[5] = (1 - 2 * (xx + zz)) * sy;
  m[6] = 2 * (yz + wx) * sy;
  m[8] = 2 * (xz + wy) * sz;
  m[9] = 2 * (yz - wx) * sz;
  m[10] = (1 - 2 * (xx + yy)) * sz;
  m[12] = translation[0];
  m[13] = translation[1];
  m[14] = translation[2];
  m[15] = 1;
  return m;
}

/** Transform a point by a column-major matrix. */
export function transformPoint(m: Float64Array, p: Vec3): Vec3 {
  const x = p[0];
  const y = p[1];
  const z = p[2];
  return [
    (m[0] ?? 0) * x + (m[4] ?? 0) * y + (m[8] ?? 0) * z + (m[12] ?? 0),
    (m[1] ?? 0) * x + (m[5] ?? 0) * y + (m[9] ?? 0) * z + (m[13] ?? 0),
    (m[2] ?? 0) * x + (m[6] ?? 0) * y + (m[10] ?? 0) * z + (m[14] ?? 0),
  ];
}

/** A frame source backed by an animated build GLB (bytes or an already parsed document). */
export function fromAnimatedGlb(input: BuildGlb | Uint8Array | ArrayBuffer): FrameSource {
  const glb = "groups" in input ? input : parseBuildGlb(input);
  const anchors = glb.anchors.map((anchor) => ({ name: anchor.anchor, group: anchor.group }));
  return {
    name: glb.name,
    durationMs: glb.durationMs,
    groups: glb.groups.length,
    anchors,
    bounds: glb.bounds,
    frame(timeMs: number): Frame {
      const clamped = Math.min(Math.max(0, timeMs), glb.durationMs);
      const seconds = clamped / 1000;
      const poses = new Map<number, Pose>();
      const samples: AnchorSample[] = [];
      for (const group of glb.groups) {
        const translation = sampleVec3(group.tracks.translation, group.translation, seconds);
        const rotation = sampleQuat(group.tracks.rotation, group.rotation, seconds);
        const scale = sampleVec3(group.tracks.scale, group.scale, seconds);
        const matrix = composeMatrix(translation, rotation, scale);
        const pose: Pose = {
          matrix,
          translation,
          rotation,
          scale,
          opacity:
            group.poseTrack === undefined
              ? 1
              : sampleScalarList(group.poseTrack.times, group.poseTrack.opacity, seconds, 1),
          tint:
            group.poseTrack === undefined
              ? [1, 1, 1, 1]
              : sampleVectorList(
                  group.poseTrack.times,
                  group.poseTrack.tint,
                  seconds,
                  [1, 1, 1, 1],
                ),
          emissive:
            group.poseTrack === undefined
              ? [0, 0, 0, 0]
              : sampleVectorList(
                  group.poseTrack.times,
                  group.poseTrack.emissive,
                  seconds,
                  [0, 0, 0, 0],
                ),
        };
        poses.set(group.group, pose);
        for (const anchor of group.anchors)
          samples.push({
            name: anchor.anchor,
            group: group.group,
            world: transformPoint(matrix, anchor.translation),
            opacity: pose.opacity,
          });
      }
      const track = glb.camera;
      const camera: CameraPose | undefined =
        track === undefined || track.times.length === 0
          ? undefined
          : {
              yaw: sampleScalarList(track.times, track.yaw, seconds, 0),
              pitch: sampleScalarList(track.times, track.pitch, seconds, 0),
              zoom: sampleScalarList(track.times, track.zoom, seconds, 1),
              targetOffset: (() => {
                const v = sampleVectorList(
                  track.times,
                  track.targetOffset.map((o) => [o[0] ?? 0, o[1] ?? 0, o[2] ?? 0, 0]),
                  seconds,
                  [0, 0, 0, 0],
                );
                return [v[0], v[1], v[2]] as Vec3;
              })(),
            };
      return { time: clamped, poses, anchors: samples, camera };
    },
  };
}
