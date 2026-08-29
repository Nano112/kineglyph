/**
 * A frame source backed by a live build-animation engine — Nucleation's `BuildAnimation` in
 * WASM, or anything with the same four methods. Poses come straight from `frameJson(t)`, so
 * they are exact (no keyframe sampling) and carry opacity / tint / emissive; the GLB is still
 * needed for meshes and bounds. The package does not import the engine: it is duck-typed.
 */
import type { CameraPose } from "./camera.js";
import type { AnchorSample, Frame, FrameSource, Pose } from "./frame-source.js";
import type { BuildGlb, Quat, Vec3 } from "./glb.js";
import { decomposeScale } from "./matrix.js";

/** The subset of Nucleation's `BuildAnimation` a live source needs. */
export interface BuildEngine {
  frameJson(timeMs: number): string;
  durationMs(): number;
  groupCount(): number;
  anchorsJson(): string;
}

interface EnginePose {
  readonly matrix?: readonly (readonly number[])[];
  readonly translate?: readonly number[];
  readonly rotate_deg?: readonly number[];
  readonly scale?: readonly number[];
  readonly opacity?: number;
  readonly tint?: readonly number[];
  readonly emissive?: readonly number[];
}

interface EngineFrame {
  readonly time_ms?: number;
  readonly poses?: readonly (readonly [number, EnginePose])[];
  readonly anchors?: readonly {
    readonly name: string;
    readonly group: number;
    readonly world: readonly number[];
    readonly opacity: number;
  }[];
  readonly camera?: {
    readonly yaw: number;
    readonly pitch: number;
    readonly zoom: number;
    readonly target_offset?: readonly number[];
  } | null;
}

function vec3(value: readonly number[] | undefined, rest: Vec3): Vec3 {
  return value === undefined || value.length < 3
    ? rest
    : [value[0] ?? rest[0], value[1] ?? rest[1], value[2] ?? rest[2]];
}

function vec4(
  value: readonly number[] | undefined,
  rest: readonly [number, number, number, number],
): readonly [number, number, number, number] {
  return value === undefined || value.length < 4
    ? rest
    : [value[0] ?? rest[0], value[1] ?? rest[1], value[2] ?? rest[2], value[3] ?? rest[3]];
}

function matrixOf(pose: EnginePose): Float64Array {
  const m = new Float64Array(16);
  const columns = pose.matrix;
  if (columns !== undefined && columns.length === 4) {
    columns.forEach((column, c) => {
      for (let r = 0; r < 4; r += 1) m[c * 4 + r] = column[r] ?? (c === r ? 1 : 0);
    });
    return m;
  }
  m[0] = 1;
  m[5] = 1;
  m[10] = 1;
  m[15] = 1;
  return m;
}

/** A frame source over a live engine; `glb` supplies bounds and the anchor list. */
export function fromBuildAnimation(engine: BuildEngine, glb: BuildGlb): FrameSource {
  const declared = JSON.parse(engine.anchorsJson()) as readonly {
    readonly name: string;
    readonly group: number;
  }[];
  const anchors = declared.map((anchor) => ({ name: anchor.name, group: anchor.group }));
  const durationMs = engine.durationMs();
  return {
    name: glb.name,
    durationMs,
    groups: engine.groupCount(),
    anchors,
    bounds: glb.bounds,
    frame(timeMs: number): Frame {
      const clamped = Math.min(Math.max(0, timeMs), durationMs);
      const raw = JSON.parse(engine.frameJson(clamped)) as EngineFrame;
      const poses = new Map<number, Pose>();
      for (const [group, pose] of raw.poses ?? []) {
        const matrix = matrixOf(pose);
        const scale =
          pose.scale === undefined ? decomposeScale(matrix) : vec3(pose.scale, [1, 1, 1]);
        poses.set(group, {
          matrix,
          translation: [matrix[12] ?? 0, matrix[13] ?? 0, matrix[14] ?? 0],
          rotation: [0, 0, 0, 1] as Quat,
          scale,
          opacity: pose.opacity ?? 1,
          tint: vec4(pose.tint, [1, 1, 1, 1]),
          emissive: vec4(pose.emissive, [0, 0, 0, 0]),
        });
      }
      const samples: AnchorSample[] = (raw.anchors ?? []).map((anchor) => ({
        name: anchor.name,
        group: anchor.group,
        world: vec3(anchor.world, [0, 0, 0]),
        opacity: anchor.opacity,
      }));
      const camera: CameraPose | undefined =
        raw.camera === undefined || raw.camera === null
          ? undefined
          : {
              yaw: raw.camera.yaw,
              pitch: raw.camera.pitch,
              zoom: raw.camera.zoom,
              targetOffset: vec3(raw.camera.target_offset, [0, 0, 0]),
            };
      return { time: clamped, poses, anchors: samples, camera };
    },
  };
}
