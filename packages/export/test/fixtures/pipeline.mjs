// Plain-JS fixture so the CLI can import it without a build step.
import { createTheme, resolvePipeline } from "@kineglyph/core";

/** @type {import("@kineglyph/core").PipelineDefinition} */
export const pipeline = {
  id: "export-fixture",
  title: "Export fixture",
  description: "Three stages with a short reveal timeline",
  nodes: [
    { id: "ingest", label: "Ingest", description: "Read events", tone: "accent" },
    { id: "shape", label: "Shape", description: "Normalize" },
    { id: "publish", label: "Publish", tone: "success" },
  ],
  edges: [
    { id: "ingest-shape", from: "ingest", to: "shape", label: "stream" },
    { id: "shape-publish", from: "shape", to: "publish" },
  ],
  timeline: {
    duration: 400,
    tracks: [
      {
        id: "reveal-1",
        target: "ingest-shape",
        property: "edgeReveal",
        keyframes: [
          { time: 0, value: 0 },
          { time: 200, value: 1 },
        ],
      },
      {
        id: "reveal-2",
        target: "shape-publish",
        property: "edgeReveal",
        keyframes: [
          { time: 200, value: 0 },
          { time: 400, value: 1 },
        ],
      },
      {
        id: "fade-publish",
        target: "publish",
        property: "opacity",
        keyframes: [
          { time: 0, value: 0 },
          { time: 400, value: 1, easing: "easeOut" },
        ],
      },
    ],
  },
};

/** @type {import("@kineglyph/core").SceneDefinition} */
export const scene = {
  schemaVersion: 2,
  id: "font-fixture",
  title: "Font fixture",
  root: {
    id: "root",
    type: "group",
    width: "fill",
    padding: 16,
    children: [{ id: "text", type: "text", text: "Shaped from embedded bytes" }],
  },
};

/**
 * Alternate export shape: a resolver function the CLI calls with { width, theme, layout }.
 *
 * @param {{
 *   width?: number;
 *   theme?: import("@kineglyph/core").ThemeTokens;
 *   layout?: "wide" | "stacked";
 * }} [context]
 */
export function resolveScene(context = {}) {
  const { width = 640, theme, layout } = context;
  return resolvePipeline(pipeline, {
    width,
    theme: theme ?? createTheme({ colors: { canvas: "#101418" } }),
    ...(layout === undefined ? {} : { layout }),
  });
}

/** Theme tokens export used by `--theme`. */
export const darkTheme = createTheme({ colors: { canvas: "#0b0d10", surface: "#161a20" } });

export default pipeline;
