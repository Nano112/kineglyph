import {
  createTheme,
  defineScene,
  fadeIn,
  fadeTo,
  kineglyphTheme,
  reveal,
  timeline,
  track,
  type SceneDefinition,
  type ThemeTokens,
  type TimelineKeyframe,
} from "@kineglyph/core";

const PATH = "M20 210C104 64 196 60 272 164S438 280 574 94";
const START = 300;
const ARRIVE = 2500;

interface Point {
  readonly x: number;
  readonly y: number;
}

function cubic(a: Point, b: Point, c: Point, d: Point, t: number): Point {
  const u = 1 - t;
  return {
    x: u ** 3 * a.x + 3 * u ** 2 * t * b.x + 3 * u * t ** 2 * c.x + t ** 3 * d.x,
    y: u ** 3 * a.y + 3 * u ** 2 * t * b.y + 3 * u * t ** 2 * c.y + t ** 3 * d.y,
  };
}

function pointOnCoverPath(progress: number): Point {
  if (progress <= 0.5) {
    return cubic(
      { x: 20, y: 210 },
      { x: 104, y: 64 },
      { x: 196, y: 60 },
      { x: 272, y: 164 },
      progress * 2,
    );
  }
  return cubic(
    { x: 272, y: 164 },
    { x: 348, y: 268 },
    { x: 438, y: 280 },
    { x: 574, y: 94 },
    (progress - 0.5) * 2,
  );
}

/** Samples the Bézier by distance so the point stays on the leading edge of the path reveal. */
function motionFrames(axis: "x" | "y"): TimelineKeyframe[] {
  const samples = Array.from({ length: 241 }, (_, index) => pointOnCoverPath(index / 240));
  const lengths = [0];
  for (let index = 1; index < samples.length; index += 1) {
    const previous = samples[index - 1] ?? samples[0]!;
    const current = samples[index] ?? previous;
    lengths.push(
      (lengths[index - 1] ?? 0) + Math.hypot(current.x - previous.x, current.y - previous.y),
    );
  }
  const total = lengths[lengths.length - 1] ?? 1;
  const start = samples[0] ?? { x: 0, y: 0 };
  const frames: TimelineKeyframe[] = [
    { time: 0, value: 0 },
    { time: START, value: 0 },
  ];

  for (let step = 1; step <= 48; step += 1) {
    const fraction = step / 48;
    const target = total * fraction;
    let upper = lengths.findIndex((length) => length >= target);
    if (upper < 1) upper = 1;
    const lower = upper - 1;
    const lowLength = lengths[lower] ?? 0;
    const highLength = lengths[upper] ?? lowLength;
    const mix = highLength === lowLength ? 0 : (target - lowLength) / (highLength - lowLength);
    const lowPoint = samples[lower] ?? start;
    const highPoint = samples[upper] ?? lowPoint;
    const value =
      axis === "x"
        ? lowPoint.x + (highPoint.x - lowPoint.x) * mix - start.x
        : lowPoint.y + (highPoint.y - lowPoint.y) * mix - start.y;
    frames.push({
      time: START + (ARRIVE - START) * fraction,
      value,
      easing: "linear",
    });
  }
  return frames;
}

export const readmeCoverTheme: ThemeTokens = createTheme(
  {
    name: "readme-cover",
    typography: {
      display: {
        ...kineglyphTheme.typography.display,
        size: 104,
        lineHeight: 110,
        letterSpacing: -6,
      },
      bodyStrong: {
        ...kineglyphTheme.typography.bodyStrong,
        size: 20,
        lineHeight: 28,
        weight: 600,
      },
    },
  },
  kineglyphTheme,
);

