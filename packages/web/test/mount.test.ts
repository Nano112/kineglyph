// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTheme, defineScene, type SceneDefinition } from "@kineglyph/core";
import { autoMount, mountKineglyph, registerScene, registerTheme, STYLE_ID } from "../src/index.js";
import { STYLE_ID as STYLE_ID_EXPORT } from "../src/styles.js";

const scene: SceneDefinition = defineScene({
  schemaVersion: 2,
  id: "lab",
  title: "Engine lab",
  description: "Pick an intent to see the recommended engine.",
  machine: {
    id: "lab-machine",
    initial: "idle",
    variables: { intent: "none" },
    states: {
      idle: { on: { PICK_A: "a", PICK_B: "b" } },
      a: {
        entry: [
          { type: "set", var: "intent", value: "a" },
          { type: "select", node: "card-a" },
        ],
        on: { PICK_B: "b", RESET: "idle" },
      },
      b: {
        entry: [
          { type: "set", var: "intent", value: "b" },
          { type: "seek", time: "end" },
        ],
        on: { PICK_A: "a", RESET: "idle" },
      },
    },
    signals: {
      engine: {
        match: { state: true },
        cases: { a: "Engine A", b: "Engine B" },
        default: "Choose",
      },
      aFocus: { when: { state: "a" }, then: 1, else: 0 },
    },
  },
  root: {
    id: "root",
    type: "group",
    layout: "row",
    gap: 16,
    children: [
      {
        id: "card-a",
        type: "group",
        width: "fill",
        padding: 12,
        frame: { fill: "surface", stroke: "border" },
        interactive: true,
        label: "Card A",
        description: "Choose engine A",
        onActivate: "PICK_A",
        bind: { highlight: "aFocus" },
        children: [{ id: "a-text", type: "text", text: "A" }],
      },
      {
        id: "card-b",
        type: "group",
        width: "fill",
        padding: 12,
        frame: { fill: "surface", stroke: "border" },
        interactive: true,
        label: "Card B",
        description: "Choose engine B",
        onActivate: "PICK_B",
        children: [{ id: "b-text", type: "text", text: "B" }],
      },
      { id: "engine", type: "text", text: "Choose", bind: { text: "engine" } },
    ],
  },
  edges: [{ id: "a-b", from: "card-a", to: "card-b", description: "A leads to B" }],
  timeline: {
    duration: 400,
    tracks: [
      {
        id: "a-in",
        target: "card-a",
        property: "opacity",
        keyframes: [
          { time: 0, value: 0 },
          { time: 400, value: 1 },
        ],
      },
      {
        id: "edge",
        target: "a-b",
        property: "edgeReveal",
        keyframes: [
          { time: 0, value: 0 },
          { time: 400, value: 1 },
        ],
      },
    ],
  },
  controls: [
    { id: "pick-a", label: "Pick A", event: "PICK_A", activeWhen: { state: "a" }, group: "Intent" },
    { id: "pick-b", label: "Pick B", event: "PICK_B", activeWhen: { state: "b" }, group: "Intent" },
    { id: "reset", kind: "reset", label: "Reset" },
  ],
});

const mediaQuery = {
  matches: false,
  media: "(prefers-reduced-motion: reduce)",
  onchange: null,
  addListener: () => undefined,
  removeListener: () => undefined,
  addEventListener: () => undefined,
  removeEventListener: () => undefined,
  dispatchEvent: () => true,
} satisfies MediaQueryList;

let hosts: HTMLDivElement[] = [];

beforeEach(() => {
  vi.stubGlobal("matchMedia", () => mediaQuery);
  hosts = [];
});

afterEach(() => {
  document.body.replaceChildren();
  document.head.replaceChildren();
  vi.unstubAllGlobals();
});

function host(width = 900): HTMLDivElement {
  const element = document.createElement("div");
  Object.defineProperty(element, "getBoundingClientRect", {
    value: () => ({ width, height: 400, top: 0, left: 0, right: width, bottom: 400 }),
  });
  document.body.append(element);
  hosts.push(element);
  return element;
}

