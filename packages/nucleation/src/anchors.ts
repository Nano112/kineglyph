/**
 * Anchors → Kineglyph frame signals.
 *
 * For a time `t`, every anchor's world position (from the frame source) is projected through the
 * surface's last view and mapped into sheet space, so a `drafting.callout` leader bound to
 * `leader.<name>` lands on the block it points at, and `anchor.<name>.visible` fades the note in
 * once the block is there. Pure and time-indexed: playback and exported frames agree.
 */
import { drafting, type Variables } from "@kineglyph/core";
import { project } from "./camera.js";
import type { FrameSource } from "./frame-source.js";
import type { BuildView } from "./surface.js";

export interface AnchorNote {
  /** Anchor name as recorded in the build. */
  readonly anchor: string;
  /** Sheet-space position of the note's head line (what `drafting.callout` was given). */
  readonly x: number;
  readonly y: number;
  /** The callout's anchor side; the leader leaves the note from the opposite edge. */
  readonly side?: "top-left" | "top-right";
}

export interface SheetRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface AnchorSignalsOptions {
  /** The surface's last view; undefined until it has rendered. */
  readonly view: () => BuildView | undefined;
  /** Fallback frame source before the surface has rendered (or without a surface). */
  readonly source?: () => FrameSource | undefined;
  /** The surface node's rectangle in sheet units. */
  readonly frame: SheetRect;
  readonly notes: readonly AnchorNote[];
  /** Below this pose opacity or scale the anchor counts as not there yet. Default 0.5. */
  readonly threshold?: number;
}

export interface AnchorSignals extends Variables {
  readonly placed: number;
  readonly groups: number;
}

/** Sheet-space signals for every anchor note, as a `frameSignals` function. */
export function anchorFrameSignals(options: AnchorSignalsOptions): (time: number) => Variables {
  const threshold = options.threshold ?? 0.5;
  const leaders = options.notes.map((note) => ({
    note,
    leader: drafting.calloutLeader(note.x, note.y, note.side ?? "top-left"),
  }));
  const hidden = (): Variables => {
    const out: Record<string, number | string> = { placed: 0, groups: 0 };
    for (const { note } of leaders) {
      out[`leader.${note.anchor}`] = "";
      out[`anchor.${note.anchor}.x`] = 0;
      out[`anchor.${note.anchor}.y`] = 0;
      out[`anchor.${note.anchor}.visible`] = 0;
    }
    return out;
  };
  return (time) => {
    const view = options.view();
    const source = view?.source ?? options.source?.();
    if (source === undefined) return hidden();
    const frame = source.frame(time);
    const out: Record<string, number | string> = { groups: source.groups, placed: 0 };
    let placed = 0;
    for (const pose of frame.poses.values()) {
      const scale = Math.min(
        Math.abs(pose.scale[0]),
        Math.abs(pose.scale[1]),
        Math.abs(pose.scale[2]),
      );
      if (pose.opacity >= 0.99 && scale >= 0.99) placed += 1;
    }
    out.placed = placed;
    for (const { note, leader } of leaders) {
      const sample = frame.anchors.find((anchor) => anchor.name === note.anchor);
      const pose = sample === undefined ? undefined : frame.poses.get(sample.group);
      const scale =
        pose === undefined
          ? 0
          : Math.min(Math.abs(pose.scale[0]), Math.abs(pose.scale[1]), Math.abs(pose.scale[2]));
      let visible = false;
      let sx = 0;
      let sy = 0;
      if (
        view !== undefined &&
        sample !== undefined &&
        sample.opacity >= threshold &&
        scale >= threshold
      ) {
        const projected = project(view.viewProjection, sample.world, view.viewport);
        if (projected.visible) {
          sx = options.frame.x + (projected.x / view.viewport.width) * options.frame.width;
          sy = options.frame.y + (projected.y / view.viewport.height) * options.frame.height;
          visible = true;
        }
      }
      out[`leader.${note.anchor}`] = visible ? leader(sx, sy) : "";
      out[`anchor.${note.anchor}.x`] = visible ? Math.round(sx * 100) / 100 : 0;
      out[`anchor.${note.anchor}.y`] = visible ? Math.round(sy * 100) / 100 : 0;
      out[`anchor.${note.anchor}.visible`] = visible ? 1 : 0;
    }
    return out;
  };
}

/** The signal keys `anchorFrameSignals` produces, for a figure's `signals` metadata. */
export function anchorSignalDefaults(
  notes: readonly AnchorNote[],
): Record<string, number | string> {
  const out: Record<string, number | string> = { placed: 0, groups: 0 };
  for (const note of notes) {
    out[`leader.${note.anchor}`] = "";
    out[`anchor.${note.anchor}.x`] = 0;
    out[`anchor.${note.anchor}.y`] = 0;
    out[`anchor.${note.anchor}.visible`] = 0;
  }
  return out;
}
