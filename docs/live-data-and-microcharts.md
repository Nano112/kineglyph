# Live data and microcharts

Kineglyph now has two deliberately different data paths:

- A full figure can accept named values with `controller.setSignals()`. Layout, themes, bindings,
  interaction, and animation remain available.
- A microchart is a complete 16-pixel SVG string with no scene resolver, observer, controls, or
  stylesheet. It is the right tool for hundreds or thousands of table cells.

The distinction keeps a live dashboard expressive without making a 1,000-row table pay for 1,000
figure runtimes.

## A dense status table is still a visual

_Live · ten services, 120 rolling samples_

This full Kineglyph figure demonstrates the visual grammar: a stable name, a compact trend, the
latest value, and colour used only for status. Rows reveal once when the table enters the viewport;
after that, a deterministic demo feed pushes a new sample every 1.1 seconds without restarting the
entrance animation. The microchart API below produces the same kind of trend at `64 × 16` with a
few hundred bytes of markup.

```kineglyph live id=live-dense-status view=preview height=560
import { counterTerminalTheme, figure, material } from "kineglyph";

export const theme = counterTerminalTheme;

const services = ["AUTH", "SEARCH", "MEDIA", "BILLING", "WORKERS", "CACHE", "EVENTS", "MAIL", "EDGE", "STORE"];
const tones = ["success", "info", "warning", "success", "accent", "info", "success", "warning", "accent", "success"];
const samples = services.map((_, service) => Array.from({ length: 12 }, (_, index) =>
  Math.round(28 + service * 4 + Math.sin(index * 0.88 + service) * 17 + ((index * (service + 3)) % 11)),
));
const path = (values) => {
  const min = Math.min(...values);
  const max = Math.max(...values);
  return `M${values.map((value, index) => {
    const x = (index / (values.length - 1)) * 100;
    const y = max === min ? 12 : ((max - value) / (max - min)) * 24;
    return `${x.toFixed(2)} ${y.toFixed(2)}`;
  }).join("L")}`;
};

const initialSignals = Object.fromEntries(services.flatMap((_, index) => [
  [`trend${index}`, path(samples[index])],
  [`latest${index}`, `${samples[index].at(-1)} ms`],
]));

export default figure("live-dense-status", {
  title: "Ten live service trends",
  description: "A dense status table containing ten compact trend lines and their latest values.",
  signals: { streamState: "CONNECTING · 00", ...initialSignals },
}, (f) => {
  const rows = services.map((name, index) => f.row([
    f.code(name, { width: { wide: 110, compact: 92, narrow: 72 }, tone: tones[index] }),
    f.path(path(samples[index]), { width: 100, height: 24 }, {
      width: "fill",
      height: 28,
      fill: "none",
      stroke: tones[index],
      strokeWidth: 2.4,
      label: `${name} recent trend`,
      bind: { path: `trend${index}` },
    }),
    f.code(`${samples[index].at(-1)} ms`, {
      width: { wide: 82, compact: 74, narrow: 62 },
      align: "end",
      tone: "textMuted",
      bind: { text: `latest${index}` },
    }),
  ], { gap: 12, padding: [7, 10], align: "center", width: "fill", frame: material("flat") }));

  f.root(f.stack([
    f.row([
      f.stack([f.eyebrow("LIVE TABLE", { tone: "info" }), f.heading("Latency at a glance")], { gap: 5 }),
      f.code("CONNECTING · 00", {
        tone: "textMuted",
        hidden: { narrow: true },
        bind: { text: "streamState" },
      }),
    ], { justify: "between", align: "end", width: "fill" }),
    f.stack(rows, { gap: 6, width: "fill" }),
  ], { gap: 18, padding: { wide: 22, compact: 16, narrow: 10 }, width: "fill", frame: material("raised") }));
  f.sequence([f.reveal(rows, { stagger: 55, duration: 460 })]);
});

export function setup(controller) {
  const history = samples.map((row) => [...row]);
  let tick = 0;
  let interval;

  const publish = () => {
    tick += 1;
    const patch = { streamState: `LIVE · ${String(tick).padStart(2, "0")}` };
    history.forEach((row, index) => {
      const pulse = Math.sin(tick * 0.82 + index * 1.37) * 9;
      const burst = (tick + index * 3) % 11 === 0 ? 19 : 0;
      const next = Math.max(12, Math.round(31 + index * 4 + pulse + burst));
      row.shift();
      row.push(next);
      patch[`trend${index}`] = path(row);
      patch[`latest${index}`] = `${next} ms`;
    });
    controller.setSignals(patch);
  };

  const start = window.setTimeout(() => {
    publish();
    interval = window.setInterval(publish, 1_100);
  }, 1_100);

  return () => {
    window.clearTimeout(start);
    if (interval !== undefined) window.clearInterval(interval);
  };
}
```

