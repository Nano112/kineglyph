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
import { clipOutside, currentGroup, leaderPolyline, placedAnchor, placedCount } from "./leaders.js";
import type { BuildView } from "./surface.js";

/** A degenerate path for hidden leaders — valid path data that draws nothing. */
export const EMPTY_PATH = "M0 0";

export interface AnchorNote {
  /** Anchor name as recorded in the build. */
  readonly anchor: string;
  /** Sheet-space position of the note's head line (what `drafting.callout` was given). */
  readonly x: number;
  readonly y: number;
  /** The callout's anchor side; the leader leaves the note from the opposite edge. */
  readonly side?: "top-left" | "top-right";
  /**
   * Colour of the part of the leader a surface draws inside the view (`buildSurface`'s
   * `leaders`): a theme colour token such as `"accent"`, or a CSS colour. Default `"text"`.
   */
  readonly tone?: string;
}

export interface SheetRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface AnchorSignalsOptions {
  /**
   * The view to project through: a surface's `view` (its last render, the argument ignored) or a
   * `headlessView` that computes the camera for the requested time.
   */
  readonly view: (time: number) => BuildView | undefined;
  /** Fallback frame source before the surface has rendered (or without a surface). */
  readonly source?: () => FrameSource | undefined;
  /** The surface node's rectangle in sheet units. */
  readonly frame: SheetRect;
  readonly notes: readonly AnchorNote[];
  /** Below this pose opacity or scale the anchor counts as not there yet. Default 0.5. */
  readonly threshold?: number;
  /**
   * The surface draws the part of each leader inside `frame` itself (`buildSurface`'s `leaders`
   * option, depth-tested against the blocks), so the sheet's path stops at the view's edge.
   */
  readonly embedded?: boolean;
  /**
   * Anchor pairs to measure: `dimension.<from>.<to>` carries the distance in blocks (two
   * decimals) and `dimension.<from>.<to>.visible` whether both anchors are there.
   */
  readonly dimensions?: readonly { readonly from: string; readonly to: string }[];
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
    const out: Record<string, number | string> = { placed: 0, groups: 0, current: -1 };
    for (const dimension of options.dimensions ?? []) {
      out[`dimension.${dimension.from}.${dimension.to}`] = 0;
      out[`dimension.${dimension.from}.${dimension.to}.visible`] = 0;
    }
    for (const { note } of leaders) {
      out[`leader.${note.anchor}`] = EMPTY_PATH;
      out[`anchor.${note.anchor}.x`] = 0;
      out[`anchor.${note.anchor}.y`] = 0;
      out[`anchor.${note.anchor}.visible`] = 0;
    }
    return out;
  };
  return (time) => {
    const view = options.view(time);
    const source = view?.source ?? options.source?.();
    if (source === undefined) return hidden();
    const frame = source.frame(time);
    const out: Record<string, number | string> = {
      groups: source.groups,
      placed: placedCount(frame),
      current: currentGroup(frame),
    };
    for (const dimension of options.dimensions ?? []) {
      const a = placedAnchor(frame, dimension.from, threshold);
      const b = placedAnchor(frame, dimension.to, threshold);
      const both = a !== undefined && b !== undefined;
      const distance = both
        ? Math.hypot(b.world[0] - a.world[0], b.world[1] - a.world[1], b.world[2] - a.world[2])
        : 0;
      out[`dimension.${dimension.from}.${dimension.to}`] = Math.round(distance * 100) / 100;
      out[`dimension.${dimension.from}.${dimension.to}.visible`] = both ? 1 : 0;
    }
    for (const { note, leader } of leaders) {
      const sample = placedAnchor(frame, note.anchor, threshold);
      let visible = false;
      let sx = 0;
      let sy = 0;
      if (view !== undefined && sample !== undefined) {
        const projected = project(view.viewProjection, sample.world, view.viewport);
        if (projected.visible) {
          sx = options.frame.x + (projected.x / view.viewport.width) * options.frame.width;
          sy = options.frame.y + (projected.y / view.viewport.height) * options.frame.height;
          visible = true;
        }
      }
      const path = !visible
        ? EMPTY_PATH
        : options.embedded === true
          ? (clipOutside(leaderPolyline(note, [sx, sy]), options.frame) ?? EMPTY_PATH)
          : leader(sx, sy);
      out[`leader.${note.anchor}`] = path;
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
  dimensions: readonly { readonly from: string; readonly to: string }[] = [],
): Record<string, number | string> {
  const out: Record<string, number | string> = { placed: 0, groups: 0, current: -1 };
  for (const dimension of dimensions) {
    out[`dimension.${dimension.from}.${dimension.to}`] = 0;
    out[`dimension.${dimension.from}.${dimension.to}.visible`] = 0;
  }
  for (const note of notes) {
    out[`leader.${note.anchor}`] = EMPTY_PATH;
    out[`anchor.${note.anchor}.x`] = 0;
    out[`anchor.${note.anchor}.y`] = 0;
    out[`anchor.${note.anchor}.visible`] = 0;
  }
  return out;
}
