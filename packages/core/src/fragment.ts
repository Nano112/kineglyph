/**
 * Scene fragments: reusable, composable pieces of a scene (a compiled chart, a recipe, a group of
 * cards with their connectors and motion). Fragments are plain data; `figure()` and other authoring
 * surfaces flatten them into one `SceneDefinition`, scoping ids so fragments can be reused.
 */
import type { TimelineTrack } from "./resolved.js";
import type {
  EdgeDefinition,
  GroupNode,
  SceneControl,
  SceneDiagnostic,
  SceneNode,
} from "./scene.js";

export interface SceneFragment {
  /** Top-level nodes contributed by the fragment, in document order. */
  readonly nodes: readonly SceneNode[];
  readonly edges?: readonly EdgeDefinition[];
  /** Motion with times relative to the fragment's own t = 0. */
  readonly tracks?: readonly TimelineTrack[];
  readonly controls?: readonly SceneControl[];
  /** Accessible summary of what the fragment shows. */
  readonly summary?: string;
  readonly diagnostics?: readonly SceneDiagnostic[];
}

/** Rewrites an id inside a fragment namespace: `${prefix}:${id}` unless already scoped. */
export function scopeId(prefix: string, id: string): string {
  if (prefix.length === 0) return id;
  return id.startsWith(`${prefix}:`) ? id : `${prefix}:${id}`;
}

function scopeNode(node: SceneNode, prefix: string): SceneNode {
  const scoped = { ...node, id: scopeId(prefix, node.id) };
  if (scoped.type === "group") {
    const group: GroupNode = {
      ...scoped,
      children: scoped.children.map((child) => scopeNode(child, prefix)),
    };
    return group;
  }
  if (scoped.type === "legend")
    return {
      ...scoped,
      items: scoped.items.map((item) => ({ ...item, id: scopeId(prefix, item.id) })),
    };
  return scoped;
}

/** Namespaces every node, edge, track, and control id in a fragment. */
export function scopeFragment(fragment: SceneFragment, prefix: string): SceneFragment {
  if (prefix.length === 0) return fragment;
  return {
    ...fragment,
    nodes: fragment.nodes.map((node) => scopeNode(node, prefix)),
    ...(fragment.edges === undefined
      ? {}
      : {
          edges: fragment.edges.map((edge) => ({
            ...edge,
            id: scopeId(prefix, edge.id),
            ...(edge.labels === undefined
              ? {}
              : {
                  labels: edge.labels.map((label) =>
                    label.id === undefined ? label : { ...label, id: scopeId(prefix, label.id) },
                  ),
                }),
            from:
              typeof edge.from === "string"
                ? scopeId(prefix, edge.from)
                : { ...edge.from, node: scopeId(prefix, edge.from.node) },
            to:
              typeof edge.to === "string"
                ? scopeId(prefix, edge.to)
                : { ...edge.to, node: scopeId(prefix, edge.to.node) },
          })),
        }),
    ...(fragment.tracks === undefined
      ? {}
      : {
          tracks: fragment.tracks.map((track) => ({
            ...track,
            id: scopeId(prefix, track.id),
            target: scopeId(prefix, track.target),
          })),
        }),
    ...(fragment.controls === undefined
      ? {}
      : {
          controls: fragment.controls.map((control) => ({
            ...control,
            id: scopeId(prefix, control.id),
          })),
        }),
    ...(fragment.diagnostics === undefined
      ? {}
      : {
          diagnostics: fragment.diagnostics.map((entry) =>
            entry.path === undefined ? entry : { ...entry, path: scopeId(prefix, entry.path) },
          ),
        }),
  };
}

/** Shifts every keyframe of the tracks by `offset` milliseconds. */
export function shiftTracks(
  tracks: readonly TimelineTrack[],
  offset: number,
): readonly TimelineTrack[] {
  if (offset === 0) return tracks;
  return tracks.map((track) => ({
    ...track,
    keyframes: track.keyframes.map((frame) => ({ ...frame, time: frame.time + offset })),
  }));
}

/** Last keyframe time across tracks (the fragment's motion length). */
export function tracksDuration(tracks: readonly TimelineTrack[] | undefined): number {
  let last = 0;
  for (const track of tracks ?? [])
    for (const frame of track.keyframes) last = Math.max(last, frame.time);
  return last;
}

/** Concatenates fragments; ids must already be distinct (use `scopeFragment`). */
export function mergeFragments(...fragments: readonly SceneFragment[]): SceneFragment {
  return {
    nodes: fragments.flatMap((fragment) => fragment.nodes),
    edges: fragments.flatMap((fragment) => fragment.edges ?? []),
    tracks: fragments.flatMap((fragment) => fragment.tracks ?? []),
    controls: fragments.flatMap((fragment) => fragment.controls ?? []),
    diagnostics: fragments.flatMap((fragment) => fragment.diagnostics ?? []),
    summary: fragments
      .map((fragment) => fragment.summary)
      .filter((value): value is string => typeof value === "string" && value.length > 0)
      .join(" "),
  };
}

/** Collects every node id in a fragment (depth-first). */
export function fragmentNodeIds(fragment: SceneFragment): string[] {
  const ids: string[] = [];
  const visit = (node: SceneNode): void => {
    ids.push(node.id);
    if (node.type === "group") node.children.forEach(visit);
  };
  fragment.nodes.forEach(visit);
  return ids;
}
