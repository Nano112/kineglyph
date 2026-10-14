# Render a figure from a URL

`@kineglyph/server` turns data into SVG, PNG, or animated GIF over HTTP. Start with a short URL,
add chart controls when needed, or send an existing scene definition. The server reuses
Kineglyph's plot compiler, scene resolver, and exporters: it is a transport, not another renderer.

A monitor only collects measurements and creates URLs. It does not need a browser, fonts, image
encoders, or chart layout code. The rendering service needs Node.js; it does not require a
browser or database.

## Start from a checkout

Requires Node.js 22.12 or newer. From the repository root:

```sh
npm ci
npm run bootstrap
node packages/server/dist/cli.js serve --host 127.0.0.1 --port 4179
```

The package provides the `kineglyph-server` executable. It is separate from `kineglyph dev`,
which previews **trusted local modules**. HTTP rendering never imports a module selected by a
request. This guide describes the source checkout; merging the feature does not publish a new
npm release or deploy a public endpoint.

```sh
curl 'http://127.0.0.1:4179/chart.svg?data=12,18,45,32,21' -o chart.svg
curl 'http://127.0.0.1:4179/chart.png?data=12,18,45,32,21&title=CPU&unit=percent' -o cpu.png
curl 'http://127.0.0.1:4179/chart.gif?data=12,18,45,32,21&width=640' -o cpu.gif
```

The default line chart has inferred axes and a complete theme. Static output renders the final
frame. GIF is a sampled, finite animation baked into the response, not a live stream.

![The actual PNG response for a minimal five-value chart](./assets/http/minimal.png)

## Progressive configuration

### A few query parameters

```text
/chart.png?data=12,18,45,32,21&title=CPU&unit=percent&mark=area&theme=blueprint&width=800
```

For named series, supply one parameter per series:

```text
/chart.png?series.cpu=12,18,45,32&series.memory=62,63,63,65&x=10:00,10:01,10:02,10:03&y.min=0&y.max=100&unit=percent&legend=true
```

These are relative URL examples. Add your service origin, and use a URL helper to escape labels
and other special characters correctly.

- `data`: comma-separated numeric samples for one series; use `null` for a missing sample.
- `series.NAME`: named series instead of `data`. Do not mix both forms. Series and x-values must
  have equal lengths; missing data is not silently converted to zero.
- `x`: comma-separated labels or numeric positions. Use structured JSON for labels containing commas.
- `title`, `unit`: chart title and value formatting. `unit=percent` adds `%` to values already in
  percentage points; it does **not** multiply fractions by 100.
- `mark`: `line`, `area`, `bar`, or `dot`. More detailed per-series choices use a structured spec.
- `legend`: `true` or `false`.
- `x.label`, `y.label`: axis titles.
- `x.min` / `x.max`, `y.min` / `y.max`: paired domain endpoints. Numeric x domains require numeric
  x-values and a compatible mark. Invalid or reversed domains are errors.
- `theme`: `light` (default), `dark`, `kineglyph`, `blueprint`, `swiss`, `ledger`, `field-manual`,
  `studio`, `civic`, `anatomy`, or `anatomy-dark`. The service fixes the font family to bundled Geist Mono across themes.
- `width`: layout/container width, 240–1600 (default 960), not merely an image resize.
- `scale`: output scaling, 0.25–3 (default 1), without changing the layout breakpoint.
- `time`: a still-frame time in milliseconds, 0–2000, for SVG/PNG. Omit for the final frame.
  GIF always exports the timeline rather than a chosen still frame.
- `fps`: GIF sampling rate, 1–24 (default 8), subject to the frame and pixel budgets below.

Unknown options, duplicate query keys, malformed numbers, and ambiguous input are rejected.
The server will not guess that `widht` meant `width`.

### A structured chart

The JSON request gives each series its own mark and semantic colour:

