/**
 * A compact, framework-neutral live authoring surface for documentation examples.
 *
 * The source stays an ordinary default-exporting ESM scene module. Edits are evaluated through a
 * replaceable loader, and successful scenes are swapped through the normal Kineglyph controller.
 * The default loader uses a blob module, so the page's import map continues to own `kineglyph`.
 */
import {
  defaultTheme,
  seekTimeline,
  type FigureSource,
  type ResolvedScene,
  type ThemeTokens,
} from "@kineglyph/core";
import { renderSvg } from "@kineglyph/svg";
import { loadGifenc } from "./gifenc.js";
import {
  autoplayAttr,
  chromeAttr,
  mountKineglyph,
  type ChromeSetting,
  type AutoplaySetting,
  type KineglyphController,
  type StartWhenVisibleOptions,
} from "./index.js";
import type { LabEditor } from "./lab-editor.js";

export type KineglyphLabView = "source" | "split" | "preview";
export type KineglyphLabSetup = (
  controller: KineglyphController,
  element: HTMLElement,
) => void | (() => void);
export interface KineglyphLabModuleResult {
  readonly scene: FigureSource;
  readonly theme?: ThemeTokens;
  /** Repeat the deterministic timeline while the figure is active. */
  readonly loop?: boolean;
  /** Starts optional live example behaviour after mount. The returned disposer runs before reruns. */
  readonly setup?: KineglyphLabSetup;
}
export type KineglyphLabLoader = (
  source: string,
  element: HTMLElement,
) => Promise<FigureSource | KineglyphLabModuleResult>;

export interface MountKineglyphLabOptions {
  readonly source?: string;
  readonly view?: KineglyphLabView;
  readonly theme?: ThemeTokens;
  readonly debounceMs?: number;
  readonly autoplay?: AutoplaySetting;
  readonly loop?: boolean;
  readonly inView?: StartWhenVisibleOptions;
  readonly controls?: ChromeSetting;
  readonly readout?: ChromeSetting;
  readonly tooltips?: boolean;
  readonly machineControls?: ChromeSetting;
  /** Starts the development bounds/quality overlay; the editor toolbar can toggle it later. */
  readonly doctor?: boolean;
  readonly load?: KineglyphLabLoader;
  readonly onError?: (error: unknown) => void;
  readonly onSourceChange?: (source: string) => void;
}

export interface MountAllKineglyphLabsOptions extends Omit<
  MountKineglyphLabOptions,
  "source" | "view" | "theme"
> {
  readonly root?: ParentNode;
  readonly selector?: string;
  readonly theme?: ThemeTokens | ((element: HTMLElement) => ThemeTokens | undefined);
  readonly options?: (
    element: HTMLElement,
  ) => Partial<Omit<MountKineglyphLabOptions, "source" | "theme">>;
}

export interface KineglyphLabController {
  readonly element: HTMLElement;
  readonly source: string;
  readonly view: KineglyphLabView;
  readonly figure: KineglyphController | undefined;
  readonly ready: Promise<boolean>;
  setSource(source: string, options?: { readonly run?: boolean }): void;
  setView(view: KineglyphLabView): void;
  setTheme(theme: ThemeTokens): void;
  run(): Promise<boolean>;
  reset(): void;
  focus(): void;
  destroy(): void;
}

const LAB_STYLE_ID = "kineglyph-lab-styles";
const DEFAULT_SELECTOR = "[data-kineglyph-lab]";
let labExportMenuCounter = 0;