export const readmeCoverScene: SceneDefinition = defineScene({
  schemaVersion: 2,
  id: "readme-cover",
  title: "Kineglyph",
  description: "Kineglyph wordmark beside a line passing through three geometric forms.",
  padding: 0,
  background: "canvas",
  root: {
    id: "cover",
    type: "group",
    layout: "absolute",
    width: "fill",
    height: 480,
    allowOverflow: true,
    children: [
      {
        id: "wordmark",
        type: "text",
        text: "Kineglyph",
        textStyle: "display",
        wrap: false,
        width: 620,
        height: 110,
        position: { x: 66, y: 137 },
      },
      {
        id: "tagline",
        type: "text",
        text: "Technical illustrations with a pulse.",
        textStyle: "bodyStrong",
        wrap: false,
        width: 580,
        height: 28,
        position: { x: 72, y: 258 },
      },
      {
        id: "kinetic",
        type: "group",
        layout: "coordinates",
        width: 594,
        height: 230,
        allowOverflow: true,
        position: { x: 750, y: 96 },
        children: [
          {
            id: "spline-glow",
            type: "path",
            d: PATH,
            viewBox: { width: 594, height: 230 },
            width: 594,
            height: 230,
            position: { x: 0, y: 0 },
            fill: "none",
            stroke: "accent",
            strokeWidth: 7,
            opacity: 0.08,
          },
          {
            id: "spline",
            type: "path",
            d: PATH,
            viewBox: { width: 594, height: 230 },
            width: 594,
            height: 230,
            position: { x: 0, y: 0 },
            fill: "none",
            stroke: "text",
            strokeWidth: 1.5,
          },
          {
            id: "source",
            type: "circle",
            width: 16,
            height: 16,
            radius: 8,
            position: { x: 20 / 594, y: 210 / 230, anchor: "center" },
            fill: "canvas",
            stroke: "text",
            strokeWidth: 2,
          },
          {
            id: "resolve-ring",
            type: "path",
            d: "M35 0A35 35 0 1 1 34.999 0Z",
            viewBox: { width: 70, height: 70 },
            width: 70,
            height: 70,
            position: { x: 153 / 594, y: 59 / 230 },
            fill: "none",
            stroke: "text",
            strokeWidth: 1.5,
          },
          {
            id: "resolve-orbit",
            type: "path",
            d: "M23 0A23 23 0 1 1 22.999 0Z",
            viewBox: { width: 46, height: 46 },
            width: 46,
            height: 46,
            position: { x: 165 / 594, y: 71 / 230 },
            fill: "none",
            stroke: "accent",
            strokeWidth: 1.5,
            dash: "dotted",
          },
          {
            id: "bind-shape",
            type: "path",
            d: "M9 0L66 12L57 66L0 54Z",
            viewBox: { width: 66, height: 66 },
            width: 66,
            height: 66,
            position: { x: 300 / 594, y: 166 / 230 },
            fill: "none",
            stroke: "text",
            strokeWidth: 1.5,
          },
          {
            id: "seek-shape",
            type: "path",
            d: "M0 76L44 0L88 76Z",
            viewBox: { width: 88, height: 76 },
            width: 88,
            height: 76,
            position: { x: 456 / 594, y: 138 / 230 },
            fill: "none",
            stroke: "text",
            strokeWidth: 1.5,
          },
          {
            id: "render-point",
            type: "circle",
            width: 16,
            height: 16,
            radius: 8,
            position: { x: 574 / 594, y: 94 / 230, anchor: "center" },
            fill: "accent",
            stroke: "none",
          },
          {
            id: "traveller",
            type: "circle",
            width: 12,
            height: 12,
            radius: 6,
            position: { x: 20 / 594, y: 210 / 230, anchor: "center" },
            fill: "accent",
            stroke: "none",
            z: 10,
          },
        ],
      },
    ],
  },
  timeline: timeline(
    [
      track("spline", "progress", [
        { time: 0, value: 0 },
        { time: START, value: 0 },
        { time: ARRIVE, value: 1, easing: "linear" },
      ]),
      track("spline-glow", "progress", [
        { time: 0, value: 0 },
        { time: START, value: 0 },
        { time: ARRIVE, value: 1, easing: "linear" },
      ]),
      fadeIn("source", 120, 320),
      ...reveal("resolve-ring", 900, 1240, { scale: 0.94 }),
      ...reveal("resolve-orbit", 1080, 1320, { scale: 0.94 }),
      ...reveal("bind-shape", 1420, 1760, { scale: 0.94 }),
      ...reveal("seek-shape", 1940, 2280, { scale: 0.94 }),
      ...reveal("render-point", 2380, 2540, { scale: 0.2 }),
      track("traveller", "translateX", motionFrames("x")),
      track("traveller", "translateY", motionFrames("y")),
      track("traveller", "opacity", [
        { time: 0, value: 0 },
        { time: START - 1, value: 0 },
        { time: START, value: 1 },
        { time: ARRIVE - 80, value: 1 },
        { time: ARRIVE, value: 0, easing: "easeOut" },
      ]),
      fadeTo("kinetic", 5200, 5800, 1, 0),
    ],
    6000,
  ),
  metadata: { purpose: "readme-cover", generated: true },
});
