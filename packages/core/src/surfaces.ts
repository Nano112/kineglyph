/** Shared live-surface contracts and adapters; no browser runtime dependency. */
import type {
  MachineEvent,
  MachineState,
  MachineStep,
  ResolvedFrame,
  ResolvedNode,
  ResolvedScene,
  ThemeTokens,
  VariableValue,
} from "./index.js";

export interface LiveSurfaceContext {
  /** HTML layer aligned to the live image node. Mount a canvas, model-viewer, iframe, or app here. */
  readonly element: HTMLDivElement;
  readonly node: ResolvedNode;
  readonly scene: ResolvedScene;
  readonly theme: ThemeTokens;
  readonly machineState: MachineState | undefined;
  readonly signals: Readonly<Record<string, VariableValue>>;
  readonly time: number;
  readonly playing: boolean;
  readonly signal: AbortSignal;
  readonly send: (event: string | MachineEvent) => MachineStep | undefined;
  /**
   * Ask the figure to re-apply its current frame — for a surface that finished async work (a
   * model reload) and whose frame signals should be recomputed now rather than at the next tick.
   */
  readonly refresh?: () => void;
  /** Restart the figure's timeline from the start — a surface rebuilt by a viewer's control. */
  readonly replay?: () => void;
  /**
   * Subscribe to the figure's events (`inspect`, `frame`, `data`, …) for the surface's lifetime;
   * returns the unsubscribe. A surface can react to a note being clicked, for instance.
   */
  readonly on?: (event: string, handler: (payload: unknown) => void) => () => void;
}

export interface LiveSurfaceUpdate {
  readonly frame: ResolvedFrame;
  readonly node: ResolvedNode;
  readonly machineState: MachineState | undefined;
  readonly signals: Readonly<Record<string, VariableValue>>;
  readonly time: number;
}

/** What a surface hands back for an export frame: a canvas-like source or a PNG data URL. */
export type SurfaceCapture = CanvasImageSource | string | undefined;

export interface LiveSurfaceHandle {
  /** Leave the static image visible and discard the HTML layer. */
  readonly mounted?: boolean;
  /** Delay the handoff from the static image until the live renderer is ready. */
  readonly ready?: Promise<void>;
  readonly update?: (next: LiveSurfaceUpdate) => void | Promise<void>;
  /** Playback changes are delivered even when no new timeline frame is emitted. */
  readonly playback?: (playing: boolean) => void | Promise<void>;
  /**
   * Render `time` and return it for compositing into an export. Optional: surfaces without it
   * keep their static fallback image in exports.
   */
  readonly capture?: (time: number) => SurfaceCapture | Promise<SurfaceCapture>;
  readonly destroy?: () => void;
}

export type LiveSurfaceRenderer = (
  context: LiveSurfaceContext,
) => void | (() => void) | LiveSurfaceHandle | Promise<void | (() => void) | LiveSurfaceHandle>;

/**
 * Application-owned adapter for a renderer whose operation or media frame follows Kineglyph time.
 * Async frame work is serialized and coalesced: while one frame renders, only the newest pending
 * frame is kept, so an expensive renderer can never paint an older result over a newer one.
 */
export interface FrameSurfaceAdapter<Target> {
  readonly mount: (context: LiveSurfaceContext) => Target | Promise<Target>;
  readonly ready?: (target: Target, context: LiveSurfaceContext) => void | Promise<void>;
  readonly frame: (
    target: Target,
    update: LiveSurfaceUpdate,
    signal: AbortSignal,
  ) => void | Promise<void>;
  readonly playback?: (
    target: Target,
    playing: boolean,
    signal: AbortSignal,
  ) => void | Promise<void>;
  readonly capture?: (target: Target, time: number) => SurfaceCapture | Promise<SurfaceCapture>;
  readonly destroy?: (target: Target) => void;
}