const LAB_STYLES = `
.kg-lab{--kg-lab-border:var(--kg-color-border,var(--kg-shell-border,#d7dbe2));--kg-lab-bg:var(--kg-color-canvas,var(--kg-shell-background,#fff));--kg-lab-surface:var(--kg-color-surface,var(--kg-shell-surface,#f7f8fa));--kg-lab-text:var(--kg-color-text,var(--kg-shell-text,#172033));--kg-lab-muted:var(--kg-color-text-muted,var(--kg-shell-muted,#657087));--kg-lab-accent:var(--kg-color-accent,var(--kg-shell-accent,#5b67f1));--kg-lab-code-bg:color-mix(in srgb,var(--kg-lab-bg) 92%,#0d1222);--kg-lab-code-text:var(--kg-lab-text);--kg-lab-syntax-keyword:var(--kg-color-accent,#8b8df5);--kg-lab-syntax-string:var(--kg-color-danger,#e56d88);--kg-lab-syntax-number:var(--kg-color-warning,#d79a42);--kg-lab-syntax-comment:var(--kg-lab-muted);--kg-lab-syntax-name:var(--kg-color-info,#58a6e7);--kg-lab-syntax-property:color-mix(in srgb,var(--kg-lab-text) 72%,var(--kg-lab-accent));--kg-lab-font:var(--kg-shell-font,Inter,ui-sans-serif,system-ui,sans-serif);--kg-lab-mono:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;container-name:kg-lab;container-type:inline-size;display:block;margin:1.5rem 0;overflow:hidden;border:1px solid var(--kg-lab-border);border-radius:12px;background:var(--kg-lab-bg);color:var(--kg-lab-text);font-family:var(--kg-lab-font)}
.kg-lab *{box-sizing:border-box}.kg-lab>[data-kg-static]{margin:0}.kg-lab__shell{display:block}.kg-lab__bar{position:relative;display:flex;min-height:45px;align-items:center;justify-content:space-between;gap:12px;padding:6px 8px;border-bottom:1px solid var(--kg-lab-border);background:var(--kg-lab-surface)}
.kg-lab__tabs,.kg-lab__actions{display:flex;align-items:center;gap:4px}.kg-lab button{appearance:none;border:1px solid transparent;border-radius:7px;padding:8px 10px;background:transparent;color:var(--kg-lab-muted);font:650 12px/1 var(--kg-lab-font);cursor:pointer}.kg-lab button:hover{color:var(--kg-lab-text);background:color-mix(in srgb,var(--kg-lab-accent) 8%,transparent)}.kg-lab button:focus-visible{outline:2px solid var(--kg-lab-accent);outline-offset:1px}.kg-lab__tabs button[aria-selected=true]{border-color:color-mix(in srgb,var(--kg-lab-accent) 35%,var(--kg-lab-border));background:color-mix(in srgb,var(--kg-lab-accent) 10%,transparent);color:var(--kg-lab-text)}.kg-lab__run{color:var(--kg-lab-text)!important}.kg-lab__shortcut{margin-left:4px;color:var(--kg-lab-muted);font:10px/1 var(--kg-lab-mono)}
.kg-lab__workspace{display:grid;min-width:0;min-height:var(--kg-lab-height,420px);grid-template-columns:minmax(0,1fr) minmax(0,1fr)}.kg-lab__editor,.kg-lab__preview{min-width:0;min-height:0}.kg-lab__editor{height:var(--kg-lab-height,420px);overflow:hidden;border-right:1px solid var(--kg-lab-border);background:var(--kg-lab-code-bg)}.kg-lab__preview{display:grid;align-content:center;overflow:auto;padding:16px;background:var(--kg-lab-bg)}.kg-lab__preview-host{width:100%;min-width:0}.kg-lab__loading{display:grid;height:100%;place-items:center;color:var(--kg-lab-muted);font:12px/1.5 var(--kg-lab-font)}
.kg-lab[data-view=source] .kg-lab__workspace{grid-template-columns:1fr}.kg-lab[data-view=source] .kg-lab__preview{display:none}.kg-lab[data-view=source] .kg-lab__editor{border-right:0}.kg-lab[data-view=preview] .kg-lab__workspace{display:block}.kg-lab[data-view=preview] .kg-lab__editor{display:none}.kg-lab[data-view=preview] .kg-lab__preview{min-height:var(--kg-lab-height,420px)}
.kg-lab__preview-actions{display:none}.kg-lab__edit,.kg-lab__export-toggle{border-color:color-mix(in srgb,var(--kg-lab-muted) 38%,transparent)!important;padding:5px 8px!important;font-weight:550!important}.kg-lab__export{position:relative}.kg-lab__export[hidden],.kg-lab__export-menu[hidden]{display:none!important}.kg-lab__export-toggle[aria-expanded=true]{border-color:color-mix(in srgb,var(--kg-lab-accent) 45%,var(--kg-lab-border))!important;color:var(--kg-lab-text);background:color-mix(in srgb,var(--kg-lab-accent) 8%,transparent)}.kg-lab__export-chevron{display:inline-block;margin-left:3px;font-size:9px;transform:translateY(-1px)}.kg-lab__export-menu{position:absolute;right:0;bottom:calc(100% + 6px);z-index:20;width:max-content;min-width:138px;padding:4px;border:1px solid var(--kg-lab-border);border-radius:9px;background:var(--kg-lab-surface);box-shadow:0 10px 28px color-mix(in srgb,#000 24%,transparent)}.kg-lab__export-menu button{display:block;width:100%;padding:8px 10px;text-align:left;white-space:nowrap}.kg-lab__export-menu small{display:block;margin-top:3px;color:var(--kg-lab-muted);font:10px/1.2 var(--kg-lab-mono)}.kg-lab__status{min-height:34px;margin:0;padding:9px 12px;border-top:1px solid var(--kg-lab-border);color:var(--kg-lab-muted);background:var(--kg-lab-surface);font:11px/1.35 var(--kg-lab-mono)}.kg-lab__status[data-kind=error]{color:#c63d52}.kg-lab__status[data-kind=success]{color:color-mix(in srgb,#25a46f 80%,var(--kg-lab-text))}
.kg-lab[data-view=preview]{overflow:visible;border:0;border-radius:0;background:transparent}.kg-lab[data-view=preview] .kg-lab__bar,.kg-lab[data-view=preview] .kg-lab__status:not([data-kind=error]){display:none}.kg-lab[data-view=preview] .kg-lab__workspace,.kg-lab[data-view=preview] .kg-lab__preview{min-height:0}.kg-lab[data-view=preview] .kg-lab__preview{padding:0;background:transparent}.kg-lab[data-view=preview] .kg-figure__stage{background:transparent}.kg-lab[data-view=preview] .kg-lab__preview-actions{display:flex;align-items:center;justify-content:flex-end;gap:6px;padding:6px 0 0;background:transparent}
@container kg-lab (max-width:640px){.kg-lab__bar{align-items:flex-start;flex-direction:column}.kg-lab__actions{position:absolute;right:8px}.kg-lab__tabs button{padding-inline:8px}.kg-lab__shortcut{display:none}.kg-lab[data-view=split] .kg-lab__workspace{grid-template-columns:1fr}.kg-lab[data-view=split] .kg-lab__editor{height:min(46vh,360px);border-right:0;border-bottom:1px solid var(--kg-lab-border)}.kg-lab[data-view=split] .kg-lab__preview{min-height:300px}.kg-lab__workspace{min-height:0}}
@media(prefers-reduced-motion:reduce){.kg-lab *{scroll-behavior:auto!important}}
`;

