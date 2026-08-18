import { describe, expect, it } from "vitest";
import {
  createTheme,
  resolveFigure,
  sceneFromSpec,
  seekTimeline,
  type SimpleSceneSpec,
} from "@kineglyph/core";
import { renderSvg } from "../src/index.js";

const theme = createTheme();

const spec: SimpleSceneSpec = {
  version: 1,
  id: "spec-scene",
  title: "Spec scene",
  layout: "stack",
  nodes: [
    { id: "intro", kind: "heading", text: "Parse, model, export" },
    { id: "detail", kind: "caption", text: "One editable model" },
    {
      id: "outputs",
      kind: "box",
      title: "Outputs",
      body: "Pick a destination",
      layout: "row",
      children: [
        { id: "schem", kind: "code", text: "schem" },
        { id: "litematic", kind: "code", text: "litematic" },
      ],
    },
  ],
  edges: [
    { from: "intro", to: "detail", label: "then" },
    { from: "detail", to: "outputs", style: "flow" },
  ],
};

describe("renderSvg over sceneFromSpec", () => {
  it("draws every text and edge a simple spec asked for", () => {
    const scene = sceneFromSpec(spec);
    const resolved = resolveFigure(scene, { width: 800, theme });
    const svg = renderSvg(seekTimeline(resolved, resolved.timeline?.duration ?? 0));
    for (const text of [
      "Parse, model, export",
      "One editable model",
      "Outputs",
      "Pick a destination",
      "schem",
      "litematic",
      "then",
    ])
      expect(svg).toContain(text);
    expect(svg).toContain("e0:intro:detail");
    expect(svg).toContain("e1:detail:outputs");
  });
});
