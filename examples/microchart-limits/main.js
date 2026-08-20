import { mountMicrocharts } from "@kineglyph/web/micro";
import { mountMicrochartCinema } from "./cinema.js";

const COLORS = ["#5fd1bc", "#8b9cff", "#dc8b5f", "#a5cf70", "#e5809c", "#b6a3e8"];
const TYPES = ["line", "area", "bar", "pie", "donut"];
const ROW_HEIGHT = 53;
const OVERSCAN_ROWS = 4;

const elements = {
  mode: document.querySelector("#mode"),
  count: document.querySelector("#count"),
  samples: document.querySelector("#samples"),
  workload: document.querySelector("#workload"),
  run: document.querySelector("#run"),
  stream: document.querySelector("#stream"),
  viewport: document.querySelector("#viewport"),
  stage: document.querySelector("#stage"),
  generate: document.querySelector("#generate"),
  throughput: document.querySelector("#throughput"),
  mount: document.querySelector("#mount"),
  update: document.querySelector("#update"),
  resident: document.querySelector("#resident"),
  residentDetail: document.querySelector("#resident-detail"),
  status: document.querySelector("#status"),
  longTasks: document.querySelector("#long-tasks"),
};

let charts;
let streamTimer;
let scrollFrame;
let tick = 0;
let virtualState;
let longTaskCount = 0;
let generatorRun = 0;
const generator = new Worker(new URL("./worker.js", import.meta.url), { type: "module" });

const formatMs = (value) => `${value < 10 ? value.toFixed(2) : value.toFixed(1)} ms`;
const formatRate = (value) => `${Math.round(value).toLocaleString()} charts/s`;
const now = () => performance.now();

const valuesFor = (index, sampleCount, phase = 0) => {
  const seed = Math.imul(index + 1, 2_654_435_761) >>> 0;
  const amplitude = 5 + ((seed >>> 16) % 17);
  const frequency = 0.24 + ((seed >>> 4) % 8) * 0.08;
  return Array.from({ length: sampleCount }, (_, sample) =>
    Math.max(
      1,
      Math.round(
        28 + (index % 31) + Math.sin(sample * frequency + phase + index * 0.19) * amplitude,
      ),
    ),
  );
};

const typeFor = (index, workload) => {
  if (workload === "line" || workload === "bar") return workload;
  if (workload === "polar") return index % 2 === 0 ? "pie" : "donut";
  return TYPES[index % TYPES.length];
};

const samplesFor = (workload, sampleCount) => (workload === "polar" ? 4 : sampleCount);

const cellMarkup = (key, logicalIndex, sampleCount, workload) => {
  const type = typeFor(logicalIndex, workload);
  return `<div class="chart-cell" style="--cell-color:${COLORS[logicalIndex % COLORS.length]}">
    <b>CHART ${String(logicalIndex + 1).padStart(5, "0")}</b>
    <span data-kineglyph-microchart="${type}" data-kineglyph-key="${key}">${valuesFor(logicalIndex, samplesFor(workload, sampleCount)).join(",")}</span>
  </div>`;
};

const measureGenerator = (count, sampleCount, workload) => {
  generatorRun += 1;
  const iterations = Math.min(100_000, Math.max(10_000, count));
  elements.generate.textContent = "running";
  elements.throughput.textContent = `${iterations.toLocaleString()} SVG strings in a worker`;
  generator.postMessage({
    id: generatorRun,
    iterations,
    sample: valuesFor(17, samplesFor(workload, sampleCount)),
    types: workload === "mixed" ? TYPES : workload === "polar" ? ["pie", "donut"] : [workload],
  });
};

generator.addEventListener("message", ({ data }) => {
  if (data.id !== generatorRun) return;
  elements.generate.textContent = formatMs(data.elapsed);
  elements.throughput.textContent = `${formatRate(data.rate)} · ${data.averageBytes} B avg`;
});

const updateMetrics = (elapsed, logicalCount) => {
  const resident = charts?.mounted ?? 0;
  elements.update.textContent = formatMs(elapsed);
  elements.resident.textContent = resident.toLocaleString();
  elements.residentDetail.textContent = `${logicalCount.toLocaleString()} logical · ${elements.stage.querySelectorAll("svg").length.toLocaleString()} SVG DOM`;
};

