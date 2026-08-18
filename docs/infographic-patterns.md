# Editorial infographic patterns

Technical graphics can explain a process, measure a change, or let the reader test a claim. This
page collects reusable editorial patterns inspired by the unusually strong instruments in
[Bun's Rust rewrite story](https://bun.com/blog/bun-in-rust), rebuilt as original Kineglyph scenes
with different data and the binary-counter visual language.

The point is not to copy one article's art direction. It is to prove that the same small API can
carry a narrative workflow, hundreds of dense cells, a quantitative timeline, and a compact
comparison. Every figure below is editable.

## A process should expose its state

_Interactive · choose any stage in place_

The strongest workflow graphics are not generic arrows between boxes. Each stage has a distinct
job, the completed path stays visible, and the current state explains what changed. Select a card
to move the review forward or backward.

```kineglyph live id=editorial-review-loop view=preview height=330
import { counterTerminalTheme, figure, material } from "kineglyph";

export const theme = counterTerminalTheme;

const stages = [
  ["draft", "01", "IMPLEMENT", "Write the smallest complete patch", "code", "accent"],
  ["test", "10", "TEST", "Make the claim executable", "signal", "info"],
  ["review", "11", "REVIEW", "Attack assumptions and edge cases", "eye", "warning"],
  ["merge", "00", "MERGE", "Record the accepted explanation", "merge", "success"],
];
const messages = {
  draft: "A concrete proposal now exists.",
  test: "The proposal survives a reproducible check.",
  review: "A second perspective is looking for the hidden failure.",
  merge: "Code, evidence, and explanation agree.",
};

export default figure("editorial-review-loop", {
  title: "A review loop with visible state",
  description: "Four selectable stages move a change from implementation through tests and review to merge.",
}, (f) => {
  const cards = stages.map(([id, binary, title, body, motif, tone]) => f.card({
    id: `stage-${id}`,
    eyebrow: binary,
    title,
    body,
    motif,
    tone,
    compact: true,
    frame: material("raised"),
    interactive: true,
    onActivate: id.toUpperCase(),
    label: `Choose ${title.toLowerCase()} stage`,
    description: body,
    bind: { highlight: id },
  }));
  const status = f.stack([
    f.row([
      f.eyebrow("CURRENT STATE", { tone: "warning" }),
      f.code("DRAFT", { tone: "warning", bind: { text: "stageName" } }),
    ], { justify: "between", width: "fill" }),
    f.body("A concrete proposal now exists.", { bind: { text: "message" } }),
  ], { gap: 8, padding: 16, width: "fill", frame: material("inset") });

  f.root(f.stack([
    f.row([
      f.stack([f.eyebrow("ONE CHANGE", { tone: "info" }), f.heading("Review is a state machine")], { gap: 5 }),
      f.code("CLICK A STAGE", { tone: "textMuted" }),
    ], { justify: "between", align: "end", width: "fill" }),
    f.flow(cards, { gap: { wide: 48, compact: 18, narrow: 14 }, align: "stretch", width: "fill" }),
    status,
  ], { gap: 20, padding: { wide: 22, compact: 18, narrow: 14 }, width: "fill", frame: material("flat") }));

  const edges = cards.slice(0, -1).map((card, index) => f.connect(card, cards[index + 1], {
    head: "arrow",
    tone: "connector",
    packets: { count: 1, period: 1100 },
    bind: { tone: `edge${index}Tone`, flow: `edge${index}Passed`, highlight: `edge${index}Passed` },
  }));
  f.sequence([
    f.reveal(cards, { stagger: 90 }),
    f.draw(edges, { stagger: 80 }),
    f.reveal(status),
  ]);

  f.machine({
    initial: "draft",
    states: Object.fromEntries(stages.map(([id]) => [id, {
      on: Object.fromEntries(stages.filter(([other]) => other !== id).map(([other]) => [other.toUpperCase(), other])),
    }])),
    signals: {
      stageName: { match: { state: true }, cases: Object.fromEntries(stages.map(([id, , title]) => [id, title])), default: "DRAFT" },
      message: { match: { state: true }, cases: messages, default: messages.draft },
      ...Object.fromEntries(stages.map(([id]) => [id, { when: { state: id }, then: 1, else: 0 }])),
      edge0Passed: { when: { state: ["test", "review", "merge"] }, then: 1, else: 0 },
      edge1Passed: { when: { state: ["review", "merge"] }, then: 1, else: 0 },
      edge2Passed: { when: { state: "merge" }, then: 1, else: 0 },
      edge0Tone: { when: { state: ["test", "review", "merge"] }, then: "info", else: "connector" },
      edge1Tone: { when: { state: ["review", "merge"] }, then: "warning", else: "connector" },
      edge2Tone: { when: { state: "merge" }, then: "success", else: "connector" },
    },
  });
});
```

## Activity belongs in a matrix

_Animated plot · 216 inspectable cells_

Repeated events become readable when two time dimensions are made spatial: days run down the
page, hours run across it, and colour carries intensity. The cells below are deterministic sample
data; in an application the rows can come from a build log, telemetry store, or WebSocket buffer.

```kineglyph live id=editorial-activity-matrix view=preview height=500
import { counterTerminalTheme, figure, heatmap, plot } from "kineglyph";

export const theme = counterTerminalTheme;

const days = Array.from({ length: 9 }, (_, index) => `D${index + 1}`);
const hours = Array.from({ length: 24 }, (_, hour) => String(hour).padStart(2, "0"));
const rows = days.flatMap((day, dayIndex) => hours.map((hour, hourIndex) => {
  const workday = hourIndex >= 7 && hourIndex <= 21 ? 1 : 0.18;
  const wave = (Math.sin((hourIndex + dayIndex * 1.7) * 0.82) + 1) / 2;
  const release = dayIndex === 5 && hourIndex >= 12 && hourIndex <= 17 ? 68 : 0;
  return { day, hour, events: Math.round((12 + dayIndex * 4 + wave * 46) * workday + release) };
}));

export default figure("editorial-activity-matrix", {
  title: "Nine days of build activity",
  description: "A day-by-hour heatmap of 216 inspectable activity cells.",
}, (f) => {
  const matrix = f.add(plot(rows, {
    id: "activity",
    title: "1,000 BUILD EVENTS",
    subtitle: "9 days × 24 hours · synthetic data",
    marks: heatmap({
      row: "day",
      column: "hour",
      value: "events",
      tone: "warning",
      cellLabels: false,
    }),
    height: { wide: 370, compact: 350, narrow: 330 },
    motion: "auto",
  }));
  const legend = f.row([
    f.eyebrow("QUIET", { tone: "textMuted", hidden: { narrow: true } }),
    ...["surfaceMuted", "chart1", "chart3", "chart5", "warning"].map((fill) => f.rect({ width: { wide: 34, compact: 24, narrow: 16 }, height: 8, radius: 4, fill })),
    f.eyebrow("BURST", { tone: "warning", hidden: { narrow: true } }),
  ], { gap: { wide: 7, compact: 5, narrow: 3 }, align: "center", justify: "end", width: "fill" });
  f.root(f.stack([matrix, legend], { gap: 12, padding: { wide: 18, compact: 14, narrow: 10 }, width: "fill" }));
  f.sequence([f.reveal(matrix), f.reveal(legend)]);
});
```

## Convergence needs lanes, not a single total

_Animated · dense primitive composition_

A total failure count hides which subsystem is stuck. These eight lanes use 288 ordinary rounded
rectangles—no canvas bitmap and no custom renderer. Hot cells are failing checkpoints; the dark
tail is the quiet period after each lane converges.

```kineglyph live id=editorial-convergence-lanes view=preview height=350
import { counterTerminalTheme, figure, material } from "kineglyph";

export const theme = counterTerminalTheme;

const laneNames = ["PARSER", "RESOLVER", "BUNDLER", "RUNTIME", "WINDOWS", "LINUX", "MACOS", "TYPES"];
const tones = ["chart1", "chart2", "chart3", "chart4", "chart5", "chart6", "warning", "success"];

export default figure("editorial-convergence-lanes", {
  title: "Eight build shards converging",
  description: "A dense lane chart with 288 checkpoints showing failures declining toward zero.",
}, (f) => {
  const lanes = laneNames.map((name, laneIndex) => {
    const cells = Array.from({ length: 36 }, (_, run) => {
      const boundary = 14 + laneIndex * 2 + (laneIndex % 3) * 3;
      const residual = Math.max(0, boundary - run + Math.round(Math.sin(run * 0.9 + laneIndex) * 3));
      return f.rect({
        id: `lane-${laneIndex}-run-${run}`,
        width: "fill",
        height: { wide: 18, compact: 16, narrow: 13 },
        radius: 3,
        fill: residual === 0 ? "surfaceMuted" : tones[laneIndex],
        opacity: residual === 0 ? 0.34 : Math.min(1, 0.42 + residual / 20),
        label: `${name} run ${run + 1}: ${residual} failures`,
      });
    });
    return f.row([
      f.code(name, { width: { wide: 92, compact: 82, narrow: 66 }, tone: tones[laneIndex], textStyle: { narrow: "caption", compact: "code", wide: "code" } }),
      f.grid(cells, { columns: 36, gap: { wide: 3, compact: 2, narrow: 1 }, width: "fill" }),
    ], { gap: 10, align: "center", width: "fill" });
  });
  f.root(f.stack([
    f.row([
      f.stack([f.eyebrow("36 RUNS", { tone: "info" }), f.heading("Failures collapse by subsystem")], { gap: 5 }),
      f.code("← HOT  ·  QUIET →", { tone: "textMuted", hidden: { narrow: true } }),
    ], { justify: "between", align: "end", width: "fill" }),
    f.stack(lanes, { gap: 9, width: "fill" }),
    f.caption("Each lane keeps its identity; zero is visible as silence, not missing data.", { tone: "textMuted" }),
  ], { gap: 18, padding: { wide: 22, compact: 16, narrow: 10 }, width: "fill", frame: material("flat") }));
  f.sequence([f.reveal(lanes, { stagger: 85 })]);
});
```

## A change stream should show both directions

_Animated plot · additions and deletions share one baseline_

Positive-only commit bars reward churn. A diverging chart lets removals occupy equal visual space,
so a cleanup release reads differently from a feature release.

```kineglyph live id=editorial-change-stream view=preview height=450
import { counterTerminalTheme, figure, plot, rule, stackedBar } from "kineglyph";

export const theme = counterTerminalTheme;

const commits = Array.from({ length: 22 }, (_, index) => ({
  commit: String(index + 1).padStart(2, "0"),
  added: 12 + ((index * 17) % 74),
  removed: -(8 + ((index * 29) % 62)),
}));

export default figure("editorial-change-stream", { title: "Code change by commit" }, (f) => {
  const chart = f.add(plot(commits, {
    id: "changes",
    title: "2,418 LINES RECONSIDERED",
    subtitle: "sample change stream · additions above, deletions below",
    x: "commit",
    y: ["added", "removed"],
    marks: stackedBar({ radius: 3 }),
    annotations: [rule({ y: 0, tone: "textMuted" })],
    axes: { x: { label: "commit" }, y: { label: "lines" } },
    grid: "y",
    height: { wide: 300, compact: 280, narrow: 250 },
  }));
  f.root(f.stack([chart], { padding: { wide: 18, compact: 14, narrow: 10 }, width: "fill" }));
  f.sequence([f.reveal(chart)]);
});
```

## End with the claim a reader can remember

_Editorial comparison · one strong number_

The final graphic is deliberately simpler. After the process detail, the reader needs the outcome:
the same workload starts faster after the rewrite. `editorialBarChart()` supplies the same polished
defaults as the eclipse example while leaving every style choice overridable.

```kineglyph live id=editorial-before-after view=preview height=460
import { counterTerminalTheme, editorialBarChart, figure } from "kineglyph";

export const theme = counterTerminalTheme;

const rows = [
  { build: "BEFORE", milliseconds: 517 },
  { build: "AFTER", milliseconds: 421 },
];

export default figure("editorial-before-after", { title: "Startup after a rewrite" }, (f) => {
  const chart = f.add(editorialBarChart(rows, {
    id: "startup",
    x: "build",
    y: "milliseconds",
    title: "Startup gets out of the way",
    subtitle: "cold start · lower is better",
    axisLabel: "milliseconds",
    tone: "warning",
    zeroLabel: false,
    height: { wide: 300, compact: 280, narrow: 250 },
  }));
  const claim = f.row([
    f.eyebrow("RESULT", { tone: "warning" }),
    f.code("−19%", { textStyle: "display", tone: "warning" }),
    f.caption("96 ms returned to every cold start", { tone: "textMuted" }),
  ], { gap: 16, align: "center", justify: "center", width: "fill" });
  f.root(f.stack([chart, claim], { gap: 10, width: "fill" }));
  f.sequence([f.reveal(chart), f.reveal(claim)]);
});
```

These are compositions, not special-case widgets. They use cards, grids, normal marks, `plot()`,
machines, bindings, and timelines, so the same scenes remain responsive and export to SVG, PNG,
or GIF.
