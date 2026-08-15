import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { resolveScene, seekTimeline, type ThemeTokens } from "@kineglyph/core";
import { KineglyphFigure, type KineglyphFigureHandle } from "@kineglyph/react";
import {
  catalogue,
  findCatalogueEntry,
  themeCopy,
  themeNames,
  themes,
  type CatalogueEntry,
  type ThemeName,
} from "@kineglyph/scenes";
import { renderSvg } from "@kineglyph/svg";
import { mountKineglyph, startWhenVisible, type KineglyphController } from "@kineglyph/web";

type WidthPreset = "desktop" | "820" | "390";
/** Explicit order: object keys that look like integers would otherwise sort ahead of "desktop". */
const WIDTH_PRESETS: readonly WidthPreset[] = ["desktop", "820", "390"];
const WIDTHS: Record<WidthPreset, number> = { desktop: 1200, "820": 820, "390": 390 };
const WIDTH_LABELS: Record<WidthPreset, string> = {
  desktop: "Desktop",
  "820": "820 px",
  "390": "390 px",
};

type Route =
  | { readonly page: "gallery" }
  | { readonly page: "scene"; readonly slug: string }
  | { readonly page: "embed" };

function parseRoute(hash: string): Route {
  const path = hash.replace(/^#\/?/, "");
  if (path.startsWith("scene/")) return { page: "scene", slug: path.slice("scene/".length) };
  if (path === "embed") return { page: "embed" };
  return { page: "gallery" };
}

function useHashRoute(): Route {
  const [route, setRoute] = useState<Route>(() =>
    parseRoute(typeof window === "undefined" ? "" : window.location.hash),
  );
  useEffect(() => {
    const update = (): void => setRoute(parseRoute(window.location.hash));
    window.addEventListener("hashchange", update);
    return () => window.removeEventListener("hashchange", update);
  }, []);
  return route;
}

export function App() {
  const [themeName, setThemeName] = useState<ThemeName>("nucleation");
  const [preset, setPreset] = useState<WidthPreset>("desktop");
  const route = useHashRoute();
  const theme = themes[themeName];

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [route.page, route.page === "scene" ? route.slug : ""]);

  return (
    <main className={`app app--${themeName}`}>
      <header className="topbar">
        <a className="brand" href="#/" aria-label="Kineglyph gallery">
          <BrandMark />
          <span>Kineglyph</span>
        </a>
        <nav className="nav" aria-label="Playground pages">
          <a href="#/" aria-current={route.page === "gallery" ? "page" : undefined}>
            Gallery
          </a>
          <a href="#/embed" aria-current={route.page === "embed" ? "page" : undefined}>
            Vanilla runtime
          </a>
        </nav>
        <span className="status">
          <i /> illustration suite · phase 2
        </span>
      </header>

      <section className="toolbar" aria-label="Rendering options">
        <div className="theme-switcher" role="group" aria-label="Illustration theme">
          {themeNames.map((name) => (
            <button
              type="button"
              key={name}
              className={name === themeName ? "is-active" : ""}
              aria-pressed={name === themeName}
              onClick={() => setThemeName(name)}
            >
              <i style={{ background: themes[name].colors.accent }} />
              {themeCopy[name].label}
            </button>
          ))}
        </div>
        <div className="theme-switcher" role="group" aria-label="Container width">
          {WIDTH_PRESETS.map((key) => (
            <button
              type="button"
              key={key}
              className={key === preset ? "is-active" : ""}
              aria-pressed={key === preset}
              onClick={() => setPreset(key)}
            >
              {WIDTH_LABELS[key]}
            </button>
          ))}
        </div>
        <span className="toolbar__note">{themeCopy[themeName].note}</span>
      </section>

      {route.page === "gallery" ? (
        <Gallery theme={theme} themeName={themeName} preset={preset} />
      ) : route.page === "scene" ? (
        <SceneDetail slug={route.slug} theme={theme} themeName={themeName} preset={preset} />
      ) : (
        <EmbedDemo theme={theme} themeName={themeName} preset={preset} />
      )}

      <footer>
        <span>Kineglyph / MIT</span>
        <span>Same semantic scene → React · vanilla · SVG · PNG · GIF</span>
      </footer>
    </main>
  );
}

interface PageProps {
  readonly theme: ThemeTokens;
  readonly themeName: ThemeName;
  readonly preset: WidthPreset;
}