describe("mountKineglyph", () => {
  it("mounts two independent figures without id, marker, or style collisions and disposes cleanly", () => {
    const first = mountKineglyph(host(), { scene, theme: createTheme(), autoplay: false });
    const second = mountKineglyph(host(600), { scene, theme: createTheme(), autoplay: false });
    expect(first.id).not.toBe(second.id);
    const ids = (root: Element): string[] => [...root.querySelectorAll("[id]")].map((el) => el.id);
    const firstIds = new Set(ids(first.element));
    for (const id of ids(second.element)) expect(firstIds.has(id)).toBe(false);
    expect(first.element.querySelector("marker")?.id.startsWith(first.id)).toBe(true);
    expect(second.element.querySelector("marker")?.id.startsWith(second.id)).toBe(true);
    expect(document.querySelectorAll(`#${STYLE_ID}`)).toHaveLength(1);
    expect(STYLE_ID_EXPORT).toBe(STYLE_ID);
    // Independent machines and layouts.
    first.send("PICK_A");
    expect(first.state.machineState?.state).toBe("a");
    expect(second.state.machineState?.state).toBe("idle");
    expect(first.state.width).toBe(900);
    expect(second.state.width).toBe(600);
    expect(
      first.element.querySelector('[data-node-id="card-a"]')?.getAttribute("data-highlight"),
    ).toBe("1");
    expect(
      second.element.querySelector('[data-node-id="card-a"]')?.getAttribute("data-highlight"),
    ).toBeNull();
    let destroyed = 0;
    first.on("destroy", () => {
      destroyed += 1;
    });
    first.destroy();
    expect(destroyed).toBe(1);
    expect(first.element.childElementCount).toBe(0);
    expect(first.state.destroyed).toBe(true);
    expect(() => first.play()).toThrow(/destroyed/);
    // The second figure keeps working after the first is gone.
    second.send("PICK_B");
    expect(second.state.machineState?.state).toBe("b");
    second.destroy();
    expect(document.body.querySelectorAll("svg")).toHaveLength(0);
  });

  it("re-renders bound content, control state, selection, and readout on machine events", () => {
    const controller = mountKineglyph(host(), { scene, autoplay: false });
    const engineText = (): string =>
      controller.element.querySelector('[data-node-id="engine"] text')?.textContent ?? "";
    expect(engineText()).toBe("Choose");
    const pickA = controller.element.querySelector<HTMLButtonElement>('[data-control="pick-a"]');
    expect(pickA?.getAttribute("aria-pressed")).toBe("false");
    pickA?.click();
    expect(controller.state.machineState?.state).toBe("a");
    expect(engineText()).toBe("Engine A");
    expect(pickA?.getAttribute("aria-pressed")).toBe("true");
    expect(
      controller.element.querySelector('[data-node-id="card-a"]')?.getAttribute("data-selected"),
    ).toBe("true");
    // Activating an interactive node with the keyboard sends its event.
    const cardB = controller.element.querySelector<SVGGElement>('[data-node-id="card-b"]');
    cardB?.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    expect(controller.state.machineState?.state).toBe("b");
    // Entry seek effect moved the timeline to the end.
    expect(controller.state.time).toBe(400);
    controller.reset();
    expect(controller.state.machineState?.state).toBe("idle");
    expect(engineText()).toBe("Choose");
    // Inspection updates the readout and reports the target.
    const inspected: string[] = [];
    controller.on("inspect", (target) => inspected.push(target?.id ?? "none"));
    controller.inspect("card-a");
    expect(controller.element.querySelector(".kg-figure__readout strong")?.textContent).toBe(
      "Card A",
    );
    expect(
      controller.element.querySelector(".kg-figure__readout > span:last-child")?.textContent,
    ).toBe("Choose engine A");
    controller.inspect(null);
    expect(inspected).toEqual(["card-a", "none"]);
    controller.destroy();
  });

  it("swaps themes, honours reduced motion, and follows the container width", () => {
    const element = host(1000);
    const controller = mountKineglyph(element, {
      scene,
      theme: createTheme({ colors: { accent: "#ff0000" } }),
      autoplay: false,
    });
    const shell = element.querySelector<HTMLElement>(".kg-figure");
    expect(shell?.style.getPropertyValue("--kg-shell-accent")).toBe("#ff0000");
    controller.setTheme(createTheme({ colors: { accent: "#00ff00", canvas: "#010203" } }));
    expect(shell?.style.getPropertyValue("--kg-shell-accent")).toBe("#00ff00");
    expect(element.querySelector(".kg-canvas")?.getAttribute("fill")).toBe("#010203");
    controller.setReducedMotion(true);
    expect(controller.state.time).toBe(400);
    expect(controller.state.reducedMotion).toBe(true);
    expect(element.querySelector<HTMLButtonElement>(".kg-figure__play")?.disabled).toBe(true);
    expect(element.querySelector<SVGGElement>('[data-node-id="card-a"]')?.style.opacity).toBe("1");
    controller.resize(390);
    expect(controller.state.width).toBe(390);
    expect(controller.state.layout).toBe("narrow");
    controller.destroy();
  });

  it("auto-mounts registered scenes from data attributes", () => {
    registerScene("lab", scene);
    registerTheme("test", createTheme({ colors: { accent: "#123456" } }));
    document.body.innerHTML =
      '<div data-kineglyph="lab" data-theme="test" data-autoplay="false" data-width="700"></div>' +
      '<div data-kineglyph="missing"></div>';
    const controllers = autoMount();
    expect(controllers).toHaveLength(1);
    expect(controllers[0]?.state.width).toBe(700);
    expect(
      document.querySelector('[data-kineglyph="missing"]')?.getAttribute("data-kineglyph-error"),
    ).toContain("unknown scene");
    expect(autoMount()).toHaveLength(0);
    controllers[0]?.destroy();
    expect(autoMount()).toHaveLength(1);
  });
});
