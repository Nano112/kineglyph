import {
  alphaGradient,
  createTheme,
  cubicBezier,
  figure,
  linearGradient,
  spring,
  type SceneDefinition,
} from "@kineglyph/core";
import { area, dot, line, plot, range, rule } from "@kineglyph/plot";
import type { CatalogueEntry } from "../catalogue.js";

const samples = [
  { second: 0, active: 8 },
  { second: 1, active: 21 },
  { second: 2, active: 39 },
  { second: 3, active: 62 },
  { second: 4, active: 78 },
  { second: 5, active: 86 },
  { second: 6, active: 82 },
  { second: 7, active: 88 },
  { second: 8, active: 84 },
  { second: 9, active: 87 },
];

const drawCurve = cubicBezier(0.16, 1, 0.3, 1);
const settleCurve = spring({ frequency: 9.5, damping: 7.5 });

/** An editorial theme used by the README render; the scene itself remains theme-agnostic. */
export const throughputPaperTheme = createTheme({
  name: "paper-pastel",
  colors: {
    canvas: "#eeeae0",
    surface: "#f7f2e7",
    surfaceRaised: "#fffaf0",
    surfaceMuted: "#e9e2d4",
    text: "#292822",
    textMuted: "#716e63",
    accent: "#a16f93",
    accentContrast: "#fffaf0",
    info: "#789fc0",
    success: "#729d7b",
    warning: "#c39a55",
    danger: "#c77d77",
    connector: "#9c978a",
    border: "#d2cabc",
    chart1: "#6fae9e",
    chart2: "#9386b8",
    chart3: "#d18a73",
    chart4: "#c8aa60",
    chart5: "#c78496",
    chart6: "#7f9eba",
    chartPositive: "#729d7b",
    chartNegative: "#c77d77",
    chartNeutral: "#9c978a",
  },
  radii: { sm: 7, md: 12, lg: 18 },
  typography: {
    body: {
      family: '"Geist Mono", ui-monospace, monospace',
      size: 14,
      lineHeight: 21,
      weight: 450,
    },
    bodyStrong: {
      family: '"Geist Mono", ui-monospace, monospace',
      size: 15,
      lineHeight: 21,
      weight: 650,
    },
    caption: {
      family: '"Geist Mono", ui-monospace, monospace',
      size: 12,
      lineHeight: 17,
      weight: 450,
    },
    label: {
      family: '"Geist Mono", ui-monospace, monospace',
      size: 11,
      lineHeight: 15,
      weight: 650,
      letterSpacing: 0.65,
    },
    title: {
      family: '"Geist Mono", ui-monospace, monospace',
      size: 22,
      lineHeight: 27,
      weight: 650,
      letterSpacing: -0.4,
    },
    display: {
      family: '"Geist Mono", ui-monospace, monospace',
      size: 36,
      lineHeight: 40,
      weight: 700,
      letterSpacing: -0.8,
    },
    code: {
      family: '"Geist Mono", ui-monospace, monospace',
      size: 13,
      lineHeight: 18,
      weight: 500,
    },
  },
  motion: {
    fast: 140,
    normal: 300,
    slow: 680,
    easing: drawCurve,
  },
  strokes: { hairline: 1, thin: 1.25, regular: 1.75, bold: 2.5 },
  ornament: { grid: "lines", surface: "outlined", lineCap: "round", eyebrow: true },
});

