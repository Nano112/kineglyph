import {
  forwardRef,
  memo,
  useCallback,
  useEffect,
  useId,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import {
  resolvePipeline,
  seekTimeline,
  type PipelineDefinition,
  type ResolvedNode,
  type ThemeTokens,
} from "@kineglyph/core";
import { KineglyphSceneAnimator } from "@kineglyph/anime";
import { renderSvg } from "@kineglyph/svg";

export interface KineglyphFigureHandle {
  play(): void;
  pause(): void;
  restart(): void;
  seek(time: number): void;
}

export interface KineglyphFigureProps {
  readonly figure: PipelineDefinition;
  readonly theme: ThemeTokens;
  readonly className?: string;
  readonly controls?: boolean;
  readonly autoplay?: boolean;
  readonly wideBreakpoint?: number;
  readonly reducedMotion?: boolean;
  readonly onInspectChange?: (node: ResolvedNode | undefined) => void;
}

/** Responsive, inspectable React host for a semantic Kineglyph pipeline. */
export const KineglyphFigure = forwardRef<KineglyphFigureHandle, KineglyphFigureProps>(
  function KineglyphFigure(
    {
      figure,
      theme,
      className,
      controls = true,
      autoplay = true,
      wideBreakpoint = 820,
      reducedMotion: reducedMotionOverride,
      onInspectChange,
    },
    forwardedRef,
  ) {
    const hostRef = useRef<HTMLDivElement>(null);
    const stageRef = useRef<HTMLDivElement>(null);
    const animatorRef = useRef<KineglyphSceneAnimator | undefined>(undefined);
    const generatedId = useId().replace(/[^a-zA-Z0-9_-]/g, "");
    const [width, setWidth] = useState(960);
    const [time, setTime] = useState(0);
    const [playing, setPlaying] = useState(false);
    const [inspectedId, setInspectedId] = useState<string>();
    const systemReducedMotion = usePrefersReducedMotion();
    const reducedMotion = reducedMotionOverride ?? systemReducedMotion;

    useEffect(() => {
      const host = hostRef.current;
      if (host === null) return;
      const update = (nextWidth: number): void => setWidth(Math.max(280, Math.round(nextWidth)));
      update(host.getBoundingClientRect().width || 960);
      const observer = new ResizeObserver((entries) => {
        const entry = entries[0];
        if (entry !== undefined) update(entry.contentRect.width);
      });
      observer.observe(host);
      return () => observer.disconnect();
    }, []);

    const resolved = useMemo(
      () =>
        resolvePipeline(figure, {
          width,
          layout: width >= wideBreakpoint ? "wide" : "stacked",
          theme,
          padding: width < 520 ? 16 : 24,
          gap: 24,
          stackedGap: 20,
        }),
      [figure, theme, width, wideBreakpoint],
    );
    const duration = resolved.timeline?.duration ?? 0;
    const initialFrame = useMemo(
      () => seekTimeline(resolved, reducedMotion ? duration : 0),
      [duration, reducedMotion, resolved],
    );
    const markup = useMemo(
      () =>
        renderSvg(initialFrame, {
          idPrefix: `kineglyph-${generatedId}`,
          className: "kg-figure__svg",
          role: "group",
        }),
      [generatedId, initialFrame],
    );

    const updateInspected = useCallback(
      (id: string | undefined) => {
        setInspectedId(id);
        onInspectChange?.(resolved.nodes.find((node) => node.id === id));
      },
      [onInspectChange, resolved.nodes],
    );

    useEffect(() => {
      const stage = stageRef.current;
      if (stage === null) return;
      const animator = new KineglyphSceneAnimator({
        root: stage,
        scene: resolved,
        reducedMotion,
        onFrame: (frame) => setTime(frame.time),
        onPlaybackChange: setPlaying,
      });
      animatorRef.current = animator;
      setTime(reducedMotion ? duration : 0);
      setPlaying(false);
      if (autoplay && !reducedMotion) animator.play();
      return () => {
        animator.dispose();
        if (animatorRef.current === animator) animatorRef.current = undefined;
      };
    }, [autoplay, duration, markup, reducedMotion, resolved]);

    useEffect(() => {
      const stage = stageRef.current;
      if (stage === null) return;
      const nodeFromEvent = (event: Event): Element | null =>
        event.target instanceof Element ? event.target.closest("[data-node-id]") : null;
      const inspect = (event: Event): void => {
        const id = nodeFromEvent(event)?.getAttribute("data-node-id") ?? undefined;
        if (id !== undefined) updateInspected(id);
      };
      const clear = (event: Event): void => {
        const relatedTarget =
          event instanceof FocusEvent || event instanceof MouseEvent ? event.relatedTarget : null;
        const currentNode = nodeFromEvent(event);
        if (
          relatedTarget instanceof Element &&
          relatedTarget.closest("[data-node-id]") === currentNode
        )
          return;
        updateInspected(undefined);
      };
      stage.addEventListener("pointerover", inspect);
      stage.addEventListener("pointerout", clear);
      stage.addEventListener("focusin", inspect);
      stage.addEventListener("focusout", clear);
      return () => {
        stage.removeEventListener("pointerover", inspect);
        stage.removeEventListener("pointerout", clear);
        stage.removeEventListener("focusin", inspect);
        stage.removeEventListener("focusout", clear);
      };
    }, [markup, updateInspected]);

    useEffect(() => {
      const stage = stageRef.current;
      if (stage === null) return;
      for (const node of stage.querySelectorAll("[data-node-id]")) {
        const selected = node.getAttribute("data-node-id") === inspectedId;
        if (selected) node.setAttribute("data-inspected", "true");
        else node.removeAttribute("data-inspected");
      }
    }, [inspectedId, markup]);

    useImperativeHandle(
      forwardedRef,
      () => ({
        play: () => animatorRef.current?.play(),
        pause: () => animatorRef.current?.pause(),
        restart: () => animatorRef.current?.restart(),
        seek: (nextTime) => animatorRef.current?.seek(nextTime),
      }),
      [],
    );

    const inspected = resolved.nodes.find((node) => node.id === inspectedId);
    const togglePlayback = (): void => {
      if (playing) animatorRef.current?.pause();
      else animatorRef.current?.play();
    };
    const onControlKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>): void => {
      if (event.key !== " ") return;
      event.preventDefault();
      togglePlayback();
    };
    const style = {
      "--kg-shell-background": theme.colors.canvas,
      "--kg-shell-surface": theme.colors.surfaceRaised,
      "--kg-shell-text": theme.colors.text,
      "--kg-shell-muted": theme.colors.textMuted,
      "--kg-shell-border": theme.colors.border,
      "--kg-shell-accent": theme.colors.accent,
      "--kg-shell-radius": `${theme.radii.lg}px`,
      "--kg-shell-font": theme.typography.body.family,
      "--kg-scene-aspect": String(resolved.width / resolved.height),
    } as CSSProperties;

    return (
      <section
        ref={hostRef}
        className={["kg-figure", className].filter(Boolean).join(" ")}
        style={style}
        aria-label={`${resolved.title} interactive figure`}
      >
        <style>{FIGURE_STYLES}</style>
        <StaticSvgStage
          ref={stageRef}
          aspectRatio={resolved.width / resolved.height}
          markup={markup}
        />

        <div className="kg-figure__readout" aria-live="polite">
          <span className="kg-figure__eyebrow">
            {inspected === undefined
              ? "Inspect a stage"
              : `Stage ${inspected.metadata.order ?? ""}`}
          </span>
          <strong>{inspected?.label ?? resolved.title}</strong>
          <span>{inspected?.description ?? resolved.description}</span>
        </div>

        {controls ? (
          <div className="kg-figure__controls" onKeyDown={onControlKeyDown}>
            <button
              type="button"
              onClick={togglePlayback}
              disabled={reducedMotion || duration === 0}
            >
              {playing ? "Pause" : "Play"}
            </button>
            <button
              type="button"
              onClick={() => animatorRef.current?.restart(false)}
              disabled={reducedMotion || duration === 0}
            >
              Restart
            </button>
            <label className="kg-figure__scrubber">
              <span>Timeline</span>
              <input
                type="range"
                min={0}
                max={Math.max(1, duration)}
                step={1}
                value={reducedMotion ? duration : time}
                disabled={reducedMotion || duration === 0}
                aria-valuetext={`${Math.round(time)} milliseconds`}
                onChange={(event) => animatorRef.current?.seek(Number(event.currentTarget.value))}
              />
            </label>
            <output>{reducedMotion ? "Reduced motion" : `${(time / 1000).toFixed(1)}s`}</output>
          </div>
        ) : null}
      </section>
    );
  },
);

