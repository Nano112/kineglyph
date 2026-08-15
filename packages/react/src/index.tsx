import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import type {
  FigureSource,
  MachineEvent,
  MachineState,
  MachineStep,
  ResolvedFrame,
  ResolvedNode,
  ResolvedScene,
  ThemeTokens,
} from "@kineglyph/core";
import {
  mountKineglyph,
  type FigureLayoutRequest,
  type InspectTarget,
  type KineglyphController,
} from "@kineglyph/web";

export type { InspectTarget, KineglyphController } from "@kineglyph/web";

export interface KineglyphFigureHandle {
  play(): void;
  pause(): void;
  restart(autoplay?: boolean): void;
  seek(time: number): void;
  send(event: string | MachineEvent): MachineStep | undefined;
  reset(): void;
  setTheme(theme: ThemeTokens): void;
  inspect(id?: string | null): InspectTarget | undefined;
  /** The live controller, or undefined before mount / after unmount. */
  readonly controller: KineglyphController | undefined;
}

export interface KineglyphFigureProps {
  /** A general scene definition or a legacy pipeline definition. */
  readonly figure: FigureSource;
  readonly theme: ThemeTokens;
  readonly className?: string;
  readonly controls?: boolean;
  readonly readout?: boolean;
  readonly machineControls?: boolean;
  readonly autoplay?: boolean;
  readonly layout?: FigureLayoutRequest;
  /** Fixed width; when omitted the figure follows its container. */
  readonly width?: number;
  readonly reducedMotion?: boolean;
  readonly idPrefix?: string;
  readonly initialState?: MachineState;
  readonly onInspectChange?: (node: ResolvedNode | undefined, target?: InspectTarget) => void;
  readonly onFrame?: (frame: ResolvedFrame) => void;
  readonly onPlaybackChange?: (playing: boolean) => void;
  readonly onStateChange?: (step: MachineStep, scene: ResolvedScene) => void;
}

/**
 * Responsive, inspectable React host for a Kineglyph figure.
 *
 * The component owns only the mount lifecycle; playback, inspection, state-machine controls,
 * keyboard behaviour, and reduced motion come from the framework-neutral `@kineglyph/web`
 * runtime, so React and vanilla embeds behave identically.
 */
export const KineglyphFigure = forwardRef<KineglyphFigureHandle, KineglyphFigureProps>(
  function KineglyphFigure(
    {
      figure,
      theme,
      className,
      controls = true,
      readout = true,
      machineControls = true,
      autoplay = true,
      layout,
      width,
      reducedMotion,
      idPrefix,
      initialState,
      onInspectChange,
      onFrame,
      onPlaybackChange,
      onStateChange,
    },
    forwardedRef,
  ) {
    const hostRef = useRef<HTMLDivElement>(null);
    const controllerRef = useRef<KineglyphController | undefined>(undefined);
    const callbacksRef = useRef({ onInspectChange, onFrame, onPlaybackChange, onStateChange });
    callbacksRef.current = { onInspectChange, onFrame, onPlaybackChange, onStateChange };

    useEffect(() => {
      const host = hostRef.current;
      if (host === null) return;
      const controller = mountKineglyph(host, {
        scene: figure,
        theme,
        controls,
        readout,
        machineControls,
        autoplay,
        ...(layout === undefined ? {} : { layout }),
        ...(width === undefined ? {} : { width }),
        ...(reducedMotion === undefined ? {} : { reducedMotion }),
        ...(idPrefix === undefined ? {} : { idPrefix }),
        ...(initialState === undefined ? {} : { initialState }),
        ...(className === undefined ? {} : { className }),
        onInspect: (target) => callbacksRef.current.onInspectChange?.(target?.node, target),
        onFrame: (frame) => callbacksRef.current.onFrame?.(frame),
        onPlaybackChange: (playing) => callbacksRef.current.onPlaybackChange?.(playing),
        onStateChange: (step, scene) => callbacksRef.current.onStateChange?.(step, scene),
      });
      controllerRef.current = controller;
      return () => {
        controller.destroy();
        if (controllerRef.current === controller) controllerRef.current = undefined;
      };
      // Theme and reduced-motion changes are applied imperatively below to avoid a remount.
    }, [
      figure,
      controls,
      readout,
      machineControls,
      autoplay,
      layout,
      width,
      idPrefix,
      initialState,
      className,
    ]);

    useEffect(() => {
      controllerRef.current?.setTheme(theme);
    }, [theme]);

    useEffect(() => {
      if (reducedMotion !== undefined) controllerRef.current?.setReducedMotion(reducedMotion);
    }, [reducedMotion]);

    useImperativeHandle(
      forwardedRef,
      () => ({
        play: () => controllerRef.current?.play(),
        pause: () => controllerRef.current?.pause(),
        restart: (nextAutoplay?: boolean) => controllerRef.current?.restart(nextAutoplay),
        seek: (nextTime) => controllerRef.current?.seek(nextTime),
        send: (event) => controllerRef.current?.send(event),
        reset: () => controllerRef.current?.reset(),
        setTheme: (nextTheme) => controllerRef.current?.setTheme(nextTheme),
        inspect: (id) => controllerRef.current?.inspect(id),
        get controller() {
          return controllerRef.current;
        },
      }),
      [],
    );

    return <div ref={hostRef} className="kg-figure-react" data-kineglyph-react="true" />;
  },
);
