// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createTheme,
  defineScene,
  inheritTheme,
  resolveFigure,
  type SceneDefinition,
} from "@kineglyph/core";
import { renderSvg } from "@kineglyph/svg";
import {
  autoMount,
  modelViewerSurface,
  mountKineglyph,
  registerScene,
  registerTheme,
  startWhenVisible,
  STYLE_ID,
} from "../src/index.js";
import { FIGURE_STYLES, STYLE_ID as STYLE_ID_EXPORT } from "../src/styles.js";

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
  it("does not imply passive edges are clickable with a hover effect", () => {
    expect(FIGURE_STYLES).not.toContain(".kg-edge-group[role=img]:hover");
  });

  it("updates externally-driven signals without replacing the scene", () => {
    const live = defineScene({
      schemaVersion: 2,
      id: "live-signals",
      title: "Live signals",
      signals: { value: "waiting", active: 0 },
      root: {
        id: "root",
        type: "group",
        layout: "stack",
        children: [
          { id: "value", type: "text", text: "waiting", bind: { text: "value" } },
          { id: "bar", type: "rect", width: 40, height: 8, bind: { opacity: "active" } },
        ],
      },
    });
    const controller = mountKineglyph(host(), { scene: live, autoplay: false });
    const updates: unknown[] = [];
    controller.on("data", (signals) => updates.push(signals));
    controller.setSignals({ value: "42", active: 1 });
    expect(controller.element.querySelector('[data-node-id="value"] text')?.textContent).toBe("42");
    expect(
      controller.element.querySelector('[data-node-id="bar"]')?.getAttribute("opacity"),
    ).not.toBe("0");
    expect(controller.state.signals.value).toBe("42");
    expect(updates).toEqual([{ value: "42", active: 1 }]);
  });

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
    // The chrome names the same roles the drawing does, so a page that re-tints one re-tints both.
    expect(shell?.style.getPropertyValue("--kg-shell-accent")).toBe(
      "var(--kg-color-accent, #ff0000)",
    );
    controller.setTheme(createTheme({ colors: { accent: "#00ff00", canvas: "#010203" } }));
    expect(shell?.style.getPropertyValue("--kg-shell-accent")).toBe(
      "var(--kg-color-accent, #00ff00)",
    );
    // The paint names its role and carries the theme's value as the fallback, so the live stage
    // paints the new canvas colour whether or not the page defines the token.
    expect(element.querySelector(".kg-canvas")?.getAttribute("fill")).toBe(
      "var(--kg-color-canvas, #010203)",
    );
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

  it("leaves a drawn stage free to be as tall as its drawing", () => {
    // The reported defect, from the other end. The stage is `overflow-y: hidden`, and it used to
    // be pinned to `aspect-ratio: width / height` the moment a drawing was put in it. That is the
    // drawing's height only while the drawing shrinks to fit; an embedder that holds the SVG to a
    // minimum width — so labels stay legible on a phone instead of scaling to nothing — makes it
    // wider than the stage and therefore taller than that ratio, and the pin then cut the bottom
    // off the picture with no scrollbar to reach it. Half of a 128px figure, in the real case.
    //
    // The reservation belongs to the *empty* stage, so it is carried as custom properties that
    // `.kg-figure__stage:empty` reads, and a stage with a drawing in it is sized by the drawing.
    const element = host(1000);
    const controller = mountKineglyph(element, { scene, autoplay: false });
    const stage = element.querySelector<HTMLElement>(".kg-figure__stage");
    expect(stage?.querySelector("svg")).not.toBeNull();
    expect(stage?.style.aspectRatio).toBe("");
    expect(Number(stage?.style.getPropertyValue("--kg-stage-width"))).toBeGreaterThan(0);
    expect(Number(stage?.style.getPropertyValue("--kg-stage-height"))).toBeGreaterThan(0);
    // Still true after a re-render, which is where the pin was being re-applied.
    controller.resize(390);
    expect(stage?.style.aspectRatio).toBe("");
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
    let repeats = 0;
    startWhenVisible(
      element,
      () => {
        repeats += 1;
      },
      { once: false },
    );
    callback?.(
      [
        {
          isIntersecting: true,
          target: element,
        } as unknown as IntersectionObserverEntry,
      ],
      {} as IntersectionObserver,
    );
    callback?.(
      [
        {
          isIntersecting: false,
          target: element,
        } as unknown as IntersectionObserverEntry,
      ],
      {} as IntersectionObserver,
    );
    callback?.(
      [
        {
          isIntersecting: true,
          target: element,
        } as unknown as IntersectionObserverEntry,
      ],
      {} as IntersectionObserver,
    );
    expect(repeats).toBe(2);
    vi.stubGlobal("IntersectionObserver", undefined);
    let immediate = 0;
    startWhenVisible(element, () => {
      immediate += 1;
    });
    expect(immediate).toBe(1);
  });

  it("defaults to a delayed in-view start and cancels the delay when the figure leaves", () => {
    vi.useFakeTimers();
    let callback: IntersectionObserverCallback | undefined;
    class FakeObserver {
      constructor(cb: IntersectionObserverCallback) {
        callback = cb;
      }
      observe(): void {}
      disconnect(): void {}
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
    const controller = mountKineglyph(element, { scene });
    const entry = (isIntersecting: boolean): IntersectionObserverEntry =>
      ({ isIntersecting, target: element }) as unknown as IntersectionObserverEntry;

    expect(controller.state.time).toBe(0);
    expect(controller.state.playing).toBe(false);
    callback?.([entry(true)], {} as IntersectionObserver);
    vi.advanceTimersByTime(179);
    expect(controller.state.playing).toBe(false);
    callback?.([entry(false)], {} as IntersectionObserver);
    vi.advanceTimersByTime(1);
    expect(controller.state.playing).toBe(false);
    callback?.([entry(true)], {} as IntersectionObserver);
    vi.advanceTimersByTime(180);
    expect(controller.state.playing).toBe(true);

    controller.destroy();
    vi.useRealTimers();
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
    // The same semantic payload appears transiently at the focused mark, without requiring the
    // persistent readout to be enabled.
    const tooltip = controller.element.querySelector<HTMLElement>(".kg-figure__tooltip");
    expect(tooltip?.hidden).toBe(false);
    expect(tooltip?.getAttribute("role")).toBe("tooltip");
    expect(tooltip?.querySelector(".kg-figure__tooltip-role")?.textContent).toBe("Bar");
    expect(tooltip?.querySelector("strong")?.textContent).toBe("A · Q2");
    expect(tooltip?.querySelector("dd")?.textContent).toBe("9");
    controller.inspect(null);
    expect(tooltip?.hidden).toBe(true);
    // Inspect-only marks still get an accessible name from inspect.title.
    expect(bar2?.querySelector("title")?.textContent).toBe("A · Q2");
    controller.destroy();
  });

  it("can disable transient tooltips while keeping inspection callbacks", () => {
    const inspected: string[] = [];
    const controller = mountKineglyph(host(), {
      scene: chart,
      theme: createTheme(),
      autoplay: false,
      readout: false,
      tooltips: false,
      onInspect: (target) => inspected.push(target?.id ?? "none"),
    });
    const mark = controller.element.querySelector<SVGElement>('[data-node-id="a-1"]');
    (mark as unknown as HTMLElement).focus();
    expect(inspected).toContain("a-1");
    expect(controller.element.querySelector(".kg-figure__tooltip")).toBeNull();
    controller.destroy();
  });

  it("shows inspect-only dense marks on pointer hover without making them clickable", () => {
    const denseMark = defineScene({
      schemaVersion: 2,
      id: "dense-mark",
      title: "Dense plot",
      root: {
        id: "root",
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
              fields: [{ label: "Events", value: "42" }],
            },
          },
        ],
      },
    });
    const controller = mountKineglyph(host(), {
      scene: denseMark,
      theme: createTheme(),
      autoplay: false,
      readout: "auto",
    });
    const cell = controller.element.querySelector<SVGElement>('[data-node-id="cell"]');
    cell?.dispatchEvent(new MouseEvent("pointerover", { bubbles: true }));
    const tooltip = controller.element.querySelector<HTMLElement>(".kg-figure__tooltip");
    expect(cell?.getAttribute("role")).not.toBe("button");
    expect(tooltip?.hidden).toBe(false);
    expect(tooltip?.textContent).toContain("D1 · 00");
    expect(tooltip?.textContent).toContain("42");
    expect(controller.element.querySelector(".kg-figure__readout")).not.toBeNull();
    cell?.dispatchEvent(new MouseEvent("pointerout", { bubbles: true }));
    expect(tooltip?.hidden).toBe(true);
    controller.destroy();
  });

  it("bubbles decorative child hover to its inspectable owner without tooltip flicker", () => {
    const nestedCard = defineScene({
      schemaVersion: 2,
      id: "nested-card",
      title: "Nested card",
      root: {
        id: "root",
        type: "group",
        children: [
          {
            id: "card",
            type: "group",
            label: "Review is a state machine",
            description: "Choose a stage to move the review.",
            children: [
              { id: "card-eyebrow", type: "text", text: "ONE CHANGE" },
              { id: "card-title", type: "text", text: "Review is a state machine" },
              {
                id: "card-metric",
                type: "rect",
                width: 20,
                height: 20,
                inspect: {
                  role: "Metric",
                  title: "One accepted change",
                  fields: [{ label: "Count", value: "1" }],
                },
              },
            ],
          },
        ],
      },
    });
    const inspected: string[] = [];
    const controller = mountKineglyph(host(), {
      scene: nestedCard,
      theme: createTheme(),
      autoplay: false,
      readout: false,
      onInspect: (target) => inspected.push(target?.id ?? "none"),
    });
    const eyebrow = controller.element.querySelector<SVGElement>('[data-node-id="card-eyebrow"]')!;
    const title = controller.element.querySelector<SVGElement>('[data-node-id="card-title"]')!;
    const metric = controller.element.querySelector<SVGElement>('[data-node-id="card-metric"]')!;
    const tooltip = controller.element.querySelector<HTMLElement>(".kg-figure__tooltip")!;

    eyebrow.dispatchEvent(new MouseEvent("pointerover", { bubbles: true }));
    expect(controller.state.inspected?.id).toBe("card");
    expect(tooltip.querySelector("strong")?.textContent).toBe("Review is a state machine");

    eyebrow.dispatchEvent(new MouseEvent("pointerout", { bubbles: true, relatedTarget: title }));
    title.dispatchEvent(new MouseEvent("pointerover", { bubbles: true, relatedTarget: eyebrow }));
    expect(tooltip.hidden).toBe(false);
    expect(controller.state.inspected?.id).toBe("card");
    expect(inspected).toEqual(["card"]);

    title.dispatchEvent(new MouseEvent("pointerout", { bubbles: true, relatedTarget: metric }));
    metric.dispatchEvent(new MouseEvent("pointerover", { bubbles: true, relatedTarget: title }));
    expect(controller.state.inspected?.id).toBe("card-metric");
    expect(tooltip.querySelector("strong")?.textContent).toBe("One accepted change");
    expect(inspected).toEqual(["card", "card-metric"]);

    metric.dispatchEvent(new MouseEvent("pointerout", { bubbles: true }));
    expect(tooltip.hidden).toBe(true);
    expect(inspected).toEqual(["card", "card-metric", "none"]);
    controller.destroy();
  });
});

