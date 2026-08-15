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

export interface LiveSurfaceContext {
  /** HTML layer aligned to the live image node. Mount a canvas, model-viewer, iframe, or app here. */
  readonly element: HTMLDivElement;
  readonly node: ResolvedNode;
  readonly scene: ResolvedScene;
  readonly theme: ThemeTokens;
  readonly machineState: MachineState | undefined;
  readonly signals: Readonly<Record<string, VariableValue>>;
  readonly time: number;
  readonly signal: AbortSignal;
  readonly send: (event: string | MachineEvent) => MachineStep | undefined;
}

export interface LiveSurfaceUpdate {
  readonly frame: ResolvedFrame;
  readonly node: ResolvedNode;
  readonly machineState: MachineState | undefined;
  readonly signals: Readonly<Record<string, VariableValue>>;
  readonly time: number;
}

export interface LiveSurfaceHandle {
  /** Leave the static image visible and discard the HTML layer. */
  readonly mounted?: boolean;
  /** Delay the handoff from the static image until the live renderer is ready. */
  readonly ready?: Promise<void>;
  readonly update?: (next: LiveSurfaceUpdate) => void;
  readonly destroy?: () => void;
}

export type LiveSurfaceRenderer = (
  context: LiveSurfaceContext,
) => void | (() => void) | LiveSurfaceHandle | Promise<void | (() => void) | LiveSurfaceHandle>;

export interface MountLiveSurfacesOptions {
  readonly renderers?: Readonly<Record<string, LiveSurfaceRenderer>>;
  readonly theme: ThemeTokens;
  readonly machineState: MachineState | undefined;
  readonly signals: Readonly<Record<string, VariableValue>>;
  readonly time: number;
  readonly send: (event: string | MachineEvent) => MachineStep | undefined;
  readonly onError?: (nodeId: string, error: unknown) => void;
}

interface SurfaceRecord {
  readonly nodeId: string;
  readonly layer: HTMLDivElement;
  readonly fallback: SVGImageElement | undefined;
  readonly abort: AbortController;
  handle: LiveSurfaceHandle | undefined;
}

/** Manages live HTML renderers aligned to exportable `image({ live: true })` nodes. */
export class LiveSurfaceManager {
  readonly #scene: ResolvedScene;
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
        signal: record.abort.signal,
        send: this.#options.send,
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
      record.layer.dataset.ready = "true";
      applyMotion(record.layer, node);
      if (record.fallback !== undefined) record.fallback.style.opacity = "0";
    } catch (error) {
      if (!record.abort.signal.aborted) this.#options.onError?.(record.nodeId, error);
      record.layer.remove();
    }
  }

  update(frame: ResolvedFrame): void {
    for (const record of this.#records) {
      const node = frame.nodes.find((candidate) => candidate.id === record.nodeId);
      if (node === undefined) continue;
      if (record.layer.dataset.ready === "true") applyMotion(record.layer, node);
      record.handle?.update?.({
        frame,
        node,
        machineState: frame.machineState,
        signals: frame.signals ?? {},
        time: frame.time,
      });
    }
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    for (const record of this.#records) {
      record.abort.abort();
      record.handle?.destroy?.();
      record.layer.remove();
      if (record.fallback !== undefined) record.fallback.style.removeProperty("opacity");
    }
    this.#records.length = 0;
  }
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
