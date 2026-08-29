// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { defaultTheme, type ResolvedNode, type ResolvedScene } from "@kineglyph/core";
import {
  adaptLiveSurface,
  bindLiveSurface,
  videoSurface,
  type LiveSurfaceContext,
  type LiveSurfaceHandle,
  type LiveSurfaceRenderer,
  type LiveSurfaceUpdate,
  LiveSurfaceManager,
} from "../src/surfaces.js";

const node = {
  id: "preview",
  kind: "image",
  x: 0,
  y: 0,
  width: 100,
  height: 60,
  label: "Preview",
  appearance: { fill: "#fff", stroke: "#000", strokeWidth: 1, radius: 0 },
  state: { opacity: 1, translateX: 0, translateY: 0, scale: 1, progress: 1 },
  interactive: false,
  focusable: false,
  metadata: {},
  image: { href: "/fallback.png", alt: "Preview", fit: "contain", live: true },
} as ResolvedNode;
const scene = {
  id: "surface",
  width: 100,
  height: 60,
  nodes: [node],
  edges: [],
  theme: {},
} as unknown as ResolvedScene;

function context(
  time = 0,
  signals: Readonly<Record<string, number | string | boolean>> = {},
): LiveSurfaceContext {
  const element = document.createElement("div");
  document.body.append(element);
  return {
    element,
    node,
    scene,
    theme: defaultTheme,
    machineState: undefined,
    signals,
    time,
    playing: false,
    signal: new AbortController().signal,
    send: () => undefined,
  };
}

function update(
  time: number,
  signals: Readonly<Record<string, number | string | boolean>> = {},
): LiveSurfaceUpdate {
  return {
    frame: { ...scene, time, progress: 0, nodes: [node] },
    node,
    machineState: undefined,
    signals,
    time,
  };
}

async function handle(
  renderer: LiveSurfaceRenderer,
  ctx: LiveSurfaceContext,
): Promise<LiveSurfaceHandle> {
  const result = await renderer(ctx);
  if (result === undefined) return {};
  if (typeof result === "function") return { destroy: result };
  return result;
}

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe("adaptLiveSurface", () => {
  it("serializes async rendering and coalesces pending work to the newest frame", async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const rendered: number[] = [];
    const surface = adaptLiveSurface({
      mount: () => ({}),
      async frame(_target, next) {
        rendered.push(next.time);
        if (next.time === 10) await gate;
      },
    });
    const mounted = await handle(surface, context());
    const first = mounted.update?.(update(10));
    void mounted.update?.(update(20));
    void mounted.update?.(update(30));
    release();
    await first;
    expect(rendered).toEqual([10, 30]);
  });
});

describe("bindLiveSurface", () => {
  it("applies initial signals, observes selected changes, and keeps timeline updates optional", async () => {
    const applied: Array<{ initial: boolean; changed: readonly string[]; time: number }> = [];
    const surface = bindLiveSurface({
      mount: () => ({ runtime: "expensive" }),
      watch: ["radius"],
      apply(_target, next) {
        applied.push({ initial: next.initial, changed: next.changed, time: next.time });
      },
    });
    const mounted = await handle(surface, context(0, { radius: 4, ignored: 1 }));
    await mounted.ready;
    await mounted.update?.(update(100, { radius: 4, ignored: 2 }));
    await mounted.update?.(update(200, { radius: 5, ignored: 2 }));
    expect(applied).toEqual([
      { initial: true, changed: ["ignored", "radius"], time: 0 },
      { initial: false, changed: ["radius"], time: 200 },
    ]);
  });

  it("can slave an external runtime to Kineglyph time without rebuilding it", async () => {
    let mounts = 0;
    const times: number[] = [];
    const surface = bindLiveSurface({
      mount: () => ({ id: ++mounts }),
      watch: ["shape"],
      includeTime: true,
      apply(_target, next) {
        times.push(next.time);
      },
    });
    const mounted = await handle(surface, context(0, { shape: "torus" }));
    await mounted.ready;
    await mounted.update?.(update(120, { shape: "torus" }));
    await mounted.update?.(update(240, { shape: "torus" }));
    expect(mounts).toBe(1);
    expect(times).toEqual([0, 120, 240]);
  });
});

describe("videoSurface", () => {
  it("slaves decoded media time to timeline frames and never starts an independent clock", async () => {
    const pause = vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);
    vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => undefined);
    const ctx = context(1000);
    const mounted = await handle(videoSurface({ src: "/preview.mp4", offset: 500, rate: 2 }), ctx);
    const video = ctx.element.querySelector("video");
    expect(video).not.toBeNull();
    video?.dispatchEvent(new Event("loadeddata"));
    await mounted.ready;
    expect(video?.currentTime).toBe(1);
    await mounted.update?.(update(2500));
    expect(video?.currentTime).toBe(4);
    await mounted.playback?.(false);
    expect(pause).toHaveBeenCalled();
    mounted.destroy?.();
    expect(ctx.element.querySelector("video")).toBeNull();
  });
});

describe("LiveSurfaceManager.snapshots", () => {
  it("collects data URLs from surfaces that can capture", async () => {
    const stage = document.createElement("div");
    document.body.append(stage);
    const manager = new LiveSurfaceManager(stage, scene, {
      renderers: {
        [node.id]: () => ({ capture: (time: number) => `data:image/png;base64,${time}` }),
      },
      theme: defaultTheme,
      machineState: undefined,
      signals: {},
      time: 0,
      playing: false,
      send: () => undefined,
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    const snapshots = await manager.snapshots(450);
    expect(snapshots.get(node.id)).toBe("data:image/png;base64,450");
    manager.dispose();
  });

  it("is empty when no surface captures", async () => {
    const stage = document.createElement("div");
    document.body.append(stage);
    const manager = new LiveSurfaceManager(stage, scene, {
      renderers: { [node.id]: () => ({}) },
      theme: defaultTheme,
      machineState: undefined,
      signals: {},
      time: 0,
      playing: false,
      send: () => undefined,
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect((await manager.snapshots(0)).size).toBe(0);
    manager.dispose();
  });
});
