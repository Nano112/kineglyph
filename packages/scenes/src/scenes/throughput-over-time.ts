import { figure, type SceneDefinition } from "@kineglyph/core";
import { area, dot, line, plot, range, rule } from "@kineglyph/plot";
import type { CatalogueEntry } from "../catalogue.js";

/** A single series expressed as three coordinated layers: context, trajectory, and samples. */
export const throughputOverTimeScene: SceneDefinition = figure(
  "throughput-over-time",
  {
    title: "A time series can carry context without losing the data",
    description:
      "An illustrative active-chunk trace combines an area, monotone line, sample dots, and an operating band.",
    metadata: { data: "illustrative", family: "quantitative" },
  },
  (f) => {
    const heading = f.heading("Streaming settles into a steady operating band");
    const trend = plot(
      [
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
      ],
      {
        id: "stream-trend",
        x: "second",
        y: "active",
        marks: [
          area({ tone: "chart1", curve: "monotone" }),
          line({ tone: "chart1", curve: "monotone", interactive: "series" }),
          dot({ tone: "chart1", pointRadius: 3, interactive: "marks" }),
        ],
        title: "Illustrative active chunks during a stream",
        description:
          "Active chunks rise from 8 to the mid-eighties, then remain inside a 75-to-92 chunk operating band.",
        axes: {
          x: { label: "Elapsed time (s)", nice: false, ticks: { wide: 7, compact: 5, narrow: 4 } },
          y: { label: "Active chunks", domain: [0, 100], nice: false },
        },
        annotations: [
          range({ y: [75, 92], label: "steady operating band", tone: "success" }),
          rule({ y: 80, tone: "success", dash: "dashed" }),
        ],
        grid: "y",
        legend: false,
        height: { wide: 260, compact: 220, narrow: 180 },
        motion: "auto",
        duration: 1100,
      },
    );
    const chart = f.add(trend);
    const note = f.caption(
      "Illustrative trace. The area shows load, the line preserves trajectory, and the dots expose the sampled observations.",
    );
    f.stack([heading, chart, note], {
      gap: { wide: 18, compact: 16, narrow: 14 },
      width: "fill",
    });
    f.sequence([f.reveal(heading, { offset: 8 }), f.reveal(chart), f.reveal(note, { offset: 6 })]);
  },
);

export const throughputOverTimeEntry: CatalogueEntry = {
  slug: "throughput-over-time",
  order: 91,
  title: "Layered time series",
  summary: "Area, line, dots, and annotations share one scale and one typed series handle.",
  concept: "A layered quantitative narrative rather than a node-and-edge explainer.",
  interaction: "Inspect the line as a series or focus individual sampled dots.",
  animation: "The area and line draw across time before the sample points settle into place.",
  source: "Kineglyph quantitative example; all values are illustrative.",
  scene: throughputOverTimeScene,
};
