/**
 * The shared recipes now live in `@kineglyph/core` (they back `figure()` as well as the catalogue).
 * This module re-exports them under their historical names so scenes and consumers keep working;
 * `flow` here is the layout recipe, which core exports as `flowLayout` because core's `flow` is
 * the packet-flow timeline helper.
 */
export {
  body,
  caption,
  card,
  code,
  eyebrow,
  flowLayout as flow,
  grid,
  heading,
  keyValue,
  motif,
  overlay,
  panel,
  pill,
  row,
  rule,
  spacer,
  stack,
  title,
  type CardOptions,
  type ContainerOptions,
  type KeyValueOptions,
  type MotifOptions,
  type PanelOptions,
  type PillOptions,
  type TextOptions,
} from "@kineglyph/core";
