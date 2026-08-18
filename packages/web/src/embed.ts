import type { FigureSource, ThemeTokens } from "@kineglyph/core";
import {
  autoplayAttr,
  chromeAttr,
  mountKineglyph,
  getRegisteredScene,
  themeByName,
  type KineglyphController,
  type MountOptions,
} from "./index.js";

export type EmbedSource =
  | { readonly kind: "registered"; readonly id: string }
  | { readonly kind: "inline"; readonly source: string }
  | { readonly kind: "module"; readonly url: string };

export interface MountAllOptions {
  readonly root?: ParentNode;
  readonly selector?: string;
  readonly theme?: ThemeTokens | ((element: HTMLElement) => ThemeTokens | undefined);
  readonly load?: (source: EmbedSource, element: HTMLElement) => Promise<FigureSource>;
  /**
   * Per-element mount options, or **`null` to decline this element entirely**.
   *
   * Declining is checked before the scene is loaded, so a declined figure costs no module fetch
   * and no resolve, and its pre-rendered frame is left visible and unhidden — which is the point:
   * for a scene with nothing to drive (see `sceneNeedsRuntime`) the live mount would render the
   * frame that is already on the page, and the server-rendered SVG is the more accessible of the
   * two. Kineglyph never declines on its own; whether a still figure is worth mounting is the
   * embedder's call, and this is where that answer goes.
   *
   * An explicit `kineglyph:update` event overrides a decline — asking for an update is asking for
   * a live figure, which is what an editor preview or a dev-server scene edit means.
   */
  readonly mountOptions?: (element: HTMLElement) => Partial<Omit<MountOptions, "scene">> | null;
}

export interface EmbeddedFigure {
  readonly element: HTMLElement;
  readonly controller: KineglyphController;
  readonly source: EmbedSource;
}

const DEFAULT_SELECTOR = "figure.kg, [data-kineglyph]";
const INLINE_TYPE = "text/kineglyph";

export function detectSource(element: HTMLElement): EmbedSource | undefined {
  const inline = element.querySelector<HTMLScriptElement>(`script[type="${INLINE_TYPE}"]`);
  if (inline !== null) return { kind: "inline", source: inline.textContent ?? "" };
  const url = element.dataset.scene;
  if (url !== undefined && url !== "") return { kind: "module", url };
  const id = element.dataset.kineglyph;
  if (id !== undefined && id !== "") return { kind: "registered", id };
  return undefined;
}

function isFigure(value: unknown): value is FigureSource {
  return value !== null && typeof value === "object";
}

/** Browser loader: inline → blob module URL (import maps still apply), module → import(url). */
export async function defaultLoader(
  source: EmbedSource,
  element: HTMLElement,
): Promise<FigureSource> {
  if (source.kind === "registered") {
    const scene = getRegisteredScene(source.id);
    if (scene === undefined) throw new Error(`unknown scene "${source.id}"`);
    return scene;
  }
  if (source.kind === "module") {
    const base = element.ownerDocument?.baseURI ?? "http://localhost/";
    const url = new URL(source.url, base).href;
    const mod = (await import(/* @vite-ignore */ url)) as { default?: unknown };
    if (!isFigure(mod.default)) throw new Error(`${source.url}: no default scene export`);
    return mod.default;
  }
  const blob = new Blob([source.source], { type: "text/javascript" });
  const url = URL.createObjectURL(blob);
  try {
    const mod = (await import(/* @vite-ignore */ url)) as { default?: unknown };
    if (!isFigure(mod.default)) throw new Error("inline scene: no default export");
    return mod.default;
  } finally {
    URL.revokeObjectURL(url);
  }
}

interface MountRecord {
  controller: KineglyphController;
  source: EmbedSource;
  load: NonNullable<MountAllOptions["load"]>;
}
const registry = new WeakMap<HTMLElement, MountRecord>();
/**
 * Elements with a `mountOne` call currently awaiting `load`. Guards against a `kineglyph:update`
 * event racing the initial mount: without this, the event would find no `registry` record yet
 * (it's only set after `load` resolves) and trigger a second concurrent `mountOne`, double-
 * mounting into the same stage and leaking the first controller.
 */
const inFlight = new WeakSet<HTMLElement>();
let updateListenerInstalled = false;
/**
 * Options from the most recent `mountAll` call. The `kineglyph:update` listener uses them to
 * (re-)mount an element that has no registry record — a figure whose first mount threw would
 * otherwise stay dead forever.
 */
let lastMountAllOptions: MountAllOptions = {};

function stageOf(element: HTMLElement): HTMLElement {
  let stage = element.querySelector<HTMLElement>(":scope > [data-kg-stage]");
  if (stage === null) {
    stage = element.ownerDocument.createElement("div");
    stage.setAttribute("data-kg-stage", "");
    element.append(stage);
  }
  return stage;
}

/**
 * The pre-rendered frame a figure shows before (and without) JavaScript.
 *
 * `img` and `picture` are the obvious carriers, but an embedder that wants the host's CSS to reach
 * its diagram has to inline the SVG instead — an image is a separate document and inherits nothing
 * — so `[data-kg-static]` lets any element say "I am the frame the live stage replaces".
 */
const STATIC_SELECTOR = ":scope > img, :scope > picture, :scope > [data-kg-static]";

function setStaticHidden(element: HTMLElement, hidden: boolean): void {
  for (const frame of element.querySelectorAll<HTMLElement>(STATIC_SELECTOR)) frame.hidden = hidden;
}

function resolveTheme(options: MountAllOptions, element: HTMLElement): ThemeTokens | undefined {
  if (typeof options.theme === "function") return options.theme(element);
  if (options.theme !== undefined) return options.theme;
  const name = element.dataset.theme;
  return name === undefined ? undefined : themeByName(name);
}

