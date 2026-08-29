/**
 * Reader for the animated build GLB that Nucleation's `BuildAnimation.toAnimatedGlbB64` writes.
 *
 * Node convention (Nucleation's public contract, `docs/features/animation.md` "Animated GLB"):
 * root `build:<name>` → children `group:<id>` (textured meshes with translation / rotation /
 * scale tracks) → children `anchor:<name>` (empty nodes). `extras.nucleation` carries what glTF
 * cannot animate: opacity / tint / emissive tracks per group and the camera track on the root.
 *
 * Only what the frame source needs is read — FLOAT accessors, node transforms, the first
 * animation, the extras — so this file has no dependency on three.js and runs in Node.
 */

export type Vec3 = readonly [number, number, number];
export type Quat = readonly [number, number, number, number];

export interface GlbTrack {
  /** Seconds. */
  readonly times: Float32Array;
  /** `stride` floats per key. */
  readonly values: Float32Array;
  readonly stride: 3 | 4;
  readonly interpolation: "LINEAR" | "STEP";
}

export interface PoseTrack {
  readonly times: readonly number[];
  readonly opacity: readonly number[];
  readonly tint: readonly (readonly number[])[];
  readonly emissive: readonly (readonly number[])[];
}

export interface CameraTrack {
  readonly times: readonly number[];
  readonly yaw: readonly number[];
  readonly pitch: readonly number[];
  readonly zoom: readonly number[];
  readonly targetOffset: readonly (readonly number[])[];
}

export interface BuildGlbNode {
  readonly index: number;
  readonly name: string;
  readonly parent: number | undefined;
  readonly children: readonly number[];
  readonly translation: Vec3;
  readonly rotation: Quat;
  readonly scale: Vec3;
  readonly mesh: number | undefined;
  readonly extras: Readonly<Record<string, unknown>> | undefined;
  readonly tracks: {
    readonly translation?: GlbTrack;
    readonly rotation?: GlbTrack;
    readonly scale?: GlbTrack;
  };
}

export interface BuildGlbGroup extends BuildGlbNode {
  readonly group: number;
  readonly blocks: number;
  readonly poseTrack: PoseTrack | undefined;
  readonly anchors: readonly BuildGlbAnchor[];
}

export interface BuildGlbAnchor extends BuildGlbNode {
  readonly anchor: string;
  readonly group: number;
}

export interface Bounds {
  readonly min: Vec3;
  readonly max: Vec3;
}

export interface BuildGlb {
  readonly name: string;
  readonly bytes: Uint8Array;
  readonly json: Readonly<Record<string, unknown>>;
  readonly binary: Uint8Array;
  readonly root: BuildGlbNode;
  readonly nodes: readonly BuildGlbNode[];
  readonly groups: readonly BuildGlbGroup[];
  readonly anchors: readonly BuildGlbAnchor[];
  readonly durationMs: number;
  readonly fps: number;
  readonly camera: CameraTrack | undefined;
  readonly bounds: Bounds;
}

interface GltfAccessor {
  readonly bufferView?: number;
  readonly byteOffset?: number;
  readonly componentType: number;
  readonly count: number;
  readonly type: string;
  readonly min?: readonly number[];
  readonly max?: readonly number[];
}

interface GltfBufferView {
  readonly byteOffset?: number;
  readonly byteLength: number;
  readonly byteStride?: number;
}

interface GltfNode {
  readonly name?: string;
  readonly children?: readonly number[];
  readonly translation?: readonly number[];
  readonly rotation?: readonly number[];
  readonly scale?: readonly number[];
  readonly mesh?: number;
  readonly extras?: Readonly<Record<string, unknown>>;
}

interface GltfAnimation {
  readonly name?: string;
  readonly channels: readonly {
    readonly sampler: number;
    readonly target: { readonly node?: number; readonly path: string };
  }[];
  readonly samplers: readonly {
    readonly input: number;
    readonly output: number;
    readonly interpolation?: string;
  }[];
}

interface GltfJson {
  readonly accessors?: readonly GltfAccessor[];
  readonly bufferViews?: readonly GltfBufferView[];
  readonly nodes?: readonly GltfNode[];
  readonly meshes?: readonly {
    readonly primitives: readonly { readonly attributes: Readonly<Record<string, number>> }[];
  }[];
  readonly animations?: readonly GltfAnimation[];
  readonly scenes?: readonly { readonly nodes?: readonly number[] }[];
}

const GLB_MAGIC = 0x46546c67; // "glTF"
const CHUNK_JSON = 0x4e4f534a;
const CHUNK_BIN = 0x004e4942;
const FLOAT = 5126;
const COMPONENTS: Readonly<Record<string, number>> = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };

function toBytes(input: Uint8Array | ArrayBuffer): Uint8Array {
  return input instanceof Uint8Array ? input : new Uint8Array(input);
}

/** Split a GLB container into its JSON document and binary chunk. */
export function splitGlb(input: Uint8Array | ArrayBuffer): {
  readonly json: Readonly<Record<string, unknown>>;
  readonly binary: Uint8Array;
} {
  const bytes = toBytes(input);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.byteLength < 20 || view.getUint32(0, true) !== GLB_MAGIC)
    throw new Error("not a GLB container");
  if (view.getUint32(4, true) !== 2) throw new Error("unsupported GLB version");
  const total = view.getUint32(8, true);
  if (total > bytes.byteLength) throw new Error("truncated GLB");
  let offset = 12;
  let json: Readonly<Record<string, unknown>> | undefined;
  let binary: Uint8Array | undefined;
  while (offset + 8 <= total) {
    const length = view.getUint32(offset, true);
    const type = view.getUint32(offset + 4, true);
    const chunk = bytes.subarray(offset + 8, offset + 8 + length);
    if (type === CHUNK_JSON)
      json = JSON.parse(new TextDecoder().decode(chunk)) as Readonly<Record<string, unknown>>;
    else if (type === CHUNK_BIN) binary = chunk;
    offset += 8 + length;
  }
  if (json === undefined) throw new Error("GLB has no JSON chunk");
  return { json, binary: binary ?? new Uint8Array(0) };
}

