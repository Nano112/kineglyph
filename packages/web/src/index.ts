/**
 * Framework-neutral Kineglyph runtime.
 *
 * `mountKineglyph(element, options)` resolves a figure for the element's width, renders the SVG,
 * drives playback through the scoped Anime.js runtime, wires inspection and state-machine
 * interaction, and returns a disposable controller. No React, no globals, no shared ids.
 */
import { KineglyphSceneAnimator } from "@kineglyph/anime";
import {
  MachineController,
  createMachineState,
  declaredColorRoles,
  defaultTheme,
  evaluateCondition,
  inheritTheme,
  resolveFigure,
  seekTimeline,
  type FigureSource,
  type LayoutName,
  type MachineEvent,
  type MachineState,
  type MachineStep,
  type ResolvedEdge,
  type ResolvedFrame,
  type ResolvedNode,
  type ResolvedScene,
  type SceneControl,
  type ThemeTokens,
} from "@kineglyph/core";
import { renderSvg } from "@kineglyph/svg";
import { mountShaderSurfaces, type ShaderSurfaceManager } from "./shaders.js";
import { ensureStyles } from "./styles.js";

export {
  createCodeDrawer,
  createParameterPanel,
  type CodeDrawerHandle,
  type CodeDrawerOptions,
  type CodeSample,
  type ParameterChange,
  type ParameterPanelHandle,
  type ParameterPanelOptions,
  type RangeParameter,
} from "./controls.js";
import { LiveSurfaceManager, type LiveSurfaceRenderer } from "./surfaces.js";

export { FIGURE_STYLES, STYLE_ID, ensureStyles } from "./styles.js";
export * from "./surfaces.js";

export type FigureLayoutRequest = "auto" | LayoutName | "stacked";

/**
 * Whether a piece of a live figure's chrome is drawn.
 *
 * `true`/`false` are the author's word and are obeyed. `"auto"` hands the decision to the scene:
 * the chrome appears only if the scene gives it something to do. That is the setting an embedder
 * wants for a figure sitting in prose, where the picture is the point and a control strip with
 * nothing behind it reads as a debug harness bolted to a diagram.
 *
 * The rule is deliberately about *content*, not about the reader's environment: a scene either has
 * a timeline (or inspectable parts) or it does not, and that answer does not change when
 * `prefers-reduced-motion` flips or the figure is resized, so the chrome never appears or vanishes
 * under the reader.
 */
export type ChromeSetting = boolean | "auto";

export interface MountOptions {
  /** A general scene definition or a legacy pipeline definition. */
  readonly scene: FigureSource;
  readonly theme?: ThemeTokens;
  readonly layout?: FigureLayoutRequest;
  /** Fixed container width in CSS pixels; when omitted the host element is measured and observed. */
  readonly width?: number;
  readonly autoplay?: boolean;
  /**
   * Render the compact play/restart/scrubber transport. Defaults to true.
   *
   * `"auto"` defers to the scene: the transport appears only when there is a timeline to drive
   * (`resolved.timeline.duration > 0`). A still diagram gets no disabled Play button against a
   * 0.0s track, which is furniture rather than a control.
   */
  readonly controls?: ChromeSetting;
  /**
   * Render the inspection readout. Defaults to true.
   *
   * `"auto"` defers to the scene: the readout appears only when something in it can actually be
   * inspected — a node that is `interactive`, or one that carries both a label and a description.
   */
  readonly readout?: ChromeSetting;
  /** Render machine control buttons when the scene declares them. Defaults to true. */
  readonly machineControls?: ChromeSetting;
  /** Overrides the `prefers-reduced-motion` media query. */
  readonly reducedMotion?: boolean;
  /** Stable DOM id prefix. Defaults to a unique generated prefix. */
  readonly idPrefix?: string;
  readonly className?: string;
  readonly initialState?: MachineState;
  /** Retain a transition history on the live machine controller. */
  readonly history?: boolean;
  /** HTML/WebGL renderers keyed by a live image node id. The image remains the export fallback. */
  readonly liveSurfaces?: Readonly<Record<string, LiveSurfaceRenderer>>;
  readonly onSurfaceError?: (nodeId: string, error: unknown) => void;
  readonly onInspect?: (target: InspectTarget | undefined) => void;
  readonly onFrame?: (frame: ResolvedFrame) => void;
  readonly onPlaybackChange?: (playing: boolean) => void;
  readonly onStateChange?: (step: MachineStep, scene: ResolvedScene) => void;
}

export interface InspectField {
  readonly label: string;
  readonly value: string;
}

/** Structured, framework-neutral inspection payload rendered as a generic definition list. */
export interface InspectTarget {
  readonly kind: "node" | "edge";
  readonly id: string;
  /** Short role for the eyebrow (e.g. "Series", "Stage", "Cell", "Connector"). */
  readonly role: string;
  readonly title: string;
  readonly summary?: string;
  readonly fields: readonly InspectField[];
  /** @deprecated use title */
  readonly label: string;
  /** @deprecated use summary */
  readonly description?: string;
  readonly node?: ResolvedNode;
  readonly edge?: ResolvedEdge;
}

export interface KineglyphState {
  readonly time: number;
  readonly duration: number;
  readonly playing: boolean;
  readonly reducedMotion: boolean;
  readonly width: number;
  readonly layout: LayoutName | undefined;
  readonly machineState: MachineState | undefined;
  readonly inspected: InspectTarget | undefined;
  readonly destroyed: boolean;
}

export type KineglyphEventMap = {
  readonly frame: ResolvedFrame;
  readonly playback: boolean;
  readonly inspect: InspectTarget | undefined;
  readonly state: { readonly step: MachineStep; readonly scene: ResolvedScene };
  readonly resize: { readonly width: number; readonly layout: LayoutName | undefined };
  readonly render: ResolvedScene;
  readonly destroy: undefined;
};