/** A typed plot composed with ordinary nodes inside one framed, animated surface. */
export const throughputOverTimeScene: SceneDefinition = figure(
  "throughput-over-time",
  {
    title: "Active chunks over time",
    description:
      "An illustrative stream trace sits inside a status card with a live value, operating band, target, and summary measurements.",
    metadata: { data: "illustrative", family: "quantitative", composition: "plot-in-card" },
  },
  (f) => {
    const trend = plot(samples, {
      id: "stream-trend",
      x: "second",
      y: "active",
      marks: [
        area({
          fill: alphaGradient("chart1", { from: 0.5, to: 0.015, angle: 90 }),
          fillOpacity: 1,
          curve: "monotone",
        }),
        line({ tone: "chart1", curve: "monotone", interactive: "series" }),
        dot({ tone: "chart1", pointRadius: 3, interactive: "marks" }),
      ],
      description:
        "Active chunks rise from 8 to the mid-eighties, then remain inside a 75-to-92 chunk operating band.",
      axes: {
        x: { label: "Elapsed time (s)", nice: false, ticks: { wide: 7, compact: 5, narrow: 4 } },
        y: { label: "Active chunks", domain: [0, 100], nice: false },
      },
      annotations: [
        range({ y: [75, 92], tone: "success" }),
        rule({ y: 80, tone: "success", dash: "dashed" }),
      ],
      grid: "y",
      legend: false,
      height: { wide: 230, compact: 210, narrow: 180 },
      motion: "auto",
      duration: 1350,
      easing: drawCurve,
    });
    const chart = f.add(trend);

    const heading = f.stack(
      [
        f.eyebrow("STREAM SAMPLE", { tone: "accent", id: "sample-label" }),
        f.title("Active chunks", { id: "sample-title" }),
        f.caption("One observation per second", { id: "sample-caption" }),
      ],
      { id: "sample-heading", gap: 3, grow: 1 },
    );
    const current = f.stack(
      [
        f.title("87", { id: "current-value", align: "end" }),
        f.eyebrow("ACTIVE NOW", { id: "current-label", align: "end", tone: "success" }),
      ],
      { id: "current", gap: 2, width: 132, align: "end" },
    );
    const header = f.row([heading, current], {
      id: "sample-header",
      width: "fill",
      align: "end",
      justify: "between",
      gap: 24,
    });

    const stat = (id: string, value: string, label: string) =>
      f.stack([f.heading(value, { id: `${id}-value` }), f.caption(label, { id: `${id}-label` })], {
        id,
        width: "fill",
        gap: 2,
        padding: [10, 12],
        frame: { fill: "surfaceMuted", stroke: "border", radius: 6 },
      });
    const average = stat("average", "71.5", "mean active");
    const peak = stat("peak", "88", "peak active");
    const settled = stat("settled", "4 s", "to steady band");
    const target = stat("target", "80", "target active");
    const stats = f.grid([average, peak, settled, target], {
      id: "sample-stats",
      columns: { wide: 4, compact: 2 },
      gap: 10,
      width: "fill",
    });

    const card = f.stack([header, chart, stats], {
      id: "stream-card",
      width: "fill",
      gap: { wide: 20, compact: 16, narrow: 14 },
      padding: { wide: [24, 26], compact: [22, 22], narrow: [18, 16] },
      frame: {
        fill: linearGradient(
          [
            { at: 0, color: "surfaceRaised" },
            { at: 0.58, color: "surface" },
            { at: 1, color: "surfaceMuted" },
          ],
          { angle: 118 },
        ),
        stroke: "border",
        radius: 12,
      },
      clip: true,
    });
    f.root(card);

    f.sequence(
      [
        [
          f.reveal(heading, { offset: 8, easing: drawCurve }),
          f.reveal(current, { offset: -8, easing: drawCurve }),
        ],
        f.reveal(chart),
        f.reveal([average, peak, settled, target], {
          stagger: 90,
          offset: 6,
          scale: 0.97,
          easing: settleCurve,
        }),
      ],
      { gap: 90 },
    );
  },
);

export const throughputOverTimeEntry: CatalogueEntry = {
  slug: "throughput-over-time",
  order: 91,
  title: "Plot in a card",
  summary: "A gradient area plot, live value, and summary measurements share one framed surface.",
  concept: "A plot is a composable scene fragment, not a special full-canvas widget.",
  interaction: "Inspect the line as a series or focus individual sampled dots.",
  animation: "The header arrives, the area and line draw together, then the measurements settle.",
  source: "Kineglyph quantitative example; all values are illustrative.",
  scene: throughputOverTimeScene,
};