/** Turn an application frame adapter into a managed Kineglyph live-surface renderer. */
export function adaptLiveSurface<Target>(
  adapter: FrameSurfaceAdapter<Target>,
): LiveSurfaceRenderer {
  return async (context) => {
    const target = await adapter.mount(context);
    let pending: LiveSurfaceUpdate | undefined;
    let draining = false;
    let failed = false;
    const drain = async (): Promise<void> => {
      if (draining || failed) return;
      draining = true;
      try {
        while (pending !== undefined && !context.signal.aborted) {
          const next = pending;
          pending = undefined;
          await adapter.frame(target, next, context.signal);
        }
      } catch (error) {
        failed = true;
        throw error;
      } finally {
        draining = false;
      }
    };
    return {
      ...(adapter.ready === undefined
        ? {}
        : { ready: Promise.resolve(adapter.ready(target, context)) }),
      update(next) {
        pending = next;
        return drain();
      },
      ...(adapter.playback === undefined
        ? {}
        : {
            playback: (playing: boolean) => adapter.playback?.(target, playing, context.signal),
          }),
      ...(adapter.capture === undefined
        ? {}
        : { capture: (time: number) => adapter.capture?.(target, time) }),
      destroy() {
        pending = undefined;
        adapter.destroy?.(target);
      },
    };
  };
}

export interface BoundSignalSurfaceUpdate {
  readonly initial: boolean;
  /** Signal names whose values changed since the last applied update. */
  readonly changed: readonly string[];
  readonly node: ResolvedNode;
  readonly scene: ResolvedScene;
  readonly machineState: MachineState | undefined;
  readonly signals: Readonly<Record<string, VariableValue>>;
  readonly time: number;
}

export interface BoundSignalSurfaceAdapter<Target> {
  /** Expensive runtimes belong here: the target survives signal updates and responsive reflows. */
  readonly mount: (context: LiveSurfaceContext) => Target | Promise<Target>;
  /** Limit signal-triggered work to these names. Omit to observe every signal. */
  readonly watch?: readonly string[];
  /** Also apply timeline-only updates when no watched signal changed. Defaults to false. */
  readonly includeTime?: boolean;
  readonly apply: (
    target: Target,
    update: BoundSignalSurfaceUpdate,
    signal: AbortSignal,
  ) => void | Promise<void>;
  readonly playback?: (
    target: Target,
    playing: boolean,
    signal: AbortSignal,
  ) => void | Promise<void>;
  readonly capture?: (target: Target, time: number) => SurfaceCapture | Promise<SurfaceCapture>;
  readonly destroy?: (target: Target) => void;
}

interface BoundSignalTarget<Target> {
  readonly target: Target;
  previous: Readonly<Record<string, VariableValue>>;
}

function changedSignals(
  previous: Readonly<Record<string, VariableValue>>,
  next: Readonly<Record<string, VariableValue>>,
): readonly string[] {
  return [...new Set([...Object.keys(previous), ...Object.keys(next)])]
    .filter((name) => !Object.is(previous[name], next[name]))
    .sort();
}

/**
 * Bind Kineglyph signals to an application-owned live runtime without remounting it. The initial
 * signal snapshot is applied before the fallback hands off, later async work is coalesced by
 * {@link adaptLiveSurface}, and `watch` keeps timeline frames from rebuilding expensive assets.
 */
export function bindLiveSurface<Target>(
  adapter: BoundSignalSurfaceAdapter<Target>,
): LiveSurfaceRenderer {
  const watch = adapter.watch === undefined ? undefined : new Set(adapter.watch);
  const relevant = (changed: readonly string[]): boolean =>
    watch === undefined || changed.some((name) => watch.has(name));
  return adaptLiveSurface<BoundSignalTarget<Target>>({
    async mount(context) {
      return { target: await adapter.mount(context), previous: {} };
    },
    async ready(holder, context) {
      const signals = { ...context.signals };
      holder.previous = signals;
      await adapter.apply(
        holder.target,
        {
          initial: true,
          changed: Object.keys(signals).sort(),
          node: context.node,
          scene: context.scene,
          machineState: context.machineState,
          signals,
          time: context.time,
        },
        context.signal,
      );
    },
    async frame(holder, next, signal) {
      const signals = { ...next.signals };
      const changed = changedSignals(holder.previous, signals);
      holder.previous = signals;
      if (!adapter.includeTime && !relevant(changed)) return;
      if (adapter.includeTime || relevant(changed))
        await adapter.apply(
          holder.target,
          {
            initial: false,
            changed,
            node: next.node,
            scene: next.frame,
            machineState: next.machineState,
            signals,
            time: next.time,
          },
          signal,
        );
    },
    ...(adapter.playback === undefined
      ? {}
      : {
          playback: (holder, playing, signal) => adapter.playback?.(holder.target, playing, signal),
        }),
    ...(adapter.capture === undefined
      ? {}
      : { capture: (holder, time) => adapter.capture?.(holder.target, time) }),
    destroy(holder) {
      adapter.destroy?.(holder.target);
    },
  });
}