```json
{
  "chart": {
    "title": "Mac mini · example measurements",
    "unit": "percent",
    "x": [0, 1, 2, 3],
    "xLabel": "Minutes",
    "yLabel": "Usage",
    "yDomain": [0, 100],
    "series": [
      { "name": "CPU", "data": [12, 18, null, 32], "mark": "area", "tone": "chart1" },
      { "name": "Memory", "data": [62, 63, 63, 65], "mark": "line", "tone": "chart2" }
    ]
  },
  "theme": "blueprint",
  "width": 960,
  "scale": 2
}
```

Save this as `request.json` and send it directly:

```sh
curl --fail-with-body -H 'Content-Type: application/json' \
  --data-binary @request.json http://127.0.0.1:4179/render.png -o dashboard.png
```

POST returns image bytes, just like GET; it does **not** upload an image or allocate a stored
image URL. A GET can carry the same request in the URL-encoded `spec` parameter. `spec` is
exclusive: put all options inside it rather than mixing it with shorthand parameters.

### Build URLs without the rendering dependencies

```ts
import { chartUrl } from "@kineglyph/server/client";

const minimal = chartUrl("https://glyph.example", { data: [12, 18, 45] });
// https://glyph.example/chart.png?data=12%2C18%2C45

const image = chartUrl("https://glyph.example", {
  chart: {
    title: "CPU",
    unit: "percent",
    series: [{ name: "CPU", data: [12, 18, 45, 32] }],
  },
  theme: "blueprint",
  width: 800,
});
```

The client entry contains request validation and encoding, not Node HTTP or native raster code.
The helper emits compact shorthand where possible and falls back to encoded JSON for richer
requests. Overlarge URLs are rejected with guidance to use POST. Real proxies and clients can
have lower URL limits than the server: keep GET snapshots compact.

### Existing scenes

Author with normal Kineglyph APIs, then send **data**, not the authoring callback:

```ts
import { figure } from "@kineglyph/core";
import { chartUrl } from "@kineglyph/server/client";

const scene = figure("status", { title: "Monitoring" }, (f) => {
  const source = f.card({ title: "Mac mini", motif: "blocks" });
  const target = f.card({ title: "Kineglyph", motif: "brush" });
  f.connect(source, target, { head: "arrow", label: "metrics" });
  f.root(f.flow([source, target]));
});
const url = chartUrl("https://glyph.example", { scene, width: 960 }, "svg");
```

The HTTP boundary supports a **validated portable subset** of `SceneDefinition`, not arbitrary
objects accepted by trusted authoring code. Unsupported fields fail explicitly instead of being
silently removed. There is no uploaded JavaScript, custom shader execution, arbitrary module
import, client-selected font path, or image URL fetching. See the server package's schema for
exact accepted fields and bounds. Use the trusted local exporter for scenes outside this subset.

Supported node families are groups, rectangles, circles, text, icons, paths, polylines, badges,
callouts and legends. Groups can use stack, row, grid, overlay, absolute or coordinate layouts;
responsive values, connectors/ports, semantic paints and gradients, named portable material
references, inspection metadata and bounded timelines are supported. Images, custom material
effect programs, state machines, signal bindings and runtime controls are outside this HTTP
subset. Named themes are supported; arbitrary theme overrides are not accepted.

Interactive controls and host callbacks do not become interactive inside a PNG or SVG `<img>`.
For live interactive figures, use the existing web runtime. Browser-specific material effects
remain subject to the portable exporter's rendering capabilities.

## Discord monitoring

![A real HTTP-rendered two-series dashboard using illustrative, not live, Mac mini measurements](./assets/http/monitor.png)

Keep the responsibilities separate:

1. The monitor collects samples and maintains a small rolling history.
2. It builds a URL whose parameters contain the new snapshot.
3. It edits the existing bot message's embed image URL.
4. Discord fetches/proxies that URL; Kineglyph renders the image.

Do not overwrite an image behind a fixed URL and expect Discord's CDN to refresh. New data should
produce a new URL. A GIF only loops its encoded frames; it cannot fetch future measurements.
PNG is usually the more readable and less expensive dashboard format.

