import type {
  MachineEvent,
  MachineState,
  MachineStep,
  ResolvedFrame,
  ResolvedNode,
  ResolvedScene,
  ThemeTokens,
  VariableValue,
} from "@kineglyph/core";

export { adaptLiveSurface, bindLiveSurface } from "@kineglyph/core/surfaces";
export type {
  LiveSurfaceContext,
  LiveSurfaceUpdate,
  SurfaceCapture,
  LiveSurfaceHandle,
  LiveSurfaceRenderer,
  FrameSurfaceAdapter,
  BoundSignalSurfaceUpdate,
  BoundSignalSurfaceAdapter,
} from "@kineglyph/core/surfaces";
import {
  adaptLiveSurface,
  type LiveSurfaceContext,
  type LiveSurfaceUpdate,
  type SurfaceCapture,
  type LiveSurfaceHandle,
  type LiveSurfaceRenderer,
} from "@kineglyph/core/surfaces";

export interface MountLiveSurfacesOptions {
  readonly renderers?: Readonly<Record<string, LiveSurfaceRenderer>>;
  readonly theme: ThemeTokens;
  readonly machineState: MachineState | undefined;
  readonly signals: Readonly<Record<string, VariableValue>>;
  readonly time: number;
  readonly playing: boolean;
  readonly send: (event: string | MachineEvent) => MachineStep | undefined;
  readonly onError?: (nodeId: string, error: unknown) => void;
  /** Re-apply the current frame (see `LiveSurfaceContext.refresh`). */
  readonly onRefresh?: () => void;
  /** Restart the timeline (see `LiveSurfaceContext.replay`). */
  readonly onReplay?: () => void;
  /** The figure's event bus (see `LiveSurfaceContext.on`). */
  readonly on?: (event: string, handler: (payload: unknown) => void) => () => void;
}

interface SurfaceRecord {
  readonly nodeId: string;
  readonly layer: HTMLDivElement;
  readonly fallback: SVGImageElement | undefined;
  readonly abort: AbortController;
  handle: LiveSurfaceHandle | undefined;
  ready: boolean;
  pending: LiveSurfaceUpdate | undefined;
}

/** Manages live HTML renderers aligned to exportable `image({ live: true })` nodes. */
export class LiveSurfaceManager {
  #scene: ResolvedScene;
  readonly #options: MountLiveSurfacesOptions;
  readonly #records: SurfaceRecord[] = [];
  #disposed = false;

  constructor(stage: HTMLElement, scene: ResolvedScene, options: MountLiveSurfacesOptions) {
    this.#scene = scene;
    this.#options = options;
    for (const node of scene.nodes) {
      if (node.kind !== "image" || node.image?.live !== true) continue;
      const renderer = options.renderers?.[node.id];
      if (renderer === undefined) continue;
      const layer = stage.ownerDocument.createElement("div");
      layer.className = "kg-live-surface";
      layer.dataset.surfaceId = node.id;
      layer.setAttribute("aria-label", node.image.alt);
      placeLayer(layer, node, scene);
      stage.append(layer);
      const fallback = fallbackImage(stage, node.id);
      const record: SurfaceRecord = {
        nodeId: node.id,
        layer,
        fallback,
        abort: new AbortController(),
        handle: undefined,
        ready: false,
        pending: undefined,
      };
      this.#records.push(record);
      void this.#mount(record, node, renderer);
    }
  }

