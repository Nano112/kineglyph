# Use Kineglyph in plain HTML

A live Kineglyph does not require React, Vue, a custom element, or a framework adapter. Give the
runtime a normal element and a serializable scene. It measures that element, chooses a responsive
layout, mounts accessible SVG, starts authored motion when the figure enters view, and returns a
small controller for updates and cleanup.

## One HTML file, no install

This complete page imports Kineglyph from a pinned esm.sh URL. Pinning the version keeps a static
site reproducible; update it deliberately when you update the figure.

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Kineglyph in plain HTML</title>
    <style>
      body {
        margin: 0;
        padding: 2rem 1rem;
        background: #111318;
        color: #f4f5f8;
        font-family: Inter, ui-sans-serif, system-ui, sans-serif;
      }

      #glyph {
        width: min(54rem, 100%);
        margin-inline: auto;
      }
    </style>
  </head>
  <body>
    <div id="glyph"></div>

    <script type="module">
      import {
        createTheme,
        figure,
        mountKineglyph,
      } from "https://esm.sh/@kineglyph/web@0.3.0/bundle?bundle";

      const theme = createTheme({
        name: "plain-html",
        colors: {
          canvas: "#111318",
          surface: "#171a21",
          surfaceRaised: "#1f2430",
          border: "#343a49",
          text: "#f4f5f8",
          textMuted: "#9aa3b5",
          accent: "#8b5cf6",
          success: "#55c99a",
          connector: "#9aa3b5",
        },
      });

      const glyph = figure(
        "html-request-flow",
        {
          title: "A browser request",
          description: "A request travels from the browser to an API and returns as JSON.",
        },
        (f) => {
          const browser = f.card({
            eyebrow: "CLIENT",
            title: "Browser",
            body: "Fetch /api/status",
            motif: "globe",
            compact: true,
          });
          const api = f.card({
            eyebrow: "SERVER",
            title: "API",
            body: "200 · application/json",
            motif: "terminal",
            tone: "success",
            compact: true,
          });
          const request = f.connect(browser, api, {
            label: "GET",
            head: "arrow",
            packets: { count: 1 },
          });

          f.root(
            f.flow([browser, api], {
              gap: 44,
              padding: 20,
              width: "fill",
            }),
          );
          f.sequence([f.reveal(browser), f.draw(request), f.reveal(api), f.flow(request)]);
        },
      );

      const controller = mountKineglyph(document.querySelector("#glyph"), {
        scene: glyph,
        theme,
        controls: "auto",
        readout: "auto",
      });

      window.addEventListener("pagehide", () => controller.destroy(), { once: true });
    </script>
  </body>
</html>
```

Serve the file over HTTP so browser modules have a normal origin:

```sh
npx vite .
# or
bunx vite .
```

The runnable copy is `examples/plain-html/index.html`.

## The live result

_Dogfood · resize the page to watch the request flow turn into a vertical stack._

```kineglyph live id=plain-html-request-flow view=preview height=350
import { figure, kineglyphTheme } from "kineglyph";

export const theme = kineglyphTheme;

