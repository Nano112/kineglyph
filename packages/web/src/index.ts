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
  resolvedSceneBounds,
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
  type ResolvedSceneCrop,
  type SceneControl,
  type ThemeTokens,
  type VariableValue,
  type Variables,
} from "@kineglyph/core";
import { patchStageSvg } from "./patch.js";
import {
  mountDoctorOverlay,
  type DoctorOverlayHandle,
  type DoctorOverlayOptions,
} from "./doctor.js";
import { renderSvg, type SvgRenderOptions } from "@kineglyph/svg";
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
export * from "./math.js";
export * from "./nucleation.js";
export * from "./compose.js";
export * from "./micro.js";
export * from "./stream.js";
export * from "./export.js";
export * from "./gif.js";

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
/** `true` starts immediately, `false` rests on the final frame, and `"in-view"` starts on entry. */
export type AutoplaySetting = boolean | "in-view";

export interface MountOptions {
  /** A general scene definition or a legacy pipeline definition. */
  readonly scene: FigureSource;
  readonly theme?: ThemeTokens;
  readonly layout?: FigureLayoutRequest;
  /** Fixed container width in CSS pixels; when omitted the host element is measured and observed. */
  readonly width?: number;
  /** Defaults to `"in-view"`, so an article figure waits until the reader reaches it. */
  readonly autoplay?: AutoplaySetting;
  /** Repeat the scene timeline after it completes. Defaults to false. */
  readonly loop?: boolean;
  /** Viewport trigger tuning used when `autoplay` is `"in-view"`. Default delay: 180 ms. */
  readonly inView?: StartWhenVisibleOptions;
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
   * inspected — a node with `inspect` metadata, one that is `interactive`, or one that carries
   * both a label and a description.
   */
  readonly readout?: ChromeSetting;
  /**
   * Show a compact semantic tooltip while an inspectable node or edge is hovered or focused.
   * Defaults to true. Disable it when the host supplies its own inspection UI via `onInspect`.
   */
  readonly tooltips?: boolean;
  /** Render machine control buttons when the scene declares them. Defaults to true. */
  readonly machineControls?: ChromeSetting;
  /** Development-only bounds and quality overlay powered by `kineglyph doctor`. */
  readonly doctor?: boolean | DoctorOverlayOptions;
  /** Overrides the `prefers-reduced-motion` media query. */
  readonly reducedMotion?: boolean;
  /** Stable DOM id prefix. Defaults to a unique generated prefix. */
  readonly idPrefix?: string;
  readonly className?: string;
  readonly initialState?: MachineState;
  /** Initial overrides for scene-declared live signals. */
  readonly signals?: Variables;
  /** Retain a transition history on the live machine controller. */
  readonly history?: boolean;
  /** HTML/WebGL renderers keyed by a live image node id. The image remains the export fallback. */
  readonly liveSurfaces?: Readonly<Record<string, LiveSurfaceRenderer>>;
  /**
   * Host-side derived signals. Called with the machine's variables after every transition (and
   * once at mount); the returned values are merged into the live signals before the scene is
   * re-resolved. This is where geometry the expression language cannot express — trigonometry,
   * numerical roots, propagated trajectories — is computed while the scene stays plain data.
   */
  readonly deriveSignals?: (variables: Variables, signals: Variables) => Variables;
  /**
   * Frame signals: evaluated for every rendered frame with the scene time (ms) and the live
   * signals, and applied at seek time to bound paths, text, opacity and visibility. Unlike
   * `deriveSignals` (per machine step) this runs per frame without re-resolving the scene, so a
   * live surface can report where its objects are and callouts follow them — in playback and in
   * exported frames alike.
   */
  readonly frameSignals?: (time: number, signals: Variables) => Variables;
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
  readonly signals: Variables;
  readonly inspected: InspectTarget | undefined;
  readonly destroyed: boolean;
}

