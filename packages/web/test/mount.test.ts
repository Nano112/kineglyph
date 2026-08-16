// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTheme, defineScene, type SceneDefinition } from "@kineglyph/core";
import {
  autoMount,
  modelViewerSurface,
  mountKineglyph,
  registerScene,
  registerTheme,
  startWhenVisible,
  STYLE_ID,
} from "../src/index.js";
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

const liveScene: SceneDefinition = defineScene({
  schemaVersion: 2,
  id: "live-preview",
  title: "Live preview",
  description: "A static export image becomes an interactive renderer in the browser.",
  root: {
    id: "live-root",
    type: "group",
    layout: "stack",
    children: [
      {
        id: "build-preview",
        type: "image",
        src: "/preview.png",
        alt: "Minecraft build preview",
        live: true,
        width: "fill",
        height: 240,
      },
    ],
  },
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
    // Nested content is part of the interactive card, not a dead click target.
    controller.element
      .querySelector('[data-node-id="a-text"]')
      ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(controller.state.machineState?.state).toBe("a");
    controller.reset();
    // Inspection updates the readout and reports the target.
    const inspected: string[] = [];
    controller.on("inspect", (target) => inspected.push(target?.id ?? "none"));
    controller.inspect("card-a");
    expect(controller.element.querySelector(".kg-figure__readout strong")?.textContent).toBe(
      "Card A",
    );
    expect(controller.element.querySelector(".kg-figure__body")?.textContent).toBe(
      "Choose engine A",
    );
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

  it("clears aria-busy on mount and removes it on destroy", () => {
    const element = host();
    element.setAttribute("aria-busy", "true");
    const controller = mountKineglyph(element, { scene, autoplay: false });
    expect(element.getAttribute("aria-busy")).toBe("false");
    controller.destroy();
    expect(element.hasAttribute("aria-busy")).toBe(false);
  });

  it("hands live image nodes to HTML renderers while retaining the export fallback", async () => {
    let mounts = 0;
    let destroys = 0;
    const controller = mountKineglyph(host(), {
      scene: liveScene,
      autoplay: false,
      liveSurfaces: {
        "build-preview": ({ element, node }) => {
          mounts += 1;
          expect(node.image?.alt).toBe("Minecraft build preview");
          const canvas = document.createElement("canvas");
          canvas.dataset.renderer = "custom";
          element.append(canvas);
          return () => {
            destroys += 1;
          };
        },
      },
    });
    await vi.waitFor(() =>
      expect(controller.element.querySelector(".kg-live-surface")?.getAttribute("data-ready")).toBe(
        "true",
      ),
    );
    expect(controller.element.querySelector("[data-renderer=custom]")).not.toBeNull();
    expect(
      controller.element.querySelector<SVGImageElement>("image[data-live=true]")?.style.opacity,
    ).toBe("0");
    controller.resize(600);
    await vi.waitFor(() => expect(mounts).toBe(2));
    expect(destroys).toBe(1);
    expect(controller.element.querySelectorAll(".kg-live-surface")).toHaveLength(1);
    controller.destroy();
    expect(destroys).toBe(2);
  });

  it("adapts live image nodes to model-viewer and falls back when it is unavailable", async () => {
    const unavailable = mountKineglyph(host(), {
      scene: liveScene,
      autoplay: false,
      liveSurfaces: {
        "build-preview": modelViewerSurface({ source: "/build.glb" }),
      },
    });
    await vi.waitFor(() =>
      expect(unavailable.element.querySelector(".kg-live-surface")).toBeNull(),
    );
    expect(
      unavailable.element.querySelector<SVGImageElement>("image[data-live=true]")?.style.opacity,
    ).not.toBe("0");
    unavailable.destroy();

    customElements.define("model-viewer", class extends HTMLElement {});
    const available = mountKineglyph(host(), {
      scene: liveScene,
      autoplay: false,
      liveSurfaces: {
        "build-preview": modelViewerSurface({ source: "/build.glb" }),
      },
    });
    const viewer = await vi.waitFor(() => {
      const candidate = available.element.querySelector("model-viewer");
      expect(candidate).not.toBeNull();
      return candidate;
    });
    viewer?.dispatchEvent(new Event("load"));
    await vi.waitFor(() =>
      expect(available.element.querySelector(".kg-live-surface")?.getAttribute("data-ready")).toBe(
        "true",
      ),
    );
    expect(viewer?.getAttribute("camera-controls")).toBe("");
    available.destroy();
  });

  it("rebuilds machine controls across setScene so no stale handlers or empty bars survive", () => {
    const controller = mountKineglyph(host(), { scene, autoplay: false });
    const bar = (): HTMLElement | null => controller.element.querySelector(".kg-figure__machine");
    expect(bar()?.hidden).toBe(false);
    // Same control ids/labels but different events: the buttons must send the new events.
    const swapped: SceneDefinition = defineScene({
      ...scene,
      id: "lab-swapped",
      controls: [
        {
          id: "pick-a",
          label: "Pick A",
          event: "PICK_B",
          activeWhen: { state: "b" },
          group: "Intent",
        },
        {
          id: "pick-b",
          label: "Pick B",
          event: "PICK_A",
          activeWhen: { state: "a" },
          group: "Intent",
        },
        { id: "reset", kind: "reset", label: "Reset" },
      ],
    });
    controller.setScene(swapped);
    controller.element.querySelector<HTMLButtonElement>('[data-control="pick-a"]')?.click();
    expect(controller.state.machineState?.state).toBe("b");
    // A scene without a machine hides and empties the bar…
    const plain: SceneDefinition = defineScene({
      schemaVersion: 2,
      id: "plain",
      title: "Plain",
      root: { id: "root", type: "group", children: [{ id: "t", type: "text", text: "Plain" }] },
    });
    controller.setScene(plain);
    expect(bar()?.hidden).toBe(true);
    expect(bar()?.childElementCount).toBe(0);
    // …and returning to a machine scene with the original signature rebuilds live buttons.
    controller.setScene(scene);
    expect(bar()?.hidden).toBe(false);
    controller.element.querySelector<HTMLButtonElement>('[data-control="pick-a"]')?.click();
    expect(controller.state.machineState?.state).toBe("a");
    // setScene can start a machine in an explicit state.
    controller.setScene(scene, {
      initialState: { state: "b", variables: { intent: "b" }, selection: null },
    });
    expect(controller.state.machineState?.state).toBe("b");
    expect(
      controller.element.querySelector('[data-control="pick-b"]')?.getAttribute("aria-pressed"),
    ).toBe("true");
    controller.destroy();
  });

  it("starts figures when they scroll into view with a low threshold", () => {
    const observed: Element[] = [];
    let callback: IntersectionObserverCallback | undefined;
    let options: IntersectionObserverInit | undefined;
    class FakeObserver {
      constructor(cb: IntersectionObserverCallback, init?: IntersectionObserverInit) {
        callback = cb;
        options = init;
      }
      observe(target: Element): void {
        observed.push(target);
      }
      disconnect(): void {
        observed.length = 0;
      }
      unobserve(): void {}
      takeRecords(): IntersectionObserverEntry[] {
        return [];
      }
      readonly root = null;
      readonly rootMargin = "";
      readonly thresholds = [];
    }
    vi.stubGlobal("IntersectionObserver", FakeObserver);
    const element = host();
    let starts = 0;
    const stop = startWhenVisible(element, () => {
      starts += 1;
    });
    expect(observed).toEqual([element]);
    expect(options?.threshold).toBeLessThanOrEqual(0.1);
    // A very tall figure only ever reaches a small ratio; it must still start.
    callback?.(
      [
        {
          isIntersecting: true,
          intersectionRatio: 0.07,
          target: element,
        } as unknown as IntersectionObserverEntry,
      ],
      {} as IntersectionObserver,
    );
    callback?.(
      [
        {
          isIntersecting: true,
          intersectionRatio: 0.5,
          target: element,
        } as unknown as IntersectionObserverEntry,
      ],
      {} as IntersectionObserver,
    );
    expect(starts).toBe(1);
    stop();
    vi.stubGlobal("IntersectionObserver", undefined);
    let immediate = 0;
    startWhenVisible(element, () => {
      immediate += 1;
    });
    expect(immediate).toBe(1);
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

  it("accepts per-host mount options for application live surfaces", () => {
    registerScene("live-lab", scene);
    document.body.innerHTML = '<div data-kineglyph="live-lab"></div>';
    const controllers = autoMount({
      mountOptions: (_element, sceneId) => ({
        className: `app-${sceneId}`,
        controls: false,
      }),
    });
    expect(controllers).toHaveLength(1);
    expect(document.querySelector(".kg-figure")?.classList.contains("app-live-lab")).toBe(true);
    expect(document.querySelector(".kg-figure__controls")).toBeNull();
    controllers[0]?.destroy();
  });
});

describe("keyboard inspection", () => {
  const chart: SceneDefinition = defineScene({
    schemaVersion: 2,
    id: "chart",
    title: "Chart",
    description: "One tab stop per series; arrows move between marks.",
    root: {
      id: "root",
      type: "group",
      layout: "stack",
      gap: 8,
      children: [
        {
          id: "series-a",
          type: "group",
          layout: "row",
          gap: 8,
          focusGroup: true,
          label: "Series A",
          children: [
            {
              id: "a-1",
              type: "rect",
              width: 40,
              height: 30,
              fill: "chart1",
              interactive: true,
              inspect: {
                role: "Bar",
                title: "A · Q1",
                summary: "First quarter",
                fields: [{ label: "Value", value: "12" }],
              },
            },
            {
              id: "a-hidden",
              type: "rect",
              width: 40,
              height: 30,
              fill: "chart1",
              interactive: true,
              hidden: true,
              label: "Hidden A",
            },
            {
              id: "a-2",
              type: "rect",
              width: 40,
              height: 30,
              fill: "chart1",
              interactive: true,
              inspect: { role: "Bar", title: "A · Q2", fields: [{ label: "Value", value: "9" }] },
            },
            {
              id: "nested",
              type: "group",
              layout: "row",
              focusGroup: true,
              label: "Nested",
              children: [
                {
                  id: "n-1",
                  type: "rect",
                  width: 20,
                  height: 20,
                  fill: "chart2",
                  interactive: true,
                  label: "Nested mark",
                },
              ],
            },
          ],
        },
        {
          id: "series-b",
          type: "group",
          layout: "row",
          gap: 8,
          focusGroup: true,
          label: "Series B",
          children: [
            {
              id: "b-1",
              type: "rect",
              width: 40,
              height: 30,
              fill: "chart2",
              interactive: true,
              inspect: { role: "Bar", title: "B · Q1", fields: [{ label: "Value", value: "4" }] },
            },
          ],
        },
      ],
    },
  });

  function key(target: Element, key: string): void {
    target.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
  }

  it("keeps one tab stop per focus group and cycles only direct, visible members with arrows", () => {
    const controller = mountKineglyph(host(), {
      scene: chart,
      theme: createTheme(),
      autoplay: false,
    });
    const svg = controller.element;
    const group = svg.querySelector<SVGElement>('[data-node-id="series-a"]');
    const bar1 = svg.querySelector<SVGElement>('[data-node-id="a-1"]');
    const bar2 = svg.querySelector<SVGElement>('[data-node-id="a-2"]');
    const nested = svg.querySelector<SVGElement>('[data-node-id="nested"]');
    const nestedMark = svg.querySelector<SVGElement>('[data-node-id="n-1"]');
    expect(group?.getAttribute("tabindex")).toBe("0");
    expect(bar1?.getAttribute("tabindex")).toBe("-1");
    expect(bar2?.getAttribute("tabindex")).toBe("-1");
    // Nested focus groups are their own tab stop; their marks are not members of the outer group.
    expect(nested?.getAttribute("tabindex")).toBe("0");
    expect(nestedMark?.getAttribute("tabindex")).toBe("-1");
    expect(svg.querySelector('[data-node-id="a-hidden"]')?.getAttribute("display")).toBe("none");
    // From the group, ArrowRight enters the first member; then cycles a-1 → a-2 → a-1 (skips hidden and nested).
    (group as unknown as HTMLElement).focus();
    key(group as Element, "ArrowRight");
    expect(document.activeElement).toBe(bar1);
    key(bar1 as Element, "ArrowRight");
    expect(document.activeElement).toBe(bar2);
    key(bar2 as Element, "ArrowRight");
    expect(document.activeElement).toBe(bar1);
    key(bar1 as Element, "End");
    expect(document.activeElement).toBe(bar2);
    key(bar2 as Element, "Home");
    expect(document.activeElement).toBe(bar1);
    key(bar1 as Element, "ArrowLeft");
    expect(document.activeElement).toBe(bar2);
    // Focusing a mark inspects it: structured readout with role/title/fields in a <div> body.
    const readout = controller.element.querySelector(".kg-figure__readout");
    expect(readout?.querySelector(".kg-figure__eyebrow")?.textContent).toBe("Bar");
    expect(readout?.querySelector("strong")?.textContent).toBe("A · Q2");
    const body = readout?.querySelector(".kg-figure__body");
    expect(body?.tagName.toLowerCase()).toBe("div");
    expect(body?.querySelector("dl.kg-figure__fields dt")?.textContent).toBe("Value");
    expect(body?.querySelector("dl.kg-figure__fields dd")?.textContent).toBe("9");
    // Inspect-only marks still get an accessible name from inspect.title.
    expect(bar2?.querySelector("title")?.textContent).toBe("A · Q2");
    controller.destroy();
  });
});
