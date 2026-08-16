import type { FigureSource, ThemeTokens } from "@kineglyph/core";
import {
  mountKineglyph,
  getRegisteredScene,
  getRegisteredTheme,
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
  readonly mountOptions?: (element: HTMLElement) => Partial<Omit<MountOptions, "scene">>;
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
export async function defaultLoader(source: EmbedSource, element: HTMLElement): Promise<FigureSource> {
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
let updateListenerInstalled = false;

function stageOf(element: HTMLElement): HTMLElement {
  let stage = element.querySelector<HTMLElement>(":scope > [data-kg-stage]");
  if (stage === null) {
    stage = element.ownerDocument.createElement("div");
    stage.setAttribute("data-kg-stage", "");
    element.append(stage);
  }
  return stage;
}

function setStaticHidden(element: HTMLElement, hidden: boolean): void {
  for (const img of element.querySelectorAll<HTMLElement>(":scope > img, :scope > picture"))
    img.hidden = hidden;
}

function resolveTheme(options: MountAllOptions, element: HTMLElement): ThemeTokens | undefined {
  if (typeof options.theme === "function") return options.theme(element);
  if (options.theme !== undefined) return options.theme;
  const name = element.dataset.theme;
  return name === undefined ? undefined : getRegisteredTheme(name);
}

/** Appends a cache-busting query param so a re-`import()` of the same URL bypasses the module cache. */
function cacheBust(url: string): string {
  return `${url}${url.includes("?") ? "&" : "?"}t=${Date.now()}`;
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
      if (rec === undefined) continue;
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
  if (doc !== undefined) installUpdateListener(doc);
  const load = options.load ?? defaultLoader;
  const out: EmbeddedFigure[] = [];
  const hosts = [...root.querySelectorAll<HTMLElement>(options.selector ?? DEFAULT_SELECTOR)];
  await Promise.all(
    hosts.map(async (element) => {
      if (element.dataset.kineglyphMounted === "true") return;
      const source = detectSource(element);
      if (source === undefined) return; // static-only
      try {
        const scene = await load(source, element);
        const theme = resolveTheme(options, element);
        const controller = mountKineglyph(stageOf(element), {
          scene,
          ...(theme === undefined ? {} : { theme }),
          autoplay: element.dataset.autoplay !== "false",
          controls: element.dataset.controls !== "false",
          readout: element.dataset.readout !== "false",
          ...(options.mountOptions?.(element) ?? {}),
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
        out.push({ element, controller, source });
      } catch (error) {
        element.dataset.kineglyphError = error instanceof Error ? error.message : String(error);
        setStaticHidden(element, false);
      }
    }),
  );
  return out.sort((a, b) => hosts.indexOf(a.element) - hosts.indexOf(b.element));
}