function Gallery({ theme, preset }: PageProps) {
  return (
    <section className="gallery" aria-labelledby="gallery-title">
      <div className="gallery__intro">
        <p className="kicker">Illustration catalogue</p>
        <h1 id="gallery-title">
          Diagrams, charts, and interactive labs,
          <br />
          <em>one semantic system.</em>
        </h1>
        <p className="lede">
          Every figure below is authored from semantic primitives or typed data — with reusable
          layout, a seekable timeline, and (where it helps) a deterministic state machine — then
          resolved for the container width you pick above and projected through the selected product
          theme.
        </p>
      </div>
      <ol className="gallery__list">
        {catalogue.map((entry) => (
          <li key={entry.slug} className="gallery__item" id={entry.slug}>
            <div className="gallery__heading">
              <div>
                <p className="kicker">
                  {String(entry.order).padStart(2, "0")} · {entry.source}
                </p>
                <h2>
                  <a href={`#/scene/${entry.slug}`}>{entry.title}</a>
                </h2>
                <p className="gallery__summary">{entry.summary}</p>
              </div>
              <a className="gallery__open" href={`#/scene/${entry.slug}`}>
                Open figure <span>↘</span>
              </a>
            </div>
            <FigureFrame preset={preset}>
              <GalleryFigure entry={entry} theme={theme} />
            </FigureFrame>
            <dl className="gallery__facts">
              <div>
                <dt>Interaction</dt>
                <dd>{entry.interaction}</dd>
              </div>
              <div>
                <dt>Animation</dt>
                <dd>{entry.animation}</dd>
              </div>
            </dl>
          </li>
        ))}
      </ol>
    </section>
  );
}

/** Mounts a figure that starts playing the first time it scrolls into view. */
function GalleryFigure({
  entry,
  theme,
}: {
  readonly entry: CatalogueEntry;
  readonly theme: ThemeTokens;
}) {
  const handle = useRef<KineglyphFigureHandle>(null);
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = host.current;
    if (element === null) return;
    // Low threshold: narrow scenes can be taller than the viewport and never reach a high ratio.
    return startWhenVisible(element, () => handle.current?.restart(true), {
      threshold: 0.06,
      rootMargin: "0px 0px -15% 0px",
      fallbackImmediately: false,
    });
  }, [entry]);
  return (
    <div ref={host}>
      <KineglyphFigure ref={handle} figure={entry.scene} theme={theme} autoplay={false} />
    </div>
  );
}

function FigureFrame({
  preset,
  children,
}: {
  readonly preset: WidthPreset;
  readonly children: ReactNode;
}) {
  return (
    <div className="figure-frame" data-preset={preset}>
      <div className="figure-frame__inner" style={{ maxWidth: WIDTHS[preset] }}>
        {children}
      </div>
    </div>
  );
}

function SceneDetail({ slug, theme, themeName, preset }: PageProps & { readonly slug: string }) {
  const entry = findCatalogueEntry(slug);
  const handle = useRef<KineglyphFigureHandle>(null);
  const [inspected, setInspected] = useState<string>();
  const [machineState, setMachineState] = useState<string>();
  if (entry === undefined) {
    return (
      <section className="detail">
        <p className="kicker">Not found</p>
        <h1>No figure named “{slug}”</h1>
        <p>
          <a href="#/">Back to the gallery</a>
        </p>
      </section>
    );
  }
  return (
    <DetailBody
      key={entry.slug}
      entry={entry}
      theme={theme}
      themeName={themeName}
      preset={preset}
      handle={handle}
      inspected={inspected}
      setInspected={setInspected}
      machineState={machineState}
      setMachineState={setMachineState}
    />
  );
}