const updateVisible = (logicalCount, sampleCount, workload, force = true) => {
  if (!charts) return undefined;
  if (virtualState) {
    const { layer, rows, columns } = virtualState;
    const totalRows = Math.ceil(logicalCount / columns);
    const firstRow = Math.max(
      0,
      Math.min(
        Math.max(0, totalRows - rows.length),
        Math.floor(elements.viewport.scrollTop / ROW_HEIGHT) - OVERSCAN_ROWS,
      ),
    );
    if (!force && firstRow === virtualState.firstRow) return undefined;
    virtualState.firstRow = firstRow;
    layer.style.transform = `translate3d(0, ${firstRow * ROW_HEIGHT}px, 0)`;
    const updates = [];
    rows.forEach((row, poolRow) => {
      const logicalRow = firstRow + poolRow;
      [...row.children].forEach((cell, column) => {
        const poolIndex = poolRow * columns + column;
        const logicalIndex = logicalRow * columns + column;
        const key = `pool-${poolIndex}`;
        cell.hidden = logicalIndex >= logicalCount;
        if (cell.hidden) return;
        const type = typeFor(logicalIndex, workload);
        cell.style.setProperty("--cell-color", COLORS[logicalIndex % COLORS.length]);
        cell.querySelector("b").textContent = `CHART ${String(logicalIndex + 1).padStart(5, "0")}`;
        const chart = cell.querySelector("[data-kineglyph-microchart]");
        const typeChanged = chart.dataset.kineglyphMicrochart !== type;
        updates.push({
          target: key,
          values: valuesFor(logicalIndex, samplesFor(workload, sampleCount), tick),
          ...(typeChanged ? { options: { type } } : {}),
        });
      });
    });
    const started = now();
    charts.updateMany(updates);
    charts.flush();
    return now() - started;
  } else {
    const updates = {};
    for (let index = 0; index < logicalCount; index += 1) {
      updates[`chart-${index}`] = valuesFor(index, samplesFor(workload, sampleCount), tick);
    }
    const started = now();
    charts.setMany(updates);
    charts.flush();
    return now() - started;
  }
};

const columnsForViewport = () =>
  Math.max(2, Math.min(8, Math.floor(elements.viewport.clientWidth / 108)));

const poolRowsForViewport = (rowCount) =>
  Math.min(rowCount, Math.ceil(elements.viewport.clientHeight / ROW_HEIGHT) + OVERSCAN_ROWS * 2);

const buildVirtual = (count, sampleCount, workload) => {
  const columns = columnsForViewport();
  const rowCount = Math.ceil(count / columns);
  const poolRows = poolRowsForViewport(rowCount);
  elements.stage.className = "virtual-spacer";
  elements.stage.style.height = `${rowCount * ROW_HEIGHT}px`;
  const layer = document.createElement("div");
  layer.className = "virtual-layer";
  layer.style.setProperty("--virtual-columns", columns);
  const rows = Array.from({ length: poolRows }, (_, poolRow) => {
    const row = document.createElement("div");
    row.className = "virtual-row";
    row.style.height = `${ROW_HEIGHT - 1}px`;
    row.innerHTML = Array.from({ length: columns }, (_, column) => {
      const poolIndex = poolRow * columns + column;
      return cellMarkup(`pool-${poolIndex}`, poolIndex, sampleCount, workload);
    }).join("");
    layer.append(row);
    return row;
  });
  elements.stage.append(layer);
  virtualState = { layer, rows, columns, firstRow: -1 };
};

const buildEager = (count, sampleCount, workload) => {
  elements.stage.className = "eager";
  elements.stage.removeAttribute("style");
  elements.stage.innerHTML = Array.from({ length: count }, (_, index) =>
    cellMarkup(`chart-${index}`, index, sampleCount, workload),
  ).join("");
  virtualState = undefined;
};

const stopStream = () => {
  if (streamTimer !== undefined) window.clearInterval(streamTimer);
  streamTimer = undefined;
  elements.stream.setAttribute("aria-pressed", "false");
  elements.stream.textContent = "Start live updates";
};

