import { createScope, createTimer, type Scope, type Timer } from "animejs";
import {
  Timeline,
  seekTimeline,
  type EasingName,
  type ResolvedFrame,
  type ResolvedScene,
  type SegmentSnapshot,
} from "@kineglyph/core";

export type AnimationCue = NodeRevealCue | EdgeRevealCue | NodeEmphasisCue;

export interface NodeRevealCue {
  readonly kind: "node-reveal";
  readonly targetId: string;
  readonly offset?: number;
  readonly fromScale?: number;
}

export interface EdgeRevealCue {
  readonly kind: "edge-reveal";
  readonly targetId: string;
}

export interface NodeEmphasisCue {
  readonly kind: "node-emphasis";
  readonly targetId: string;
  readonly strength?: number;
}

export interface AnimationStep {
  readonly id: string;
  readonly start: number;
  readonly duration: number;
  readonly easing?: EasingName;
  readonly cue: AnimationCue;
}

export interface AnimationProgramOptions {
  readonly duration?: number;
  readonly steps: readonly AnimationStep[];
}

export type AnimationProgram = Timeline<AnimationCue>;

export interface CueState {
  readonly id: string;
  readonly cue: AnimationCue;
  readonly progress: number;
  readonly phase: SegmentSnapshot<AnimationCue>["phase"];
}

/** Converts authored steps to the core's deterministic random-access timeline. */
export function createAnimationProgram(options: AnimationProgramOptions): AnimationProgram {
  return new Timeline({
    ...(options.duration === undefined ? {} : { duration: options.duration }),
    segments: options.steps.map((step) => ({
      id: step.id,
      start: step.start,
      duration: step.duration,
      ...(step.easing === undefined ? {} : { easing: step.easing }),
      data: step.cue,
    })),
  });
}

/** Pure cue evaluation used by the DOM runtime and future frame exporters. */
export function cueStatesAt(program: AnimationProgram, time: number): readonly CueState[] {
  return program.seek(time).segments.flatMap((segment) =>
    segment.data === undefined
      ? []
      : [
          {
            id: segment.id,
            cue: segment.data,
            progress: segment.easedProgress,
            phase: segment.phase,
          },
        ],
  );
}

export interface KineglyphAnimatorOptions {
  readonly root: HTMLElement | SVGElement;
  readonly program: AnimationProgram;
  readonly reducedMotion?: boolean;
  readonly onTimeChange?: (time: number, progress: number) => void;
  readonly onPlaybackChange?: (playing: boolean) => void;
}

/**
 * Scoped Anime.js v4 driver for one Kineglyph root.
 *
 * Anime owns the clock and lifecycle; the pure core timeline remains authoritative so direct
 * seeks, animation playback, and later raster-frame export resolve to the same visual state.
 */
export class KineglyphAnimator {
  readonly duration: number;
  readonly #root: HTMLElement | SVGElement;
  readonly #program: AnimationProgram;
  readonly #scope: Scope;
  readonly #onTimeChange: KineglyphAnimatorOptions["onTimeChange"];
  readonly #onPlaybackChange: KineglyphAnimatorOptions["onPlaybackChange"];
  #timer: Timer | undefined;
  #reducedMotion: boolean;
  #holdTerminal = false;
  #disposed = false;