Editable examples may export `setup(controller, element)`. It runs after the preview mounts and can
return a disposer; the lab calls that disposer before every rerun and on teardown, so timers,
sockets, and observers do not leak while someone edits.

## Push external values into a figure

Declare the keys and useful empty-state defaults in figure metadata. Bindings are checked against
those declarations at build time, even when the figure has no state machine.

```ts
import { figure } from "@kineglyph/core";

const telemetry = figure(
  "telemetry",
  {
    title: "Request telemetry",
    signals: { rate: "waiting", status: "connecting", load: 0.12 },
  },
  (f) => {
    const rate = f.code("waiting", { bind: { text: "rate" } });
    const status = f.badge("connecting", { bind: { text: "status" } });
    const load = f.rect({ width: 320, height: 12, bind: { opacity: "load" } });
    f.root(f.stack([f.row([status, rate]), load]));
  },
);
```

`setSignals()` merges patches and re-resolves only that mounted figure. Pass `replace: true` when
a payload is a complete snapshot rather than a patch.

```ts
import { mountKineglyph } from "@kineglyph/web";

const controller = mountKineglyph(document.querySelector("#telemetry")!, {
  scene: telemetry,
  controls: "auto",
  readout: "auto",
});

controller.setSignals({ rate: "1,284 req/s", status: "live", load: 0.74 });
controller.on("data", (values) => console.log("rendered", values));
```

External values override scene defaults and machine-derived signals with the same name. This makes
it possible to keep interaction local—selection, zoom, filters—while the server owns measurements.

## Connect a WebSocket without rebuilding lifecycle code

`connectWebSocket()` parses JSON by default, reports connection state, and coalesces bursts to the
newest message once per animation frame. Optional reconnect uses bounded exponential backoff.

```ts
import { connectWebSocket } from "@kineglyph/web";

const feed = connectWebSocket<{ rate: number; load: number; online: boolean }>(
  "wss://example.test/telemetry",
  {
    reconnect: { retries: 8, delay: 400, maxDelay: 8_000 },
    onStatus: (status) => controller.setSignals({ status }),
    onMessage: ({ rate, load, online }) =>
      controller.setSignals({
        rate: `${rate.toLocaleString()} req/s`,
        load,
        status: online ? "live" : "degraded",
      }),
    onError: console.error,
  },
);

// On route teardown:
feed.close(1000, "view disposed");
controller.destroy();
```

The adapter accepts a custom `parse` function for binary or newline-delimited protocols and a
custom WebSocket constructor for workers, tests, or compatible transports.

## Render thousands of tiny SVGs

`renderMicroSvg()` is a separate fast path in `@kineglyph/svg`. It accepts an array or Peity-style
comma/slash-delimited text and returns one standalone accessible SVG. Line and bar charts default
to `64 × 16`; pie and donut charts default to `16 × 16`.

```ts
import { renderMicroSvg } from "@kineglyph/svg";

latencyCell.innerHTML = renderMicroSvg("31,28,35,42,39,51,44", {
  type: "line",
  stroke: "#a855f7",
  label: "Seven recent latency samples",
});

changeCell.innerHTML = renderMicroSvg([4, -2, 7, -1, 3], {
  type: "bar",
  fill: "#22c55e",
  negativeFill: "#fb7185",
});

shareCell.innerHTML = renderMicroSvg("37/63", {
  type: "donut",
  fills: ["#facc15", "#27272a"],
  label: "37 percent complete",
});
```

