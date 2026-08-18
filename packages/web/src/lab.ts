/**
 * A compact, framework-neutral live authoring surface for documentation examples.
 *
 * The source stays an ordinary default-exporting ESM scene module. Edits are evaluated through a
 * replaceable loader, and successful scenes are swapped through the normal Kineglyph controller.
 * The default loader uses a blob module, so the page's import map continues to own `kineglyph`.
 */
import type { FigureSource, ThemeTokens } from "@kineglyph/core";
import {
  chromeAttr,
  defaultLoader,
  mountKineglyph,
  type ChromeSetting,
  type KineglyphController,
} from "./index.js";
import type { LabEditor } from "./lab-editor.js";

export type KineglyphLabView = "source" | "split" | "preview";
export type KineglyphLabLoader = (source: string, element: HTMLElement) => Promise<FigureSource>;

export interface MountKineglyphLabOptions {
  readonly source?: string;
  readonly view?: KineglyphLabView;
  readonly theme?: ThemeTokens;
  readonly debounceMs?: number;
  readonly autoplay?: boolean;
  readonly controls?: ChromeSetting;
  readonly readout?: ChromeSetting;
  readonly machineControls?: ChromeSetting;
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

const LAB_STYLES = `
.kg-lab{--kg-lab-border:var(--kg-color-border,var(--kg-shell-border,#d7dbe2));--kg-lab-bg:var(--kg-color-canvas,var(--kg-shell-background,#fff));--kg-lab-surface:var(--kg-color-surface,var(--kg-shell-surface,#f7f8fa));--kg-lab-text:var(--kg-color-text,var(--kg-shell-text,#172033));--kg-lab-muted:var(--kg-color-text-muted,var(--kg-shell-muted,#657087));--kg-lab-accent:var(--kg-color-accent,var(--kg-shell-accent,#5b67f1));--kg-lab-code-bg:color-mix(in srgb,var(--kg-lab-bg) 92%,#0d1222);--kg-lab-code-text:var(--kg-lab-text);--kg-lab-syntax-keyword:var(--kg-color-accent,#8b8df5);--kg-lab-syntax-string:var(--kg-color-danger,#e56d88);--kg-lab-syntax-number:var(--kg-color-warning,#d79a42);--kg-lab-syntax-comment:var(--kg-lab-muted);--kg-lab-syntax-name:var(--kg-color-info,#58a6e7);--kg-lab-syntax-property:color-mix(in srgb,var(--kg-lab-text) 72%,var(--kg-lab-accent));--kg-lab-font:var(--kg-shell-font,Inter,ui-sans-serif,system-ui,sans-serif);--kg-lab-mono:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;container-name:kg-lab;container-type:inline-size;display:block;margin:1.5rem 0;overflow:hidden;border:1px solid var(--kg-lab-border);border-radius:12px;background:var(--kg-lab-bg);color:var(--kg-lab-text);font-family:var(--kg-lab-font)}
.kg-lab *{box-sizing:border-box}.kg-lab>[data-kg-static]{margin:0}.kg-lab__shell{display:block}.kg-lab__bar{position:relative;display:flex;min-height:45px;align-items:center;justify-content:space-between;gap:12px;padding:6px 8px;border-bottom:1px solid var(--kg-lab-border);background:var(--kg-lab-surface)}
.kg-lab__tabs,.kg-lab__actions{display:flex;align-items:center;gap:4px}.kg-lab button{appearance:none;border:1px solid transparent;border-radius:7px;padding:8px 10px;background:transparent;color:var(--kg-lab-muted);font:650 12px/1 var(--kg-lab-font);cursor:pointer}.kg-lab button:hover{color:var(--kg-lab-text);background:color-mix(in srgb,var(--kg-lab-accent) 8%,transparent)}.kg-lab button:focus-visible{outline:2px solid var(--kg-lab-accent);outline-offset:1px}.kg-lab__tabs button[aria-selected=true]{border-color:color-mix(in srgb,var(--kg-lab-accent) 35%,var(--kg-lab-border));background:color-mix(in srgb,var(--kg-lab-accent) 10%,transparent);color:var(--kg-lab-text)}.kg-lab__run{color:var(--kg-lab-text)!important}.kg-lab__shortcut{margin-left:4px;color:var(--kg-lab-muted);font:10px/1 var(--kg-lab-mono)}
.kg-lab__workspace{display:grid;min-width:0;min-height:var(--kg-lab-height,420px);grid-template-columns:minmax(0,1fr) minmax(0,1fr)}.kg-lab__editor,.kg-lab__preview{min-width:0;min-height:0}.kg-lab__editor{height:var(--kg-lab-height,420px);overflow:hidden;border-right:1px solid var(--kg-lab-border);background:var(--kg-lab-code-bg)}.kg-lab__preview{display:grid;align-content:center;overflow:auto;padding:16px;background:var(--kg-lab-bg)}.kg-lab__preview-host{width:100%;min-width:0}.kg-lab__loading{display:grid;height:100%;place-items:center;color:var(--kg-lab-muted);font:12px/1.5 var(--kg-lab-font)}
.kg-lab[data-view=source] .kg-lab__workspace{grid-template-columns:1fr}.kg-lab[data-view=source] .kg-lab__preview{display:none}.kg-lab[data-view=source] .kg-lab__editor{border-right:0}.kg-lab[data-view=preview] .kg-lab__workspace{display:block}.kg-lab[data-view=preview] .kg-lab__editor{display:none}.kg-lab[data-view=preview] .kg-lab__preview{min-height:var(--kg-lab-height,420px)}
.kg-lab__preview-actions{display:none}.kg-lab__edit{border-color:color-mix(in srgb,var(--kg-lab-muted) 38%,transparent)!important;padding:5px 8px!important;font-weight:550!important}.kg-lab__status{min-height:34px;margin:0;padding:9px 12px;border-top:1px solid var(--kg-lab-border);color:var(--kg-lab-muted);background:var(--kg-lab-surface);font:11px/1.35 var(--kg-lab-mono)}.kg-lab__status[data-kind=error]{color:#c63d52}.kg-lab__status[data-kind=success]{color:color-mix(in srgb,#25a46f 80%,var(--kg-lab-text))}
.kg-lab[data-view=preview]{overflow:visible;border:0;border-radius:0;background:transparent}.kg-lab[data-view=preview] .kg-lab__bar,.kg-lab[data-view=preview] .kg-lab__status:not([data-kind=error]){display:none}.kg-lab[data-view=preview] .kg-lab__preview{padding:0;background:transparent}.kg-lab[data-view=preview] .kg-lab__preview-actions{display:flex;justify-content:flex-end;padding:6px 0 0;background:transparent}
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

/** In a lab, `auto` is deliberately quiet; only `true` opts into persistent figure chrome. */
function explicitChromeAttr(value: string | undefined): ChromeSetting | undefined {
  const parsed = chromeAttr(value);
  return parsed === "auto" ? undefined : parsed;
}

/** Evaluates an ESM scene in the browser. Bare imports are resolved by the page's import map. */
export async function loadKineglyphLabModule(
  source: string,
  element: HTMLElement,
): Promise<FigureSource> {
  const embedded = { kind: "inline" as const, source };
  return await defaultLoader(embedded, element);
}

class LabRuntime implements KineglyphLabController {
  readonly element: HTMLElement;
  readonly ready: Promise<boolean>;
  #source: string;
  readonly #initialSource: string;
  #view: KineglyphLabView;
  #theme: ThemeTokens | undefined;
  #figure: KineglyphController | undefined;
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

  constructor(element: HTMLElement, options: MountKineglyphLabOptions) {
    this.element = element;
    this.#options = options;
    this.#script = sourceScript(element);
    this.#source = options.source ?? this.#script?.textContent?.trim() ?? "";
    this.#initialSource = this.#source;
    this.#view = options.view ?? (isView(element.dataset.view) ? element.dataset.view : "split");
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
    const reset = doc.createElement("button");
    reset.type = "button";
    reset.textContent = "Reset";
    reset.addEventListener("click", () => this.reset());
    const run = doc.createElement("button");
    run.type = "button";
    run.className = "kg-lab__run";
    run.innerHTML = 'Run <span class="kg-lab__shortcut">⌘↵</span>';
    run.addEventListener("click", () => void this.run());
    actions.append(reset, run);
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
    previewActions.append(edit);
    this.#shell.append(bar, workspace, previewActions, this.#status);
    const height = Number(element.dataset.height);
    if (Number.isFinite(height) && height >= 240 && height <= 1200)
      this.#shell.style.setProperty("--kg-lab-height", `${Math.round(height)}px`);
    element.append(this.#shell);
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
      const scene = await (this.#options.load ?? loadKineglyphLabModule)(
        this.#source,
        this.element,
      );
      if (this.#destroyed || generation !== this.#generation) return false;
      if (this.#figure === undefined) {
        this.#figure = mountKineglyph(this.#previewHost, {
          scene,
          ...(this.#theme === undefined ? {} : { theme: this.#theme }),
          autoplay: this.#options.autoplay ?? false,
          controls: this.#options.controls ?? false,
          readout: this.#options.readout ?? false,
          machineControls: this.#options.machineControls ?? "auto",
        });
      } else {
        const { playing, time, duration } = this.#figure.state;
        const position = duration === 0 ? 0 : time / duration;
        this.#figure.setScene(scene);
        if (position > 0) this.#figure.seek(position * this.#figure.state.duration);
        if (playing) this.#figure.play();
        else this.#figure.pause();
      }
      showStatic(this.element, false);
      delete this.element.dataset.kineglyphError;
      this.#setStatus("Preview updated", "success");
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
    this.#figure?.destroy();
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
      element.dataset.autoplay === "true" ? true : (local.autoplay ?? shared.autoplay);
    const controls =
      local.controls ?? shared.controls ?? explicitChromeAttr(element.dataset.controls);
    const readout = local.readout ?? shared.readout ?? explicitChromeAttr(element.dataset.readout);
    const controller = mountKineglyphLab(element, {
      ...shared,
      ...local,
      source,
      ...(view === undefined ? {} : { view }),
      ...(theme === undefined ? {} : { theme }),
      ...(autoplay === undefined ? {} : { autoplay }),
      ...(controls === undefined ? {} : { controls }),
      ...(readout === undefined ? {} : { readout }),
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