Use a reachable HTTPS origin: Discord cannot fetch `127.0.0.1` or your machine-only hostname.
Pin the deployed renderer when stable output matters, include a measurement timestamp in the
chart title, coalesce updates, and respect Discord rate limits. Test an actual two-snapshot embed
edit in your target channel before relying on its cache behaviour.

Query payloads are visible in URLs, logs, browser history, and the platforms displaying them.
Encoding is **not encryption**. Do not include secrets or sensitive machine information in public
image URLs. For private dashboards, choose a separate authenticated delivery/storage design;
Discord's image fetcher does not send your custom Authorization header.

## Embed the handler

```ts
import { createServer } from "node:http";
import { createRenderHandler, startRenderServer } from "@kineglyph/server";

// Managed listener: the default address is 127.0.0.1:3000.
const service = await startRenderServer({
  port: 4179,
  concurrency: 2,
  timeoutMs: 10_000,
  cacheBytes: 8_000_000,
});
// On application shutdown:
await service.shutdown();

// Alternatively, use a handler in your own Node HTTP server.
const handler = createRenderHandler({ cacheBytes: 8_000_000 });
const server = createServer(handler);
server.listen(4179, "127.0.0.1");
// Stop admitting requests and drain accepted work before disposing your server:
// await handler.close(); server.close();
```

`GET`, `HEAD`, and JSON `POST` are accepted at `/chart.svg`, `/chart.png`, `/chart.gif` and their
`/render.*` aliases. POST query parameters are rejected: put the complete request in the body.
`HEAD` returns the image's headers without its body; it can still require rendering a cache miss.

Handler options are server-owned, never query-controlled:

- `concurrency`: default 2, maximum 8; includes admitted body readers. There is no waiting queue.
- `timeoutMs`: default 10,000, maximum 30,000; render worker wall-clock deadline.
- `bodyTimeoutMs`: default 5,000, maximum 30,000; deadline to finish receiving JSON.
- `cacheBytes`: default 0 (disabled), maximum 64,000,000; process-local LRU byte budget.

Call `shutdown()` for an owned service, or `handler.close()` for an embedded handler, to stop
admission and drain outstanding work. The application still owns an embedded HTTP listener.

## Operational boundaries

The service binds to loopback by default. Public exposure should sit behind a reverse proxy with
TLS, appropriate authentication or access controls, request/connection rate limits, and URL/body
limits. Application limits are not a substitute for operating-system memory/CPU limits.

Requests are validated before rendering. The default, server-owned limits are:

- 131,072 bytes per URL/JSON payload; depth 24 and 20,000 visited input values.
- Up to 6 chart series and 1,000 samples total across all series.
- Up to 500 scene nodes, 1,000 polyline points, 100 edges and 100 timeline tracks.
- At most 2,000 milliseconds of authored timeline and 25 GIF frames.
- Resolved height at most 2,000 layout units; at most 4,000,000 scaled output pixels.
- At most 24,000,000 pixels across GIF frames and 16,000,000 encoded response bytes.

Large scale, duration and FPS settings can exceed the combined budgets even when each individual
option is within range. Reduce dimensions/scale/FPS, or reduce scene complexity. Individual fields
also have length and numeric-range limits enforced by the exported schemas.

Rendering runs in killable child processes
with bounded concurrency, so an expensive render does not block the HTTP event loop. Overload
is rejected rather than building an unbounded queue. Raster exporters are loaded only when needed.

Raster output uses a bundled, licensed font rather than host font discovery. SVG text appearance
can still depend on the fonts available to the viewing application; use PNG when the displayed
pixels must match exactly.

Successful images have an ETag for conditional requests. The bounded process-local cache is an
optimization, not permanent image storage. Cache contents disappear on restart, but self-contained
requests remain renderable. Pin code, dependencies, and fonts if URLs must reproduce identical
bytes across deployments.

Errors are JSON, not placeholder charts. Check the HTTP status and Content-Type before saving a
response as an image. Invalid input is a client error, capacity exhaustion is retryable, and a
render timeout is not reported as a successful image.