export type KineglyphEventMap = {
  readonly frame: ResolvedFrame;
  readonly playback: boolean;
  readonly inspect: InspectTarget | undefined;
  readonly state: { readonly step: MachineStep; readonly scene: ResolvedScene };
  readonly data: Variables;
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
  setScene(
    scene: FigureSource,
    options?: {
      readonly initialState?: MachineState;
      /** Replaces the live-surface registry while swapping the scene. Omit to keep it. */
      readonly liveSurfaces?: Readonly<Record<string, LiveSurfaceRenderer>> | undefined;
      /** Replaces the derived-signal hook while swapping the scene. Omit to keep it. */
      readonly deriveSignals?: MountOptions["deriveSignals"] | undefined;
      /** Replaces the frame-signal hook while swapping the scene. Omit to keep it. */
      readonly frameSignals?: MountOptions["frameSignals"] | undefined;
    },
  ): void;
  /** Merges live signal values and re-renders; pass `replace` to discard earlier overrides. */
  setSignals(signals: Variables, options?: { readonly replace?: boolean }): void;
  /** The frame at `time` as SVG markup, with frame signals applied. */
  frameSvg(time: number, options?: SvgRenderOptions): string;
  /**
   * PNG data URLs of every live surface that can capture `time`, keyed by node id. Surfaces render
   * that time for it, so call it before `frameSvg(time)` when compositing an export.
   */
  surfaceSnapshots(time: number): Promise<ReadonlyMap<string, string>>;
  setReducedMotion(reduced: boolean): void;
  /** Enables or disables repetition without remounting the figure. */
  setLoop(loop: boolean): void;
  /** Enables or disables the development quality overlay without remounting the figure. */
  setDoctor(enabled: boolean | DoctorOverlayOptions): void;
  /** Serializes the current timeline and machine state, optionally tightly cropped. */
  toSvg(
    options?: SvgRenderOptions & {
      readonly crop?: ResolvedSceneCrop;
      readonly cropPadding?: number;
    },
  ): string;
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

/** Reads `data-autoplay`; an absent or explicit `in-view` value gets the viewport-aware default. */
export function autoplayAttr(value: string | undefined): AutoplaySetting {
  return value === "false" ? false : value === "true" ? true : "in-view";
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
  #doctorOverlay: DoctorOverlayHandle | undefined;
  #doctorEnabled: boolean;
  #doctorOptions: DoctorOverlayOptions;
  #width: number;
  #reducedMotion: boolean;
  #inspected: InspectTarget | undefined;
  #destroyed = false;
  /** `--kg-color-*` this figure has pinned on its shell, so a later theme can unpin them. */
  #pinnedColorVars: readonly string[] = [];
  #time = 0;
  #playing = false;
  #signals: Record<string, VariableValue>;
  readonly #emitter = new Emitter();
  readonly #cleanups: Array<() => void> = [];
  readonly #shell: HTMLElement;
  readonly #readout: HTMLElement | undefined;
  readonly #tooltip: HTMLElement | undefined;
  readonly #machineBar: HTMLElement | undefined;
  readonly #controls: HTMLElement | undefined;
  #playButton: HTMLButtonElement | undefined;
  #restartButton: HTMLButtonElement | undefined;
  #scrubber: HTMLInputElement | undefined;
  #timeOutput: HTMLOutputElement | undefined;
  #live: HTMLElement | undefined;
  #observer: ResizeObserver | undefined;
  #inViewStarted = false;

  constructor(element: HTMLElement, options: MountOptions) {
    this.element = element;
    this.#options = options;
    this.#doctorEnabled = options.doctor !== false && options.doctor !== undefined;
    this.#doctorOptions = typeof options.doctor === "object" ? options.doctor : {};
    this.#source = options.scene;
    this.#signals = { ...(options.signals ?? {}) };
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

    this.#deriveSignals();
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
    if (chromeWanted(options.machineControls, (this.#resolved.controls?.length ?? 0) > 0)) {
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
    // Tooltips are transient rather than chrome: keeping one hidden element available costs no
    // visible space and lets a live editor swap an inert scene for an inspectable one later.
    if (options.tooltips !== false) {
      this.#tooltip = doc.createElement("div");
      this.#tooltip.id = `${this.id}-tooltip`;
      this.#tooltip.className = "kg-figure__tooltip";
      this.#tooltip.setAttribute("role", "tooltip");
      this.#tooltip.setAttribute("aria-hidden", "true");
      this.#tooltip.hidden = true;
      this.#tooltip.innerHTML =
        '<span class="kg-figure__tooltip-role"></span><strong></strong><div class="kg-figure__tooltip-summary"></div><dl class="kg-figure__tooltip-fields"></dl>';
      this.#shell.append(this.#tooltip);
    }

    this.#render(true);
    this.#bindInteractions(doc);
    this.#observeMedia(element);
    if (options.width === undefined) this.#observeSize(element);
    if ((options.autoplay ?? "in-view") === "in-view") {
      this.#cleanups.push(
        startWhenVisible(
          element,
          () => {
            if (this.#destroyed) return;
            const shouldRestart = !this.#inViewStarted || options.inView?.once === false;
            this.#inViewStarted = true;
            if (shouldRestart && !this.#reducedMotion && this.#duration > 0) this.restart(true);
          },
          { ...options.inView, delay: options.inView?.delay ?? 180 },
        ),
      );
    }
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
      signals: { ...this.#resolved.signals },
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
    this.#render(false, true);
  }

  setScene(
    scene: FigureSource,
    options: {
      readonly initialState?: MachineState;
      readonly liveSurfaces?: Readonly<Record<string, LiveSurfaceRenderer>> | undefined;
      readonly deriveSignals?: MountOptions["deriveSignals"] | undefined;
      readonly frameSignals?: MountOptions["frameSignals"] | undefined;
    } = {},
  ): void {
    this.#assertLive();
    this.#source = scene;
    if ("frameSignals" in options) {
      const { frameSignals: _previousFrame, ...mountOptions } = this.#options;
      void _previousFrame;
      this.#options =
        options.frameSignals === undefined
          ? mountOptions
          : { ...mountOptions, frameSignals: options.frameSignals };
    }
    if ("liveSurfaces" in options) {
      const { liveSurfaces: _previousLiveSurfaces, ...mountOptions } = this.#options;
      void _previousLiveSurfaces;
      this.#options =
        options.liveSurfaces === undefined
          ? mountOptions
          : { ...mountOptions, liveSurfaces: options.liveSurfaces };
    }
    if ("deriveSignals" in options) {
      const { deriveSignals: _previousDerive, ...mountOptions } = this.#options;
      void _previousDerive;
      this.#options =
        options.deriveSignals === undefined
          ? mountOptions
          : { ...mountOptions, deriveSignals: options.deriveSignals };
    }
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
    this.#deriveSignals();
    this.#resolved = this.#resolve();
    this.#render(true, true);
  }

  /** Frame signals for `time`, or undefined when the mount has none. */
  #frameSignalsAt(time: number): Variables | undefined {
    const frameSignals = this.#options.frameSignals;
    return frameSignals === undefined ? undefined : frameSignals(time, this.#signals);
  }

  #seekOptions(time: number): { readonly signals?: Variables } {
    const signals = this.#frameSignalsAt(time);
    return signals === undefined ? {} : { signals };
  }

  frameSvg(time: number, options: SvgRenderOptions = {}): string {
    this.#assertLive();
    const clamped = Math.max(0, Math.min(this.#duration, time));
    return renderSvg(seekTimeline(this.#resolved, clamped, this.#seekOptions(clamped)), options);
  }

  async surfaceSnapshots(time: number): Promise<ReadonlyMap<string, string>> {
    this.#assertLive();
    return this.#liveSurfaces?.snapshots(time) ?? new Map();
  }

  setSignals(signals: Variables, options: { readonly replace?: boolean } = {}): void {
    this.#assertLive();
    this.#signals = options.replace === true ? { ...signals } : { ...this.#signals, ...signals };
    this.#resolved = this.#resolve();
    this.#render(false);
    this.#emitter.emit("data", { ...this.#signals });
  }

  setReducedMotion(reduced: boolean): void {
    this.#assertLive();
    this.#reducedMotion = reduced;
    this.#animator?.setReducedMotion(reduced);
    this.#syncControls();
  }

  setLoop(loop: boolean): void {
    this.#assertLive();
    if ((this.#options.loop ?? false) === loop) return;
    const atEnd = this.#time >= this.#duration;
    this.#options = { ...this.#options, loop };
    this.#render(false);
    if (loop && atEnd && this.#shouldAutoplay() && !this.#reducedMotion && this.#duration > 0)
      this.restart(true);
  }

  setDoctor(enabled: boolean | DoctorOverlayOptions): void {
    this.#assertLive();
    const nextEnabled = enabled !== false;
    const nextOptions = typeof enabled === "object" ? enabled : this.#doctorOptions;
    if (nextEnabled === this.#doctorEnabled && nextOptions === this.#doctorOptions) return;
    this.#doctorEnabled = nextEnabled;
    this.#doctorOptions = nextOptions;
    if (nextEnabled) {
      this.#doctorOverlay?.destroy();
      this.#doctorOverlay = mountDoctorOverlay(this.stage, this.#resolved, this.#doctorOptions);
    } else {
      this.#doctorOverlay?.destroy();
      this.#doctorOverlay = undefined;
    }
  }

  toSvg(
    options: SvgRenderOptions & {
      readonly crop?: ResolvedSceneCrop;
      readonly cropPadding?: number;
    } = {},
  ): string {
    this.#assertLive();
    const svgTime = this.#reducedMotion ? this.#duration : this.#time;
    const frame = seekTimeline(this.#resolved, svgTime, this.#seekOptions(svgTime));
    const { crop = "scene", cropPadding = 0, ...renderOptions } = options;
    const bounds = resolvedSceneBounds(frame, crop, cropPadding);
    const svg = renderSvg(frame, renderOptions);
    const viewBox = `${bounds.x} ${bounds.y} ${bounds.width} ${bounds.height}`;
    return svg
      .replace(/\bviewBox=(['"])[^'"]*\1/, `viewBox="${viewBox}"`)
      .replace(/\bwidth=(['"])[^'"]*\1/, `width="${bounds.width}"`)
      .replace(/\bheight=(['"])[^'"]*\1/, `height="${bounds.height}"`);
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
    this.#doctorOverlay?.destroy();
    this.#doctorOverlay = undefined;
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

  /** Merges host-derived signals for the current machine variables into the live signal set. */
  #deriveSignals(): void {
    const derive = this.#options.deriveSignals;
    if (derive === undefined) return;
    const variables = this.machine?.state.variables ?? {};
    const signals = this.machine?.signals ?? {};
    this.#signals = { ...this.#signals, ...derive(variables, signals) };
  }

  #resolve(): ResolvedScene {
    return resolveFigure(this.#source, {
      width: this.#width,
      theme: this.#theme,
      layout: this.#options.layout ?? "auto",
      ...(this.machine === undefined ? {} : { machineState: this.machine.state }),
      signals: this.#signals,
    });
  }

  #shouldAutoplay(): boolean {
    const setting = this.#options.autoplay ?? "in-view";
    return setting === true || (setting === "in-view" && this.#inViewStarted);
  }

  /** Renders the SVG for the current resolution and (re)creates the animator. */
  #render(resetTime: boolean, remountLiveSurfaces = false): void {
    const previousTime = this.#animator?.time ?? 0;
    const wasPlaying = this.#animator?.playing ?? false;
    const focusedId = this.#focusedNodeId();
    this.#animator?.dispose();
    this.#shaders?.dispose();
    this.#shaders = undefined;
    if (remountLiveSurfaces) {
      this.#liveSurfaces?.dispose();
      this.#liveSurfaces = undefined;
    }
    this.#hideTooltip();
    // Disabled and reduced-motion figures present their terminal frame. In-view figures wait at
    // frame zero, so the reader sees the authored entrance rather than a flash of the ending.
    const restFrame = this.#reducedMotion || (this.#options.autoplay ?? "in-view") === false;
    const initialTime = resetTime ? (restFrame ? this.#duration : 0) : previousTime;
    const initialPlaying = resetTime
      ? this.#shouldAutoplay() && !this.#reducedMotion && this.#duration > 0
      : wasPlaying && !this.#reducedMotion;
    const frame = seekTimeline(this.#resolved, initialTime, this.#seekOptions(initialTime));
    const drawing = patchStageSvg(
      this.stage,
      renderSvg(frame, {
        idPrefix: this.id,
        className: "kg-figure__svg",
        role: "group",
        effects: "enhanced",
      }),
    );
    // Some documentation shells apply a readability floor through inherited `--kg-w`/`--kg-h`
    // properties. A live figure resolves its own responsive drawing at runtime, so the current
    // SVG—not the publish-time placeholder—must own those dimensions. Keeping the values on the
    // drawing also makes the contract safe for nested editors and independently sized figures.
    // Append to the serialized attribute instead of mutating `CSSStyleDeclaration`: the latter
    // normalizes every existing declaration and breaks byte parity with a prerendered frame.
    const drawingStyle = drawing.getAttribute("style");
    drawing.setAttribute(
      "style",
      `${drawingStyle === null || drawingStyle.length === 0 ? "" : `${drawingStyle};`}--kg-w:${this.#resolved.width};--kg-h:${this.#resolved.height}`,
    );
    if (this.#doctorEnabled) {
      if (this.#doctorOverlay === undefined)
        this.#doctorOverlay = mountDoctorOverlay(this.stage, this.#resolved, this.#doctorOptions);
      else this.#doctorOverlay.update(this.#resolved);
    }
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
    if (this.#liveSurfaces === undefined)
      this.#liveSurfaces = new LiveSurfaceManager(this.stage, this.#resolved, {
        ...(this.#options.liveSurfaces === undefined
          ? {}
          : { renderers: this.#options.liveSurfaces }),
        theme: this.#theme,
        machineState: this.machine?.state,
        signals: { ...(this.machine?.signals ?? {}), ...this.#signals },
        time: initialTime,
        playing: initialPlaying,
        send: (event) => this.send(event),
        onRefresh: () => {
          const animator = this.#animator;
          if (animator !== undefined && !animator.playing) animator.seek(this.#time);
        },
        ...(this.#options.onSurfaceError === undefined
          ? {}
          : { onError: this.#options.onSurfaceError }),
      });
    else this.#liveSurfaces.update(frame);
    this.#applyShellTheme();
    this.#animator = new KineglyphSceneAnimator({
      root: this.stage,
      scene: this.#resolved,
      initialTime,
      reducedMotion: this.#reducedMotion,
      loop: this.#options.loop ?? false,
      ambientFlow: this.#shouldAutoplay() && !this.#reducedMotion,
      ...(this.#options.frameSignals === undefined
        ? {}
        : { frameSignals: (time: number) => this.#frameSignalsAt(time) ?? {} }),
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
    this.#renderMachineControls();
    this.#syncControls();
    this.#syncSelection();
    this.#refreshReadout();
    this.#emitter.emit("render", this.#resolved);
    if (resetTime) {
      if (this.#shouldAutoplay() && !this.#reducedMotion && this.#duration > 0)
        this.#animator.play();
    } else if (wasPlaying && !this.#reducedMotion) this.#animator.play();
    if (focusedId !== undefined) this.#restoreFocus(focusedId);
  }

  #applyStep(step: MachineStep): void {
    this.#deriveSignals();
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
    if (controls.length === 0) {
      bar.hidden = true;
      this.#invalidateMachineControls();
      return;
    }
    bar.hidden = false;
    // The signature covers every behavioural field so a same-looking control never keeps a
    // stale click handler; buttons are only reused while the whole control set is identical.
    const signature = JSON.stringify(controls);
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
        const kind = control.kind ?? "event";
        if (kind === "transport") {
          const transport = doc.createElement("div");
          transport.className = "kg-figure__machine-transport";
          transport.dataset.control = control.id;
          transport.setAttribute("role", "group");
          transport.setAttribute("aria-label", control.label);
          const play = doc.createElement("button");
          play.type = "button";
          play.dataset.transportAction = "play";
          play.addEventListener("click", () => (this.#playing ? this.pause() : this.play()));
          const step = doc.createElement("button");
          step.type = "button";
          step.textContent = "Step";
          step.dataset.transportAction = "step";
          step.addEventListener("click", () => {
            this.pause();
            const base = this.#time >= this.#duration ? 0 : this.#time;
            this.seek(Math.min(this.#duration, base + (control.transportStep ?? 100)));
          });
          const restart = doc.createElement("button");
          restart.type = "button";
          restart.textContent = "Restart";
          restart.dataset.transportAction = "restart";
          restart.addEventListener("click", () => this.restart(false));
          transport.append(play, step, restart);
          group.append(transport);
          continue;
        }
        if (kind === "range") {
          const field = doc.createElement("label");
          field.className = "kg-figure__machine-field kg-figure__machine-field--range";
          const label = doc.createElement("span");
          label.textContent = control.label;
          const input = doc.createElement("input");
          input.type = "range";
          input.id = `${this.id}-control-${control.id}`;
          input.dataset.control = control.id;
          input.min = String(control.min ?? 0);
          input.max = String(control.max ?? 100);
          input.step = String(control.step ?? 1);
          if (control.description !== undefined) input.title = control.description;
          const output = doc.createElement("output");
          output.htmlFor = input.id;
          output.dataset.outputFor = control.id;
          input.addEventListener("input", () => {
            if (control.event !== undefined)
              this.send({ type: control.event, value: Number(input.value) });
          });
          field.append(label, input, output);
          group.append(field);
          continue;
        }
        if (kind === "select") {
          const field = doc.createElement("label");
          field.className = "kg-figure__machine-field";
          const label = doc.createElement("span");
          label.textContent = control.label;
          const select = doc.createElement("select");
          select.id = `${this.id}-control-${control.id}`;
          select.dataset.control = control.id;
          if (control.description !== undefined) select.title = control.description;
          for (const [index, option] of (control.options ?? []).entries()) {
            const element = doc.createElement("option");
            element.value = String(index);
            element.textContent = option.label;
            if (option.description !== undefined) element.title = option.description;
            select.append(element);
          }
          select.addEventListener("change", () => {
            const option = control.options?.[Number(select.value)];
            if (control.event !== undefined && option !== undefined)
              this.send({ type: control.event, value: option.value });
          });
          field.append(label, select);
          group.append(field);
          continue;
        }
        if (kind === "radio") {
          const radio = doc.createElement("div");
          radio.className = "kg-figure__machine-radio";
          radio.dataset.control = control.id;
          radio.setAttribute("role", "radiogroup");
          radio.setAttribute("aria-label", control.label);
          if (control.description !== undefined) radio.title = control.description;
          for (const [index, option] of (control.options ?? []).entries()) {
            const button = doc.createElement("button");
            button.type = "button";
            button.textContent = option.label;
            button.dataset.option = String(index);
            button.setAttribute("role", "radio");
            if (option.description !== undefined) button.title = option.description;
            button.addEventListener("click", () => {
              if (control.event !== undefined)
                this.send({ type: control.event, value: option.value });
            });
            radio.append(button);
          }
          group.append(radio);
          continue;
        }
        const button = doc.createElement("button");
        button.type = "button";
        button.textContent = control.label;
        button.dataset.control = control.id;
        if (control.description !== undefined) button.title = control.description;
        if (kind === "reset") {
          button.classList.add("kg-figure__reset");
          button.addEventListener("click", () => this.reset());
        } else if (kind === "toggle") {
          button.addEventListener("click", () => {
            if (control.event !== undefined)
              this.send({ type: control.event, value: !this.#controlValue(control) });
          });
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
    if (bar === undefined) return;
    const state = this.machine?.state;
    for (const control of this.#resolved.controls ?? []) {
      const element = bar.querySelector<HTMLElement>(`[data-control="${cssEscape(control.id)}"]`);
      if (element === null) continue;
      const kind = control.kind ?? "event";
      const value = this.#controlValue(control);
      if (kind === "transport") {
        const play = element.querySelector<HTMLButtonElement>('[data-transport-action="play"]');
        if (play !== null) {
          play.textContent = this.#playing ? "Pause" : "Play";
          play.setAttribute("aria-pressed", this.#playing ? "true" : "false");
          play.disabled = this.#reducedMotion || this.#duration === 0;
        }
        for (const action of element.querySelectorAll<HTMLButtonElement>("button"))
          if (action !== play) action.disabled = this.#reducedMotion || this.#duration === 0;
      } else if (kind === "toggle") element.setAttribute("aria-pressed", value ? "true" : "false");
      else if (kind === "range" && element instanceof HTMLInputElement) {
        if (typeof value === "number" && Number.isFinite(value)) element.value = String(value);
        const output = bar.querySelector<HTMLOutputElement>(
          `[data-output-for="${cssEscape(control.id)}"]`,
        );
        if (output !== null) output.value = element.value;
      } else if (kind === "select" && element instanceof HTMLSelectElement) {
        const index = control.options?.findIndex((option) => Object.is(option.value, value)) ?? -1;
        if (index >= 0) element.value = String(index);
      } else if (kind === "radio") {
        for (const option of element.querySelectorAll<HTMLButtonElement>("[data-option]")) {
          const candidate = control.options?.[Number(option.dataset.option)];
          option.setAttribute(
            "aria-checked",
            Object.is(candidate?.value, value) ? "true" : "false",
          );
        }
      } else if (control.activeWhen !== undefined && state !== undefined)
        element.setAttribute(
          "aria-pressed",
          evaluateCondition(control.activeWhen, state) ? "true" : "false",
        );
    }
  }

  #controlValue(control: SceneControl): VariableValue | undefined {
    if (control.bind === undefined) return control.value;
    return this.#resolved.signals?.[control.bind] ?? control.value;
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
    type InspectHit = { readonly owner: Element; readonly target: InspectTarget };
    /**
     * Finds the semantic owner of the painted element under the pointer.
     *
     * Text, icons, and other decoration are nodes too, but usually carry no inspection payload of
     * their own. Stopping at the nearest `data-node-id` makes crossing those children look like
     * leaving their card. Walk upward until a node actually has something to say; an explicitly
     * inspectable nested node still wins before its parent.
     */
    const inspectFrom = (source: EventTarget | null): InspectHit | undefined => {
      if (!(source instanceof Element)) return undefined;
      let owner: Element | null = source.closest("[data-node-id],[data-edge-group]");
      while (owner !== null && stage.contains(owner)) {
        const nodeId = owner.getAttribute("data-node-id");
        const edgeId = owner.getAttribute("data-edge-group");
        const target =
          nodeId !== null && this.#isInspectable(nodeId)
            ? this.#targetFor(nodeId)
            : edgeId !== null && owner.getAttribute("role") === "img"
              ? this.#targetFor(edgeId)
              : undefined;
        if (target !== undefined) return { owner, target };
        owner = owner.parentElement?.closest("[data-node-id],[data-edge-group]") ?? null;
      }
      return undefined;
    };
    const inspect = (event: Event): void => {
      const hit = inspectFrom(event.target);
      if (hit === undefined) return;
      this.#setInspected(hit.target);
      this.#showTooltip(hit.target, hit.owner);
    };
    const clear = (event: Event): void => {
      const related =
        event instanceof FocusEvent || event instanceof MouseEvent ? event.relatedTarget : null;
      const current = inspectFrom(event.target);
      if (current === undefined) return;
      const next = inspectFrom(related);
      // Pointerout/focusout precedes the corresponding enter event. Transfer immediately when the
      // related element has another owner so adjacent cells and genuinely nested targets never
      // flash the tooltip off between two valid states.
      if (next !== undefined) {
        this.#setInspected(next.target);
        this.#showTooltip(next.target, next.owner);
        return;
      }
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
    const gestureOwner = (source: EventTarget | null, attribute: string): Element | null =>
      source instanceof Element ? source.closest(`[${attribute}]`) : null;
    const normalizedPoint = (event: PointerEvent, owner: Element): readonly [number, number] => {
      const box = owner.getBoundingClientRect();
      const x =
        box.width <= 0 ? 0.5 : Math.min(1, Math.max(0, (event.clientX - box.left) / box.width));
      const y =
        box.height <= 0 ? 0.5 : Math.min(1, Math.max(0, (event.clientY - box.top) / box.height));
      return [x, y];
    };
    const sendGesture = (owner: Element, attribute: string, value?: readonly number[]): void => {
      const type = owner.getAttribute(attribute);
      if (type !== null) this.send(value === undefined ? type : { type, value });
    };
    const hover = (event: Event): void => {
      const owner = gestureOwner(event.target, "data-hover");
      if (owner === null) return;
      const related =
        "relatedTarget" in event
          ? gestureOwner(event.relatedTarget as EventTarget | null, "data-hover")
          : null;
      if (related === owner) return;
      sendGesture(owner, "data-hover");
    };
    const leave = (event: Event): void => {
      const owner = gestureOwner(event.target, "data-leave");
      if (owner === null) return;
      const related =
        "relatedTarget" in event
          ? gestureOwner(event.relatedTarget as EventTarget | null, "data-leave")
          : null;
      if (related === owner) return;
      sendGesture(owner, "data-leave");
    };
    const focusGesture = (event: Event): void => {
      const owner = gestureOwner(event.target, "data-focus");
      if (owner !== null) sendGesture(owner, "data-focus");
    };
    const blurGesture = (event: Event): void => {
      const owner = gestureOwner(event.target, "data-blur");
      if (owner !== null) sendGesture(owner, "data-blur");
    };
    let dragOwner: Element | null = null;
    let pendingPointer:
      | {
          readonly owner: Element;
          readonly attribute: string;
          readonly point: readonly [number, number];
        }
      | undefined;
    let pointerFrame: number | undefined;
    const queuePointer = (
      owner: Element,
      attribute: string,
      point: readonly [number, number],
    ): void => {
      pendingPointer = { owner, attribute, point };
      if (pointerFrame !== undefined) return;
      const view = stage.ownerDocument.defaultView;
      const flush = (): void => {
        pointerFrame = undefined;
        const pending = pendingPointer;
        pendingPointer = undefined;
        if (pending !== undefined) sendGesture(pending.owner, pending.attribute, pending.point);
      };
      if (view?.requestAnimationFrame !== undefined)
        pointerFrame = view.requestAnimationFrame(flush);
      else flush();
    };
    const pointerDown = (event: Event): void => {
      if (!("clientX" in event) || !("clientY" in event)) return;
      const pointer = event as PointerEvent;
      const owner = gestureOwner(event.target, "data-drag");
      if (owner === null) return;
      event.preventDefault();
      dragOwner = owner;
      if ("setPointerCapture" in owner && Number.isFinite(pointer.pointerId))
        (owner as Element & { setPointerCapture(id: number): void }).setPointerCapture(
          pointer.pointerId,
        );
      queuePointer(owner, "data-drag", normalizedPoint(pointer, owner));
    };
    const pointerMove = (event: Event): void => {
      if (!("clientX" in event) || !("clientY" in event)) return;
      const pointer = event as PointerEvent;
      const pointerOwner = gestureOwner(event.target, "data-pointer");
      if (pointerOwner !== null)
        queuePointer(pointerOwner, "data-pointer", normalizedPoint(pointer, pointerOwner));
      if (dragOwner !== null)
        queuePointer(dragOwner, "data-drag", normalizedPoint(pointer, dragOwner));
    };
    const pointerUp = (): void => {
      dragOwner = null;
    };
    const keyboardDrag = (event: Event): void => {
      if (!(event instanceof KeyboardEvent)) return;
      const owner = gestureOwner(event.target, "data-drag");
      if (owner === null) return;
      const points: Readonly<Record<string, readonly [number, number]>> = {
        ArrowLeft: [0, 0.5],
        ArrowRight: [1, 0.5],
        ArrowUp: [0.5, 0],
        ArrowDown: [0.5, 1],
      };
      const point = points[event.key];
      if (point === undefined) return;
      event.preventDefault();
      sendGesture(owner, "data-drag", point);
    };
    stage.addEventListener("pointerover", inspect);
    stage.addEventListener("pointerout", clear);
    stage.addEventListener("focusin", inspect);
    stage.addEventListener("focusout", clear);
    stage.addEventListener("pointerover", hover);
    stage.addEventListener("pointerout", leave);
    stage.addEventListener("focusin", focusGesture);
    stage.addEventListener("focusout", blurGesture);
    stage.addEventListener("pointerdown", pointerDown);
    stage.addEventListener("pointermove", pointerMove);
    stage.addEventListener("pointerup", pointerUp);
    stage.addEventListener("pointercancel", pointerUp);
    stage.addEventListener("scroll", this.#hideTooltip, { passive: true });
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
    stage.addEventListener("keydown", keyboardDrag);
    this.#cleanups.push(() => {
      stage.removeEventListener("pointerover", inspect);
      stage.removeEventListener("pointerout", clear);
      stage.removeEventListener("focusin", inspect);
      stage.removeEventListener("focusout", clear);
      stage.removeEventListener("pointerover", hover);
      stage.removeEventListener("pointerout", leave);
      stage.removeEventListener("focusin", focusGesture);
      stage.removeEventListener("focusout", blurGesture);
      stage.removeEventListener("pointerdown", pointerDown);
      stage.removeEventListener("pointermove", pointerMove);
      stage.removeEventListener("pointerup", pointerUp);
      stage.removeEventListener("pointercancel", pointerUp);
      stage.removeEventListener("scroll", this.#hideTooltip);
      stage.removeEventListener("click", activate);
      stage.removeEventListener("keydown", activate);
      stage.removeEventListener("keydown", rove);
      stage.removeEventListener("keydown", keyboardDrag);
      const view = stage.ownerDocument.defaultView;
      if (pointerFrame !== undefined) view?.cancelAnimationFrame(pointerFrame);
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
      (node.inspect !== undefined ||
        node.interactive ||
        (node.label.length > 0 && node.description !== undefined))
    );
  }

  /**
   * Whether pointing at this scene could ever fill the readout.
   *
   * The same predicate `#bindInteractions` gates on, asked of the whole scene rather than one
   * node — so `readout: "auto"` promises exactly what hovering will deliver, instead of guessing
   * from something adjacent like "the scene has a description". Explicit `inspect` metadata is
   * enough: dense plot marks can remain non-interactive while still explaining themselves under
   * a pointer.
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
    this.#hideTooltip();
    this.#inspected = target;
    this.#syncSelection();
    this.#refreshReadout();
    this.#emitter.emit("inspect", target);
    this.#options.onInspect?.(target);
  }

  #syncSelection(): void {
    const selection = this.machine?.state.selection ?? null;
    const interactionGroup =
      this.#inspected?.node?.interactionGroup ?? this.#inspected?.edge?.interactionGroup;
    for (const element of this.stage.querySelectorAll("[data-node-id]")) {
      const id = element.getAttribute("data-node-id");
      if (id === this.#inspected?.id) element.setAttribute("data-inspected", "true");
      else element.removeAttribute("data-inspected");
      if (id !== null && id === selection) element.setAttribute("data-selected", "true");
      else element.removeAttribute("data-selected");
    }
    for (const element of this.stage.querySelectorAll("[data-node-id],[data-edge-id]")) {
      if (
        interactionGroup !== undefined &&
        element.getAttribute("data-interaction-group") === interactionGroup
      )
        element.setAttribute("data-related", "true");
      else element.removeAttribute("data-related");
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

  readonly #hideTooltip = (): void => {
    const tooltip = this.#tooltip;
    if (tooltip === undefined || tooltip.hidden) return;
    tooltip.hidden = true;
    tooltip.setAttribute("aria-hidden", "true");
  };

  #showTooltip(inspected: InspectTarget, anchor: Element): void {
    const tooltip = this.#tooltip;
    if (tooltip === undefined) return;
    const [role, title, summary, fields] = tooltip.children;
    if (role) role.textContent = inspected.role;
    if (title) title.textContent = inspected.title;
    if (summary) {
      summary.textContent = inspected.summary ?? "";
      (summary as HTMLElement).hidden = inspected.summary === undefined || inspected.summary === "";
    }
    if (fields) {
      fields.replaceChildren();
      for (const field of inspected.fields) {
        const term = tooltip.ownerDocument.createElement("dt");
        term.textContent = field.label;
        const value = tooltip.ownerDocument.createElement("dd");
        value.textContent = field.value;
        fields.append(term, value);
      }
      (fields as HTMLElement).hidden = inspected.fields.length === 0;
    }
    tooltip.hidden = false;
    tooltip.setAttribute("aria-hidden", "false");
    this.#positionTooltip(anchor);
  }

  #positionTooltip(anchor: Element): void {
    const tooltip = this.#tooltip;
    if (tooltip === undefined || tooltip.hidden) return;
    const shellRect = this.#shell.getBoundingClientRect();
    const anchorRect = anchor.getBoundingClientRect();
    const tooltipRect = tooltip.getBoundingClientRect();
    const inset = 8;
    const shellWidth = shellRect.width || this.#width;
    const tooltipWidth = tooltipRect.width || Math.min(280, Math.max(0, shellWidth - inset * 2));
    const half = tooltipWidth / 2;
    const naturalX = anchorRect.left + anchorRect.width / 2 - shellRect.left;
    const minX = inset + half;
    const maxX = Math.max(minX, shellWidth - inset - half);
    const x = Math.min(maxX, Math.max(minX, naturalX));
    const aboveSpace = anchorRect.top - shellRect.top;
    const placeBelow = aboveSpace < (tooltipRect.height || 96) + 12;
    tooltip.dataset.placement = placeBelow ? "below" : "above";
    tooltip.style.left = `${Math.round(x)}px`;
    tooltip.style.top = `${Math.round(
      (placeBelow ? anchorRect.bottom : anchorRect.top) - shellRect.top,
    )}px`;
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
 * `data-layout`, `data-autoplay="true"|"false"|"in-view"`, `data-autoplay-delay="180"`,
 * `data-loop="true"`,
 * `data-controls="false"|"auto"`,
 * `data-readout="false"|"auto"`, `data-tooltips="false"`, `data-reduced-motion="true"`,
 * `data-width`. Returns the controllers in document order.
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
    const autoplayDelay = numberAttr(element.dataset.autoplayDelay);
    const additional = options.mountOptions?.(element, sceneId) ?? {};
    const controller = mountKineglyph(element, {
      scene,
      ...(theme === undefined ? {} : { theme }),
      ...(layout === undefined ? {} : { layout }),
      ...(width === undefined || !Number.isFinite(width) ? {} : { width }),
      autoplay: autoplayAttr(element.dataset.autoplay),
      loop: element.dataset.loop === "true",
      ...(autoplayDelay === undefined ? {} : { inView: { delay: autoplayDelay } }),
      controls: chromeAttr(element.dataset.controls),
      readout: chromeAttr(element.dataset.readout),
      tooltips: element.dataset.tooltips !== "false",
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
  /** Wait after entry before starting. Defaults to 0; in-view autoplay supplies 180 ms. */
  readonly delay?: number;
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
  let timer: ReturnType<typeof setTimeout> | undefined;
  let fired = false;
  const observerRef: { disconnect?: () => void } = {};
  const cancelPending = (): void => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
  };
  const invoke = (): void => {
    timer = undefined;
    if (options.once !== false) {
      if (fired) return;
      fired = true;
      observerRef.disconnect?.();
    }
    start();
  };
  const schedule = (): void => {
    if (fired || timer !== undefined) return;
    const delay = Math.max(0, options.delay ?? 0);
    if (delay === 0) invoke();
    else timer = setTimeout(invoke, delay);
  };
  if (typeof Observer !== "function") {
    if (options.fallbackImmediately !== false) schedule();
    return cancelPending;
  }
  const observer = new Observer(
    (entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) {
        cancelPending();
        return;
      }
      schedule();
    },
    { threshold: options.threshold ?? 0.06, rootMargin: options.rootMargin ?? "0px 0px -10% 0px" },
  );
  observerRef.disconnect = () => observer.disconnect();
  observer.observe(element);
  return () => {
    cancelPending();
    observer?.disconnect();
  };
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

function numberAttr(value: string | undefined): number | undefined {
  if (value === undefined || value.trim() === "") return undefined;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : undefined;
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
export * from "./canvas.js";
export * from "./patch.js";
export * from "./worker.js";
export * from "./doctor.js";
