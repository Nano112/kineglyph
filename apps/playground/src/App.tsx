import { useState } from "react";
import { KineglyphFigure } from "@kineglyph/react";
import { sdfPipeline, themeCopy, themes, type ThemeName } from "./scene.js";

const themeNames = Object.keys(themes) as ThemeName[];

export function App() {
  const [themeName, setThemeName] = useState<ThemeName>("nucleation");

  return (
    <main className={`app app--${themeName}`}>
      <header className="topbar">
        <a className="brand" href="#top" aria-label="Kineglyph home">
          <BrandMark />
          <span>Kineglyph</span>
        </a>
        <span className="status">
          <i /> vertical slice 01
        </span>
        <a className="source-link" href="#source">
          One scene · three languages <span>↘</span>
        </a>
      </header>

      <section className="hero" id="top">
        <div className="hero__copy">
          <p className="kicker">Deterministic illustration runtime</p>
          <h1>
            Technical illustrations
            <br />
            <em>with a pulse.</em>
          </h1>
          <p className="lede">
            Author a visual explanation once. Theme it, inspect it, animate it, seek it, and embed
            the same scene anywhere.
          </p>
        </div>
        <dl className="manifesto">
          <div>
            <dt>01</dt>
            <dd>Semantic source</dd>
          </div>
          <div>
            <dt>02</dt>
            <dd>Constraint layout</dd>
          </div>
          <div>
            <dt>03</dt>
            <dd>Seekable motion</dd>
          </div>
          <div>
            <dt>04</dt>
            <dd>Accessible output</dd>
          </div>
        </dl>
      </section>

      <section className="workbench" aria-labelledby="workbench-title">
        <div className="workbench__header">
          <div>
            <p className="kicker">Live scene 001</p>
            <h2 id="workbench-title">Nucleation · SDF and fields</h2>
          </div>
          <div className="theme-switcher" aria-label="Illustration theme">
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
        </div>

        <KineglyphFigure figure={sdfPipeline} theme={themes[themeName]} />

        <div className="theme-caption">
          <span>Theme projection</span>
          <strong>{themeCopy[themeName].note}</strong>
          <span>Resize the window: layout resolves wide → stacked without stretching.</span>
        </div>
      </section>

      <section className="source" id="source">
        <div>
          <p className="kicker">One authored definition</p>
          <h2>
            The diagram is data.
            <br />
            The look is a projection.
          </h2>
          <p>
            Geometry comes from constraints, not theme-specific coordinates. Motion is evaluated at
            an exact time, then Anime.js drives the browser using that same timeline.
          </p>
        </div>
        <pre
          aria-label="Scrollable Kineglyph scene example"
          aria-description="Use horizontal scrolling to read lines wider than the code panel."
          role="region"
          tabIndex={0}
        >
          <code>{`definePipeline({
  id: "nucleation-sdf-pipeline",
  nodes: [field, graph, boundary, blocks],
  edges: [fieldToGraph, graphToShape, shapeToBlocks],
  timeline: buildSequence,
})

resolvePipeline(scene, {
  layout: width >= 820 ? "wide" : "stacked",
  theme: themes[product],
})`}</code>
        </pre>
      </section>

      <footer>
        <span>Kineglyph / MIT</span>
        <span>Interactive SVG now · deterministic raster next</span>
      </footer>
    </main>
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