  constructor(options: KineglyphAnimatorOptions) {
    this.#root = options.root;
    this.#program = options.program;
    this.#reducedMotion = options.reducedMotion ?? false;
    this.#onTimeChange = options.onTimeChange;
    this.#onPlaybackChange = options.onPlaybackChange;
    this.duration = options.program.duration;
    this.#scope = createScope({ root: options.root });
    this.#scope.add(() => {
      const timer = createTimer({
        autoplay: false,
        duration: Math.max(1, this.duration),
        onUpdate: (currentTimer) => {
          if (this.#disposed) return;
          this.#apply(this.#holdTerminal ? this.duration : currentTimer.currentTime);
        },
        onComplete: () => {
          if (this.#disposed) return;
          // Anime emits a reset update after completion. Hold the terminal frame until replay.
          this.#holdTerminal = true;
          this.#apply(this.duration);
          this.#onPlaybackChange?.(false);
        },
        onPause: () => {
          if (!this.#disposed) this.#onPlaybackChange?.(false);
        },
      });
      this.#timer = timer;
      return () => timer.cancel();
    });
    this.#apply(this.#reducedMotion ? this.duration : 0);
  }

  get time(): number {
    return this.#reducedMotion ? this.duration : (this.#timer?.currentTime ?? 0);
  }

  get playing(): boolean {
    return this.#timer !== undefined && !this.#timer.paused && !this.#timer.completed;
  }

  play(): void {
    this.#assertLive();
    if (this.#reducedMotion) {
      this.#apply(this.duration);
      return;
    }
    if (this.#timer?.completed || this.#holdTerminal) {
      this.#holdTerminal = false;
      this.#timer?.restart();
    } else this.#timer?.play();
    this.#onPlaybackChange?.(true);
  }

  pause(): void {
    this.#assertLive();
    this.#timer?.pause();
    this.#onPlaybackChange?.(false);
  }

  restart(autoplay = true): void {
    this.#assertLive();
    if (this.#reducedMotion) {
      this.#apply(this.duration);
      return;
    }
    this.#holdTerminal = false;
    this.#timer?.pause().seek(0);
    this.#apply(0);
    if (autoplay) this.play();
  }

  seek(time: number): void {
    this.#assertLive();
    const next = this.#reducedMotion ? this.duration : clamp(time, 0, this.duration);
    this.#holdTerminal = next >= this.duration;
    if (this.#holdTerminal) this.#timer?.pause();
    this.#timer?.seek(next, true);
    this.#apply(next);
  }

  setReducedMotion(reduced: boolean): void {
    this.#assertLive();
    this.#reducedMotion = reduced;
    if (reduced) {
      this.#holdTerminal = true;
      this.#timer?.pause();
      this.#apply(this.duration);
      this.#onPlaybackChange?.(false);
    } else {
      this.#holdTerminal = false;
    }
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    const timer = this.#timer;
    timer?.cancel();
    this.#scope.revert();
    this.#timer = undefined;
  }

  #apply(time: number): void {
    if (this.#disposed) return;
    const states = cueStatesAt(this.#program, time);
    for (const state of states) this.#applyCue(state);
    const resolved = this.#program.seek(time);
    this.#root.style.setProperty("--kg-time", String(resolved.time));
    this.#root.style.setProperty("--kg-timeline-progress", String(resolved.progress));
    this.#onTimeChange?.(resolved.time, resolved.progress);
  }

  #applyCue(state: CueState): void {
    const cue = state.cue;
    if (cue.kind === "edge-reveal") {
      for (const element of this.#find(`[data-edge-id="${cssEscape(cue.targetId)}"]`)) {
        if (!(element instanceof SVGPathElement)) continue;
        element.setAttribute("pathLength", "1");
        element.style.strokeDasharray = "1";
        element.style.strokeDashoffset = String(1 - state.progress);
        element.style.opacity = String(state.progress === 0 ? 0 : 1);
      }
      return;
    }

    for (const element of this.#find(`[data-node-id="${cssEscape(cue.targetId)}"]`)) {
      if (!(element instanceof SVGElement)) continue;
      element.style.transformBox = "fill-box";
      element.style.transformOrigin = "center";
      if (cue.kind === "node-reveal") {
        const offset = cue.offset ?? 14;
        const scale = (cue.fromScale ?? 0.96) + (1 - (cue.fromScale ?? 0.96)) * state.progress;
        element.style.opacity = String(state.progress);
        element.style.transform = `translateY(${round(offset * (1 - state.progress))}px) scale(${round(scale)})`;
      } else {
        const strength = cue.strength ?? 0.035;
        const pulse = Math.sin(state.progress * Math.PI);
        element.style.transform = `scale(${round(1 + pulse * strength)})`;
        element.style.filter = `brightness(${round(1 + pulse * 0.12)})`;
      }
    }
  }

  #find(selector: string): readonly Element[] {
    return Array.from(this.#root.querySelectorAll(selector));
  }

  #assertLive(): void {
    if (this.#disposed) throw new Error("KineglyphAnimator has been disposed");
  }
}

export interface KineglyphSceneAnimatorOptions {
  readonly root: HTMLElement | SVGElement;
  readonly scene: ResolvedScene;
  readonly reducedMotion?: boolean;
  readonly onFrame?: (frame: ResolvedFrame) => void;
  readonly onPlaybackChange?: (playing: boolean) => void;
}

/** Anime.js clock compiled directly from a resolved scene's seekable core timeline. */
export class KineglyphSceneAnimator {
  readonly duration: number;
  readonly #root: HTMLElement | SVGElement;
  readonly #scene: ResolvedScene;
  readonly #scope: Scope;
  readonly #onFrame: KineglyphSceneAnimatorOptions["onFrame"];
  readonly #onPlaybackChange: KineglyphSceneAnimatorOptions["onPlaybackChange"];
  #timer: Timer | undefined;
  #reducedMotion: boolean;
  #holdTerminal = false;
  #disposed = false;

  constructor(options: KineglyphSceneAnimatorOptions) {
    this.#root = options.root;
    this.#scene = options.scene;
    this.#reducedMotion = options.reducedMotion ?? false;
    this.#onFrame = options.onFrame;
    this.#onPlaybackChange = options.onPlaybackChange;
    this.duration = options.scene.timeline?.duration ?? 0;
    this.#scope = createScope({ root: options.root });
    this.#scope.add(() => {
      const timer = createTimer({
        autoplay: false,
        duration: Math.max(1, this.duration),
        onUpdate: (currentTimer) => {
          if (this.#disposed) return;
          this.#apply(this.#holdTerminal ? this.duration : currentTimer.currentTime);
        },
        onComplete: () => {
          if (this.#disposed) return;
          // Completion is a persistent visual state, not Anime's reset iteration state.
          this.#holdTerminal = true;
          this.#apply(this.duration);
          this.#onPlaybackChange?.(false);
        },
        onPause: () => {
          if (!this.#disposed) this.#onPlaybackChange?.(false);
        },
      });
      this.#timer = timer;
      return () => timer.cancel();
    });
    this.#apply(this.#reducedMotion ? this.duration : 0);
  }

  get time(): number {
    return this.#reducedMotion ? this.duration : (this.#timer?.currentTime ?? 0);
  }

  get playing(): boolean {
    return this.#timer !== undefined && !this.#timer.paused && !this.#timer.completed;
  }

  play(): void {
    this.#assertLive();
    if (this.#reducedMotion || this.duration === 0) {
      this.#apply(this.duration);
      return;
    }
    if (this.#timer?.completed || this.#holdTerminal) {
      this.#holdTerminal = false;
      this.#timer?.restart();
    } else this.#timer?.play();
    this.#onPlaybackChange?.(true);
  }

  pause(): void {
    this.#assertLive();
    this.#timer?.pause();
    this.#onPlaybackChange?.(false);
  }

  restart(autoplay = true): void {
    this.#assertLive();
    if (this.#reducedMotion) {
      this.#apply(this.duration);
      return;
    }
    this.#holdTerminal = false;
    this.#timer?.pause().seek(0, true);
    this.#apply(0);
    if (autoplay) this.play();
  }

  seek(time: number): void {
    this.#assertLive();
    const next = this.#reducedMotion ? this.duration : clamp(time, 0, this.duration);
    this.#holdTerminal = next >= this.duration;
    if (this.#holdTerminal) this.#timer?.pause();
    this.#timer?.seek(next, true);
    this.#apply(next);
  }

  setReducedMotion(reduced: boolean): void {
    this.#assertLive();
    this.#reducedMotion = reduced;
    if (reduced) {
      this.#holdTerminal = true;
      this.#timer?.pause();
      this.#onPlaybackChange?.(false);
    } else {
      this.#holdTerminal = false;
    }
    this.#apply(reduced ? this.duration : this.time);
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    const timer = this.#timer;
    timer?.cancel();
    this.#scope.revert();
    this.#timer = undefined;
  }

  #apply(time: number): void {
    if (this.#disposed) return;
    const frame = seekTimeline(this.#scene, time);
    for (const node of frame.nodes) {
      for (const element of this.#find(`[data-node-id="${cssEscape(node.id)}"]`)) {
        if (!(element instanceof SVGElement)) continue;
        element.style.opacity = String(node.state.opacity);
        element.style.transformBox = "fill-box";
        element.style.transformOrigin = "center";
        element.style.transform = `translate(${round(node.state.translateX)}px, ${round(node.state.translateY)}px) scale(${round(node.state.scale)})`;
        element.style.setProperty("--kg-progress", String(node.state.progress));
      }
    }
    for (const edge of frame.edges) {
      for (const element of this.#find(`[data-edge-id="${cssEscape(edge.id)}"]`)) {
        if (!(element instanceof SVGPathElement)) continue;
        element.setAttribute("pathLength", "1");
        element.style.opacity = String(edge.state.opacity);
        element.style.strokeDasharray = "1";
        element.style.strokeDashoffset = String(1 - edge.state.progress);
      }
    }
    this.#root.style.setProperty("--kg-time", String(frame.time));
    this.#root.style.setProperty("--kg-timeline-progress", String(frame.progress));
    this.#onFrame?.(frame);
  }

  #find(selector: string): readonly Element[] {
    return Array.from(this.#root.querySelectorAll(selector));
  }

  #assertLive(): void {
    if (this.#disposed) throw new Error("KineglyphSceneAnimator has been disposed");
  }
}

function clamp(value: number, minimum: number, maximum: number): number {
  if (!Number.isFinite(value)) return minimum;
  return Math.min(maximum, Math.max(minimum, value));
}

function round(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

function cssEscape(value: string): string {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") return CSS.escape(value);
  return value.replace(/["\\]/g, "\\$&");
}
