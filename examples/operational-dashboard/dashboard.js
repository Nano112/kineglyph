import {
  gaugeChart,
  counterTerminalTheme,
  figure,
  line,
  material,
  mountKineglyph,
  mountMicrochartBatch,
  plot,
  plotRule,
  timelineChart,
  topology,
} from "@kineglyph/web/bundle";

const path = (values) => {
  const min = Math.min(...values);
  const max = Math.max(...values);
  return `M${values
    .map((value, index) => {
      const x = (index / Math.max(1, values.length - 1)) * 100;
      const y = max === min ? 14 : ((max - value) / (max - min)) * 28;
      return `${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join("L")}`;
};

const initialTraffic = Array.from({ length: 24 }, (_, index) =>
  Math.round(12_400 + Math.sin(index * 0.64) * 1_350 + (index % 7) * 90),
);
const initialLatency = Array.from({ length: 24 }, (_, index) =>
  Math.round(72 + Math.sin(index * 0.71 + 1.2) * 19 + (index % 9 === 0 ? 24 : 0)),
);

const overview = figure(
  "operations-overview",
  {
    title: "Production overview",
    description: "Live request rate, p95 latency, error rate, and availability instruments.",
    signals: {
      stream: "LIVE · DEMO",
      streamTone: "success",
      requests: "12,400 /s",
      p95: "84 ms",
      errors: "0.18%",
      availability: "99.98%",
      trafficPath: path(initialTraffic),
      latencyPath: path(initialLatency),
    },
  },
  (f) => {
    const metric = (eyebrow, value, signal, tone, trend, trendSignal) =>
      f.stack(
        [
          f.eyebrow(eyebrow, { tone: "textMuted" }),
          f.code(value, { textStyle: "title", tone, bind: { text: signal } }),
          f.path(
            path(trend),
            { width: 100, height: 28 },
            {
              width: "fill",
              height: 32,
              fill: "none",
              stroke: tone,
              strokeWidth: 2.2,
              label: `${eyebrow} rolling trend`,
              bind: { path: trendSignal },
            },
          ),
        ],
        { gap: 7, padding: 14, width: "fill", frame: material("flat") },
      );

    const metrics = [
      metric("REQUEST RATE", "12,400 /s", "requests", "accent", initialTraffic, "trafficPath"),
      metric("P95 LATENCY", "84 ms", "p95", "warning", initialLatency, "latencyPath"),
      f.stack(
        [
          f.eyebrow("ERROR RATE", { tone: "textMuted" }),
          f.code("0.18%", { textStyle: "title", tone: "danger", bind: { text: "errors" } }),
          f.body("5 minute rolling window", { tone: "textMuted" }),
        ],
        { gap: 7, padding: 14, width: "fill", frame: material("flat") },
      ),
      f.stack(
        [
          f.eyebrow("AVAILABILITY", { tone: "textMuted" }),
          f.code("99.98%", {
            textStyle: "title",
            tone: "success",
            bind: { text: "availability" },
          }),
          f.body("30 day objective · 99.95%", { tone: "textMuted" }),
        ],
        { gap: 7, padding: 14, width: "fill", frame: material("flat") },
      ),
    ];

    f.root(
      f.stack(
        [
          f.row(
            [
              f.stack([f.eyebrow("OPERATIONAL VIEW"), f.heading("Production overview")], {
                gap: 4,
              }),
              f.badge("LIVE · DEMO", { bind: { text: "stream", tone: "streamTone" } }),
            ],
            { width: "fill", justify: "between", align: "center" },
          ),
          f.grid(metrics, { columns: { wide: 4, compact: 2, narrow: 1 }, gap: 10, width: "fill" }),
        ],
        {
          gap: 16,
          padding: { wide: 18, compact: 14, narrow: 10 },
          width: "fill",
          frame: material("raised"),
        },
      ),
    );
  },
);

const latencyRows = Array.from({ length: 24 }, (_, minute) => ({
  minute,
  p50: Math.round(34 + Math.sin(minute * 0.48) * 6),
  p95: initialLatency[minute] ?? 72,
  p99: Math.round((initialLatency[minute] ?? 72) * 1.36),
}));

const latencyScene = (motion = "none") =>
  figure("operations-latency", { title: "Latency percentiles" }, (f) => {
    const chart = f.add(
      plot(latencyRows, {
        id: "latency-window",
        x: "minute",
        y: ["p50", "p95", "p99"],
        marks: line({ strokeWidth: 2.4 }),
        annotations: [plotRule({ y: 120, label: "SLO 120 ms", tone: "danger", dash: "dashed" })],
        axes: {
          x: { label: "newest sample →", ticks: { wide: 6, narrow: 3 } },
          y: { label: "milliseconds", ticks: { wide: 5, narrow: 3 } },
        },
        grid: "y",
        height: { wide: 270, compact: 250, narrow: 220 },
        motion,
      }),
    );
    f.root(
      f.stack([chart], {
        width: "fill",
        padding: { wide: 14, compact: 12, narrow: 8 },
      }),
    );
  });

const dependencyNodes = [
  { id: "edge", label: "Edge", x: 0.1, y: 0.5 },
  { id: "auth", label: "Auth", x: 0.32, y: 0.23 },
  { id: "catalog", label: "Catalog", x: 0.32, y: 0.72 },
  { id: "checkout", label: "Checkout", x: 0.57, y: 0.5 },
  { id: "events", label: "Events", x: 0.8, y: 0.25 },
  { id: "workers", label: "Workers", x: 0.88, y: 0.72 },
];
const dependencyLinks = [
  ["edge", "auth"],
  ["edge", "catalog"],
  ["auth", "checkout"],
  ["catalog", "checkout"],
  ["checkout", "events"],
  ["events", "workers"],
];

const serviceTone = (name) => {
  const state = services.find((service) => service.name === name)?.state;
  return state === "critical" ? "danger" : state === "warning" ? "warning" : "success";
};

const topologyScene = (motion = "none") =>
  figure("operations-topology", { title: "Request path" }, (f) => {
    const graph = topology({
      id: "request-path",
      height: 270,
      motion,
      nodes: dependencyNodes.map((node) => ({
        ...node,
        tone: node.id === "edge" ? "info" : serviceTone(node.id),
      })),
      links: dependencyLinks.map(([source, target]) => ({
        source,
        target,
        directed: true,
        tone: serviceTone(target),
      })),
    });
    const added = f.add(graph);
    f.root(
      f.stack([added], {
        width: "fill",
        padding: { wide: 14, compact: 12, narrow: 8 },
      }),
    );
    if (motion === "auto")
      f.sequence(
        (graph.fragment.edges ?? []).map((edge) => f.flow(edge.id, { duration: 900 })),
        { gap: 80 },
      );
  });

const capacity = { cpu: 58, memory: 71, queue: 42 };
const gauge = (id, label, value, unit = "%") =>
  gaugeChart({
    id,
    label,
    value,
    min: 0,
    max: 100,
    unit,
    thresholds: [
      { value: 70, tone: "success", label: "Healthy" },
      { value: 85, tone: "warning", label: "Elevated" },
      { value: 100, tone: "danger", label: "Critical" },
    ],
    height: 190,
    motion: "none",
  });

const capacityScene = () =>
  figure("operations-capacity", { title: "Resource saturation" }, (f) => {
    const gauges = [
      f.add(gauge("cpu-gauge", "CPU", capacity.cpu)),
      f.add(gauge("memory-gauge", "Memory", capacity.memory)),
      f.add(gauge("queue-gauge", "Queue", capacity.queue)),
    ];
    f.root(
      f.grid(gauges, {
        columns: { wide: 3, compact: 3, narrow: 1 },
        gap: 8,
        width: "fill",
        padding: { wide: 10, compact: 8, narrow: 6 },
      }),
    );
  });

const operationalEvents = [
  { event: "deploy 91c2", start: 1, end: 2.5, tone: "info" },
  { event: "cache warm", start: 3.2, end: 5.4, tone: "success" },
  { event: "queue alert", start: 7.1, end: 8.4, tone: "warning" },
];

const eventsScene = (motion = "none") =>
  figure("operations-events", { title: "Deployments and incidents" }, (f) => {
    const events = f.add(
      timelineChart(operationalEvents, {
        id: "operations-events-window",
        label: "event",
        start: "start",
        end: "end",
        tone: "tone",
        height: 250,
        motion,
      }),
    );
    f.root(
      f.stack([events], {
        width: "fill",
        padding: { wide: 14, compact: 12, narrow: 8 },
      }),
    );
  });

const serviceSeeds = [
  ["auth", "us-east", 54],
  ["catalog", "eu-west", 72],
  ["checkout", "us-east", 91],
  ["events", "ap-southeast", 64],
  ["media", "eu-west", 118],
  ["search", "ap-southeast", 83],
  ["sessions", "us-east", 47],
  ["workers", "eu-west", 76],
];

const services = serviceSeeds.map(([name, region, baseline], serviceIndex) => ({
  name,
  region,
  baseline,
  history: Array.from({ length: 24 }, (_, index) =>
    Math.round(
      baseline + Math.sin(index * 0.69 + serviceIndex) * 16 + ((index + serviceIndex) % 8),
    ),
  ),
  errors: 0.08 + serviceIndex * 0.025,
  state: "healthy",
}));

const rows = document.querySelector("#service-rows");
const rowHandles = services.map((service) => {
  const row = document.createElement("tr");
  row.dataset.region = service.region;

  const name = document.createElement("td");
  name.className = "service-name";
  name.textContent = service.name;

  const region = document.createElement("td");
  region.textContent = service.region;

  const trendCell = document.createElement("td");
  const trend = document.createElement("span");
  trend.className = "trend";
  trend.dataset.kineglyphMicrochart = "line";
  trend.dataset.width = "112";
  trend.dataset.height = "24";
  trend.setAttribute("aria-label", `${service.name} latency over the latest 24 samples`);
  trend.textContent = service.history.join(",");
  trendCell.append(trend);

  const latency = document.createElement("td");
  latency.textContent = `${service.history.at(-1)} ms`;

  const errors = document.createElement("td");
  errors.textContent = `${service.errors.toFixed(2)}%`;

  const state = document.createElement("td");
  state.className = "state";
  state.textContent = service.state;

  row.append(name, region, trendCell, latency, errors, state);
  rows.append(row);
  return { row, trend, latency, errors, state };
});

const overviewController = mountKineglyph(document.querySelector("#overview-glyph"), {
  scene: overview,
  theme: counterTerminalTheme,
  controls: "auto",
  readout: "auto",
});
const latencyController = mountKineglyph(document.querySelector("#latency-glyph"), {
  scene: latencyScene("auto"),
  theme: counterTerminalTheme,
  controls: false,
  readout: false,
});
const topologyController = mountKineglyph(document.querySelector("#topology-glyph"), {
  scene: topologyScene("auto"),
  theme: counterTerminalTheme,
  controls: false,
  readout: false,
});
const capacityController = mountKineglyph(document.querySelector("#capacity-glyph"), {
  scene: capacityScene(),
  theme: counterTerminalTheme,
  controls: false,
  readout: false,
});
const eventsController = mountKineglyph(document.querySelector("#events-glyph"), {
  scene: eventsScene("auto"),
  theme: counterTerminalTheme,
  controls: false,
  readout: false,
});
const microcharts = mountMicrochartBatch({
  root: document,
  selector: "#service-rows [data-kineglyph-microchart]",
  defer: "visible",
  recycle: true,
});

const traffic = [...initialTraffic];
const latencyHistory = [...initialLatency];
let tick = 0;
let paused = false;

const update = () => {
  if (paused) return;
  tick += 1;
  const updates = [];

  services.forEach((service, index) => {
    const burst = (tick + index * 3) % 19 === 0 ? 54 : 0;
    const next = Math.max(
      18,
      Math.round(service.baseline + Math.sin(tick * 0.73 + index * 1.17) * 17 + burst),
    );
    service.history.shift();
    service.history.push(next);
    service.errors = Math.max(0.01, service.errors + Math.sin(tick * 0.41 + index) * 0.018);
    service.state = next > 140 ? "critical" : next > 105 ? "warning" : "healthy";

    const handle = rowHandles[index];
    handle.latency.textContent = `${next} ms`;
    handle.errors.textContent = `${service.errors.toFixed(2)}%`;
    handle.state.textContent = service.state;
    handle.state.dataset.state = service.state;
    handle.trend.dataset.state = service.state;
    updates.push({ target: handle.trend, values: service.history });
  });

  microcharts.updateMany(updates);
  const totalRequests = Math.round(12_800 + Math.sin(tick * 0.52) * 1_600 + (tick % 5) * 110);
  const p95 = Math.max(...services.map((service) => service.history.at(-1)));
  const errorRate = services.reduce((sum, service) => sum + service.errors, 0) / services.length;
  traffic.shift();
  traffic.push(totalRequests);
  latencyHistory.shift();
  latencyHistory.push(p95);
  latencyRows.shift();
  latencyRows.push({
    minute: tick + 24,
    p50: Math.round(p95 * 0.46),
    p95,
    p99: Math.round(p95 * 1.34),
  });
  capacity.cpu = Math.max(18, Math.min(98, Math.round(54 + Math.sin(tick * 0.37) * 25)));
  capacity.memory = Math.max(28, Math.min(96, Math.round(capacity.memory + Math.sin(tick * 0.23))));
  capacity.queue = Math.max(
    8,
    Math.min(100, Math.round(35 + errorRate * 90 + (p95 > 140 ? 35 : 0))),
  );

  if (p95 > 140 && !operationalEvents.some((event) => event.event === `latency ${tick}`)) {
    const start = Math.round((8.8 + (tick % 5) * 0.12) * 100) / 100;
    operationalEvents.push({
      event: `latency ${tick}`,
      start,
      end: Math.round((start + 0.9) * 100) / 100,
      tone: "danger",
    });
    if (operationalEvents.length > 5) operationalEvents.shift();
  }

  overviewController.setSignals({
    stream: `LIVE · ${String(tick).padStart(3, "0")}`,
    streamTone: p95 > 140 ? "danger" : p95 > 105 ? "warning" : "success",
    requests: `${new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(totalRequests)} /s`,
    p95: `${p95} ms`,
    errors: `${errorRate.toFixed(2)}%`,
    availability: `${(100 - errorRate / 8).toFixed(3)}%`,
    trafficPath: path(traffic),
    latencyPath: path(latencyHistory),
  });
  latencyController.setScene(latencyScene());
  topologyController.setScene(topologyScene());
  capacityController.setScene(capacityScene());
  eventsController.setScene(eventsScene());
};

const timer = window.setInterval(update, 1_000);
const pause = document.querySelector("#pause-feed");
const feedStatus = document.querySelector("#feed-status");
pause.addEventListener("click", () => {
  paused = !paused;
  pause.textContent = paused ? "Resume feed" : "Pause feed";
  pause.setAttribute("aria-pressed", String(paused));
  feedStatus.textContent = paused ? "Demo feed · paused" : "Demo feed · live";
  overviewController.setSignals({
    stream: paused ? "PAUSED" : `LIVE · ${String(tick).padStart(3, "0")}`,
    streamTone: paused ? "textMuted" : "success",
  });
});

document.querySelector("#region-filter").addEventListener("change", (event) => {
  const selected = event.currentTarget.value;
  rowHandles.forEach(({ row }) => {
    row.hidden = selected !== "all" && row.dataset.region !== selected;
  });
});

window.addEventListener(
  "pagehide",
  () => {
    window.clearInterval(timer);
    microcharts.destroy();
    overviewController.destroy();
    latencyController.destroy();
    topologyController.destroy();
    capacityController.destroy();
    eventsController.destroy();
  },
  { once: true },
);
