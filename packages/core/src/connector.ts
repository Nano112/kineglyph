/**
 * What a connector needs in order to read as a connector.
 *
 * In a flow diagram the boxes are the nouns and the connector is the verb, so the connector is
 * designed first and the layout is asked to accommodate it — not the other way round. Everything
 * here is stated as a multiple of the stroke width, because an arrowhead that does not scale with
 * its line stops looking like it belongs to the line.
 *
 * These numbers are the *contract* between three places that must agree:
 *
 *   - `@kineglyph/svg` draws the arrowhead to `CONNECTOR_HEAD_LENGTH` at
 *     `CONNECTOR_HEAD_HALF_ANGLE`, with a head stroke of `CONNECTOR_HEAD_STROKE`;
 *   - `layout.ts` and `spec.ts` size the space between two nodes with `minimumConnectorRun`;
 *   - `edges.ts` keeps labels `CONNECTOR_LABEL_CLEARANCE` away from every node.
 *
 * Change a number here and the drawing, the spacing and the labelling move together.
 */

/**
 * Arrowhead length, in stroke widths, from barb to tip.
 *
 * At the default 2px stroke that is a 9.6px head — about the smallest head that still reads as an
 * arrow rather than a tick at body-text sizes.
 */
export const CONNECTOR_HEAD_LENGTH = 4.8;

/**
 * Half the arrowhead's included angle, in degrees.
 *
 * 30° (a 60° included angle) is the classical drafting arrow. The wider the angle the blunter and
 * more "squashed" the head looks, and a head as wide as it is long (45°, which is what a chevron
 * inscribed in a square gives you) is the shape that reads as a glitch on a short run.
 */
export const CONNECTOR_HEAD_HALF_ANGLE = 30;

/**
 * Arrowhead stroke weight, in stroke widths.
 *
 * Exactly the line's own weight: a head drawn heavier than its shaft detaches from it and reads as
 * a separate mark stuck on the end.
 */
export const CONNECTOR_HEAD_STROKE = 1;

/**
 * Shaft lengths a head needs behind it before the run reads as a flow rather than a stub.
 *
 * Three is the point at which the eye stops seeing "arrowhead with a smudge" and starts seeing
 * "line that arrives somewhere": the head occupies a quarter of the run, which is also roughly
 * where a hand-drawn arrow lands.
 */
export const CONNECTOR_SHAFT_RATIO = 3;

/**
 * Clear space, in pixels, that an edge label keeps from any node it is not attached to.
 *
 * Large enough to clear a node's corner radius as well as its border, so a label never appears to
 * be sitting on a box.
 */
export const CONNECTOR_LABEL_CLEARANCE = 6;

/** The spacing step every derived gap is rounded up to, so gaps stay on the layout rhythm. */
const SPACING_STEP = 4;

/**
 * The shortest run a directed connector of this stroke width can carry.
 *
 * Derived from the arrowhead's own size rather than picked: head length x (1 + shaft ratio),
 * rounded up to the spacing step. At the default 2px stroke that is 40px; at the 1.5px stroke the
 * darker themes use, 32px.
 *
 * Layouts call this to decide how much room to leave between two nodes, which is the whole point:
 * the gap satisfies the connector instead of the connector making do with the gap.
 */
export function minimumConnectorRun(strokeWidth = 2): number {
  const w = Math.max(0.5, Number.isFinite(strokeWidth) ? strokeWidth : 2);
  const run = CONNECTOR_HEAD_LENGTH * (1 + CONNECTOR_SHAFT_RATIO) * w;
  return Math.ceil(run / SPACING_STEP) * SPACING_STEP;
}

/** Arrowhead length in pixels for a given stroke width. */
export function connectorHeadLength(strokeWidth = 2): number {
  return CONNECTOR_HEAD_LENGTH * Math.max(0.5, strokeWidth);
}
