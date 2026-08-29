import type { Vec3 } from "./glb.js";

/** Column lengths of a column-major affine matrix — the scale it applies per axis. */
export function decomposeScale(m: Float64Array): Vec3 {
  const length = (c: number): number =>
    Math.hypot(m[c * 4] ?? 0, m[c * 4 + 1] ?? 0, m[c * 4 + 2] ?? 0);
  return [length(0), length(1), length(2)];
}