For progressive enhancement, put compact values directly in the cell:

```html
<td data-kineglyph-microchart="line" aria-label="Recent latency">31,28,35,42,39</td>
<td data-kineglyph-microchart="bar" data-width="48">4,-2,7,-1,3</td>

<script type="module">
  import { mountAllMicrocharts } from "@kineglyph/web";
  const charts = mountAllMicrocharts();
  // charts[0].update(nextSamples) replaces only its tiny SVG.
</script>
```

The direct renderer has no runtime stylesheet or observers and emits decorative SVG by default.
Provide `label` when the trend conveys information not already written in the table. It becomes
both the accessible name and a native SVG `<title>` tooltip, so even a matrix with thousands of
charts gains hover detail without thousands of JavaScript listeners. In tests, 1,000 three-point
line charts remain under 300 KB of uncompressed markup.

For thousands of live or scrollable rows, use the batch helper. It keeps only intersecting charts
mounted, recycles SVG DOM after cells leave the viewport, and collapses every synchronous burst to
one shared animation-frame write. There is one observer for the table—not one per chart.

```ts
import { mountMicrochartBatch } from "@kineglyph/web";

const trends = mountMicrochartBatch({
  root: document.querySelector("#services")!,
  rootMargin: "240px 0px", // pre-render just beyond the scrollport
});

feed.onmessage = ({ updates }) => {
  trends.updateMany(updates.map(({ row, samples }) => ({ target: row, values: samples })));
};

// Updates for offscreen rows change only the retained numbers. Their SVG is created on entry.
// On route teardown:
trends.destroy();
```

If the application already virtualizes table rows, pass `defer: false`: only the small set of DOM
rows owned by the virtualizer exists, and Kineglyph will mount those charts eagerly.

## A virtualized scroll can represent 5,000 live rows

_Interactive · 5,000 logical rows, 18 reusable DOM rows_

This example virtualizes the rows at the application layer and lets Kineglyph own the chart inside
each pooled row. Scroll quickly: the scrollbar represents all 5,000 services, while the DOM and SVG
counts stay flat. The visible pool continues to receive a new sample every 1.2 seconds.