const run = (anchorIndex = 0) => {
  if (typeof anchorIndex !== "number") anchorIndex = 0;
  stopStream();
  charts?.destroy();
  charts = undefined;
  virtualState = undefined;
  elements.stage.replaceChildren();
  elements.viewport.scrollTop = 0;
  const mode = elements.mode.value;
  const requested = Math.max(100, Math.min(100_000, Number(elements.count.value) || 1000));
  const count = mode === "eager" ? Math.min(10_000, requested) : requested;
  const sampleCount = Number(elements.samples.value);
  const workload = elements.workload.value;
  if (count !== requested) elements.count.value = String(count);
  elements.status.textContent = "Measuring SVG generation…";
  measureGenerator(count, sampleCount, workload);
  const domStarted = now();
  if (mode === "virtual") buildVirtual(count, sampleCount, workload);
  else buildEager(count, sampleCount, workload);
  if (mode === "virtual" && anchorIndex > 0) {
    elements.viewport.scrollTop = Math.floor(anchorIndex / virtualState.columns) * ROW_HEIGHT;
  }
  const domElapsed = now() - domStarted;
  const mountStarted = now();
  charts = mountMicrocharts(elements.stage, { defer: false });
  charts.flush();
  const mountElapsed = now() - mountStarted;
  tick += 0.5;
  const updateElapsed = updateVisible(count, sampleCount, workload, true) ?? 0;
  elements.mount.textContent = formatMs(mountElapsed);
  updateMetrics(updateElapsed, count);
  elements.status.textContent = `${mode === "virtual" ? "Virtual pool" : "Eager DOM"}: ${formatMs(domElapsed)} to build host cells; ${formatMs(mountElapsed)} to mount.`;
};

const stream = () => {
  if (streamTimer !== undefined) {
    stopStream();
    elements.status.textContent = "Live updates paused.";
    return;
  }
  const count = Number(elements.count.value);
  const sampleCount = Number(elements.samples.value);
  const workload = elements.workload.value;
  elements.stream.setAttribute("aria-pressed", "true");
  elements.stream.textContent = "Pause live updates";
  streamTimer = window.setInterval(() => {
    tick += 0.35;
    const elapsed = updateVisible(count, sampleCount, workload, true) ?? 0;
    updateMetrics(elapsed, count);
    elements.status.textContent = `Live frame ${tick.toFixed(0)} · ${formatMs(elapsed)} synchronous update cost.`;
  }, 500);
};

const onScroll = () => {
  if (!virtualState || scrollFrame !== undefined) return;
  scrollFrame = requestAnimationFrame(() => {
    scrollFrame = undefined;
    const elapsed = updateVisible(
      Number(elements.count.value),
      Number(elements.samples.value),
      elements.workload.value,
      false,
    );
    if (elapsed !== undefined) updateMetrics(elapsed, Number(elements.count.value));
  });
};

elements.run.addEventListener("click", () => run());
elements.stream.addEventListener("click", stream);
elements.viewport.addEventListener("scroll", onScroll, { passive: true });
elements.viewport.addEventListener("keydown", (event) => {
  if (event.key === "End") elements.viewport.scrollTop = elements.viewport.scrollHeight;
  else if (event.key === "Home") elements.viewport.scrollTop = 0;
  else if (event.key === "PageDown") elements.viewport.scrollTop += elements.viewport.clientHeight;
  else if (event.key === "PageUp") elements.viewport.scrollTop -= elements.viewport.clientHeight;
  else return;
  event.preventDefault();
  onScroll();
});

if ("PerformanceObserver" in window) {
  try {
    const observer = new PerformanceObserver((list) => {
      longTaskCount += list.getEntries().length;
      elements.longTasks.textContent = `${longTaskCount} long task${longTaskCount === 1 ? "" : "s"}`;
    });
    observer.observe({ type: "longtask", buffered: true });
  } catch {}
}

let resizeTimer;
new ResizeObserver(() => {
  if (!virtualState || resizeTimer !== undefined) return;
  resizeTimer = window.setTimeout(() => {
    resizeTimer = undefined;
    if (!virtualState) return;
    const count = Number(elements.count.value);
    const rowCount = Math.ceil(count / virtualState.columns);
    const columnsChanged = columnsForViewport() !== virtualState.columns;
    const poolChanged = poolRowsForViewport(rowCount) !== virtualState.rows.length;
    if (!columnsChanged && !poolChanged) return;
    const anchorIndex = Math.floor(elements.viewport.scrollTop / ROW_HEIGHT) * virtualState.columns;
    run(anchorIndex);
  }, 100);
}).observe(elements.viewport);

mountMicrochartCinema();
run();