function autoplayDelay(element: HTMLElement): number | undefined {
  const value = element.dataset.autoplayDelay;
  if (value === undefined || value.trim() === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

/** Appends a cache-busting query param so a re-`import()` of the same URL bypasses the module cache. */
function cacheBust(url: string): string {
  return `${url}${url.includes("?") ? "&" : "?"}t=${Date.now()}`;
}

/**
 * Mounts one embedded figure. Returns `undefined` when the element is already mounted, carries no
 * detectable source (static-only), the embedder declined it (`mountOptions` → `null`), or the
 * load/mount attempt failed (which records `data-kineglyph-error` and leaves the static fallback
 * visible).
 *
 * `force` is set by the `kineglyph:update` listener: an explicit request for a fresh scene is a
 * request for a live figure, so it overrides a decline.
 */
async function mountOne(
  element: HTMLElement,
  options: MountAllOptions,
  force = false,
): Promise<EmbeddedFigure | undefined> {
  if (element.dataset.kineglyphMounted === "true") return undefined;
  if (inFlight.has(element)) return undefined;
  const source = detectSource(element);
  if (source === undefined) return undefined; // static-only
  /*
   * Asked *before* `load`, so declining costs nothing: no module fetch, no resolve, and the
   * pre-rendered frame stays exactly as the server sent it. Asking after would have thrown away
   * the whole saving, since the fetch is the expensive half.
   */
  const chosen = options.mountOptions === undefined ? {} : options.mountOptions(element);
  if (chosen === null && !force) return undefined; // declined
  const load = options.load ?? defaultLoader;
  inFlight.add(element);
  try {
    const scene = await load(source, element);
    const theme = resolveTheme(options, element);
    const delay = autoplayDelay(element);
    const controller = mountKineglyph(stageOf(element), {
      scene,
      ...(theme === undefined ? {} : { theme }),
      autoplay: autoplayAttr(element.dataset.autoplay),
      ...(delay === undefined ? {} : { inView: { delay } }),
      controls: chromeAttr(element.dataset.controls),
      readout: chromeAttr(element.dataset.readout),
      ...(chosen ?? {}),
    });
    element.dataset.kineglyphMounted = "true";
    delete element.dataset.kineglyphError;
    setStaticHidden(element, true);
    registry.set(element, { controller, source, load });
    controller.on("destroy", () => {
      delete element.dataset.kineglyphMounted;
      setStaticHidden(element, false);
      registry.delete(element);
    });
    return { element, controller, source };
  } catch (error) {
    element.dataset.kineglyphError = error instanceof Error ? error.message : String(error);
    setStaticHidden(element, false);
    return undefined;
  } finally {
    inFlight.delete(element);
  }
}

function installUpdateListener(doc: Document): void {
  if (updateListenerInstalled) return;
  updateListenerInstalled = true;
  doc.addEventListener("kineglyph:update", (event) => {
    const detail = (event as CustomEvent<{ selector?: string; url?: string }>).detail ?? {};
    const targets: HTMLElement[] = [];
    if (detail.selector !== undefined) {
      try {
        targets.push(...doc.querySelectorAll<HTMLElement>(detail.selector));
      } catch {
        return; // malformed selector: never throw out of the event listener
      }
    } else if (detail.url !== undefined) {
      for (const el of doc.querySelectorAll<HTMLElement>(`[data-scene]`))
        if (
          new URL(el.dataset.scene ?? "", doc.baseURI).pathname ===
          new URL(detail.url, doc.baseURI).pathname
        )
          targets.push(el);
    }
    for (const el of targets) {
      const rec = registry.get(el);
      if (rec === undefined) {
        // Never mounted (or the first attempt failed): try a fresh mount rather than give up —
        // otherwise a figure that errored once can never recover from an update event.
        if (detectSource(el) !== undefined) void mountOne(el, lastMountAllOptions, true);
        continue;
      }
      const source: EmbedSource =
        rec.source.kind === "module"
          ? { kind: "module", url: cacheBust(detail.url ?? rec.source.url) }
          : rec.source.kind === "inline"
            ? (detectSource(el) ?? rec.source)
            : rec.source;
      void rec.load(source, el).then(
        (scene) => rec.controller.setScene(scene),
        (error: unknown) => {
          el.dataset.kineglyphError = error instanceof Error ? error.message : String(error);
        },
      );
    }
  });
}

function ownerDocumentOf(root: ParentNode): Document | undefined {
  const node = root as unknown as Node;
  if (node.nodeType === 9) return root as unknown as Document;
  return node.ownerDocument ?? undefined;
}

/** Mounts every embedded figure under `root`; resolves once all attempts settle. */
export async function mountAll(options: MountAllOptions = {}): Promise<EmbeddedFigure[]> {
  const root: ParentNode | undefined =
    options.root ?? (typeof document === "undefined" ? undefined : document);
  if (root === undefined || typeof root.querySelectorAll !== "function") return [];
  const doc = ownerDocumentOf(root);
  lastMountAllOptions = options;
  if (doc !== undefined) installUpdateListener(doc);
  const out: EmbeddedFigure[] = [];
  const hosts = [...root.querySelectorAll<HTMLElement>(options.selector ?? DEFAULT_SELECTOR)];
  await Promise.all(
    hosts.map(async (element) => {
      const figure = await mountOne(element, options);
      if (figure !== undefined) out.push(figure);
    }),
  );
  return out.sort((a, b) => hosts.indexOf(a.element) - hosts.indexOf(b.element));
}