function DetailBody({
  entry,
  theme,
  themeName,
  preset,
  handle,
  inspected,
  setInspected,
  machineState,
  setMachineState,
}: PageProps & {
  readonly entry: CatalogueEntry;
  readonly handle: React.RefObject<KineglyphFigureHandle | null>;
  readonly inspected: string | undefined;
  readonly setInspected: (value: string | undefined) => void;
  readonly machineState: string | undefined;
  readonly setMachineState: (value: string | undefined) => void;
}) {
  const downloadSvg = useCallback(() => {
    const resolved = resolveScene(entry.scene, { width: WIDTHS[preset], theme });
    const svg = renderSvg(seekTimeline(resolved, resolved.timeline?.duration ?? 0), {
      idPrefix: `${entry.slug}-export`,
    });
    const blob = new Blob([`<?xml version="1.0" encoding="UTF-8"?>\n${svg}`], {
      type: "image/svg+xml",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${entry.slug}-${themeName}-${WIDTHS[preset]}.svg`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1_000);
  }, [entry, preset, theme, themeName]);

  const events = useMemo(
    () => (entry.scene.controls ?? []).filter((control) => control.event !== undefined),
    [entry],
  );

  return (
    <section className="detail" aria-labelledby="detail-title">
      <div className="detail__header">
        <div>
          <p className="kicker">
            <a href="#/">Gallery</a> / {String(entry.order).padStart(2, "0")} · {entry.source}
          </p>
          <h1 id="detail-title">{entry.title}</h1>
          <p className="lede">{entry.scene.description}</p>
        </div>
        <div className="detail__actions">
          <button type="button" onClick={downloadSvg}>
            Download SVG
          </button>
          <button type="button" onClick={() => handle.current?.restart(true)}>
            Replay
          </button>
        </div>
      </div>
      <FigureFrame preset={preset}>
        <KineglyphFigure
          ref={handle}
          figure={entry.scene}
          theme={theme}
          autoplay
          onInspectChange={(_node, target) => setInspected(target?.label)}
          onStateChange={(step) => setMachineState(step.next.state)}
        />
      </FigureFrame>
      <div className="detail__grid">
        <dl className="detail__facts">
          <div>
            <dt>Concept</dt>
            <dd>{entry.concept}</dd>
          </div>
          <div>
            <dt>Interaction</dt>
            <dd>{entry.interaction}</dd>
          </div>
          <div>
            <dt>Animation</dt>
            <dd>{entry.animation}</dd>
          </div>
          <div>
            <dt>Live readout</dt>
            <dd>
              {inspected === undefined ? "Hover or focus a stage." : `Inspecting: ${inspected}`}
              {machineState === undefined ? "" : ` · machine state: ${machineState}`}
            </dd>
          </div>
        </dl>
        {events.length > 0 ? (
          <div className="detail__events">
            <p className="kicker">Deterministic events</p>
            <p>
              Send any of these from your own code with <code>controller.send(event)</code> — the
              same transition table drives the buttons under the figure.
            </p>
            <ul>
              {events.map((control) => (
                <li key={control.id}>
                  <button type="button" onClick={() => handle.current?.send(control.event ?? "")}>
                    <code>{control.event}</code>
                  </button>
                  <span>{control.description ?? control.label}</span>
                </li>
              ))}
              <li>
                <button type="button" onClick={() => handle.current?.reset()}>
                  <code>reset()</code>
                </button>
                <span>Back to the initial state and the start of the timeline.</span>
              </li>
            </ul>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function EmbedDemo({ theme, themeName, preset }: PageProps) {
  const hostA = useRef<HTMLDivElement>(null);
  const hostB = useRef<HTMLDivElement>(null);
  const controllers = useRef<KineglyphController[]>([]);
  const [log, setLog] = useState<string[]>([]);

  useEffect(() => {
    const a = hostA.current;
    const b = hostB.current;
    if (a === null || b === null) return;
    const first = findCatalogueEntry("smart-simulation") ?? catalogue[0];
    const second = findCatalogueEntry("fast-generation") ?? catalogue[1];
    if (first === undefined || second === undefined) return;
    const created = [
      mountKineglyph(a, { scene: first.scene, theme, autoplay: false }),
      mountKineglyph(b, { scene: second.scene, theme, autoplay: true }),
    ];
    controllers.current = created;
    const unsubscribe = created.map((controller, index) =>
      controller.on("state", ({ step }) =>
        setLog((entries) =>
          [
            `figure ${index + 1}: ${step.transition?.from ?? "?"} → ${step.next.state} (${step.event.type})`,
            ...entries,
          ].slice(0, 6),
        ),
      ),
    );
    return () => {
      for (const stop of unsubscribe) stop();
      for (const controller of created) controller.destroy();
      controllers.current = [];
    };
    // Theme changes are applied imperatively to prove setTheme works without a remount.
  }, [preset]);

  useEffect(() => {
    for (const controller of controllers.current) controller.setTheme(theme);
  }, [theme]);

  return (
    <section className="embed" aria-labelledby="embed-title">
      <div className="detail__header">
        <div>
          <p className="kicker">@kineglyph/web · no React</p>
          <h1 id="embed-title">Two figures, one page, zero collisions</h1>
          <p className="lede">
            These figures are mounted with <code>mountKineglyph(element, options)</code> from the
            framework-neutral runtime — the same call a Blade view or a plain{" "}
            <code>&lt;script type="module"&gt;</code> page uses. Each has its own ids, timeline,
            state machine, and controls; switching the theme above calls{" "}
            <code>controller.setTheme()</code> on both.
          </p>
        </div>
      </div>
      <FigureFrame preset={preset}>
        <div className="embed__stack">
          <div ref={hostA} className="embed__host" />
          <div ref={hostB} className="embed__host" />
        </div>
      </FigureFrame>
      <div className="detail__grid">
        <div className="detail__events">
          <p className="kicker">Transition log</p>
          {log.length === 0 ? (
            <p>Press a control under the first figure to see deterministic transitions.</p>
          ) : (
            <ul>
              {log.map((line, index) => (
                <li key={`${index}-${line}`}>
                  <code>{line}</code>
                </li>
              ))}
            </ul>
          )}
        </div>
        <pre className="embed__code" aria-label="Vanilla mount example">
          <code>{`import { mountKineglyph } from "@kineglyph/web";
import { catalogue, themes } from "@kineglyph/scenes";

const controller = mountKineglyph(document.querySelector("#figure"), {
  scene: catalogue[4].scene,   // smart-simulation
  theme: themes.${themeName},
  autoplay: false,
});

controller.send("INTENT_CIRCUIT");
controller.on("state", ({ step }) => console.log(step.transition));
controller.destroy();`}</code>
        </pre>
      </div>
    </section>
  );
}

function BrandMark() {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true">
      <path d="M6 9.5 16 4l10 5.5v13L16 28 6 22.5Z" />
      <path d="m6 9.5 10 6 10-6M16 15.5V28" />
      <circle cx="16" cy="15.5" r="2.2" />
    </svg>
  );
}