export default figure("plain-html-request-flow", {
  title: "A browser request",
  description: "A request travels from the browser to an API and returns as JSON.",
}, (f) => {
  const browser = f.card({
    eyebrow: "CLIENT",
    title: "Browser",
    body: "Fetch /api/status",
    motif: "globe",
    compact: true,
  });
  const api = f.card({
    eyebrow: "SERVER",
    title: "API",
    body: "200 · application/json",
    motif: "terminal",
    tone: "success",
    compact: true,
  });
  const request = f.connect(browser, api, {
    label: "GET",
    head: "arrow",
    packets: { count: 1 },
  });

  f.root(f.graph([browser, api], {
    style: "flow",
    direction: { wide: "horizontal", compact: "horizontal", narrow: "vertical" },
    layerGap: 44,
    padding: 20,
  }));
  f.sequence([f.reveal(browser), f.draw(request), f.reveal(api), f.flow(request)]);
});
```

## What `mountKineglyph()` handles

The host element is the responsive boundary. Kineglyph observes its width rather than assuming the
width of the whole window. That means the same figure works in a full article, a narrow sidebar, a
dialog, or a resizable application panel.

By default the controller provides:

- accessible SVG titles, descriptions, focus targets, and keyboard activation;
- container-based wide, compact, and narrow layout resolution;
- in-view autoplay with a short delay and reduced-motion support;
- pointer, hover, focus, drag, tooltip, and state-machine wiring when the scene declares them;
- stable keyed updates rather than replacing compatible SVG elements; and
- automatic cleanup of its resize, visibility, and input observers through `destroy()`.

`controls: "auto"` shows playback only when the scene has a timeline. `readout: "auto"` shows the
inspection surface only when the scene contains inspectable content. Static figures therefore stay
visually quiet.

## Use installed packages instead of a CDN

For an application or a site with a JavaScript build step, install the package and keep the same
HTML:

```sh
npm install @kineglyph/web
# or
bun add @kineglyph/web
```

Change only the import:

```js
import { figure, kineglyphTheme, mountKineglyph } from "@kineglyph/web/bundle";
```

Vite, Bun, esbuild, Rollup, and similar tools resolve that bare package import. A production page
that keeps scene authoring in its own module can import `mountKineglyph` from
`@kineglyph/web/runtime` so it does not ship the authoring and editor surfaces in the runtime chunk.
Install `@kineglyph/core` alongside `@kineglyph/web` when that separate scene module imports the
authoring API directly.

## Put the scene in its own file

Once the HTML grows beyond a short example, keep the scene reusable:

```js
// request-flow.js
import { figure } from "@kineglyph/core";

export const requestFlow = figure(
  "request-flow",
  {
    title: "Request flow",
  },
  (f) => {
    // Author the figure here.
  },
);
```

```html
<div id="glyph"></div>
<script type="module">
  import { mountKineglyph } from "@kineglyph/web/runtime";
  import { kineglyphTheme } from "@kineglyph/core";
  import { requestFlow } from "./request-flow.js";

  const controller = mountKineglyph(document.querySelector("#glyph"), {
    scene: requestFlow,
    theme: kineglyphTheme,
  });
</script>
```

The same `requestFlow` export can be rendered by a Node build script or the Kineglyph CLI. Browser
and file output do not need parallel scene definitions.

## Update a live value

Declare signal defaults in the figure metadata and bind ordinary marks to them:

```js
const statusGlyph = figure(
  "status",
  {
    title: "Service status",
    signals: { latency: "waiting…", latencyTone: "textMuted" },
  },
  (f) => {
    f.root(
      f.stack(
        [
          f.eyebrow("LATENCY"),
          f.code("waiting…", {
            textStyle: "display",
            bind: { text: "latency", tone: "latencyTone" },
          }),
        ],
        { padding: 20, width: "fill" },
      ),
    );
  },
);

const controller = mountKineglyph(document.querySelector("#glyph"), {
  scene: statusGlyph,
});

controller.setSignals({ latency: "42 ms", latencyTone: "success" });
```

For continuous feeds, batch values at the application boundary or use the WebSocket adapter. See
[Live data and microcharts](./live-data-and-microcharts.md).

## Multiple figures

Each mount owns its ids, timeline, observers, and state. Reuse a definition as many times as needed:

```js
const controllers = [...document.querySelectorAll("[data-request-flow]")].map((element) =>
  mountKineglyph(element, { scene: requestFlow, controls: "auto" }),
);

// Route or page teardown:
controllers.forEach((controller) => controller.destroy());
```

Do not reuse one controller across elements. Reuse the serializable scene definition and mount one
controller per host.

## Static fallback

When a page does not need animation or interaction, the smallest browser runtime is no runtime at
all. Generate an SVG with the [Node/Bun workflow](./node-and-bun.md) and embed it normally:

```html
<img
  src="/images/request-flow.svg"
  alt="A browser sends GET /api/status to an API and receives JSON"
  width="640"
  height="280"
/>
```

Use live mounting for state, motion, resizing that must reflow, tooltips, and direct manipulation.
Use generated SVG for fixed illustrations, email-safe assets, README images, and the lightest
possible table or article embeds.

Continue with [Embedding and theming](./embedding-and-theming.md) for CSS token ownership, theme
inheritance, declarative auto-mounting, and server-rendered hydration.

For a larger live application, [Build an operational dashboard](./operational-dashboards.md) shows
how to combine Kineglyph instruments with native controls, tables, batched microcharts, and a
coalesced WebSocket feed.
