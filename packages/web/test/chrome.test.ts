// @vitest-environment jsdom

/**
 * `controls`/`readout`/`machineControls` as three-valued settings, and what `"auto"` decides.
 *
 * A figure's chrome used to be a yes/no the embedder had to answer blind, before the scene was
 * resolved and therefore before anything was known about it. So every figure got the lot: a still
 * three-box diagram sitting in an article carried an INSPECT readout it could never fill and a
 * transport driving a 0.0s timeline, which roughly doubled its height and made a picture look like
 * an instrument.
 *
 * `"auto"` moves the decision to where the answer lives — the resolved scene. These tests pin the
 * rule in both directions, because the failure that matters is not "chrome appeared" but "chrome
 * appeared with nothing behind it", and its mirror, "a scene that really animates lost its Play".
 */
import { beforeEach, describe, expect, it } from "vitest";
import { defineScene, heading, stack, text, type SceneDefinition } from "@kineglyph/core";
import { chromeAttr, mountKineglyph } from "../src/index.js";
import { mountAll } from "../src/embed.js";

/** A picture: no timeline, and nothing in it a reader could point at and learn something from. */
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

/** An instrument: a timeline to drive, and a node whose label and description fill the readout. */
const lively: SceneDefinition = defineScene({
  schemaVersion: 2,
  id: "lively",
  title: "Engine lab",
  description: "Pick an intent.",
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
        frame: { fill: "surface", stroke: "border" },
        label: "Card",
        description: "A card worth inspecting",
        children: [{ id: "card-text", type: "text", text: "A" }],
      },
    ],
  },
  timeline: {
    duration: 400,
    tracks: [
      {
        id: "in",
        target: "card",
        property: "opacity",
        keyframes: [
          { time: 0, value: 0 },
          { time: 400, value: 1 },
        ],
      },
    ],
  },
});

const host = (): HTMLElement => {
  const el = document.createElement("div");
  document.body.append(el);
  return el;
};

const chrome = (el: HTMLElement): { controls: boolean; readout: boolean } => ({
  controls: el.querySelector(".kg-figure__controls") !== null,
  readout: el.querySelector(".kg-figure__readout") !== null,
});

beforeEach(() => {
  document.body.innerHTML = "";
});

describe("chromeAttr", () => {
  it('reads "false" as off, "auto" as deferred, and everything else as on', () => {
    expect(chromeAttr("false")).toBe(false);
    expect(chromeAttr("auto")).toBe("auto");
    expect(chromeAttr("true")).toBe(true);
    // An absent attribute has always meant "on"; that is the compatibility this rests on.
    expect(chromeAttr(undefined)).toBe(true);
    expect(chromeAttr("")).toBe(true);
  });
});

describe("the default is unchanged", () => {
  it("draws both bars when nothing is said, even for a still scene", () => {
    const el = host();
    mountKineglyph(el, { scene: still });
    expect(chrome(el)).toEqual({ controls: true, readout: true });
  });

  it("still obeys an explicit false", () => {
    const el = host();
    mountKineglyph(el, { scene: lively, controls: false, readout: false });
    expect(chrome(el)).toEqual({ controls: false, readout: false });
  });

  it("still obeys an explicit true, even where auto would have said no", () => {
    const el = host();
    mountKineglyph(el, { scene: still, controls: true, readout: true });
    expect(chrome(el)).toEqual({ controls: true, readout: true });
  });
});

describe('"auto" asks the scene', () => {
  it("gives a still, uninspectable scene no chrome at all", () => {
    const el = host();
    mountKineglyph(el, { scene: still, controls: "auto", readout: "auto" });
    expect(chrome(el)).toEqual({ controls: false, readout: false });
    // The drawing is still there — this is about the furniture around it, not the picture.
    expect(el.querySelector(".kg-figure__stage svg")).not.toBeNull();
  });

  it("gives an animated, inspectable scene both", () => {
    const el = host();
    mountKineglyph(el, { scene: lively, controls: "auto", readout: "auto" });
    expect(chrome(el)).toEqual({ controls: true, readout: true });
  });

  it("decides the two independently", () => {
    // The case the screenshot caught: an inline scene with content worth inspecting and a 0.0s
    // timeline got a Play button it could only ever render disabled.
    const el = host();
    mountKineglyph(el, { scene: still, controls: "auto", readout: true });
    expect(chrome(el)).toEqual({ controls: false, readout: true });
  });

  it("hides the machine bar when the scene declares no machine", () => {
    const el = host();
    mountKineglyph(el, { scene: still, machineControls: "auto" });
    expect(el.querySelector(".kg-figure__machine")).toBeNull();
  });
});

describe("the DOM order the chrome is built in", () => {
  it("keeps stage, readout, machine, controls even though the scene resolves first", () => {
    const el = host();
    mountKineglyph(el, { scene: lively, controls: true, readout: true, machineControls: true });
    const classes = [...el.querySelector(".kg-figure")!.children].map((c) => c.className);
    expect(classes).toEqual([
      "kg-figure__stage",
      "kg-figure__live",
      "kg-figure__readout",
      "kg-figure__machine",
      "kg-figure__controls",
    ]);
  });
});

describe('data-controls="auto" through mountAll', () => {
  it("reaches the runtime as the deferred setting, not as true", async () => {
    document.body.innerHTML = `<figure class="kg" data-kineglyph="still" data-controls="auto" data-readout="auto"></figure>`;
    const figure = document.querySelector<HTMLElement>("figure")!;
    await mountAll({ load: () => Promise.resolve(still) });
    expect(chrome(figure)).toEqual({ controls: false, readout: false });
  });

  it("leaves a figure that said nothing with the chrome it has always had", async () => {
    document.body.innerHTML = `<figure class="kg" data-kineglyph="still"></figure>`;
    const figure = document.querySelector<HTMLElement>("figure")!;
    await mountAll({ load: () => Promise.resolve(still) });
    expect(chrome(figure)).toEqual({ controls: true, readout: true });
  });
});
