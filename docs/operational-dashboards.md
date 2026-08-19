# Build an operational dashboard

Kineglyph can drive a real-time operational dashboard, but it should not own the entire application.
Use semantic HTML for navigation, filters, forms, tables, incident text, and screen-reader reading
order. Mount Kineglyph into the places where a visual instrument adds meaning: an overview panel, a
topology, a latency distribution, a deployment timeline, or a directly manipulable simulation.

This division produces a dashboard that remains fast, accessible, responsive, and easy to update.
It also avoids rebuilding a table or application shell through an SVG scene every time one number
changes.

[Open the complete live dashboard](../examples/operational-dashboard/). It combines a semantic
HTML application shell with live overview metrics, a percentile plot and SLO, dependency topology,
threshold gauges, a deployment/incident timeline, regional filtering, pause/resume, and a dense
service table. Every instrument updates from one coherent snapshot and cleans up its runtime when
the page is removed.

## The three rendering tiers

| Dashboard surface                   | Kineglyph path                            | Why                                      |
| ----------------------------------- | ----------------------------------------- | ---------------------------------------- |
| Important live instruments          | `mountKineglyph()` + signals/scenes       | Full layout, motion, tooltips, and state |
| Percentiles, distributions, SLOs    | `plot()` + annotations                    | Proper scales, axes, layers, and rules   |
| Dependencies and event correlation  | `topology()` / `timelineChart()`          | Inspectable semantic geometry            |
| Saturation and headroom             | `gaugeChart()`                            | Threshold-aware operational reading      |
| Hundreds or thousands of row trends | `mountMicrochartBatch()`                  | One observer and one frame queue         |
| Dense non-interactive mark fields   | `mountCanvasScene()` with an HTML summary | Avoid thousands of SVG DOM nodes         |

HTML is the fourth tier: use it whenever the content is fundamentally a control, a table cell, a
paragraph, or a status value. Kineglyph does not need to redraw what the browser already renders
well.

## A live overview instrument

_Live · request rate and latency change every second without restarting the figure._

```kineglyph live id=operational-dashboard-overview view=preview height=520
import { counterTerminalTheme, figure, material } from "kineglyph";

export const theme = counterTerminalTheme;

const path = (values) => {
  const min = Math.min(...values);
  const max = Math.max(...values);
  return `M${values.map((value, index) => {
    const x = (index / Math.max(1, values.length - 1)) * 100;
    const y = max === min ? 14 : ((max - value) / (max - min)) * 28;
    return `${x.toFixed(2)} ${y.toFixed(2)}`;
  }).join("L")}`;
};

const traffic = Array.from({ length: 24 }, (_, index) =>
  Math.round(12_400 + Math.sin(index * .64) * 1_350 + (index % 7) * 90));
const latency = Array.from({ length: 24 }, (_, index) =>
  Math.round(72 + Math.sin(index * .71 + 1.2) * 19 + (index % 9 === 0 ? 24 : 0)));

export default figure("operations-overview", {
  title: "Production overview",
  description: "Live request rate, p95 latency, error rate, and availability instruments.",
  signals: {
    stream: "LIVE · 000", streamTone: "success",
    requests: "12.4K /s", p95: "84 ms", errors: "0.18%", availability: "99.98%",
    trafficPath: path(traffic), latencyPath: path(latency),
  },
}, (f) => {
  const metric = (eyebrow, value, signal, tone, trend, trendSignal) => f.stack([
    f.eyebrow(eyebrow, { tone: "textMuted" }),
    f.code(value, { textStyle: "title", tone, bind: { text: signal } }),
    f.path(path(trend), { width: 100, height: 28 }, {
      width: "fill", height: 32, fill: "none", stroke: tone, strokeWidth: 2.2,
      label: `${eyebrow} rolling trend`, bind: { path: trendSignal },
    }),
  ], { gap: 7, padding: 14, width: "fill", frame: material("flat") });

  const metrics = [
    metric("REQUEST RATE", "12.4K /s", "requests", "accent", traffic, "trafficPath"),
    metric("P95 LATENCY", "84 ms", "p95", "warning", latency, "latencyPath"),
    f.stack([
      f.eyebrow("ERROR RATE", { tone: "textMuted" }),
      f.code("0.18%", { textStyle: "title", tone: "danger", bind: { text: "errors" } }),
      f.body("5 minute rolling window", { tone: "textMuted" }),
    ], { gap: 7, padding: 14, width: "fill", frame: material("flat") }),
    f.stack([
      f.eyebrow("AVAILABILITY", { tone: "textMuted" }),
      f.code("99.98%", { textStyle: "title", tone: "success", bind: { text: "availability" } }),
      f.body("30 day objective · 99.95%", { tone: "textMuted" }),
    ], { gap: 7, padding: 14, width: "fill", frame: material("flat") }),
  ];

  f.root(f.stack([
    f.row([
      f.stack([f.eyebrow("OPERATIONAL VIEW"), f.heading("Production overview")], { gap: 4 }),
      f.badge("LIVE · 000", { bind: { text: "stream", tone: "streamTone" } }),
    ], { width: "fill", justify: "between", align: "center" }),
    f.grid(metrics, { columns: { wide: 4, compact: 2, narrow: 1 }, gap: 10, width: "fill" }),
  ], {
    gap: 16, padding: { wide: 18, compact: 14, narrow: 10 },
    width: "fill", frame: material("raised"),
  }));
});

export function setup(controller) {
  const requestHistory = [...traffic];
  const latencyHistory = [...latency];
  let tick = 0;
  const timer = window.setInterval(() => {
    tick += 1;
    const requests = Math.round(12_800 + Math.sin(tick * .52) * 1_600 + (tick % 5) * 110);
    const p95 = Math.round(78 + Math.sin(tick * .63 + 1.1) * 24 + (tick % 13 === 0 ? 42 : 0));
    requestHistory.shift(); requestHistory.push(requests);
    latencyHistory.shift(); latencyHistory.push(p95);
    controller.setSignals({
      stream: `LIVE · ${String(tick).padStart(3, "0")}`,
      streamTone: p95 > 110 ? "warning" : "success",
      requests: `${(requests / 1_000).toFixed(1)}K /s`,
      p95: `${p95} ms`,
      errors: `${(0.16 + Math.abs(Math.sin(tick * .31)) * .12).toFixed(2)}%`,
      availability: `${(99.96 + Math.abs(Math.cos(tick * .23)) * .035).toFixed(3)}%`,
      trafficPath: path(requestHistory),
      latencyPath: path(latencyHistory),
    });
  }, 1_000);
  return () => window.clearInterval(timer);
}
```