function ensureLabStyles(element: Element): void {
  const doc = element.ownerDocument;
  if (doc.getElementById(LAB_STYLE_ID) !== null) return;
  const style = doc.createElement("style");
  style.id = LAB_STYLE_ID;
  style.textContent = LAB_STYLES;
  (doc.head ?? doc.documentElement).append(style);
}

function isView(value: string | undefined): value is KineglyphLabView {
  return value === "source" || value === "split" || value === "preview";
}

function sourceScript(element: HTMLElement): HTMLScriptElement | undefined {
  return (
    element.querySelector<HTMLScriptElement>(':scope > script[type="text/kineglyph"]') ?? undefined
  );
}

function staticFrames(element: HTMLElement): HTMLElement[] {
  return Array.from(
    element.querySelectorAll<HTMLElement>(
      ":scope > img, :scope > picture, :scope > [data-kg-static]",
    ),
  );
}

function showStatic(element: HTMLElement, show: boolean): void {
  for (const frame of staticFrames(element)) frame.hidden = !show;
}

function message(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

/** A still scene can be exported in-browser without asking which moment or machine state to use. */
function isPortableExportScene(scene: ResolvedScene): boolean {
  return !scene.nodes.some((node) => node.image?.live === true);
}

type LabExportFormat = "svg" | "png" | "gif";

function exportFileName(scene: ResolvedScene, extension: LabExportFormat): string {
  const stem = scene.id
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${stem || "kineglyph-figure"}.${extension}`;
}

function downloadBlob(doc: Document, blob: Blob, name: string): void {
  const urlApi = doc.defaultView?.URL ?? URL;
  const href = urlApi.createObjectURL(blob);
  const anchor = doc.createElement("a");
  anchor.href = href;
  anchor.download = name;
  anchor.hidden = true;
  (doc.body ?? doc.documentElement).append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => urlApi.revokeObjectURL(href), 0);
}

async function pngBlob(doc: Document, svg: string, width: number, height: number): Promise<Blob> {
  const view = doc.defaultView;
  if (view === null) throw new Error("PNG export needs a browser window");
  const urlApi = view.URL;
  const source = new view.Blob([svg], { type: "image/svg+xml;charset=utf-8" });
  const href = urlApi.createObjectURL(source);
  try {
    const image = new view.Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("The browser could not rasterize this SVG"));
      image.src = href;
    });
    const scale = 2;
    const canvas = doc.createElement("canvas");
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const context = canvas.getContext("2d");
    if (context === null) throw new Error("Canvas is unavailable for PNG export");
    context.scale(scale, scale);
    context.drawImage(image, 0, 0, width, height);
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) => (blob === null ? reject(new Error("PNG encoding failed")) : resolve(blob)),
        "image/png",
      );
    });
  } finally {
    urlApi.revokeObjectURL(href);
  }
}

const GIF_MAX_WIDTH = 960;
const GIF_MAX_HEIGHT = 720;
const GIF_MAX_FRAMES = 180;
const GIF_FPS = 12;

function gifFrameTimes(duration: number): number[] {
  if (duration <= 0) return [0];
  const count = Math.max(2, Math.min(GIF_MAX_FRAMES, Math.floor((duration * GIF_FPS) / 1_000) + 1));
  return Array.from({ length: count }, (_, index) =>
    index === count - 1 ? duration : (index / (count - 1)) * duration,
  );
}

async function drawSvgFrame(
  doc: Document,
  context: CanvasRenderingContext2D,
  svg: string,
  width: number,
  height: number,
  background: string,
): Promise<Uint8ClampedArray> {
  const view = doc.defaultView;
  if (view === null) throw new Error("GIF export needs a browser window");
  const urlApi = view.URL;
  const source = new view.Blob([svg], { type: "image/svg+xml;charset=utf-8" });
  const href = urlApi.createObjectURL(source);
  try {
    const image = new view.Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("The browser could not rasterize a GIF frame"));
      image.src = href;
    });
    context.save();
    context.clearRect(0, 0, width, height);
    context.fillStyle = background;
    context.fillRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);
    context.restore();
    return context.getImageData(0, 0, width, height).data;
  } finally {
    urlApi.revokeObjectURL(href);
  }
}

/** Browser-native GIF export: the same seekable scene is sampled without a server round-trip. */
async function gifBlob(doc: Document, scene: ResolvedScene): Promise<Blob> {
  const view = doc.defaultView;
  if (view === null) throw new Error("GIF export needs a browser window");
  const { GIFEncoder, applyPalette, quantize } = await loadGifenc();
  const scale = Math.min(
    1,
    GIF_MAX_WIDTH / Math.max(1, scene.width),
    GIF_MAX_HEIGHT / Math.max(1, scene.height),
  );
  const width = Math.max(1, Math.round(scene.width * scale));
  const height = Math.max(1, Math.round(scene.height * scale));
  const canvas = doc.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (context === null) throw new Error("Canvas is unavailable for GIF export");
  const duration = scene.timeline?.duration ?? 0;
  const times = gifFrameTimes(duration);
  const delay =
    times.length <= 1 ? 1_000 : Math.max(20, Math.round(duration / (times.length - 1) / 10) * 10);
  const encoder = GIFEncoder({ auto: true });

  for (const [index, time] of times.entries()) {
    const frame = seekTimeline(scene, time);
    const svg = renderSvg(frame, {
      idPrefix: `export-${scene.id}-frame-${index}`,
      background: "none",
      animateFlow: false,
      effects: "portable",
    });
    const rgba = await drawSvgFrame(doc, context, svg, width, height, scene.theme.background);
    const palette = quantize(rgba, 256);
    const indexed = applyPalette(rgba, palette);
    encoder.writeFrame(indexed, width, height, {
      palette,
      delay: index === times.length - 1 ? delay + 800 : delay,
      repeat: 0,
    });
    // Let the editor, progress text, and page remain responsive during longer timelines.
    if (index % 4 === 3) await new Promise<void>((resolve) => view.setTimeout(resolve, 0));
  }
  encoder.finish();
  const bytes = encoder.bytes();
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return new view.Blob([buffer], { type: "image/gif" });
}

/** In a lab, `auto` is deliberately quiet; only `true` opts into persistent figure chrome. */
function quietChrome(value: ChromeSetting | undefined): ChromeSetting | undefined {
  return value === "auto" ? undefined : value;
}

function explicitChromeAttr(value: string | undefined): ChromeSetting | undefined {
  return quietChrome(chromeAttr(value));
}

/** Evaluates an ESM scene in the browser. Bare imports are resolved by the page's import map. */
export async function loadKineglyphLabModule(
  source: string,
  _element: HTMLElement,
): Promise<KineglyphLabModuleResult> {
  void _element;
  const blob = new Blob([source], { type: "text/javascript" });
  const url = URL.createObjectURL(blob);
  try {
    const mod = (await import(/* @vite-ignore */ url)) as {
      default?: unknown;
      theme?: unknown;
      loop?: unknown;
      setup?: unknown;
    };
    if (mod.default === null || typeof mod.default !== "object")
      throw new Error("inline scene: no default export");
    if (mod.setup !== undefined && typeof mod.setup !== "function")
      throw new Error("inline scene: setup export must be a function");
    if (mod.loop !== undefined && typeof mod.loop !== "boolean")
      throw new Error("inline scene: loop export must be a boolean");
    const theme =
      mod.theme !== null && typeof mod.theme === "object" ? (mod.theme as ThemeTokens) : undefined;
    return {
      scene: mod.default as FigureSource,
      ...(theme === undefined ? {} : { theme }),
      ...(mod.loop === undefined ? {} : { loop: mod.loop }),
      ...(mod.setup === undefined ? {} : { setup: mod.setup as KineglyphLabSetup }),
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}

function loadedModule(value: FigureSource | KineglyphLabModuleResult): KineglyphLabModuleResult {
  return "scene" in value ? value : { scene: value };
}

class LabRuntime implements KineglyphLabController {
  readonly element: HTMLElement;
  readonly ready: Promise<boolean>;
  #source: string;
  readonly #initialSource: string;
  #view: KineglyphLabView;
  #hostTheme: ThemeTokens | undefined;
  #moduleTheme: ThemeTokens | undefined;
  #moduleHasSetup = false;
  #doctorEnabled: boolean;
  readonly #moduleColorVars = new Set<string>();
  #theme: ThemeTokens | undefined;
  #figure: KineglyphController | undefined;
  #moduleCleanup: (() => void) | undefined;
  #editor: LabEditor | undefined;
  #editorLoading: Promise<LabEditor> | undefined;
  #destroyed = false;
  #timer: ReturnType<typeof setTimeout> | undefined;
  #generation = 0;
  readonly #options: MountKineglyphLabOptions;
  readonly #script: HTMLScriptElement | undefined;
  readonly #shell: HTMLElement;
  readonly #editorHost: HTMLElement;
  readonly #previewHost: HTMLElement;
  readonly #status: HTMLElement;
  readonly #buttons = new Map<KineglyphLabView, HTMLButtonElement>();
  readonly #exportGroup: HTMLElement;
  readonly #exportToggle: HTMLButtonElement;
  readonly #exportMenu: HTMLElement;
  readonly #exportItems = new Map<LabExportFormat, HTMLButtonElement>();
  readonly #onDocumentClick = (event: Event): void => {
    if (event.target !== null && !this.#exportGroup.contains(event.target as Node))
      this.#closeExportMenu();
  };

  constructor(element: HTMLElement, options: MountKineglyphLabOptions) {
    this.element = element;
    this.#options = options;
    this.#doctorEnabled = options.doctor ?? false;
    this.#script = sourceScript(element);
    this.#source = options.source ?? this.#script?.textContent?.trim() ?? "";
    this.#initialSource = this.#source;
    this.#view = options.view ?? (isView(element.dataset.view) ? element.dataset.view : "split");
    this.#hostTheme = options.theme;
    this.#theme = options.theme;
    ensureLabStyles(element);
    element.classList.add("kg-lab");
    element.dataset.view = this.#view;
    element.dataset.kineglyphLabMounted = "true";

    const doc = element.ownerDocument;
    this.#shell = doc.createElement("div");
    this.#shell.className = "kg-lab__shell";
    const bar = doc.createElement("div");
    bar.className = "kg-lab__bar";
    const tabs = doc.createElement("div");
    tabs.className = "kg-lab__tabs";
    tabs.setAttribute("role", "tablist");
    const labels: ReadonlyArray<readonly [KineglyphLabView, string]> = [
      ["source", "Source"],
      ["split", "Editor + preview"],
      ["preview", "Preview"],
    ];
    for (const [view, label] of labels) {
      const button = doc.createElement("button");
      button.type = "button";
      button.setAttribute("role", "tab");
      button.textContent = label;
      button.addEventListener("click", () => this.setView(view));
      tabs.append(button);
      this.#buttons.set(view, button);
    }
    const actions = doc.createElement("div");
    actions.className = "kg-lab__actions";
    const inspect = doc.createElement("button");
    inspect.type = "button";
    inspect.className = "kg-lab__doctor";
    inspect.textContent = "Inspect layout";
    inspect.setAttribute("aria-pressed", String(this.#doctorEnabled));
    inspect.addEventListener("click", () => {
      this.#doctorEnabled = !this.#doctorEnabled;
      inspect.setAttribute("aria-pressed", String(this.#doctorEnabled));
      this.#figure?.setDoctor(this.#doctorEnabled);
    });
    const reset = doc.createElement("button");
    reset.type = "button";
    reset.textContent = "Reset";
    reset.addEventListener("click", () => this.reset());
    const run = doc.createElement("button");
    run.type = "button";
    run.className = "kg-lab__run";
    run.innerHTML = 'Run <span class="kg-lab__shortcut">⌘↵</span>';
    run.addEventListener("click", () => void this.run());
    actions.append(inspect, reset, run);
    bar.append(tabs, actions);

    const workspace = doc.createElement("div");
    workspace.className = "kg-lab__workspace";
    this.#editorHost = doc.createElement("div");
    this.#editorHost.className = "kg-lab__editor";
    const loading = doc.createElement("div");
    loading.className = "kg-lab__loading";
    loading.textContent = "Loading editor…";
    this.#editorHost.append(loading);
    const preview = doc.createElement("div");
    preview.className = "kg-lab__preview";
    this.#previewHost = doc.createElement("div");
    this.#previewHost.className = "kg-lab__preview-host";
    preview.append(this.#previewHost);
    workspace.append(this.#editorHost, preview);
    this.#status = doc.createElement("p");
    this.#status.className = "kg-lab__status";
    this.#status.setAttribute("role", "status");
    this.#status.setAttribute("aria-live", "polite");
    this.#status.textContent = "Preparing preview…";
    const previewActions = doc.createElement("div");
    previewActions.className = "kg-lab__preview-actions";
    const edit = doc.createElement("button");
    edit.type = "button";
    edit.className = "kg-lab__edit";
    edit.textContent = "Edit figure";
    edit.addEventListener("click", () => this.focus());
    this.#exportGroup = doc.createElement("div");
    this.#exportGroup.className = "kg-lab__export";
    this.#exportGroup.hidden = true;
    this.#exportToggle = doc.createElement("button");
    this.#exportToggle.type = "button";
    this.#exportToggle.className = "kg-lab__export-toggle";
    this.#exportToggle.setAttribute("aria-haspopup", "menu");
    this.#exportToggle.setAttribute("aria-expanded", "false");
    this.#exportToggle.innerHTML =
      'Export <span class="kg-lab__export-chevron" aria-hidden="true">▼</span>';
    const exportMenuId = `kineglyph-lab-export-${++labExportMenuCounter}`;
    this.#exportToggle.setAttribute("aria-controls", exportMenuId);
    this.#exportMenu = doc.createElement("div");
    this.#exportMenu.id = exportMenuId;
    this.#exportMenu.className = "kg-lab__export-menu";
    this.#exportMenu.setAttribute("role", "menu");
    this.#exportMenu.setAttribute("aria-label", "Export figure");
    this.#exportMenu.hidden = true;
    const formats = [
      ["svg", "Download SVG", "vector · transparent"],
      ["png", "Download PNG", "2× · transparent"],
      ["gif", "Download GIF", "full timeline · themed"],
    ] as const;
    for (const [format, label, detail] of formats) {
      const button = doc.createElement("button");
      button.type = "button";
      button.setAttribute("role", "menuitem");
      button.dataset.format = format;
      button.innerHTML = `${label}<small>${detail}</small>`;
      button.addEventListener("click", () => void this.#export(format));
      this.#exportMenu.append(button);
      this.#exportItems.set(format, button);
    }
    this.#exportToggle.addEventListener("click", () => {
      this.#setExportMenu(this.#exportMenu.hidden);
    });
    this.#exportGroup.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      this.#closeExportMenu();
      this.#exportToggle.focus();
    });
    this.#exportGroup.append(this.#exportToggle, this.#exportMenu);
    previewActions.append(edit, this.#exportGroup);
    this.#shell.append(bar, workspace, previewActions, this.#status);
    const height = Number(element.dataset.height);
    if (Number.isFinite(height) && height >= 240 && height <= 1200)
      this.#shell.style.setProperty("--kg-lab-height", `${Math.round(height)}px`);
    element.append(this.#shell);
    doc.addEventListener("click", this.#onDocumentClick);
    this.setView(this.#view);
    this.ready = this.run();
  }

  get source(): string {
    return this.#source;
  }
  get view(): KineglyphLabView {
    return this.#view;
  }
  get figure(): KineglyphController | undefined {
    return this.#figure;
  }

  setSource(source: string, options: { readonly run?: boolean } = {}): void {
    this.#assertLive();
    this.#source = source;
    if (this.#script !== undefined) this.#script.textContent = source;
    this.#editor?.setValue(source);
    this.#options.onSourceChange?.(source);
    if (options.run !== false) this.#schedule();
  }

  setView(view: KineglyphLabView): void {
    this.#assertLive();
    this.#view = view;
    this.element.dataset.view = view;
    for (const [candidate, button] of this.#buttons) {
      const selected = candidate === view;
      button.setAttribute("aria-selected", String(selected));
      button.tabIndex = selected ? 0 : -1;
    }
    if (view !== "preview") {
      void this.#ensureEditor().then((editor) => {
        if (!this.#destroyed) editor.setReadOnly(view === "source");
      });
    }
  }

  setTheme(theme: ThemeTokens): void {
    this.#assertLive();
    this.#hostTheme = theme;
    if (this.#moduleTheme !== undefined) return;
    this.#theme = theme;
    this.#figure?.setTheme(theme);
  }

  async run(): Promise<boolean> {
    this.#assertLive();
    if (this.#timer !== undefined) clearTimeout(this.#timer);
    this.#timer = undefined;
    const generation = ++this.#generation;
    this.#setStatus("Rendering…", "pending");
    try {
      const loaded = loadedModule(
        await (this.#options.load ?? loadKineglyphLabModule)(this.#source, this.element),
      );
      const scene = loaded.scene;
      const loop = loaded.loop ?? this.#options.loop ?? false;
      this.#moduleTheme = loaded.theme;
      this.#applyModuleTheme(loaded.theme);
      const nextTheme = loaded.theme ?? this.#hostTheme ?? defaultTheme;
      if (this.#destroyed || generation !== this.#generation) return false;
      if (this.#figure === undefined) {
        this.#theme = nextTheme;
        this.#figure = mountKineglyph(this.#previewHost, {
          scene,
          ...(this.#theme === undefined ? {} : { theme: this.#theme }),
          autoplay: this.#options.autoplay ?? "in-view",
          loop,
          ...(this.#options.inView === undefined ? {} : { inView: this.#options.inView }),
          controls: this.#options.controls ?? false,
          readout: this.#options.readout ?? false,
          tooltips: this.#options.tooltips ?? true,
          machineControls: this.#options.machineControls ?? "auto",
          doctor: this.#doctorEnabled,
        });
      } else {
        if (nextTheme !== this.#theme) this.#figure.setTheme(nextTheme);
        this.#theme = nextTheme;
        this.#figure.setLoop(loop);
        // A successful edit is a new performance. setScene() restarts it when the lab is already
        // in view and otherwise leaves it waiting at frame zero for the normal viewport trigger.
        // Preserving a completed timeline made hot-reloaded animations look permanently static.
        this.#figure.setScene(scene);
      }
      this.#moduleCleanup?.();
      this.#moduleCleanup = loaded.setup?.(this.#figure, this.element) ?? undefined;
      this.#moduleHasSetup = loaded.setup !== undefined;
      showStatic(this.element, false);
      delete this.element.dataset.kineglyphError;
      this.#setStatus("Preview updated", "success");
      this.#syncExportVisibility();
      return true;
    } catch (error) {
      if (this.#destroyed || generation !== this.#generation) return false;
      this.element.dataset.kineglyphError = message(error);
      if (this.#figure === undefined) showStatic(this.element, true);
      this.#setStatus(message(error), "error");
      this.#options.onError?.(error);
      return false;
    }
  }

  reset(): void {
    this.setSource(this.#initialSource, { run: false });
    void this.run();
  }

  focus(): void {
    this.#assertLive();
    if (this.#view === "preview") this.setView("split");
    void this.#ensureEditor().then((editor) => editor.focus());
  }

  destroy(): void {
    if (this.#destroyed) return;
    this.#destroyed = true;
    this.#generation++;
    if (this.#timer !== undefined) clearTimeout(this.#timer);
    this.#editor?.destroy();
    this.#moduleCleanup?.();
    this.#moduleCleanup = undefined;
    this.#figure?.destroy();
    this.element.ownerDocument.removeEventListener("click", this.#onDocumentClick);
    this.#shell.remove();
    showStatic(this.element, true);
    delete this.element.dataset.kineglyphLabMounted;
  }

  #schedule(): void {
    if (this.#timer !== undefined) clearTimeout(this.#timer);
    this.#setStatus("Waiting for changes…", "pending");
    this.#timer = setTimeout(() => void this.run(), this.#options.debounceMs ?? 220);
  }

  async #ensureEditor(): Promise<LabEditor> {
    if (this.#editor !== undefined) return this.#editor;
    this.#editorLoading ??= import("./lab-editor.js").then(({ createLabEditor }) => {
      if (this.#destroyed) throw new Error("Kineglyph lab was destroyed while loading the editor");
      this.#editorHost.replaceChildren();
      this.#editor = createLabEditor({
        parent: this.#editorHost,
        source: this.#source,
        readOnly: this.#view === "source",
        onChange: (source) => {
          this.#source = source;
          if (this.#script !== undefined) this.#script.textContent = source;
          this.#options.onSourceChange?.(source);
          this.#schedule();
        },
        onRun: () => void this.run(),
      });
      return this.#editor;
    });
    return await this.#editorLoading;
  }

  #setStatus(text: string, kind: "pending" | "success" | "error"): void {
    this.#status.textContent = text;
    this.#status.dataset.kind = kind;
  }

  #setExportMenu(open: boolean): void {
    if (this.#exportGroup.hidden) return;
    this.#exportMenu.hidden = !open;
    this.#exportToggle.setAttribute("aria-expanded", String(open));
    if (open) this.#exportMenu.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
  }

  #closeExportMenu(): void {
    this.#exportMenu.hidden = true;
    this.#exportToggle.setAttribute("aria-expanded", "false");
  }

  #syncExportVisibility(): void {
    this.#exportGroup.hidden =
      this.#figure === undefined ||
      this.#moduleHasSetup ||
      !isPortableExportScene(this.#figure.scene);
    const gif = this.#exportItems.get("gif");
    if (gif !== undefined) gif.hidden = (this.#figure?.scene.timeline?.duration ?? 0) <= 0;
    if (this.#exportGroup.hidden) this.#closeExportMenu();
  }

  async #export(format: LabExportFormat): Promise<void> {
    this.#closeExportMenu();
    const scene = this.#figure?.scene;
    if (scene === undefined || !isPortableExportScene(scene) || this.#moduleHasSetup) return;
    this.#setStatus(`Preparing ${format.toUpperCase()}…`, "pending");
    try {
      const time = this.#figure?.state.time ?? scene.timeline?.duration ?? 0;
      const frame = seekTimeline(scene, time);
      const svg = renderSvg(frame, {
        idPrefix: `export-${scene.id}`,
        background: "none",
        animateFlow: false,
        effects: "portable",
      });
      const doc = this.element.ownerDocument;
      if (format === "svg") {
        const BlobConstructor = doc.defaultView?.Blob ?? Blob;
        downloadBlob(
          doc,
          new BlobConstructor([svg], { type: "image/svg+xml;charset=utf-8" }),
          exportFileName(scene, format),
        );
      } else if (format === "png") {
        downloadBlob(
          doc,
          await pngBlob(doc, svg, scene.width, scene.height),
          exportFileName(scene, format),
        );
      } else downloadBlob(doc, await gifBlob(doc, scene), exportFileName(scene, format));
      this.#setStatus(`${format.toUpperCase()} downloaded`, "success");
    } catch (error) {
      this.#setStatus(message(error), "error");
      this.#options.onError?.(error);
    }
  }

  #applyModuleTheme(theme: ThemeTokens | undefined): void {
    for (const property of this.#moduleColorVars) this.#previewHost.style.removeProperty(property);
    this.#moduleColorVars.clear();
    if (theme === undefined) return;
    for (const [name, value] of Object.entries(theme.colors)) {
      const role = name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
      const property = `--kg-color-${role}`;
      this.#previewHost.style.setProperty(property, value);
      this.#moduleColorVars.add(property);
    }
  }

  #assertLive(): void {
    if (this.#destroyed) throw new Error("Kineglyph lab controller is destroyed");
  }
}

export function mountKineglyphLab(
  element: HTMLElement,
  options: MountKineglyphLabOptions = {},
): KineglyphLabController {
  return new LabRuntime(element, options);
}

/** Enhances every live-example host. Already-mounted labs are left alone. */
export async function mountAllKineglyphLabs(
  options: MountAllKineglyphLabsOptions = {},
): Promise<KineglyphLabController[]> {
  const root = options.root ?? document;
  const {
    root: _root,
    selector: _selector,
    theme: themeOption,
    options: optionsFor,
    ...shared
  } = options;
  void _root;
  void _selector;
  const elements = Array.from(
    root.querySelectorAll<HTMLElement>(options.selector ?? DEFAULT_SELECTOR),
  );
  const mounted: KineglyphLabController[] = [];
  for (const element of elements) {
    if (element.dataset.kineglyphLabMounted === "true") continue;
    const source = sourceScript(element)?.textContent?.trim();
    if (source === undefined || source === "") continue;
    const local = optionsFor?.(element) ?? {};
    const theme = typeof themeOption === "function" ? themeOption(element) : themeOption;
    const view = isView(element.dataset.view) ? element.dataset.view : undefined;
    const autoplay =
      element.dataset.autoplay === undefined
        ? (local.autoplay ?? shared.autoplay ?? "in-view")
        : autoplayAttr(element.dataset.autoplay);
    const autoplayDelay = Number(element.dataset.autoplayDelay);
    const loop = element.dataset.loop === "true" || local.loop === true || shared.loop === true;
    const inView =
      Number.isFinite(autoplayDelay) && autoplayDelay >= 0
        ? { ...(shared.inView ?? {}), ...(local.inView ?? {}), delay: autoplayDelay }
        : (local.inView ?? shared.inView);
    const controls =
      quietChrome(
        local.controls ?? explicitChromeAttr(element.dataset.controls) ?? shared.controls,
      ) ?? false;
    const readout =
      quietChrome(local.readout ?? explicitChromeAttr(element.dataset.readout) ?? shared.readout) ??
      false;
    const controller = mountKineglyphLab(element, {
      ...shared,
      ...local,
      source,
      ...(view === undefined ? {} : { view }),
      ...(theme === undefined ? {} : { theme }),
      ...(autoplay === undefined ? {} : { autoplay }),
      loop,
      ...(inView === undefined ? {} : { inView }),
      controls,
      readout,
      tooltips: local.tooltips ?? shared.tooltips ?? element.dataset.tooltips !== "false",
      machineControls:
        local.machineControls ??
        shared.machineControls ??
        chromeAttr(element.dataset.machineControls),
    });
    mounted.push(controller);
  }
  await Promise.all(mounted.map(async (lab) => await lab.ready));
  return mounted;
}
