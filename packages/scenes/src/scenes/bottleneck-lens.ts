import { figure, type SceneDefinition } from "@kineglyph/core";
import { dot, line, plot } from "@kineglyph/plot";
import type { CatalogueEntry } from "../catalogue.js";

/** Controls select a reading of the same chart; series groups respond through ordinary bindings. */
export const bottleneckLensScene: SceneDefinition = figure(
  "bottleneck-lens",
  {
    title: "The same chart can answer different operational questions",
    description:
      "A state-machine lens highlights illustrative read or write pressure and updates the interpretation without replacing the chart.",
    metadata: { data: "illustrative", family: "quantitative" },
  },
  (f) => {
    const heading = f.heading("Select the pressure you want to explain");
    const result = plot(
      [
        { second: 0, reads: 18, writes: 12 },
        { second: 1, reads: 28, writes: 19 },
        { second: 2, reads: 44, writes: 31 },
        { second: 3, reads: 58, writes: 47 },
        { second: 4, reads: 63, writes: 68 },
        { second: 5, reads: 66, writes: 82 },
        { second: 6, reads: 71, writes: 76 },
        { second: 7, reads: 74, writes: 69 },
      ],
      {
        id: "pressure-chart",
        x: "second",
        y: ["reads", "writes"],
        marks: [line({ curve: "monotone" }), dot({ pointRadius: 3 })],
        title: "Illustrative streaming pressure",
        description:
          "Read and write pressure over eight seconds. Use the controls to isolate a series and change the interpretation.",
        axes: {
          x: { label: "Elapsed time (s)", nice: false },
          y: { label: "Queue pressure (%)", domain: [0, 100], nice: false },
        },
        grid: "y",
        legend: { position: "top" },
        seriesBindings: {
          reads: { opacity: "readsOpacity", highlight: "readsFocus" },
          writes: { opacity: "writesOpacity", highlight: "writesFocus" },
        },
        height: { wide: 244, compact: 214, narrow: 180 },
        motion: "auto",
        duration: 1050,
      },
    );
    const chart = f.add(result);
    const interpretation = f.callout(
      "Both queues climb together until write pressure briefly becomes the limiting path.",
      { tone: "info", bind: { text: "interpretation" } },
    );
    f.stack([heading, chart, interpretation], {
      gap: { wide: 18, compact: 16, narrow: 14 },
      width: "fill",
    });
    f.sequence([
      f.reveal(heading, { offset: 8 }),
      f.reveal(chart),
      f.reveal(interpretation, { offset: 6 }),
    ]);
    f.machine({
      initial: "all",
      states: {
        all: { on: { SHOW_READS: "reads", SHOW_WRITES: "writes", SHOW_ALL: "all" } },
        reads: { on: { SHOW_READS: "reads", SHOW_WRITES: "writes", SHOW_ALL: "all" } },
        writes: { on: { SHOW_READS: "reads", SHOW_WRITES: "writes", SHOW_ALL: "all" } },
      },
      signals: {
        readsOpacity: {
          when: { state: ["all", "reads"] },
          then: 1,
          else: 0.24,
        },
        writesOpacity: {
          when: { state: ["all", "writes"] },
          then: 1,
          else: 0.24,
        },
        readsFocus: { when: { state: "reads" }, then: 1, else: 0 },
        writesFocus: { when: { state: "writes" }, then: 1, else: 0 },
        interpretation: {
          match: { state: true },
          cases: {
            reads:
              "Read pressure rises steadily but stays below 75%; prefetching remains ahead of demand.",
            writes:
              "Write pressure overtakes reads at 4 s and peaks at 82%; commit throughput is the short-lived bottleneck.",
          },
          default:
            "Both queues climb together until write pressure briefly becomes the limiting path.",
        },
      },
    });
    f.controls([
      { label: "Both", event: "SHOW_ALL", activeWhen: { state: "all" }, group: "lens" },
      { label: "Reads", event: "SHOW_READS", activeWhen: { state: "reads" }, group: "lens" },
      {
        label: "Writes",
        event: "SHOW_WRITES",
        activeWhen: { state: "writes" },
        group: "lens",
      },
    ]);
  },
);

export const bottleneckLensEntry: CatalogueEntry = {
  slug: "bottleneck-lens",
  order: 93,
  title: "State-machine chart lens",
  summary: "Controls dim, highlight, and reinterpret meaningful series in one stable chart.",
  concept: "Stateful quantitative explanation, not a static dashboard screenshot.",
  interaction: "Choose Both, Reads, or Writes to isolate the operational story in the same data.",
  animation:
    "Both lines draw once; machine states then change emphasis without rebuilding the plot.",
  source: "Kineglyph quantitative example; all values are illustrative.",
  scene: bottleneckLensScene,
};