The figure declares useful empty values, and each update is a small named patch. Stable ids retain
compatible SVG elements, focus, and element-bound listeners. The scene still resolves as one
coherent responsive instrument rather than leaving the application to manually align four widgets.

## Full instruments, not only microcharts

Microcharts answer one narrow question in a dense row. A dashboard also needs full-size surfaces
with scales, thresholds, relationships, inspection, and export. The runnable example uses ordinary
Kineglyph figures for each of these:

| Instrument                 | Authoring surface                                              | Live update path                        |
| -------------------------- | -------------------------------------------------------------- | --------------------------------------- |
| Latency percentiles        | `plot()` + three `line()` series + an SLO `rule()`             | rebuild from a bounded snapshot         |
| Dependency health          | `topology()` with directed, semantically toned nodes and links | rebuild when service states change      |
| CPU/memory/queue headroom  | `gaugeChart()` with success/warning/danger thresholds          | rebuild from the newest capacity values |
| Deployments and incidents  | `timelineChart()` with inspectable intervals                   | append bounded events, then rebuild     |
| Overview values and traces | ordinary figure primitives bound to named signals              | `controller.setSignals()`               |

Rebuilding a 20–100 mark scene once per second is an appropriate live path: `setScene()` resolves
new data and patches compatible SVG elements by stable id. Use signals when the geometry topology is
fixed and only text, tone, width, height, or a path changes. Use scene replacement when rows, scale
domains, thresholds, nodes, or events change.

The new gauge family is a normal exportable plot fragment rather than a browser widget:

```kineglyph live id=operational-capacity-gauges view=preview height=430
import { counterTerminalTheme, figure, gaugeChart } from "kineglyph";

export const theme = counterTerminalTheme;

const thresholds = [
  { value: 70, tone: "success", label: "Healthy" },
  { value: 85, tone: "warning", label: "Elevated" },
  { value: 100, tone: "danger", label: "Critical" },
];

const capacityFigure = (values) => figure("capacity-gauges", {
  title: "Resource saturation",
  description: "Live CPU, memory, and queue headroom.",
}, (f) => {
  const gauge = (id, label, value) => f.add(gaugeChart({
    id, label, value, max: 100, unit: "%", thresholds, height: 190, motion: "none",
  }));
  f.root(f.grid([
    gauge("capacity-cpu", "CPU", values.cpu),
    gauge("capacity-memory", "Memory", values.memory),
    gauge("capacity-queue", "Queue", values.queue),
  ], {
    columns: { wide: 3, compact: 3, narrow: 1 }, gap: 10, width: "fill",
    padding: { wide: 12, compact: 10, narrow: 8 },
  }));
});

export default capacityFigure({ cpu: 58, memory: 71, queue: 42 });

export function setup(controller) {
  let tick = 0;
  const timer = window.setInterval(() => {
    tick += 1;
    controller.setScene(capacityFigure({
      cpu: Math.round(54 + Math.sin(tick * .37) * 25),
      memory: Math.round(70 + Math.sin(tick * .19 + 1) * 13),
      queue: Math.round(38 + Math.sin(tick * .51 + 2) * 31),
    }));
  }, 1_000);
  return () => window.clearInterval(timer);
}
```

Threshold bands, the active arc, needle, value, labels, descriptions, and inspection metadata are
all ordinary scene nodes. The gauge therefore works in the live DOM, deterministic SVG, Canvas,
PNG, GIF, regression snapshots, and the editor without a second implementation.

## Put the application shell in HTML

The [complete runnable example](../examples/operational-dashboard/) lives in
`examples/operational-dashboard`. Its DOM owns the filter, pause button, status announcement, and
service table:

```html
<header>
  <label>
    Region
    <select id="region-filter">
      <option value="all">All regions</option>
      <option value="us-east">US East</option>
      <option value="eu-west">EU West</option>
    </select>
  </label>
  <button id="pause-feed" type="button">Pause feed</button>
</header>

<div id="overview-glyph"></div>

<table>
  <thead>
    …
  </thead>
  <tbody id="service-rows"></tbody>
</table>
```

Native controls provide their expected keyboard, focus, form, and assistive-technology behavior.
Native tables provide column relationships, copying, browser search, and predictable scrolling.
Kineglyph remains responsible for the visual explanation inside `#overview-glyph`.

## Use microcharts in the service table

Do not mount a full scene runtime in every row. Give each trend cell values and one accessible label:

```html
<span
  data-kineglyph-microchart="line"
  data-width="112"
  data-height="24"
  aria-label="Checkout latency over the latest 24 samples"
  >72,81,76,89,94,87</span
>
```

One batch controller virtualizes every matching chart and coalesces all dirty cells into one frame:

```js
import { mountMicrochartBatch } from "@kineglyph/web/micro";

const tbody = document.querySelector("#service-rows");
const trends = [...tbody.querySelectorAll("[data-kineglyph-microchart]")];
const microcharts = mountMicrochartBatch({
  root: document,
  selector: "#service-rows [data-kineglyph-microchart]",
  defer: "visible",
  recycle: true,
});

microcharts.updateMany(
  services.map((service, index) => ({
    target: trends[index],
    values: service.history,
  })),
);

// Before an exact screenshot/export, or at transaction boundaries:
microcharts.flush();
```

Offscreen cells retain only their latest values; their SVG is recreated when they return. The
table's numeric p95 and error cells should still contain text—the sparkline shows shape, not an
accessible replacement for the measurement.

## Connect the real feed

Replace the example timer with one WebSocket adapter. It parses JSON, reports status, coalesces
bursts to the newest message once per animation frame, and optionally reconnects with bounded
exponential backoff:

```js
import { connectWebSocket } from "@kineglyph/web/stream";

const feed = connectWebSocket("wss://ops.example.com/v1/telemetry", {
  reconnect: { retries: 10, delay: 400, maxDelay: 8_000 },
  onStatus(status) {
    overviewController.setSignals({
      stream: status.toUpperCase(),
      streamTone: status === "open" ? "success" : "warning",
    });
  },
  onMessage(snapshot) {
    overviewController.setSignals({
      requests: `${snapshot.requestsPerSecond} /s`,
      p95: `${snapshot.p95} ms`,
      errors: `${snapshot.errorRate}%`,
      availability: `${snapshot.availability}%`,
      trafficPath: path(snapshot.requestHistory),
      latencyPath: path(snapshot.latencyHistory),
    });
    updateServiceRows(snapshot.services);
  },
  onError(error) {
    console.error("telemetry stream", error);
  },
});
```