```kineglyph live id=virtualized-service-list view=preview height=520
import { counterTerminalTheme, figure, material, mountMicrochartBatch } from "kineglyph";

export const theme = counterTerminalTheme;
const TOTAL = 5_000;
const ROW_HEIGHT = 36;
const POOL_SIZE = 18;
const PALETTE = ["#d946ef", "#8b5cf6", "#38bdf8", "#34d399", "#facc15", "#fb7185"];
const valuesFor = (row, tick) => Array.from({ length: 12 }, (_, sample) =>
  Math.max(8, Math.round(24 + (row % 31) * 1.7 + Math.sin(row * .41 + sample * .72 + tick) * 13)),
);

export default figure("virtualized-service-list", {
  title: "Five thousand virtualized service trends",
  description: "A fixed pool of eighteen rows represents five thousand live services.",
}, (f) => {
  f.root(f.row([
    f.stack([f.eyebrow("VIRTUAL TABLE", { tone: "info" }), f.heading("5,000 services")], { gap: 4 }),
    f.code("18 DOM ROWS", { tone: "success" }),
  ], { justify: "between", align: "end", padding: [14, 16], width: "fill", frame: material("raised") }));
});

export function setup(controller) {
  const host = controller.element;
  host.classList.add("kg-virtual-services");
  const style = document.createElement("style");
  style.textContent = `
    .kg-virtual-services .kg-demo-status{display:flex;justify-content:space-between;gap:12px;padding:8px 2px;color:var(--kg-color-text-muted);font:600 11px/1.2 ui-monospace,monospace}
    .kg-virtual-services .kg-demo-viewport{position:relative;height:320px;overflow:auto;overscroll-behavior:contain;border:1px solid var(--kg-color-border);border-radius:10px;background:color-mix(in srgb,var(--kg-color-canvas) 92%,transparent)}
    .kg-virtual-services .kg-demo-spacer{position:relative;width:100%}
    .kg-virtual-services .kg-demo-row{position:absolute;left:0;right:0;display:grid;grid-template-columns:56px minmax(90px,1fr) minmax(90px,2fr) 72px;align-items:center;height:${ROW_HEIGHT}px;padding:0 10px;border-bottom:1px solid color-mix(in srgb,var(--kg-color-border) 62%,transparent);color:var(--kg-color-text);font:600 11px/1 ui-monospace,monospace}
    .kg-virtual-services .kg-demo-row>[role=cell]:first-child{color:var(--kg-color-text-muted)}
    .kg-virtual-services [data-kineglyph-microchart] svg{display:block;width:100%;height:16px;color:var(--kg-row-color,var(--kg-color-info))}
    .kg-virtual-services .kg-demo-latency{text-align:right;color:var(--kg-color-text-muted)}
    @container kg-lab (max-width:520px){.kg-virtual-services .kg-demo-row{grid-template-columns:42px minmax(72px,1fr) minmax(80px,1.4fr) 58px;padding-inline:6px}}
  `;
  const status = document.createElement("div");
  status.className = "kg-demo-status";
  status.innerHTML = `<span>5,000 LOGICAL ROWS</span><span>${POOL_SIZE} ROWS + ${POOL_SIZE} SVGs</span>`;
  const viewport = document.createElement("div");
  viewport.className = "kg-demo-viewport";
  viewport.tabIndex = 0;
  viewport.setAttribute("role", "table");
  viewport.setAttribute("aria-label", "Five thousand virtualized service latency rows");
  viewport.setAttribute("aria-rowcount", String(TOTAL));
  const spacer = document.createElement("div");
  spacer.className = "kg-demo-spacer";
  spacer.style.height = `${TOTAL * ROW_HEIGHT}px`;
  viewport.append(spacer);
  host.append(style, status, viewport);

  const rows = Array.from({ length: POOL_SIZE }, () => {
    const row = document.createElement("div");
    row.className = "kg-demo-row";
    row.setAttribute("role", "row");
    row.innerHTML = `<span role="cell"></span><span role="cell"></span><span role="cell" data-kineglyph-microchart="line">1,2,3</span><span role="cell" class="kg-demo-latency"></span>`;
    spacer.append(row);
    return row;
  });
  const charts = rows.map((row) => row.querySelector("[data-kineglyph-microchart]"));
  const batch = mountMicrochartBatch({ root: spacer, defer: false });
  let tick = 0;

  const render = () => {
    const first = Math.max(0, Math.min(TOTAL - POOL_SIZE, Math.floor(viewport.scrollTop / ROW_HEIGHT) - 4));
    rows.forEach((row, poolIndex) => {
      const index = first + poolIndex;
      const values = valuesFor(index, tick);
      row.style.transform = `translateY(${index * ROW_HEIGHT}px)`;
      row.style.setProperty("--kg-row-color", PALETTE[index % PALETTE.length]);
      row.setAttribute("aria-rowindex", String(index + 1));
      row.children[0].textContent = String(index + 1).padStart(4, "0");
      row.children[1].textContent = `SERVICE-${String(index + 1).padStart(4, "0")}`;
      row.children[3].textContent = `${values.at(-1)} ms`;
      batch.update(charts[poolIndex], values, { label: `Service ${index + 1} recent latency` });
    });
    batch.flush();
  };

  let frame;
  const onScroll = () => {
    if (frame !== undefined) return;
    frame = window.requestAnimationFrame(() => { frame = undefined; render(); });
  };
  const onKeydown = (event) => {
    if (event.key === "End") viewport.scrollTop = viewport.scrollHeight;
    else if (event.key === "Home") viewport.scrollTop = 0;
    else if (event.key === "PageDown") viewport.scrollTop += viewport.clientHeight;
    else if (event.key === "PageUp") viewport.scrollTop -= viewport.clientHeight;
    else return;
    event.preventDefault();
    onScroll();
  };
  viewport.addEventListener("scroll", onScroll, { passive: true });
  viewport.addEventListener("keydown", onKeydown);
  render();
  const timer = window.setInterval(() => { tick += .55; render(); }, 1_200);

  return () => {
    window.clearInterval(timer);
    if (frame !== undefined) window.cancelAnimationFrame(frame);
    viewport.removeEventListener("scroll", onScroll);
    viewport.removeEventListener("keydown", onKeydown);
    batch.destroy();
    style.remove();
    status.remove();
    viewport.remove();
    host.classList.remove("kg-virtual-services");
  };
}
```