/**
 * A declared theme has to be an override *and* stay in its own figure. Those pull against each
 * other: the way to beat the page is to define the token, and the way to leak is to define it
 * somewhere shared. The tests below hold both ends — the pin exists, and it exists on this
 * figure's own shell, where the figure beside it cannot see it.
 */
describe("a figure's theme is scoped to the figure", () => {
  const shellOf = (element: HTMLElement): HTMLElement =>
    element.querySelector<HTMLElement>(".kg-figure") as HTMLElement;
  const pinsOn = (element: HTMLElement): string[] =>
    [...shellOf(element).style]
      .filter((name) => name.startsWith("--kg-color-"))
      .map((name) => `${name}:${shellOf(element).style.getPropertyValue(name)}`)
      .sort();
  const svgPinsIn = (element: HTMLElement): string[] =>
    [
      ...(element.querySelector("svg")?.getAttribute("style") ?? "").matchAll(
        /(--kg-color-[a-z0-9-]+):([^;]*)/g,
      ),
    ]
      .map((match) => `${match[1]}:${match[2]}`)
      .sort();

  it("pins nothing for a figure with no opinion", () => {
    const element = host();
    const controller = mountKineglyph(element, { scene, autoplay: false });

    expect(pinsOn(element)).toEqual([]);
    expect(svgPinsIn(element)).toEqual([]);
    // …while still naming every role, so the page's tokens reach the chrome as well as the drawing.
    expect(shellOf(element).style.getPropertyValue("--kg-shell-accent")).toContain(
      "var(--kg-color-accent,",
    );
    controller.destroy();
  });

  it("pins a declared theme without touching the document or the figure next to it", () => {
    const declared = host();
    const neighbour = host();
    const a = mountKineglyph(declared, {
      scene,
      theme: createTheme({ colors: { accent: "#ff00ff", canvas: "#101216" } }),
      autoplay: false,
    });
    const b = mountKineglyph(neighbour, { scene, autoplay: false });

    expect(pinsOn(declared)).toEqual(["--kg-color-accent:#ff00ff", "--kg-color-canvas:#101216"]);
    expect(pinsOn(neighbour)).toEqual([]);
    // Nothing was written above either figure — that is the whole difference between an override
    // and a repaint of the article.
    expect(document.documentElement.getAttribute("style")).toBeNull();
    expect(document.body.getAttribute("style")).toBeNull();
    a.destroy();
    b.destroy();
  });

  it("pins only what a partial theme names", () => {
    const element = host();
    const controller = mountKineglyph(element, {
      scene,
      theme: createTheme({ colors: { accent: "#ff00ff" } }),
      autoplay: false,
    });

    expect(pinsOn(element)).toEqual(["--kg-color-accent:#ff00ff"]);
    // Nineteen roles still read through, carrying the theme's literal only as a fallback.
    expect(shellOf(element).style.getPropertyValue("--kg-shell-background")).toBe(
      "var(--kg-color-canvas, #eef1f5)",
    );
    controller.destroy();
  });

  it("lets a figure go back to following the page", () => {
    const element = host();
    const controller = mountKineglyph(element, {
      scene,
      theme: createTheme({ colors: { accent: "#ff00ff" } }),
      autoplay: false,
    });
    expect(pinsOn(element)).toEqual(["--kg-color-accent:#ff00ff"]);

    // A pin nobody clears is an override the author has deleted but the page still obeys.
    controller.setTheme(inheritTheme(createTheme({ colors: { accent: "#ff00ff" } })));
    expect(pinsOn(element)).toEqual([]);
    expect(svgPinsIn(element)).toEqual([]);
    controller.destroy();
  });

  it("gives the prerendered frame and the hydrated one the same pins", () => {
    // The two paths are the same renderer, and this is the assertion that keeps them so: the
    // publish-time string and the DOM the runtime builds carry an identical set of overrides, so
    // a reader with JavaScript off and a reader with it on see one figure, not two.
    const theme = createTheme({ colors: { accent: "#ff00ff", canvas: "#101216" } });
    const prerendered = renderSvg(resolveFigure(scene, { width: 900, theme }));
    const element = host();
    const controller = mountKineglyph(element, { scene, theme, autoplay: false });

    const prerenderedPins = [
      ...(/style="([^"]*)"/.exec(prerendered)?.[1] ?? "").matchAll(
        /(--kg-color-[a-z0-9-]+):([^;]*)/g,
      ),
    ]
      .map((match) => `${match[1]}:${match[2]}`)
      .sort();

    expect(prerenderedPins).toEqual(["--kg-color-accent:#ff00ff", "--kg-color-canvas:#101216"]);
    expect(svgPinsIn(element)).toEqual(prerenderedPins);
    controller.destroy();
  });

  it("resolves the reserved name a host writes when it means inherit", () => {
    registerTheme("declared-dark", createTheme({ colors: { canvas: "#101216" } }));
    const declared = host();
    const following = host();
    declared.dataset.kineglyph = "lab";
    declared.dataset.theme = "declared-dark";
    declared.dataset.autoplay = "false";
    following.dataset.kineglyph = "lab";
    following.dataset.theme = "inherit";
    following.dataset.autoplay = "false";
    registerScene("lab", scene);

    const controllers = autoMount();

    expect(pinsOn(declared)).toEqual(["--kg-color-canvas:#101216"]);
    expect(pinsOn(following)).toEqual([]);
    for (const controller of controllers) controller.destroy();
  });
});
