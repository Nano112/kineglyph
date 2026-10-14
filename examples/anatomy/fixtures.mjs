// Original Kineglyph fixtures: existing scene geometry, no upstream renderer.
export const anatomyChart = {
  chart: {
    title: "SIGNAL RECOVERY / 02",
    x: [0, 1, 2, 3, 4, 5, 6, 7],
    xLabel: "TIME / s",
    yLabel: "AMPLITUDE / mV",
    series: [
      { name: "Input", data: [18, 30, 26, 52, 41, 65, 60, 78], tone: "chart6" },
      { name: "Recovered", data: [16, 25, 30, 42, 46, 55, 63, 71], tone: "info" },
    ],
  },
  width: 960,
};
const children = [];
const rect = (id, x, y, width, height, extra = {}) =>
  children.push({ type: "rect", id, position: { x, y }, width, height, ...extra });
const text = (id, x, y, value, width = 300, style = "label", color = "text") =>
  children.push({
    type: "text",
    id,
    position: { x, y },
    width,
    text: value,
    textStyle: style,
    color,
    wrap: false,
  });
const line = (id, points, stroke = "connector", strokeWidth = 0.75) =>
  children.push({
    type: "polyline",
    id,
    position: { x: 0, y: 0 },
    width: 960,
    height: 560,
    points,
    space: "px",
    stroke,
    strokeWidth,
    fill: "none",
  });
rect("plate", 24, 24, 912, 512, { fill: "surface", stroke: "connector", strokeWidth: 0.6 });
text("fig", 48, 44, "FIG. 03 / SIGNAL CONDITIONER");
text("revision", 680, 44, "INSTRUMENT STUDY / REV. A", 230);
text("title", 48, 91, "A quieter signal path", 720, "title", "chart6");
text("subtitle", 48, 132, "SAMPLE  →  FILTER  →  RECOVER", 700, "caption");
line(
  "rule",
  [
    [48, 178],
    [912, 178],
  ],
  "border",
);
for (const [i, x, title, sub] of [
  [0, 64, "01 / SENSOR", "RAW INPUT"],
  [1, 372, "02 / FILTER", "LOW-PASS / 12 Hz"],
  [2, 680, "03 / OUTPUT", "RECOVERED"],
]) {
  rect(`module-${i}`, x, 230, 216, 164, { material: "raised" });
  text(`name-${i}`, x + 16, 246, title, 188);
  text(`sub-${i}`, x + 16, 365, sub, 188, "label", "textMuted");
  const points = Array.from({ length: 49 }, (_, j) => [
    x + 16 + j * 3.8,
    320 + Math.sin(j * 0.38) * (i === 0 ? 20 : 13) + (i === 0 ? Math.sin(j * 2.1) * 6 : 0),
  ]);
  line(`wave-${i}`, points, i === 2 ? "info" : "connector", 1.1);
}
line("wire-1", [
  [280, 312],
  [372, 312],
]);
line(
  "wire-2",
  [
    [588, 312],
    [680, 312],
  ],
  "info",
);
for (const [i, x] of [280, 372, 588, 680].entries())
  children.push({
    type: "circle",
    id: `terminal-${i}`,
    position: { x: x - 3, y: 309 },
    width: 6,
    height: 6,
    fill: "surface",
    stroke: "connector",
    strokeWidth: 0.75,
  });
line(
  "footer-rule",
  [
    [48, 454],
    [912, 454],
  ],
  "border",
);
text("status", 48, 478, "● LOCKED / 48 kHz", 250, "label", "success");
text("footer", 490, 478, "GAIN 1.00×     NOISE −42 dB     CH 01", 414);
export const anatomyInstrument = {
  schemaVersion: 2,
  padding: 0,
  id: "anatomy-instrument",
  title: "Signal conditioner",
  root: {
    type: "group",
    id: "root",
    layout: "absolute",
    padding: 0,
    width: 960,
    height: 560,
    children,
  },
};