## A matrix can contain 1,000 independently updating charts

_Live matrix · 1,000 cells, viewport-sized SVG population_

Here every matrix cell remains addressable, but SVG exists only around the current scrollport.
Updates still target all 1,000 records; the batch retains numbers for offscreen cells and draws them
only if they become visible. Each cell also gets a deterministic profile—frequency, phase, slope,
spike position, chart type, and colour—so density reads as variety rather than cloned decoration.

```kineglyph live id=virtualized-chart-matrix view=preview height=570
import { counterTerminalTheme, figure, material, mountMicrochartBatch } from "kineglyph";

export const theme = counterTerminalTheme;
const TOTAL = 1_000;
const TYPES = ["line", "line", "area", "bar"];
const PALETTE = ["#d946ef", "#8b5cf6", "#38bdf8", "#34d399", "#facc15", "#fb7185"];
const profiles = Array.from({ length: TOTAL }, (_, cell) => {
  const seed = Math.imul(cell + 1, 2_654_435_761) >>> 0;
  return {
    frequency: .3 + ((seed >>> 3) % 9) * .11,
    phase: ((seed >>> 8) % 628) / 100,
    slope: (((seed >>> 15) % 9) - 4) * .85,
    amplitude: 6 + ((seed >>> 20) % 15),
    spike: (seed >>> 27) % 8,
    polarity: seed & 1 ? 1 : -1,
  };
});
const valuesFor = (cell, tick) => {
  const profile = profiles[cell];
  return Array.from({ length: 8 }, (_, sample) => {
    const wave = Math.sin(sample * profile.frequency + profile.phase + tick) * profile.amplitude;
    const harmonic = Math.cos(sample * .47 + profile.phase * 1.7 - tick * .35) * 4;
    const trend = profile.slope * (sample - 3.5);
    const spike = sample === profile.spike ? profile.polarity * (8 + cell % 13) : 0;
    return Math.max(1, Math.round(34 + cell % 23 + wave + harmonic + trend + spike));
  });
};

export default figure("virtualized-chart-matrix", {
  title: "One thousand chart matrix",
  description: "A scrollable matrix retains one thousand trends while mounting only visible SVG.",
}, (f) => {
  f.root(f.row([
    f.stack([f.eyebrow("VIRTUAL MATRIX", { tone: "accent" }), f.heading("1,000 live trends")], { gap: 4 }),
    f.code("ONE OBSERVER", { tone: "success" }),
  ], { justify: "between", align: "end", padding: [14, 16], width: "fill", frame: material("raised") }));
});

export function setup(controller) {
  const host = controller.element;
  host.classList.add("kg-chart-matrix");
  const style = document.createElement("style");
  style.textContent = `
    .kg-chart-matrix .kg-matrix-status{display:flex;justify-content:space-between;padding:8px 2px;color:var(--kg-color-text-muted);font:600 11px/1.2 ui-monospace,monospace}
    .kg-chart-matrix .kg-matrix-viewport{height:360px;overflow:auto;overscroll-behavior:contain;border:1px solid var(--kg-color-border);border-radius:10px;background:color-mix(in srgb,var(--kg-color-canvas) 94%,transparent)}
    .kg-chart-matrix .kg-matrix-grid{display:grid;grid-template-columns:repeat(10,minmax(68px,1fr));min-width:700px;padding:6px;gap:4px}
    .kg-chart-matrix .kg-matrix-cell{display:grid;gap:5px;height:48px;padding:6px;border:1px solid color-mix(in srgb,var(--kg-cell-color) 24%,var(--kg-color-border));border-radius:6px;color:color-mix(in srgb,var(--kg-cell-color) 64%,var(--kg-color-text-muted));font:600 9px/1 ui-monospace,monospace}
    .kg-chart-matrix [data-kineglyph-microchart] svg{display:block;width:100%;height:16px;color:var(--kg-cell-color)}
  `;
  const status = document.createElement("div");
  status.className = "kg-matrix-status";
  const viewport = document.createElement("div");
  viewport.className = "kg-matrix-viewport";
  viewport.tabIndex = 0;
  viewport.setAttribute("aria-label", "Matrix of one thousand live trend charts");
  const grid = document.createElement("div");
  grid.className = "kg-matrix-grid";
  viewport.append(grid);
  host.append(style, status, viewport);

  const cells = Array.from({ length: TOTAL }, (_, index) => {
    const cell = document.createElement("div");
    cell.className = "kg-matrix-cell";
    const profile = profiles[index];
    const type = TYPES[(index + profile.spike) % TYPES.length];
    cell.style.setProperty("--kg-cell-color", PALETTE[(index * 7 + profile.spike) % PALETTE.length]);
    cell.innerHTML = `<span>${type.toUpperCase()} ${String(index + 1).padStart(4, "0")}</span><span data-kineglyph-microchart="${type}" aria-label="Cell ${index + 1} ${type} trend">${valuesFor(index, 0).join(",")}</span>`;
    grid.append(cell);
    return cell.querySelector("[data-kineglyph-microchart]");
  });
  const batch = mountMicrochartBatch({ root: viewport, rootMargin: "100px 0px" });
  let tick = 0;
  let reportFrame;
  const report = () => {
    reportFrame = undefined;
    status.innerHTML = `<span>1,000 RETAINED TRENDS</span><span>${batch.mounted} SVGs MOUNTED</span>`;
  };
  const scheduleReport = () => {
    if (reportFrame !== undefined) return;
    reportFrame = window.requestAnimationFrame(report);
  };
  const onKeydown = (event) => {
    if (event.key === "End") viewport.scrollTop = viewport.scrollHeight;
    else if (event.key === "Home") viewport.scrollTop = 0;
    else if (event.key === "PageDown") viewport.scrollTop += viewport.clientHeight;
    else if (event.key === "PageUp") viewport.scrollTop -= viewport.clientHeight;
    else return;
    event.preventDefault();
    scheduleReport();
  };
  viewport.addEventListener("scroll", scheduleReport, { passive: true });
  viewport.addEventListener("keydown", onKeydown);
  const timer = window.setInterval(() => {
    tick += .6;
    batch.updateMany(cells.map((cell, index) => ({ target: cell, values: valuesFor(index, tick) })));
    scheduleReport();
  }, 1_300);
  scheduleReport();

  return () => {
    window.clearInterval(timer);
    if (reportFrame !== undefined) window.cancelAnimationFrame(reportFrame);
    viewport.removeEventListener("scroll", scheduleReport);
    viewport.removeEventListener("keydown", onKeydown);
    batch.destroy();
    style.remove();
    status.remove();
    viewport.remove();
    host.classList.remove("kg-chart-matrix");
  };
}
```

## Pick the smallest useful tier

| Need                                               | Use                                                   |
| -------------------------------------------------- | ----------------------------------------------------- |
| A few values inside prose                          | `renderMicroSvg()`                                    |
| Hundreds of progressively enhanced cells           | `mountAllMicrocharts()`                               |
| Thousands of scrolling or live cells               | `mountMicrochartBatch()`                              |
| A live figure with layout, themes, and interaction | `mountKineglyph()` + `setSignals()`                   |
| A bursty network feed                              | `connectWebSocket()` feeding either controller        |
| A reproducible file                                | Resolve and export the full scene to SVG, PNG, or GIF |

Microcharts are intentionally not miniature Kineglyph scenes. Full figures are intentionally not
optimized into anonymous table-cell glyphs. Sharing one package family without collapsing those
two jobs is what keeps both paths pleasant.
