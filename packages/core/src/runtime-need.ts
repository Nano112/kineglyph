import type { ResolvedScene } from "./resolved.js";

/**
 * Whether this scene has anything the runtime could drive that a still frame cannot.
 *
 * A Kineglyph figure is normally delivered twice: once as a pre-rendered SVG that works with no
 * JavaScript at all, and again as a live mount that replaces it. For a great many diagrams the
 * second delivery is indistinguishable from the first — a still three-box picture with no
 * timeline, no inspectable part and no machine renders exactly the frame that was already on the
 * page. An embedder that knows this can keep the pre-rendered frame and skip the mount entirely:
 * one less module fetch, one less resolve, and the accessible server-rendered SVG survives.
 *
 * This is the fact that decision needs, and *only* the fact. Kineglyph does not decide whether a
 * given embedder should skip — a playground may want a live mount around an inert scene so that
 * `setScene` can swap it later, and that is a legitimate choice. `mountAll`'s `mountOptions` may
 * return `null` to decline, which is where an embedder puts its own answer.
 *
 * The predicates are exactly the capabilities `FigureRuntime` adds over a still frame:
 *
 * | Answer `true` when | Because the runtime would |
 * |---|---|
 * | the timeline has a duration | animate it, with or without a transport |
 * | any node is inspectable | highlight and describe it on hover, focus and keyboard |
 * | the scene declares a machine | accept clicks and Enter/Space to send events |
 * | the scene declares controls | render a parameter panel bound to them |
 * | any image node is `live` | hand it to a host renderer (canvas, iframe, model-viewer) |
 *
 * "Inspectable" is the same test `readout: "auto"` uses — `interactive`, or a label *and* a
 * description — because hover highlighting is bound for exactly those nodes whether or not a
 * readout was drawn.
 *
 * Deliberately **not** a reason on its own: `prefers-reduced-motion` (nothing to reduce without a
 * timeline), the reader's width (a fixed-width mount does not observe it), and a theme change
 * (every paint in an exported SVG is a `var(--kg-color-*)`, so CSS retints the still frame too).
 */
export function sceneNeedsRuntime(scene: ResolvedScene): boolean {
  if ((scene.timeline?.duration ?? 0) > 0) return true;
  if (scene.machine !== undefined) return true;
  if ((scene.controls?.length ?? 0) > 0) return true;
  return scene.nodes.some(
    (node) =>
      node.image?.live === true ||
      node.interactive ||
      (node.label.length > 0 && node.description !== undefined),
  );
}