If the server sends row patches instead of complete snapshots, put `createKeyedLiveData()` between
the socket and the view. It batches keyed upserts/removals, bounds rolling history, and exposes an
immutable deterministic snapshot that can also be exported or tested.

## Keep the data boundary boring

Normalize transport messages before they reach a figure. A useful dashboard view model contains
plain values and bounded histories:

```ts
interface OperationsSnapshot {
  readonly capturedAt: string;
  readonly requestsPerSecond: number;
  readonly p95: number;
  readonly errorRate: number;
  readonly availability: number;
  readonly requestHistory: readonly number[];
  readonly latencyHistory: readonly number[];
  readonly services: readonly {
    id: string;
    region: string;
    state: "healthy" | "warning" | "critical";
    p95: number;
    errorRate: number;
    history: readonly number[];
  }[];
}
```

Do not put WebSocket objects, DOM nodes, callbacks, dates, or application classes into scene
signals. Convert timestamps to strings, choose bounded arrays, and keep every value serializable.
That preserves worker execution, snapshots, replay, and file export.

## Backpressure and update frequency

Rendering every network packet is rarely useful. Match paint frequency to the question a person can
answer from the dashboard:

- Coalesce high-frequency telemetry at the transport boundary; the supplied WebSocket adapter uses
  one animation-frame queue by default.
- Send one `setSignals()` patch containing all values for an overview snapshot instead of several
  partial calls.
- Use `updateMany()` for table charts, not one independent animation frame per cell.
- Bound every rolling history. A 60-sample sparkline should not retain a day of points.
- Move expensive custom aggregation to a worker; return serializable snapshots to the page.
- Pause or reduce polling when the page is hidden when stale data semantics allow it.

The browser can paint at 60Hz; that does not mean an operator benefits from 60 layout resolutions
per second. One to four updates per second is often enough for service-health instruments, while a
fast trace may justify a specialized Canvas surface.

## Failure and stale states are part of the visualization

An operational dashboard must distinguish these states:

| State          | Display behavior                                                       |
| -------------- | ---------------------------------------------------------------------- |
| Connecting     | Keep prior values or explicit placeholders; label the connection state |
| Live           | Show the capture time and ordinary semantic status colours             |
| Reconnecting   | Preserve the last snapshot, mark it stale, and show retry state        |
| Closed         | Stop motion and state clearly that values will no longer update        |
| Partial data   | Mark the affected instrument; do not reinterpret missing as zero       |
| Operator pause | Keep the pause control pressed and label the snapshot as paused        |

Do not use animation or colour as the only status channel. Every warning must also have text, and
the table should remain useful in forced-colour and reduced-motion modes.

## Snapshot and export

The operational page is live, but its serializable figures remain exportable. Keep the most recent
normalized snapshot, resolve the same scene with those signal values in Node, and produce an SVG or
PNG for an incident report. Call `microcharts.flush()` before an application-owned browser capture
so every visible row reflects the same transaction.

An application screenshot is different from a scene export: HTML controls and tables are outside
the figure by design. Export individual figures with Kineglyph; capture the assembled dashboard
with the application's browser/PDF tooling when the whole page is the artifact.

## Teardown

Close every owned resource when a route, tab, or dashboard panel is removed:

```js
feed.close(1000, "dashboard disposed");
microcharts.destroy();
overviewController.destroy();
latencyController.destroy();
topologyController.destroy();
capacityController.destroy();
eventsController.destroy();
```

The batch controller disconnects its shared observer and cancels its pending frame. The figure
controller removes resize, visibility, pointer, and timeline work. The socket adapter cancels its
reconnect timer.

## Production checklist

- Keep the application shell and tabular facts in semantic HTML.
- Use one full figure runtime per meaningful instrument, not per primitive or table row.
- Give every live figure useful loading, stale, reconnecting, and closed values.
- Coalesce feed bursts and patch all related signals in one transaction.
- Use stable service ids and bounded histories.
- Pair every chart with a title/description and every status colour with text.
- Respect reduced motion; avoid decorative looping motion on an always-open operations screen.
- Destroy controllers, batch renderers, intervals, observers, and sockets on teardown.
- Snapshot normalized data separately from the DOM so incidents can be replayed and exported.

Run the complete example from `examples/operational-dashboard` with `npx vite .`, or
[open the published build](../examples/operational-dashboard/). Continue with [Live data and
microcharts](./live-data-and-microcharts.md) for the lower-level stream and keyed-data contracts,
and [Tooling, scale, and output](./tooling-and-scale.md) for workers, Canvas, regression, and export.