  async #mount(
    record: SurfaceRecord,
    node: ResolvedNode,
    renderer: LiveSurfaceRenderer,
  ): Promise<void> {
    try {
      const result = await renderer({
        element: record.layer,
        node,
        scene: this.#scene,
        theme: this.#options.theme,
        machineState: this.#options.machineState,
        signals: this.#options.signals,
        time: this.#options.time,
        playing: this.#options.playing,
        signal: record.abort.signal,
        send: this.#options.send,
        ...(this.#options.onRefresh === undefined ? {} : { refresh: this.#options.onRefresh }),
        ...(this.#options.onReplay === undefined ? {} : { replay: this.#options.onReplay }),
        ...(this.#options.on === undefined
          ? {}
          : {
              on: (event: string, handler: (payload: unknown) => void) => {
                const off = this.#options.on?.(event, handler) ?? (() => undefined);
                record.abort.signal.addEventListener("abort", off, { once: true });
                return off;
              },
            }),
      });
      const handle = normaliseHandle(result);
      if (record.abort.signal.aborted || this.#disposed) {
        handle?.destroy?.();
        return;
      }
      if (handle?.mounted === false) {
        record.layer.remove();
        return;
      }
      record.handle = handle;
      await handle?.ready;
      if (record.abort.signal.aborted || this.#disposed) return;
      record.ready = true;
      record.layer.dataset.ready = "true";
      applyMotion(record.layer, node);
      if (record.fallback !== undefined) record.fallback.style.opacity = "0";
      const pending = record.pending;
      record.pending = undefined;
      if (pending !== undefined && handle?.update !== undefined) await handle.update(pending);
    } catch (error) {
      if (!record.abort.signal.aborted) this.#options.onError?.(record.nodeId, error);
      record.layer.remove();
    }
  }

  update(frame: ResolvedFrame): void {
    this.#scene = frame;
    for (const record of this.#records) {
      const node = frame.nodes.find((candidate) => candidate.id === record.nodeId);
      if (node === undefined) continue;
      placeLayer(record.layer, node, frame);
      if (record.layer.dataset.ready === "true") applyMotion(record.layer, node);
      if (record.ready && record.fallback !== undefined) record.fallback.style.opacity = "0";
      const next = {
        frame,
        node,
        machineState: frame.machineState,
        signals: frame.signals ?? {},
        time: frame.time,
      } satisfies LiveSurfaceUpdate;
      if (!record.ready || record.handle === undefined) {
        record.pending = next;
        continue;
      }
      const update = record.handle.update?.(next);
      if (update !== undefined)
        void Promise.resolve(update).catch((error: unknown) => {
          if (!record.abort.signal.aborted) this.#options.onError?.(record.nodeId, error);
        });
    }
  }

  setPlaying(playing: boolean): void {
    for (const record of this.#records) {
      const update = record.handle?.playback?.(playing);
      if (update !== undefined)
        void Promise.resolve(update).catch((error: unknown) => {
          if (!record.abort.signal.aborted) this.#options.onError?.(record.nodeId, error);
        });
    }
  }

  /**
   * Snapshots of every surface that can capture, keyed by node id, as PNG data URLs. Surfaces
   * render `time` for it, so call this before rendering the frame that will embed them.
   */
  async snapshots(time: number): Promise<ReadonlyMap<string, string>> {
    const out = new Map<string, string>();
    for (const record of this.#records) {
      const capture = record.handle?.capture;
      if (!record.ready || capture === undefined) continue;
      try {
        const source = await capture(time);
        const url = snapshotUrl(source, record.layer.ownerDocument);
        if (url !== undefined) out.set(record.nodeId, url);
      } catch (error) {
        this.#options.onError?.(record.nodeId, error);
      }
    }
    return out;
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    for (const record of this.#records) {
      record.abort.abort();
      record.pending = undefined;
      record.handle?.destroy?.();
      record.layer.remove();
      if (record.fallback !== undefined) record.fallback.style.removeProperty("opacity");
    }
    this.#records.length = 0;
  }
}

export interface VideoSurfaceOptions {
  readonly src: string;
  readonly poster?: string;
  readonly muted?: boolean;
  readonly loop?: boolean;
  readonly preload?: "none" | "metadata" | "auto";
  readonly crossOrigin?: "anonymous" | "use-credentials";
  /** Kineglyph time at which media time zero begins. Defaults to 0. */
  readonly offset?: number;
  /** Media seconds per Kineglyph second. Defaults to 1. */
  readonly rate?: number;
  readonly attributes?: Readonly<Record<string, string>>;
}

/**
 * Mount a video whose decoded frame is slaved to the seekable Kineglyph timeline. The video never
 * runs an independent clock: every live frame sets `currentTime`, eliminating playback drift and
 * making pause, seek, restart, and reduced-motion frames agree with exported scene time.
 */
export function videoSurface(options: VideoSurfaceOptions): LiveSurfaceRenderer {
  const seek = (video: HTMLVideoElement, time: number): void => {
    video.pause();
    const rate = options.rate ?? 1;
    const desired = Math.max(0, ((time - (options.offset ?? 0)) / 1000) * rate);
    const mediaTime = Number.isFinite(video.duration) ? Math.min(video.duration, desired) : desired;
    if (Math.abs(video.currentTime - mediaTime) > 1 / 240) video.currentTime = mediaTime;
  };
  return adaptLiveSurface<HTMLVideoElement>({
    mount(context) {
      const video = context.element.ownerDocument.createElement("video");
      video.src = options.src;
      video.muted = options.muted ?? true;
      video.loop = options.loop ?? false;
      video.preload = options.preload ?? "auto";
      video.playsInline = true;
      if (options.poster !== undefined) video.poster = options.poster;
      if (options.crossOrigin !== undefined) video.crossOrigin = options.crossOrigin;
      for (const [name, value] of Object.entries(options.attributes ?? {}))
        video.setAttribute(name, value);
      video.style.display = "block";
      video.style.width = "100%";
      video.style.height = "100%";
      video.style.objectFit = context.node.image?.fit ?? "contain";
      context.element.append(video);
      return video;
    },
    async ready(video, context) {
      if (video.readyState < 2)
        await new Promise<void>((resolve, reject) => {
          const loaded = () => resolve();
          const failed = () => reject(new Error(`video could not load ${context.node.id}`));
          video.addEventListener("loadeddata", loaded, { once: true });
          video.addEventListener("error", failed, { once: true });
          context.signal.addEventListener(
            "abort",
            () => reject(new DOMException("Aborted", "AbortError")),
            { once: true },
          );
        });
      seek(video, context.time);
    },
    frame(video, update) {
      seek(video, update.time);
    },
    playback(video, playing) {
      // The scene clock owns playback; this callback is still useful to pause immediately when the
      // animator stops before another frame arrives.
      if (!playing) video.pause();
    },
    destroy(video) {
      video.pause();
      video.removeAttribute("src");
      video.load();
      video.remove();
    },
  });
}

function snapshotUrl(source: SurfaceCapture, doc: Document): string | undefined {
  if (source === undefined) return undefined;
  if (typeof source === "string") return source;
  const view = doc.defaultView;
  if (view !== null && source instanceof view.HTMLCanvasElement)
    return source.toDataURL("image/png");
  const width = "width" in source && typeof source.width === "number" ? source.width : 0;
  const height = "height" in source && typeof source.height === "number" ? source.height : 0;
  if (width <= 0 || height <= 0) return undefined;
  const canvas = doc.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (context === null) return undefined;
  context.drawImage(source, 0, 0);
  return canvas.toDataURL("image/png");
}

function normaliseHandle(
  result: void | (() => void) | LiveSurfaceHandle,
): LiveSurfaceHandle | undefined {
  if (result === undefined) return undefined;
  if (typeof result === "function") return { destroy: result };
  return result;
}

function placeLayer(layer: HTMLDivElement, node: ResolvedNode, scene: ResolvedScene): void {
  layer.style.left = `${(node.x / scene.width) * 100}%`;
  layer.style.top = `${(node.y / scene.height) * 100}%`;
  layer.style.width = `${(node.width / scene.width) * 100}%`;
  layer.style.height = `${(node.height / scene.height) * 100}%`;
  layer.style.borderRadius = `${node.appearance.radius}px`;
  layer.style.opacity = "0";
}

function applyMotion(layer: HTMLDivElement, node: ResolvedNode): void {
  layer.style.opacity = String(node.state.opacity);
  layer.style.transform = `translate(${node.state.translateX}px, ${node.state.translateY}px) scale(${node.state.scale})`;
}

function fallbackImage(stage: HTMLElement, nodeId: string): SVGImageElement | undefined {
  for (const image of stage.querySelectorAll<SVGImageElement>("image[data-live=true]")) {
    if (image.closest("[data-node-id]")?.getAttribute("data-node-id") === nodeId) return image;
  }
  return undefined;
}

export type ModelViewerSource = string | Blob | ArrayBuffer | Uint8Array;

export interface ModelViewerSurfaceOptions {
  /** Called after the scene has resolved, so GLB generation can use machine state and signals. */
  readonly source:
    | ModelViewerSource
    | ((context: LiveSurfaceContext) => ModelViewerSource | Promise<ModelViewerSource>);
  readonly alt?: string;
  readonly cameraControls?: boolean;
  readonly autoRotate?: boolean;
  readonly attributes?: Readonly<Record<string, string>>;
}

/**
 * Adapts generated GLB bytes to Google's `<model-viewer>` web component. The component remains an
 * optional peer: when it has not been registered, Kineglyph keeps the image node's static fallback.
 */
export function modelViewerSurface(options: ModelViewerSurfaceOptions): LiveSurfaceRenderer {
  return async (context) => {
    const view = context.element.ownerDocument.defaultView;
    if (view?.customElements.get("model-viewer") === undefined) return { mounted: false };
    const viewer = context.element.ownerDocument.createElement("model-viewer");
    viewer.setAttribute("alt", options.alt ?? context.node.image?.alt ?? context.node.label);
    viewer.setAttribute("loading", "eager");
    viewer.setAttribute("interaction-prompt", "none");
    viewer.setAttribute("tone-mapping", "neutral");
    if (options.cameraControls !== false) viewer.setAttribute("camera-controls", "");
    if (options.autoRotate === true) viewer.setAttribute("auto-rotate", "");
    for (const [name, value] of Object.entries(options.attributes ?? {}))
      viewer.setAttribute(name, value);
    viewer.style.display = "block";
    viewer.style.width = "100%";
    viewer.style.height = "100%";
    viewer.style.background = "transparent";
    context.element.append(viewer);

    const source =
      typeof options.source === "function" ? await options.source(context) : options.source;
    if (context.signal.aborted) return { mounted: false };
    const objectUrl = sourceUrl(source);
    const ready = new Promise<void>((resolve, reject) => {
      const loaded = () => resolve();
      const failed = () => reject(new Error(`model-viewer could not load ${context.node.id}`));
      viewer.addEventListener("load", loaded, { once: true });
      viewer.addEventListener("error", failed, { once: true });
      context.signal.addEventListener(
        "abort",
        () => reject(new DOMException("Aborted", "AbortError")),
        {
          once: true,
        },
      );
    });
    viewer.setAttribute("src", objectUrl.url);
    return {
      ready,
      destroy() {
        viewer.remove();
        objectUrl.revoke?.();
      },
    };
  };
}

function sourceUrl(source: ModelViewerSource): {
  readonly url: string;
  readonly revoke?: () => void;
} {
  if (typeof source === "string") return { url: source };
  const Url = globalThis.URL;
  const BlobType = globalThis.Blob;
  const part: BlobPart = source instanceof Uint8Array ? new Uint8Array(source).buffer : source;
  const blob =
    source instanceof BlobType ? source : new BlobType([part], { type: "model/gltf-binary" });
  const url = Url.createObjectURL(blob);
  return { url, revoke: () => Url.revokeObjectURL(url) };
}
