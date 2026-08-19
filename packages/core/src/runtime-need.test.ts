/**
 * `sceneNeedsRuntime` — "could a live mount show a reader anything this still frame cannot?"
 *
 * The answer decides whether an embedder may keep its pre-rendered SVG and skip hydrating. Both
 * directions matter and the expensive one is the false negative: saying "no" about a scene that
 * really animates leaves a reader looking at a frozen first frame forever. So every capability the
 * runtime adds over a still frame gets a case here, and each is asserted in isolation — a scene
 * that has *only* that one reason.
 */
import { describe, expect, it } from "vitest";
import { heading, stack, text } from "./recipes.js";
import { defineScene, type SceneDefinition } from "./scene.js";
import { resolveFigure } from "./resolve.js";
import { sceneNeedsRuntime } from "./runtime-need.js";
import { defaultTheme } from "./theme.js";

const needs = (definition: SceneDefinition): boolean =>
  sceneNeedsRuntime(resolveFigure(definition, { width: 960, theme: defaultTheme }));

/** A picture: nothing to play, nothing to point at, nothing to send. */
const still: SceneDefinition = defineScene({
  schemaVersion: 2,
  id: "still",
  title: "How a page is published",
  description: "Markdown in, HTML and figures out.",
  root: stack("r", [heading("h", "Publish"), text("t", "prose and figures")], {
    padding: 8,
    width: "fill",
  }),
});

/** `still` with one thing changed, so each case below differs from the baseline in exactly one way. */
const plus = (extra: Partial<SceneDefinition>): SceneDefinition =>
  defineScene({ ...still, ...extra });

describe("sceneNeedsRuntime", () => {
  it("is false for a still diagram — the frame already is the figure", () => {
    expect(needs(still)).toBe(false);
  });

  it("is true when the timeline has a duration, transport or no transport", () => {
    // The reason this is not `controls !== false`: a quiet figure with a timeline still animates.
    expect(
      needs(
        plus({
          timeline: {
            duration: 400,
            tracks: [
              {
                id: "in",
                target: "h",
                property: "opacity",
                keyframes: [
                  { time: 0, value: 0 },
                  { time: 400, value: 1 },
                ],
              },
            ],
          },
        }),
      ),
    ).toBe(true);
  });

  it("is false for a timeline of zero duration", () => {
    expect(needs(plus({ timeline: { duration: 0, tracks: [] } }))).toBe(false);
  });

  it("is true when a node carries a label and a description — that is what hover reveals", () => {
    expect(
      needs(
        plus({
          root: {
            id: "r",
            type: "group",
            width: "fill",
            padding: 12,
            children: [
              {
                id: "card",
                type: "group",
                width: "fill",
                padding: 12,
                label: "Card",
                description: "A card worth inspecting",
                children: [{ id: "card-text", type: "text", text: "A" }],
              },
            ],
          },
        }),
      ),
    ).toBe(true);
  });

  it("is true for inspect-only marks that deliberately remain non-interactive", () => {
    expect(
      needs(
        plus({
          root: {
            id: "r",
            type: "group",
            children: [
              {
                id: "cell",
                type: "rect",
                width: 24,
                height: 24,
                inspect: {
                  role: "Cell",
                  title: "D1 · 00",
                  fields: [{ label: "Value", value: "42" }],
                },
              },
            ],
          },
        }),
      ),
    ).toBe(true);
  });

  it("is false when a node has a label but nothing to say about it", () => {
    expect(
      needs(
        plus({
          root: {
            id: "r",
            type: "group",
            width: "fill",
            padding: 12,
            label: "Card",
            children: [{ id: "card-text", type: "text", text: "A" }],
          },
        }),
      ),
    ).toBe(false);
  });

  it("is true when the scene declares a machine, with or without controls bound to it", () => {
    // A scene control is only valid against a machine, so `controls` never arrives alone — it is
    // checked anyway, because the predicate should not depend on that staying true.
    const machine: NonNullable<SceneDefinition["machine"]> = {
      id: "m",
      initial: "idle",
      states: { idle: { on: { go: "done" } }, done: {} },
    };
    expect(needs(plus({ machine }))).toBe(true);
    expect(needs(plus({ machine, controls: [{ id: "go", label: "Go", event: "go" }] }))).toBe(true);
  });
});