export interface KineglyphController {
  readonly element: HTMLElement;
  readonly stage: HTMLElement;
  readonly id: string;
  /** The current resolved scene (re-resolved after resizes, theme changes, and transitions). */
  readonly scene: ResolvedScene;
  readonly state: KineglyphState;
  readonly machine: MachineController | undefined;
  play(): void;
  pause(): void;
  restart(autoplay?: boolean): void;
  seek(time: number): void;
  /** Sends a machine event; returns the step (unchanged when the scene has no machine). */
  send(event: string | MachineEvent): MachineStep | undefined;
  /** Resets the machine to its initial state and the timeline to the start. */
  reset(): void;
  setTheme(theme: ThemeTokens): void;
  setScene(scene: FigureSource, options?: { readonly initialState?: MachineState }): void;
  setReducedMotion(reduced: boolean): void;
  /** Programmatic inspection; pass `null` to clear. Returns the current inspection target. */
  inspect(id?: string | null): InspectTarget | undefined;
  /** Forces a re-measure (fixed-width mounts accept an explicit width). */
  resize(width?: number): void;
  on<K extends keyof KineglyphEventMap>(
    event: K,
    handler: (payload: KineglyphEventMap[K]) => void,
  ): () => void;
  destroy(): void;
}

/**
 * Resolves a {@link ChromeSetting} against what the scene actually offers.
 *
 * `undefined` keeps the historical default — chrome is drawn — so nothing that never asked a
 * question changes its answer.
 */
function chromeWanted(setting: ChromeSetting | undefined, justified: boolean): boolean {
  if (setting === "auto") return justified;
  return setting !== false;
}

/**
 * Reads a `data-controls` / `data-readout` / `data-machine-controls` attribute as a
 * {@link ChromeSetting}. `"false"` is off, `"auto"` defers to the scene, anything else (including
 * an absent attribute) is on — which is what every such attribute has always meant.
 */
export function chromeAttr(value: string | undefined): ChromeSetting {
  return value === "false" ? false : value === "auto" ? "auto" : true;
}

let mountCounter = 0;

/** Mounts a Kineglyph figure into `element` and returns a disposable controller. */
export function mountKineglyph(element: HTMLElement, options: MountOptions): KineglyphController {
  return new FigureRuntime(element, options);
}

class Emitter {
  readonly #handlers = new Map<string, Set<(payload: unknown) => void>>();

  on(event: string, handler: (payload: unknown) => void): () => void {
    const set = this.#handlers.get(event) ?? new Set();
    set.add(handler);
    this.#handlers.set(event, set);
    return () => {
      set.delete(handler);
    };
  }

  emit(event: string, payload: unknown): void {
    for (const handler of this.#handlers.get(event) ?? []) handler(payload);
  }

  clear(): void {
    this.#handlers.clear();
  }
}

class FigureRuntime implements KineglyphController {
  readonly element: HTMLElement;
  readonly stage: HTMLElement;
  readonly id: string;
  machine: MachineController | undefined;

  #source: FigureSource;
  #theme: ThemeTokens;
  #options: MountOptions;
  #resolved: ResolvedScene;
  #animator: KineglyphSceneAnimator | undefined;
  #shaders: ShaderSurfaceManager | undefined;
  #liveSurfaces: LiveSurfaceManager | undefined;
  #width: number;
  #reducedMotion: boolean;
  #inspected: InspectTarget | undefined;
  #destroyed = false;
  /** `--kg-color-*` this figure has pinned on its shell, so a later theme can unpin them. */
  #pinnedColorVars: readonly string[] = [];
  #time = 0;
  #playing = false;
  readonly #emitter = new Emitter();
  readonly #cleanups: Array<() => void> = [];
  readonly #shell: HTMLElement;
  readonly #readout: HTMLElement | undefined;
  readonly #machineBar: HTMLElement | undefined;
  readonly #controls: HTMLElement | undefined;
  #playButton: HTMLButtonElement | undefined;
  #restartButton: HTMLButtonElement | undefined;
  #scrubber: HTMLInputElement | undefined;
  #timeOutput: HTMLOutputElement | undefined;
  #live: HTMLElement | undefined;
  #observer: ResizeObserver | undefined;

