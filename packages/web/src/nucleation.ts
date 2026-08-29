import type * as Nucleation from "@kineglyph/nucleation";

let pending: Promise<typeof Nucleation> | undefined;

/**
 * Loads `@kineglyph/nucleation` on demand. It carries three.js, so it is imported only when a
 * page mounts a build surface; the module is shared once loaded.
 */
export function loadBuildSurface(): Promise<typeof Nucleation> {
  pending ??= import("@kineglyph/nucleation");
  return pending;
}