function readFloats(doc: GltfJson, binary: Uint8Array, accessorIndex: number): Float32Array {
  const accessor = doc.accessors?.[accessorIndex];
  if (accessor === undefined) throw new Error(`accessor ${accessorIndex} missing`);
  if (accessor.componentType !== FLOAT)
    throw new Error(`accessor ${accessorIndex}: only FLOAT accessors are read`);
  const components = COMPONENTS[accessor.type];
  if (components === undefined) throw new Error(`accessor ${accessorIndex}: type ${accessor.type}`);
  const out = new Float32Array(accessor.count * components);
  if (accessor.bufferView === undefined) return out;
  const bufferView = doc.bufferViews?.[accessor.bufferView];
  if (bufferView === undefined) throw new Error(`bufferView ${accessor.bufferView} missing`);
  const stride = bufferView.byteStride ?? components * 4;
  const base = (bufferView.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  const view = new DataView(binary.buffer, binary.byteOffset, binary.byteLength);
  for (let i = 0; i < accessor.count; i += 1) {
    const at = base + i * stride;
    for (let c = 0; c < components; c += 1)
      out[i * components + c] = view.getFloat32(at + c * 4, true);
  }
  return out;
}

function numberArray(value: unknown, fallback: readonly number[]): readonly number[] {
  return Array.isArray(value) && value.every((v): v is number => typeof v === "number")
    ? value
    : fallback;
}

function record(value: unknown): Readonly<Record<string, unknown>> | undefined {
  return typeof value === "object" && value !== null
    ? (value as Readonly<Record<string, unknown>>)
    : undefined;
}

function numberList(value: unknown): readonly number[] {
  return Array.isArray(value) ? value.map((v) => Number(v)) : [];
}

function vectorList(value: unknown): readonly (readonly number[])[] {
  return Array.isArray(value) ? value.map((v) => numberList(v)) : [];
}

/** Parse a build GLB into its named nodes, tracks, anchors, and Nucleation extras. */
export function parseBuildGlb(input: Uint8Array | ArrayBuffer): BuildGlb {
  const bytes = toBytes(input);
  const { json, binary } = splitGlb(bytes);
  const doc = json as unknown as GltfJson;
  const gltfNodes = doc.nodes ?? [];
  const parents = new Map<number, number>();
  gltfNodes.forEach((node, index) => {
    for (const child of node.children ?? []) parents.set(child, index);
  });

  const tracks = new Map<
    number,
    { translation?: GlbTrack; rotation?: GlbTrack; scale?: GlbTrack }
  >();
  const animation = doc.animations?.[0];
  let maxTime = 0;
  if (animation !== undefined) {
    for (const channel of animation.channels) {
      const sampler = animation.samplers[channel.sampler];
      const target = channel.target.node;
      if (sampler === undefined || target === undefined) continue;
      const path = channel.target.path;
      if (path !== "translation" && path !== "rotation" && path !== "scale") continue;
      const times = readFloats(doc, binary, sampler.input);
      const values = readFloats(doc, binary, sampler.output);
      const track: GlbTrack = {
        times,
        values,
        stride: path === "rotation" ? 4 : 3,
        interpolation: sampler.interpolation === "STEP" ? "STEP" : "LINEAR",
      };
      const entry = tracks.get(target) ?? {};
      entry[path] = track;
      tracks.set(target, entry);
      if (times.length > 0) maxTime = Math.max(maxTime, times[times.length - 1] ?? 0);
    }
  }

  const nodes: BuildGlbNode[] = gltfNodes.map((node, index) => ({
    index,
    name: node.name ?? "",
    parent: parents.get(index),
    children: node.children ?? [],
    translation: numberArray(node.translation, [0, 0, 0]) as unknown as Vec3,
    rotation: numberArray(node.rotation, [0, 0, 0, 1]) as unknown as Quat,
    scale: numberArray(node.scale, [1, 1, 1]) as unknown as Vec3,
    mesh: node.mesh,
    extras: node.extras,
    tracks: tracks.get(index) ?? {},
  }));

  const sceneRoots = doc.scenes?.[0]?.nodes ?? [0];
  const rootIndex = sceneRoots[0] ?? 0;
  const root = nodes[rootIndex];
  if (root === undefined || !root.name.startsWith("build:"))
    throw new Error("not a Nucleation build GLB: the scene root must be named build:<name>");
  const name = root.name.slice("build:".length);
  const rootExtras = record(record(root.extras)?.nucleation);

  const anchors: BuildGlbAnchor[] = [];
  const groups: BuildGlbGroup[] = [];
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (const childIndex of root.children) {
    const node = nodes[childIndex];
    if (node === undefined || !node.name.startsWith("group:")) continue;
    const extras = record(record(node.extras)?.nucleation);
    const group = Number(extras?.group ?? node.name.slice("group:".length));
    const groupAnchors: BuildGlbAnchor[] = [];
    for (const anchorIndex of node.children) {
      const anchorNode = nodes[anchorIndex];
      if (anchorNode === undefined || !anchorNode.name.startsWith("anchor:")) continue;
      const anchorExtras = record(record(anchorNode.extras)?.nucleation);
      const anchor: BuildGlbAnchor = {
        ...anchorNode,
        anchor:
          typeof anchorExtras?.anchor === "string"
            ? anchorExtras.anchor
            : anchorNode.name.slice("anchor:".length),
        group,
      };
      groupAnchors.push(anchor);
      anchors.push(anchor);
    }
    const poseRecord = record(extras?.poseTrack);
    const poseTrack: PoseTrack | undefined =
      poseRecord === undefined
        ? undefined
        : {
            times: numberList(poseRecord.times),
            opacity: numberList(poseRecord.opacity),
            tint: vectorList(poseRecord.tint),
            emissive: vectorList(poseRecord.emissive),
          };
    if (node.mesh !== undefined) {
      const position = doc.meshes?.[node.mesh]?.primitives[0]?.attributes.POSITION;
      const accessor = position === undefined ? undefined : doc.accessors?.[position];
      if (accessor?.min !== undefined && accessor.max !== undefined) {
        for (let i = 0; i < 3; i += 1) {
          const lo = min[i] ?? Infinity;
          const hi = max[i] ?? -Infinity;
          min[i] = Math.min(lo, accessor.min[i] ?? lo);
          max[i] = Math.max(hi, accessor.max[i] ?? hi);
        }
      }
    }
    groups.push({
      ...node,
      group,
      blocks: Number(extras?.blocks ?? 0),
      poseTrack,
      anchors: groupAnchors,
    });
  }
  groups.sort((a, b) => a.group - b.group);

  const cameraRecord = record(rootExtras?.camera);
  const camera: CameraTrack | undefined =
    cameraRecord === undefined
      ? undefined
      : {
          times: numberList(cameraRecord.times),
          yaw: numberList(cameraRecord.yaw),
          pitch: numberList(cameraRecord.pitch),
          zoom: numberList(cameraRecord.zoom),
          targetOffset: vectorList(cameraRecord.targetOffset),
        };
  const durationMs = Number(rootExtras?.durationMs ?? maxTime * 1000);
  const fps = Number(rootExtras?.fps ?? 30);
  const bounds: Bounds =
    Number.isFinite(min[0]) && Number.isFinite(max[0])
      ? { min: [min[0], min[1], min[2]], max: [max[0], max[1], max[2]] }
      : { min: [0, 0, 0], max: [1, 1, 1] };
  return {
    name,
    bytes,
    json,
    binary,
    root,
    nodes,
    groups,
    anchors,
    durationMs: Number.isFinite(durationMs) ? durationMs : 0,
    fps: Number.isFinite(fps) && fps > 0 ? fps : 30,
    camera,
    bounds,
  };
}