  constructor(element: HTMLElement, options: MountOptions) {
    this.element = element;
    this.#options = options;
    this.#source = options.scene;
    this.#theme = options.theme ?? defaultTheme;
    mountCounter += 1;
    this.id = options.idPrefix ?? `kineglyph-${mountCounter.toString(36)}`;
    ensureStyles(element);
    const doc = element.ownerDocument;
    element.replaceChildren();
    element.classList.add("kg-figure-host");

    this.#shell = doc.createElement("section");
    this.#shell.className = ["kg-figure", options.className].filter(Boolean).join(" ");
    this.stage = doc.createElement("div");
    this.stage.className = "kg-figure__stage";
    this.#shell.append(this.stage);
    this.#live = doc.createElement("div");
    this.#live.className = "kg-figure__live";
    this.#live.setAttribute("aria-live", "polite");
    this.#shell.append(this.#live);
    element.append(this.#shell);

    this.#reducedMotion = options.reducedMotion ?? prefersReducedMotion(element);
    this.#width = Math.max(280, Math.round(options.width ?? measureWidth(element)));

    if (isSceneDefinition(this.#source) && this.#source.machine !== undefined) {
      this.machine = new MachineController(this.#source.machine, {
        ...(options.initialState === undefined ? {} : { initialState: options.initialState }),
        history: options.history ?? false,
      });
    }

    this.#resolved = this.#resolve();

    // The chrome is built *after* the first resolve, because `"auto"` cannot be answered before
    // the scene is: whether a transport is meaningful is a fact about the resolved timeline, and
    // whether a readout is is a fact about the resolved nodes. Appended after the stage and the
    // live region, which is the order they were created in, so the DOM is unchanged.
    if (chromeWanted(options.readout, this.#hasInspectableContent())) {
      this.#readout = doc.createElement("div");
      this.#readout.className = "kg-figure__readout";
      // The body is a <div> so structured fields (<dl>) stay valid HTML inside it.
      this.#readout.innerHTML =
        '<span class="kg-figure__eyebrow"></span><strong></strong><div class="kg-figure__body"></div>';
      this.#shell.append(this.#readout);
    }
    if (chromeWanted(options.machineControls, this.machine !== undefined)) {
      this.#machineBar = doc.createElement("div");
      this.#machineBar.className = "kg-figure__machine";
      this.#machineBar.hidden = true;
      this.#shell.append(this.#machineBar);
    }
    if (chromeWanted(options.controls, this.#duration > 0)) {
      this.#controls = doc.createElement("div");
      this.#controls.className = "kg-figure__controls";
      this.#shell.append(this.#controls);
      this.#buildControls(doc);
    }

    this.#render(true);
    this.#bindInteractions(doc);
    this.#observeMedia(element);
    if (options.width === undefined) this.#observeSize(element);
    // Hosts often advertise aria-busy="true" while waiting for the runtime; the figure is ready now.
    element.setAttribute("aria-busy", "false");
  }

  // -----------------------------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------------------------

  get scene(): ResolvedScene {
    return this.#resolved;
  }

  get state(): KineglyphState {
    return {
      time: this.#reducedMotion ? this.#duration : this.#time,
      duration: this.#duration,
      playing: this.#playing,
      reducedMotion: this.#reducedMotion,
      width: this.#width,
      layout: this.#resolved.layoutName,
      machineState: this.machine?.state,
      inspected: this.#inspected,
      destroyed: this.#destroyed,
    };
  }

  play(): void {
    this.#assertLive();
    this.#animator?.play();
  }

  pause(): void {
    this.#assertLive();
    this.#animator?.pause();
  }

  restart(autoplay = true): void {
    this.#assertLive();
    this.#animator?.restart(autoplay);
  }

  seek(time: number): void {
    this.#assertLive();
    this.#animator?.seek(time);
  }

  send(event: string | MachineEvent): MachineStep | undefined {
    this.#assertLive();
    if (this.machine === undefined) return undefined;
    const step = this.machine.send(event);
    if (step.transition !== undefined) this.#applyStep(step);
    return step;
  }

  reset(): void {
    this.#assertLive();
    if (this.machine !== undefined) {
      const step = this.machine.reset();
      this.#applyStep(step);
    } else this.restart(false);
  }

  setTheme(theme: ThemeTokens): void {
    this.#assertLive();
    this.#theme = theme;
    this.#resolved = this.#resolve();
    this.#render(false);
  }

  setScene(scene: FigureSource, options: { readonly initialState?: MachineState } = {}): void {
    this.#assertLive();
    this.#source = scene;
    // A new scene gets a fresh machine; the mount-time initialState belongs to the original scene.
    this.machine =
      isSceneDefinition(scene) && scene.machine !== undefined
        ? new MachineController(scene.machine, {
            history: this.#options.history ?? false,
            ...(options.initialState === undefined ? {} : { initialState: options.initialState }),
          })
        : undefined;
    this.#inspected = undefined;
    this.#invalidateMachineControls();
    this.#resolved = this.#resolve();
    this.#render(true);
  }

  setReducedMotion(reduced: boolean): void {
    this.#assertLive();
    this.#reducedMotion = reduced;
    this.#animator?.setReducedMotion(reduced);
    this.#syncControls();
  }

  inspect(id?: string | null): InspectTarget | undefined {
    this.#assertLive();
    if (id === undefined) return this.#inspected;
    this.#setInspected(id === null ? undefined : this.#targetFor(id));
    return this.#inspected;
  }

  resize(width?: number): void {
    this.#assertLive();
    const next = Math.max(280, Math.round(width ?? measureWidth(this.element)));
    if (next === this.#width && width === undefined) return;
    this.#width = next;
    this.#resolved = this.#resolve();
    this.#render(false);
    this.#emitter.emit("resize", { width: this.#width, layout: this.#resolved.layoutName });
  }

  on<K extends keyof KineglyphEventMap>(
    event: K,
    handler: (payload: KineglyphEventMap[K]) => void,
  ): () => void {
    return this.#emitter.on(event, handler as (payload: unknown) => void);
  }

  destroy(): void {
    if (this.#destroyed) return;
    this.#destroyed = true;
    this.#animator?.dispose();
    this.#animator = undefined;
    this.#shaders?.dispose();
    this.#shaders = undefined;
    this.#liveSurfaces?.dispose();
    this.#liveSurfaces = undefined;
    this.#observer?.disconnect();
    for (const cleanup of this.#cleanups.splice(0)) cleanup();
    this.#emitter.emit("destroy", undefined);
    this.#emitter.clear();
    this.element.replaceChildren();
    this.element.classList.remove("kg-figure-host");
    // The host is empty again: it is neither busy nor a live figure.
    this.element.removeAttribute("aria-busy");
  }

  // -----------------------------------------------------------------------------------------
  // Internals
  // -----------------------------------------------------------------------------------------

  get #duration(): number {
    return this.#resolved.timeline?.duration ?? 0;
  }

  #assertLive(): void {
    if (this.#destroyed) throw new Error("Kineglyph controller has been destroyed");
  }

  #resolve(): ResolvedScene {
    return resolveFigure(this.#source, {
      width: this.#width,
      theme: this.#theme,
      layout: this.#options.layout ?? "auto",
      ...(this.machine === undefined ? {} : { machineState: this.machine.state }),
    });
  }

  /** Renders the SVG for the current resolution and (re)creates the animator. */
  #render(resetTime: boolean): void {
    const previousTime = this.#animator?.time ?? 0;
    const wasPlaying = this.#animator?.playing ?? false;
    const focusedId = this.#focusedNodeId();
    this.#animator?.dispose();
    this.#shaders?.dispose();
    this.#shaders = undefined;
    this.#liveSurfaces?.dispose();
    this.#liveSurfaces = undefined;
    // Non-autoplaying and reduced-motion figures present their complete terminal frame; Play restarts.
    const restFrame = this.#reducedMotion || !(this.#options.autoplay ?? true);
    const initialTime = resetTime ? (restFrame ? this.#duration : 0) : previousTime;
    const initialPlaying = resetTime
      ? (this.#options.autoplay ?? true) && !this.#reducedMotion && this.#duration > 0
      : wasPlaying && !this.#reducedMotion;
    const frame = seekTimeline(this.#resolved, initialTime);
    this.stage.innerHTML = renderSvg(frame, {
      idPrefix: this.id,
      className: "kg-figure__svg",
      role: "group",
      effects: "enhanced",
    });
    // The stage reserves the drawing's box only while it is *empty* (see `.kg-figure__stage:empty`
    // in `styles.ts`); once a drawing is in it, the drawing's own height is the honest one.
    //
    // Pinning `aspect-ratio` on a *full* stage makes its height follow its own width, which is the
    // drawing's height only while the drawing shrinks to fit. An embedder that holds the SVG to a
    // minimum width — so labels stay legible on a narrow screen instead of scaling to nothing —
    // makes it wider than the stage and therefore taller than that ratio, and the pin then cut the
    // bottom off the picture against `overflow-y: hidden`, with no way to scroll to what was lost.
    this.stage.style.setProperty("--kg-stage-width", String(this.#resolved.width));
    this.stage.style.setProperty("--kg-stage-height", String(this.#resolved.height));
    this.#shaders = mountShaderSurfaces(this.stage, initialTime);
    this.#liveSurfaces = new LiveSurfaceManager(this.stage, this.#resolved, {
      ...(this.#options.liveSurfaces === undefined
        ? {}
        : { renderers: this.#options.liveSurfaces }),
      theme: this.#theme,
      machineState: this.machine?.state,
      signals: this.machine?.signals ?? {},
      time: initialTime,
      playing: initialPlaying,
      send: (event) => this.send(event),
      ...(this.#options.onSurfaceError === undefined
        ? {}
        : { onError: this.#options.onSurfaceError }),
    });
    this.#applyShellTheme();
    this.#animator = new KineglyphSceneAnimator({
      root: this.stage,
      scene: this.#resolved,
      reducedMotion: this.#reducedMotion,
      onFrame: (nextFrame) => {
        this.#time = nextFrame.time;
        this.#shaders?.seek(nextFrame.time);
        this.#liveSurfaces?.update(nextFrame);
        this.#syncScrubber();
        this.#emitter.emit("frame", nextFrame);
        this.#options.onFrame?.(nextFrame);
      },
      onPlaybackChange: (playing) => {
        this.#playing = playing;
        this.#liveSurfaces?.setPlaying(playing);
        this.#syncControls();
        this.#emitter.emit("playback", playing);
        this.#options.onPlaybackChange?.(playing);
      },
    });
    if (!resetTime || (restFrame && !this.#reducedMotion)) this.#animator.seek(initialTime);
    this.#renderMachineControls();
    this.#syncControls();
    this.#syncSelection();
    this.#refreshReadout();
    this.#emitter.emit("render", this.#resolved);
    if (resetTime) {
      if ((this.#options.autoplay ?? true) && !this.#reducedMotion && this.#duration > 0)
        this.#animator.play();
    } else if (wasPlaying && !this.#reducedMotion) this.#animator.play();
    if (focusedId !== undefined) this.#restoreFocus(focusedId);
  }

  #applyStep(step: MachineStep): void {
    this.#resolved = this.#resolve();
    this.#render(false);
    for (const effect of step.effects) {
      if (effect.type === "seek") {
        const time =
          effect.time === "start" ? 0 : effect.time === "end" ? this.#duration : effect.time;
        this.#animator?.seek(time);
      }
    }
    if (this.machine !== undefined && this.#live !== undefined) {
      const signals = this.machine.signals;
      const summary = [signals.engine, signals.insightTitle, signals.summary]
        .filter((value): value is string => typeof value === "string" && value.length > 0)
        .join(" — ");
      this.#live.textContent = summary || `State: ${step.next.state}`;
    }
    this.#emitter.emit("state", { step, scene: this.#resolved });
    this.#options.onStateChange?.(step, this.#resolved);
  }

  /**
   * The chrome around a live figure — its frame, readout and transport — in the same colours as
   * the diagram inside it.
   *
   * Each property is written as a *reference* to the contract token it stands for, with the
   * theme's own value as the fallback: `var(--kg-color-canvas, #f7f8fa)`. That is what keeps a
   * page's `--kg-color-*` reaching the chrome as well as the drawing. Written as literals it
   * could not — an inline style is the last word on an element — and a figure on a dark page
   * ended up as a re-tinted diagram in a white box.
   */
  #applyShellTheme(): void {
    const tokens = this.#theme;
    const style = this.#shell.style;
    const ref = (role: string, value: string): string => `var(--kg-color-${role}, ${value})`;
    /*
     * A declared theme is an override, and this is where it is scoped.
     *
     * The drawing pins its own claimed roles on the `<svg>` root (see `buildPalette`), but the
     * chrome around it is not inside that root, so it would still be reading the page's tokens and
     * a figure given a dark theme on a light page ended up as a dark diagram in a light box. Pinning
     * on the shell covers both — the stage is a descendant — and covers neither of the neighbours,
     * because a custom property set on an element reaches exactly its own subtree.
     *
     * Stale pins are removed rather than left: `setTheme` can hand back a theme that claims less
     * than the last one, and a pin nobody cleared is an override the author has deleted.
     */
    const pinned = new Map<string, string>();
    for (const role of declaredColorRoles(tokens)) {
      const value = tokens.colors[role];
      if (typeof value === "string" && value.length > 0)
        pinned.set(`--kg-color-${cssRole(role)}`, value);
    }
    for (const name of this.#pinnedColorVars) if (!pinned.has(name)) style.removeProperty(name);
    for (const [name, value] of pinned) style.setProperty(name, value);
    this.#pinnedColorVars = [...pinned.keys()];
    style.setProperty("--kg-shell-background", ref("canvas", tokens.colors.canvas));
    style.setProperty("--kg-shell-surface", ref("surface-raised", tokens.colors.surfaceRaised));
    style.setProperty("--kg-shell-text", ref("text", tokens.colors.text));
    style.setProperty("--kg-shell-muted", ref("text-muted", tokens.colors.textMuted));
    style.setProperty("--kg-shell-border", ref("border", tokens.colors.border));
    style.setProperty("--kg-shell-accent", ref("accent", tokens.colors.accent));
    style.setProperty("--kg-shell-radius", `${tokens.radii.lg}px`);
    style.setProperty("--kg-shell-font", tokens.typography.body.family);
    this.#shell.classList.toggle("kg-figure--compact", this.#width < 620);
    this.#shell.setAttribute("aria-label", `${this.#resolved.title} interactive figure`);
    this.#shell.dataset.layout = this.#resolved.layoutName ?? this.#resolved.layout;
    this.#shell.dataset.theme = tokens.name ?? "custom";
  }

  #buildControls(doc: Document): void {
    const controls = this.#controls;
    if (controls === undefined) return;
    const play = doc.createElement("button");
    play.type = "button";
    play.className = "kg-figure__play";
    play.textContent = "Play";
    play.addEventListener("click", () => {
      if (this.#playing) this.pause();
      else this.play();
    });
    const restart = doc.createElement("button");
    restart.type = "button";
    restart.className = "kg-figure__restart";
    restart.textContent = "Restart";
    restart.addEventListener("click", () => this.restart(false));
    const label = doc.createElement("label");
    label.className = "kg-figure__scrubber";
    const caption = doc.createElement("span");
    caption.textContent = "Timeline";
    const range = doc.createElement("input");
    range.type = "range";
    range.min = "0";
    range.step = "1";
    range.addEventListener("input", () => this.seek(Number(range.value)));
    label.append(caption, range);
    const output = doc.createElement("output");
    controls.append(play, restart, label, output);
    controls.addEventListener("keydown", (event) => {
      if (event.key !== " " || event.target === range) return;
      if (event.target instanceof HTMLButtonElement) return;
      event.preventDefault();
      if (this.#playing) this.pause();
      else this.play();
    });
    this.#playButton = play;
    this.#restartButton = restart;
    this.#scrubber = range;
    this.#timeOutput = output;
  }

  /** Forgets the built control buttons so the next render rebuilds them from the current scene. */
  #invalidateMachineControls(): void {
    const bar = this.#machineBar;
    if (bar === undefined) return;
    delete bar.dataset.controls;
    bar.replaceChildren();
  }

  #renderMachineControls(): void {
    const bar = this.#machineBar;
    if (bar === undefined) return;
    const controls = this.#resolved.controls ?? [];
    if (this.machine === undefined || controls.length === 0) {
      bar.hidden = true;
      this.#invalidateMachineControls();
      return;
    }
    bar.hidden = false;
    // The signature covers every behavioural field so a same-looking control never keeps a
    // stale click handler; buttons are only reused while the whole control set is identical.
    const signature = JSON.stringify(
      controls.map((control) => [
        control.id,
        control.label,
        control.kind ?? "event",
        control.event ?? "",
        control.group ?? "",
        control.description ?? "",
      ]),
    );
    if (bar.dataset.controls === signature && bar.childElementCount > 0) {
      this.#syncMachineControls();
      return;
    }
    bar.dataset.controls = signature;
    const doc = bar.ownerDocument;
    bar.replaceChildren();
    const groups = new Map<string, SceneControl[]>();
    for (const control of controls) {
      const key = control.group ?? "";
      const list = groups.get(key) ?? [];
      list.push(control);
      groups.set(key, list);
    }
    for (const [name, list] of groups) {
      const group = doc.createElement("div");
      group.className = "kg-figure__machine-group";
      group.setAttribute("role", "group");
      if (name.length > 0) {
        group.setAttribute("aria-label", name);
        const label = doc.createElement("span");
        label.className = "kg-figure__machine-label";
        label.textContent = name;
        group.append(label);
      }
      for (const control of list) {
        const button = doc.createElement("button");
        button.type = "button";
        button.textContent = control.label;
        button.dataset.control = control.id;
        if (control.description !== undefined) button.title = control.description;
        if ((control.kind ?? "event") === "reset") {
          button.classList.add("kg-figure__reset");
          button.addEventListener("click", () => this.reset());
        } else {
          button.addEventListener("click", () => {
            if (control.event !== undefined) this.send(control.event);
          });
        }
        group.append(button);
      }
      bar.append(group);
    }
    this.#syncMachineControls();
  }

  #syncMachineControls(): void {
    const bar = this.#machineBar;
    if (bar === undefined || this.machine === undefined) return;
    const state = this.machine.state;
    for (const control of this.#resolved.controls ?? []) {
      const button = bar.querySelector<HTMLButtonElement>(
        `[data-control="${cssEscape(control.id)}"]`,
      );
      if (button === null) continue;
      if (control.activeWhen !== undefined)
        button.setAttribute(
          "aria-pressed",
          evaluateCondition(control.activeWhen, state) ? "true" : "false",
        );
    }
  }

  #syncControls(): void {
    const disabled = this.#reducedMotion || this.#duration === 0;
    if (this.#playButton !== undefined) {
      this.#playButton.textContent = this.#playing ? "Pause" : "Play";
      this.#playButton.setAttribute("aria-pressed", this.#playing ? "true" : "false");
      this.#playButton.disabled = disabled;
    }
    if (this.#restartButton !== undefined) this.#restartButton.disabled = disabled;
    if (this.#scrubber !== undefined) {
      this.#scrubber.max = String(Math.max(1, this.#duration));
      this.#scrubber.disabled = disabled;
    }
    this.#syncScrubber();
    this.#syncMachineControls();
  }

  #syncScrubber(): void {
    const time = this.#reducedMotion ? this.#duration : this.#time;
    if (this.#scrubber !== undefined) {
      this.#scrubber.value = String(Math.round(time));
      this.#scrubber.setAttribute("aria-valuetext", `${Math.round(time)} milliseconds`);
    }
    if (this.#timeOutput !== undefined)
      this.#timeOutput.textContent = this.#reducedMotion
        ? "Reduced motion"
        : `${(time / 1000).toFixed(1)}s`;
  }

  #bindInteractions(doc: Document): void {
    const stage = this.stage;
    const nodeFrom = (event: Event): Element | null =>
      event.target instanceof Element
        ? event.target.closest("[data-node-id],[data-edge-group]")
        : null;
    const inspect = (event: Event): void => {
      const target = nodeFrom(event);
      if (target === null) return;
      const nodeId = target.getAttribute("data-node-id");
      const edgeId = target.getAttribute("data-edge-group");
      if (nodeId !== null && this.#isInspectable(nodeId))
        this.#setInspected(this.#targetFor(nodeId));
      else if (edgeId !== null && target.getAttribute("role") === "img")
        this.#setInspected(this.#targetFor(edgeId));
    };
    const clear = (event: Event): void => {
      const related =
        event instanceof FocusEvent || event instanceof MouseEvent ? event.relatedTarget : null;
      const current = nodeFrom(event);
      if (
        related instanceof Element &&
        related.closest("[data-node-id],[data-edge-group]") === current
      )
        return;
      if (event.type === "focusout" && current !== null && !current.matches("[data-node-id]"))
        return;
      this.#setInspected(undefined);
    };
    const activate = (event: Event): void => {
      const target =
        event.target instanceof Element ? event.target.closest("[data-activate]") : null;
      if (target === null) return;
      const eventName = target.getAttribute("data-activate");
      if (eventName === null) return;
      if (event instanceof KeyboardEvent && event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      this.send(eventName);
    };
    stage.addEventListener("pointerover", inspect);
    stage.addEventListener("pointerout", clear);
    stage.addEventListener("focusin", inspect);
    stage.addEventListener("focusout", clear);
    const rove = (event: Event): void => {
      if (!(event instanceof KeyboardEvent)) return;
      const keys = ["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp", "Home", "End"];
      if (!keys.includes(event.key)) return;
      const active = event.target instanceof Element ? event.target : null;
      const group = active?.closest("[data-focus-group]");
      if (group === null || group === undefined) return;
      const members = focusGroupMembers(group);
      if (members.length === 0) return;
      const index = members.findIndex((member) => member === active);
      let next: number;
      if (event.key === "Home") next = 0;
      else if (event.key === "End") next = members.length - 1;
      else if (event.key === "ArrowRight" || event.key === "ArrowDown")
        next = index < 0 ? 0 : (index + 1) % members.length;
      else next = index < 0 ? members.length - 1 : (index - 1 + members.length) % members.length;
      event.preventDefault();
      members[next]?.focus({ preventScroll: true });
    };
    stage.addEventListener("click", activate);
    stage.addEventListener("keydown", activate);
    stage.addEventListener("keydown", rove);
    this.#cleanups.push(() => {
      stage.removeEventListener("pointerover", inspect);
      stage.removeEventListener("pointerout", clear);
      stage.removeEventListener("focusin", inspect);
      stage.removeEventListener("focusout", clear);
      stage.removeEventListener("click", activate);
      stage.removeEventListener("keydown", activate);
      stage.removeEventListener("keydown", rove);
    });
    void doc;
  }

  #observeMedia(element: HTMLElement): void {
    if (this.#options.reducedMotion !== undefined) return;
    const view = element.ownerDocument.defaultView;
    if (view === null || typeof view.matchMedia !== "function") return;
    const media = view.matchMedia("(prefers-reduced-motion: reduce)");
    const update = (): void => {
      if (this.#destroyed) return;
      this.setReducedMotion(media.matches);
    };
    media.addEventListener("change", update);
    this.#cleanups.push(() => media.removeEventListener("change", update));
  }

  #observeSize(element: HTMLElement): void {
    const view = element.ownerDocument.defaultView;
    if (view === null || typeof view.ResizeObserver !== "function") return;
    this.#observer = new view.ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry === undefined || this.#destroyed) return;
      const next = Math.max(280, Math.round(entry.contentRect.width));
      if (next !== this.#width && next > 0) this.resize(next);
    });
    this.#observer.observe(element);
  }

  #isInspectable(nodeId: string): boolean {
    const node = this.#resolved.nodes.find((entry) => entry.id === nodeId);
    return (
      node !== undefined &&
      (node.interactive || (node.label.length > 0 && node.description !== undefined))
    );
  }

  /**
   * Whether pointing at this scene could ever fill the readout.
   *
   * The same predicate `#bindInteractions` gates on, asked of the whole scene rather than one
   * node — so `readout: "auto"` promises exactly what hovering will deliver, instead of guessing
   * from something adjacent like "the scene has a description".
   */
  #hasInspectableContent(): boolean {
    return this.#resolved.nodes.some((node) => this.#isInspectable(node.id));
  }

  #targetFor(id: string): InspectTarget | undefined {
    const node = this.#resolved.nodes.find((entry) => entry.id === id);
    if (node !== undefined) {
      const info = node.inspect ?? {};
      const metaRole = node.metadata.role;
      const role =
        info.role ?? (typeof metaRole === "string" && metaRole.length > 0 ? metaRole : "Element");
      const title = info.title ?? node.label;
      const summary = info.summary ?? node.description;
      return {
        kind: "node",
        id,
        role,
        title,
        ...(summary === undefined ? {} : { summary }),
        fields: info.fields ?? [],
        label: title,
        ...(summary === undefined ? {} : { description: summary }),
        node,
      };
    }
    const edge = this.#resolved.edges.find((entry) => entry.id === id);
    if (edge !== undefined) {
      const title = edge.label ?? edge.description ?? id;
      return {
        kind: "edge",
        id,
        role: "Connection",
        title,
        ...(edge.description === undefined ? {} : { summary: edge.description }),
        fields: [
          { label: "From", value: edge.from },
          { label: "To", value: edge.to },
        ],
        label: title,
        ...(edge.description === undefined ? {} : { description: edge.description }),
        edge,
      };
    }
    return undefined;
  }

  #setInspected(target: InspectTarget | undefined): void {
    if (this.#inspected?.id === target?.id) return;
    this.#inspected = target;
    this.#syncSelection();
    this.#refreshReadout();
    this.#emitter.emit("inspect", target);
    this.#options.onInspect?.(target);
  }

  #syncSelection(): void {
    const selection = this.machine?.state.selection ?? null;
    for (const element of this.stage.querySelectorAll("[data-node-id]")) {
      const id = element.getAttribute("data-node-id");
      if (id === this.#inspected?.id) element.setAttribute("data-inspected", "true");
      else element.removeAttribute("data-inspected");
      if (id !== null && id === selection) element.setAttribute("data-selected", "true");
      else element.removeAttribute("data-selected");
    }
  }

  #refreshReadout(): void {
    const readout = this.#readout;
    if (readout === undefined) return;
    const [eyebrow, strong, body] = readout.children;
    const inspected = this.#inspected;
    const doc = readout.ownerDocument;
    if (inspected === undefined) {
      if (eyebrow) eyebrow.textContent = "Inspect";
      if (strong) strong.textContent = this.#resolved.title;
      if (body) body.textContent = this.#resolved.description ?? "";
      return;
    }
    if (eyebrow) eyebrow.textContent = inspected.role;
    if (strong) strong.textContent = inspected.title;
    if (body) {
      body.replaceChildren();
      if (inspected.summary !== undefined && inspected.summary.length > 0)
        body.append(doc.createTextNode(inspected.summary));
      if (inspected.fields.length > 0) {
        const list = doc.createElement("dl");
        list.className = "kg-figure__fields";
        for (const field of inspected.fields) {
          const term = doc.createElement("dt");
          term.textContent = field.label;
          const value = doc.createElement("dd");
          value.textContent = field.value;
          list.append(term, value);
        }
        body.append(list);
      }
    }
  }

  #focusedNodeId(): string | undefined {
    const active = this.element.ownerDocument.activeElement;
    if (!(active instanceof Element) || !this.stage.contains(active)) return undefined;
    return active.closest("[data-node-id]")?.getAttribute("data-node-id") ?? undefined;
  }

  #restoreFocus(nodeId: string): void {
    const target = this.stage.querySelector<HTMLElement | SVGElement>(
      `[data-node-id="${cssEscape(nodeId)}"]`,
    );
    if (target !== null && typeof (target as HTMLElement).focus === "function")
      (target as HTMLElement).focus({ preventScroll: true });
  }
}

// ---------------------------------------------------------------------------------------------
// Auto-mount from data attributes (Blade / static pages)
// ---------------------------------------------------------------------------------------------

const sceneRegistry = new Map<string, FigureSource>();
const themeRegistry = new Map<string, ThemeTokens>();

/** Registers a scene under an id for `data-kineglyph` auto-mounting. */
export function registerScene(id: string, scene: FigureSource): void {
  sceneRegistry.set(id, scene);
}

/** Registers a theme under a name for `data-theme` auto-mounting. */
export function registerTheme(name: string, theme: ThemeTokens): void {
  themeRegistry.set(name, theme);
}

/** Looks up a scene registered via `registerScene`. */
export function getRegisteredScene(id: string): FigureSource | undefined {
  return sceneRegistry.get(id);
}

/** Looks up a theme registered via `registerTheme`. */
export function getRegisteredTheme(name: string): ThemeTokens | undefined {
  return themeRegistry.get(name);
}

/**
 * The reserved theme name for "take the page's colours".
 *
 * It exists because a host whose theme arrives as configuration — an article's front matter, a CMS
 * field, a `data-theme` attribute written by a template — needs a way to *say* inherit. Without a
 * name for it the only way to express the default is to leave the field out, which is a different
 * statement: an omission is silence, and silence is not a decision an author can point at.
 */
export const INHERIT_THEME = "inherit";

/**
 * Resolves a `data-theme` name to a theme. `"inherit"` is reserved and wins over the registry, so
 * it means the same thing on every host. An unknown name inherits too, by returning `undefined`.
 */
export function themeByName(
  name: string,
  themes?: Readonly<Record<string, ThemeTokens>>,
): ThemeTokens | undefined {
  if (name === INHERIT_THEME) return inheritTheme();
  return themes?.[name] ?? themeRegistry.get(name);
}

/** `--kg-color-` suffix for a semantic role: `surfaceRaised` → `surface-raised`. */
function cssRole(role: string): string {
  return role
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-");
}

export interface AutoMountOptions {
  readonly root?: ParentNode;
  readonly selector?: string;
  readonly scenes?: Readonly<Record<string, FigureSource>>;
  readonly themes?: Readonly<Record<string, ThemeTokens>>;
  /** Per-host runtime options for live surfaces, callbacks, or application-specific defaults. */
  readonly mountOptions?: (
    element: HTMLElement,
    sceneId: string,
  ) => Partial<Omit<MountOptions, "scene">>;
}

/**
 * Mounts every `[data-kineglyph="<scene id>"]` element. Optional attributes: `data-theme`,
 * `data-layout`, `data-autoplay="false"`, `data-controls="false"|"auto"`,
 * `data-readout="false"|"auto"`, `data-reduced-motion="true"`, `data-width`. Returns the
 * controllers in document order.
 */
export function autoMount(options: AutoMountOptions = {}): KineglyphController[] {
  const root: ParentNode =
    options.root ?? (typeof document === "undefined" ? ({} as ParentNode) : document);
  if (typeof root.querySelectorAll !== "function") return [];
  const controllers: KineglyphController[] = [];
  for (const element of root.querySelectorAll<HTMLElement>(
    options.selector ?? "[data-kineglyph]",
  )) {
    if (element.dataset.kineglyphMounted === "true") continue;
    const sceneId = element.dataset.kineglyph ?? "";
    const scene = options.scenes?.[sceneId] ?? sceneRegistry.get(sceneId);
    if (scene === undefined) {
      element.setAttribute("data-kineglyph-error", `unknown scene "${sceneId}"`);
      continue;
    }
    const themeName = element.dataset.theme;
    const theme = themeName === undefined ? undefined : themeByName(themeName, options.themes);
    const layout = element.dataset.layout as FigureLayoutRequest | undefined;
    const width = element.dataset.width === undefined ? undefined : Number(element.dataset.width);
    const additional = options.mountOptions?.(element, sceneId) ?? {};
    const controller = mountKineglyph(element, {
      scene,
      ...(theme === undefined ? {} : { theme }),
      ...(layout === undefined ? {} : { layout }),
      ...(width === undefined || !Number.isFinite(width) ? {} : { width }),
      autoplay: element.dataset.autoplay !== "false",
      controls: chromeAttr(element.dataset.controls),
      readout: chromeAttr(element.dataset.readout),
      ...(element.dataset.reducedMotion === undefined
        ? {}
        : { reducedMotion: element.dataset.reducedMotion === "true" }),
      ...(element.dataset.idPrefix === undefined ? {} : { idPrefix: element.dataset.idPrefix }),
      ...additional,
    });
    element.dataset.kineglyphMounted = "true";
    controller.on("destroy", () => {
      delete element.dataset.kineglyphMounted;
    });
    controllers.push(controller);
  }
  return controllers;
}

// ---------------------------------------------------------------------------------------------
// The page's own font
// ---------------------------------------------------------------------------------------------

/**
 * The font stack an element is actually rendered in, ready to hand to `withFontFamily`.
 *
 * A figure's text is laid out once and shipped as fixed geometry, so it has to be laid out in the
 * font the page draws with — a diagram rendered against the library's default lands in a host's
 * article set in something else and reads as a foreign object. Anything that renders a figure
 * inside a real page (an in-browser publisher, most of all) can read the answer off the page
 * instead of assuming it.
 *
 * Returns `undefined` when there is no view to ask, so a caller can fall back to its theme.
 */
export function documentFontFamily(element?: Element): string | undefined {
  const target = element ?? globalThis.document?.body ?? globalThis.document?.documentElement;
  const view = target?.ownerDocument.defaultView;
  if (target === undefined || target === null || view === undefined || view === null)
    return undefined;
  const family = view.getComputedStyle(target).fontFamily;
  return family === "" ? undefined : family;
}

// ---------------------------------------------------------------------------------------------
// In-view start (article pages, galleries)
// ---------------------------------------------------------------------------------------------

export interface StartWhenVisibleOptions {
  /**
   * Fraction of the element that must be visible. Kept deliberately low (default 0.06) because
   * tall narrow figures may never reach a high ratio inside a short viewport.
   */
  readonly threshold?: number;
  /** Extra margin around the viewport; defaults to starting slightly before the figure scrolls in. */
  readonly rootMargin?: string;
  /** Fire once (default) or on every entry. */
  readonly once?: boolean;
  /** Called immediately when IntersectionObserver is unavailable. Defaults to true. */
  readonly fallbackImmediately?: boolean;
}

/**
 * Invokes `start` the first time `element` scrolls into view. Returns a disposer. Intended for
 * galleries and long articles so figures play when the reader reaches them.
 */
export function startWhenVisible(
  element: Element,
  start: () => void,
  options: StartWhenVisibleOptions = {},
): () => void {
  const view = element.ownerDocument.defaultView;
  const Observer = view?.IntersectionObserver;
  if (typeof Observer !== "function") {
    if (options.fallbackImmediately !== false) start();
    return () => undefined;
  }
  let fired = false;
  const observer = new Observer(
    (entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      if (options.once !== false) {
        if (fired) return;
        fired = true;
        observer.disconnect();
      }
      start();
    },
    { threshold: options.threshold ?? 0.06, rootMargin: options.rootMargin ?? "0px 0px -10% 0px" },
  );
  observer.observe(element);
  return () => observer.disconnect();
}

// ---------------------------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------------------------

function isSceneDefinition(
  source: FigureSource,
): source is Extract<FigureSource, { schemaVersion: 2 }> {
  return (source as { schemaVersion?: unknown }).schemaVersion === 2;
}

function measureWidth(element: HTMLElement): number {
  const rect = element.getBoundingClientRect();
  if (rect.width > 0) return rect.width;
  const parent = element.parentElement;
  const parentWidth = parent === null ? 0 : parent.getBoundingClientRect().width;
  return parentWidth > 0 ? parentWidth : 960;
}

function prefersReducedMotion(element: HTMLElement): boolean {
  const view = element.ownerDocument.defaultView;
  if (view === null || typeof view.matchMedia !== "function") return false;
  return view.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Direct roving members of a focus group: focusable descendants whose nearest focus group is this
 * one (nested focus groups are their own tab stops), skipping hidden, inert, or aria-hidden marks.
 */
function focusGroupMembers(group: Element): HTMLElement[] {
  return [...group.querySelectorAll<HTMLElement>("[data-node-id][tabindex]")].filter((member) => {
    if (member === group) return false;
    if (member.hasAttribute("data-focus-group")) return false;
    const owner = member.parentElement?.closest("[data-focus-group]") ?? null;
    if (owner !== group) return false;
    for (let el: Element | null = member; el !== null && el !== group; el = el.parentElement) {
      if (
        el.getAttribute("data-hidden") === "true" ||
        el.getAttribute("display") === "none" ||
        el.getAttribute("aria-hidden") === "true" ||
        el.hasAttribute("inert") ||
        el.hasAttribute("hidden")
      )
        return false;
    }
    return true;
  });
}

function cssEscape(value: string): string {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") return CSS.escape(value);
  return value.replace(/["\\]/g, "\\$&");
}

export { createMachineState };
export type { FigureSource, MachineState, MachineStep, ResolvedFrame, ResolvedScene, ThemeTokens };
export * from "./embed.js";