interface StaticSvgStageProps {
  readonly aspectRatio: number;
  readonly markup: string;
}

/** Keep React control-state renders from replacing the imperative animation DOM. */
const StaticSvgStage = memo(
  forwardRef<HTMLDivElement, StaticSvgStageProps>(function StaticSvgStage(
    { aspectRatio, markup },
    ref,
  ) {
    const html = useMemo(() => ({ __html: markup }), [markup]);
    return (
      <div
        ref={ref}
        className="kg-figure__stage"
        style={{ aspectRatio }}
        dangerouslySetInnerHTML={html}
      />
    );
  }),
);

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() =>
    typeof window === "undefined"
      ? false
      : window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = (): void => setReduced(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  return reduced;
}

const FIGURE_STYLES = `
.kg-figure{box-sizing:border-box;overflow:hidden;border:1px solid var(--kg-shell-border);border-radius:var(--kg-shell-radius);background:var(--kg-shell-background);color:var(--kg-shell-text);font-family:var(--kg-shell-font);box-shadow:0 24px 80px color-mix(in srgb,var(--kg-shell-background),transparent 25%)}
.kg-figure *{box-sizing:border-box}
.kg-figure__stage{width:100%;min-height:240px;background:var(--kg-shell-background);overflow:hidden}
.kg-figure__stage svg{display:block;width:100%;height:100%;overflow:visible}
.kg-figure__stage [data-node-id]{transition:filter 160ms ease}
.kg-figure__stage [data-node-id]:hover .kg-node-shape,.kg-figure__stage [data-node-id]:focus .kg-node-shape,.kg-figure__stage [data-inspected=true] .kg-node-shape{stroke:var(--kg-shell-accent);filter:drop-shadow(0 0 10px color-mix(in srgb,var(--kg-shell-accent),transparent 62%))}
.kg-figure__readout{display:grid;grid-template-columns:minmax(110px,.4fr) minmax(140px,.7fr) minmax(220px,1.5fr);gap:16px;align-items:baseline;min-height:72px;padding:18px 22px;border-top:1px solid var(--kg-shell-border);background:var(--kg-shell-surface)}
.kg-figure__readout strong{font-size:15px}.kg-figure__readout>span:last-child{color:var(--kg-shell-muted);font-size:13px;line-height:1.45}
.kg-figure__eyebrow{text-transform:uppercase;letter-spacing:.13em;color:var(--kg-shell-accent);font-size:10px;font-weight:700}
.kg-figure__controls{display:flex;align-items:center;gap:10px;padding:12px 16px;border-top:1px solid var(--kg-shell-border);background:color-mix(in srgb,var(--kg-shell-surface),var(--kg-shell-background) 28%)}
.kg-figure__controls button{appearance:none;border:1px solid var(--kg-shell-border);border-radius:7px;padding:8px 12px;background:var(--kg-shell-surface);color:var(--kg-shell-text);font:600 12px/1 var(--kg-shell-font);cursor:pointer}
.kg-figure__controls button:hover:not(:disabled),.kg-figure__controls button:focus-visible{border-color:var(--kg-shell-accent);outline:none}.kg-figure__controls button:disabled{opacity:.42;cursor:not-allowed}
.kg-figure__scrubber{display:flex;align-items:center;gap:10px;flex:1;min-width:160px;color:var(--kg-shell-muted);font-size:11px;text-transform:uppercase;letter-spacing:.08em}.kg-figure__scrubber input{width:100%;accent-color:var(--kg-shell-accent)}
.kg-figure__controls output{min-width:48px;text-align:right;color:var(--kg-shell-muted);font-variant-numeric:tabular-nums;font-size:12px}
@media(max-width:620px){.kg-figure__readout{grid-template-columns:1fr;gap:5px;min-height:112px}.kg-figure__controls{flex-wrap:wrap}.kg-figure__scrubber{order:3;flex-basis:100%}}
@media(prefers-reduced-motion:reduce){.kg-figure__stage [data-node-id]{transition:none}}
`;
