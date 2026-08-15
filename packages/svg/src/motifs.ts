/**
 * Semantic motif library. Every motif is authored in a 24×24 box centred on the origin so it can
 * be scaled uniformly by the renderer. Motifs are stroke-based line art; fills are opt-in.
 */
export interface MotifShape {
  readonly tag: "path" | "circle" | "rect" | "line" | "polyline";
  readonly attrs: Readonly<Record<string, string>>;
  readonly fill?: "background" | "stroke" | "none";
}

const P = (d: string, fill?: MotifShape["fill"]): MotifShape => ({
  tag: "path",
  attrs: { d },
  ...(fill === undefined ? {} : { fill }),
});
const C = (cx: number, cy: number, r: number, fill?: MotifShape["fill"]): MotifShape => ({
  tag: "circle",
  attrs: { cx: String(cx), cy: String(cy), r: String(r) },
  ...(fill === undefined ? {} : { fill }),
});
const R = (
  x: number,
  y: number,
  w: number,
  h: number,
  rx = 1,
  fill?: MotifShape["fill"],
): MotifShape => ({
  tag: "rect",
  attrs: { x: String(x), y: String(y), width: String(w), height: String(h), rx: String(rx) },
  ...(fill === undefined ? {} : { fill }),
});
const L = (x1: number, y1: number, x2: number, y2: number): MotifShape => ({
  tag: "line",
  attrs: { x1: String(x1), y1: String(y1), x2: String(x2), y2: String(y2) },
});

export const MOTIFS: Readonly<Record<string, readonly MotifShape[]>> = {
  field: [C(0, 0, 10, "background"), C(0, 0, 6, "background"), C(0, 0, 2, "stroke")],
  graph: [
    P("M -8 7 L 0 -8 L 8 6 Z"),
    C(-8, 7, 2.6, "background"),
    C(0, -8, 2.6, "background"),
    C(8, 6, 2.6, "background"),
  ],
  boundary: [C(0, 0, 10, "background"), P("M -10 0 C -5 -6 5 6 10 0")],
  blocks: [R(-9, -9, 8, 8), R(1, -9, 8, 8), R(-9, 1, 8, 8), R(1, 1, 8, 8)],
  box: [P("M -9 -5 L 0 -10 L 9 -5 L 9 5 L 0 10 L -9 5 Z"), P("M -9 -5 L 0 0 L 9 -5 M 0 0 L 0 10")],
  cube: [P("M -9 -5 L 0 -10 L 9 -5 L 9 5 L 0 10 L -9 5 Z"), P("M -9 -5 L 0 0 L 9 -5 M 0 0 L 0 10")],
  sphere: [
    C(0, 0, 10, "background"),
    P("M -10 0 C -6 -4 6 -4 10 0 M -10 0 C -6 4 6 4 10 0"),
    P("M 0 -10 C -4 -6 -4 6 0 10"),
  ],
  brush: [P("M 4 -10 L 10 -4 L -1 7 L -7 1 Z"), P("M -7 1 C -9 5 -9 8 -11 11 C -6 10 -3 9 -1 7")],
  layers: [
    P("M -10 -3 L 0 -8 L 10 -3 L 0 2 Z"),
    P("M -10 2 L 0 7 L 10 2"),
    P("M -10 6 L 0 11 L 10 6"),
  ],
  palette: [
    P(
      "M 0 -10 C -6 -10 -10 -6 -10 0 C -10 6 -6 10 0 10 C 3 10 4 8 4 6 C 4 4 6 3 8 3 C 10 3 10 1 10 -1 C 10 -6 6 -10 0 -10 Z",
    ),
    C(-5, -3, 1.6, "stroke"),
    C(0, -6, 1.6, "stroke"),
    C(5, -3, 1.6, "stroke"),
    C(-5, 3, 1.6, "stroke"),
  ],
  gear: [
    C(0, 0, 4),
    P(
      "M 0 -11 L 0 -7 M 0 7 L 0 11 M -11 0 L -7 0 M 7 0 L 11 0 M -7.8 -7.8 L -5 -5 M 5 5 L 7.8 7.8 M 7.8 -7.8 L 5 -5 M -5 5 L -7.8 7.8",
    ),
  ],
  chip: [
    R(-7, -7, 14, 14, 2),
    R(-3, -3, 6, 6, 1),
    P(
      "M -3 -11 L -3 -7 M 3 -11 L 3 -7 M -3 7 L -3 11 M 3 7 L 3 11 M -11 -3 L -7 -3 M -11 3 L -7 3 M 7 -3 L 11 -3 M 7 3 L 11 3",
    ),
  ],
  world: [
    C(0, 0, 10, "background"),
    P(
      "M -10 0 L 10 0 M 0 -10 C -5 -5 -5 5 0 10 M 0 -10 C 5 -5 5 5 0 10 M -8 -5 L 8 -5 M -8 5 L 8 5",
    ),
  ],
  code: [P("M -4 -7 L -10 0 L -4 7 M 4 -7 L 10 0 L 4 7 M 2 -10 L -2 10")],
  mesh: [
    P("M -10 -6 L -2 -10 L 10 -4 L 2 0 Z"),
    P("M -10 -6 L -8 4 L 2 10 L 2 0 M 2 10 L 10 6 L 10 -4"),
  ],
  camera: [P("M -10 -5 L -4 -5 L -2 -8 L 2 -8 L 4 -5 L 10 -5 L 10 8 L -10 8 Z"), C(0, 1, 4)],
  film: [
    R(-10, -8, 20, 16, 2),
    P("M -6 -8 L -6 8 M 6 -8 L 6 8 M -10 -3 L -6 -3 M -10 3 L -6 3 M 6 -3 L 10 -3 M 6 3 L 10 3"),
  ],
  arrow: [P("M -10 0 L 8 0 M 2 -6 L 8 0 L 2 6")],
  bolt: [P("M 2 -11 L -7 2 L 0 2 L -2 11 L 7 -2 L 0 -2 Z")],
  filter: [P("M -10 -9 L 10 -9 L 2 1 L 2 9 L -2 11 L -2 1 Z")],
  grid: [
    P(
      "M -10 -10 L 10 -10 L 10 10 L -10 10 Z M -3.3 -10 L -3.3 10 M 3.3 -10 L 3.3 10 M -10 -3.3 L 10 -3.3 M -10 3.3 L 10 3.3",
    ),
  ],
  dots: [
    C(-6, -6, 1.8, "stroke"),
    C(0, -6, 1.8, "stroke"),
    C(6, -6, 1.8, "stroke"),
    C(-6, 0, 1.8, "stroke"),
    C(0, 0, 1.8, "stroke"),
    C(6, 0, 1.8, "stroke"),
    C(-6, 6, 1.8, "stroke"),
    C(0, 6, 1.8, "stroke"),
    C(6, 6, 1.8, "stroke"),
  ],
  wave: [P("M -11 0 C -8 -8 -4 -8 -1 0 C 2 8 6 8 11 0")],
  funnel: [P("M -10 -8 L 10 -8 L 3 0 L 3 9 L -3 9 L -3 0 Z")],
  plug: [
    P(
      "M -4 -11 L -4 -5 M 4 -11 L 4 -5 M -8 -5 L 8 -5 L 8 0 C 8 5 4 8 0 8 C -4 8 -8 5 -8 0 Z M 0 8 L 0 12",
    ),
  ],
  book: [
    P(
      "M -10 -8 C -6 -10 -2 -9 0 -7 C 2 -9 6 -10 10 -8 L 10 8 C 6 6 2 7 0 9 C -2 7 -6 6 -10 8 Z M 0 -7 L 0 9",
    ),
  ],
  terminal: [R(-10, -8, 20, 16, 2), P("M -6 -3 L -2 0 L -6 3 M 0 4 L 6 4")],
  tag: [P("M -10 -10 L 0 -10 L 10 0 L 0 10 L -10 0 Z"), C(-5, -5, 1.6, "stroke")],
  clock: [C(0, 0, 10, "background"), P("M 0 -6 L 0 0 L 5 3")],
  shield: [
    P("M 0 -11 L 9 -7 L 9 0 C 9 6 5 9 0 11 C -5 9 -9 6 -9 0 L -9 -7 Z"),
    P("M -4 0 L -1 3 L 5 -3"),
  ],
  compare: [
    P("M -10 -6 L -2 -6 M -10 0 L -2 0 M -10 6 L -2 6 M 2 -6 L 10 -6 M 2 0 L 10 0 M 2 6 L 10 6"),
  ],
  branch: [
    C(-6, -6, 2.5, "background"),
    C(-6, 6, 2.5, "background"),
    C(6, 0, 2.5, "background"),
    P("M -3.5 -6 C 0 -6 0 0 3.5 0 M -3.5 6 C 0 6 0 0 3.5 0"),
  ],
  merge: [
    C(6, -6, 2.5, "background"),
    C(6, 6, 2.5, "background"),
    C(-6, 0, 2.5, "background"),
    P("M 3.5 -6 C 0 -6 0 0 -3.5 0 M 3.5 6 C 0 6 0 0 -3.5 0"),
  ],
  ramp: [
    R(-10, 4, 5, 5, 0.5, "stroke"),
    R(-3.5, 0, 5, 9, 0.5, "stroke"),
    R(3, -5, 5, 14, 0.5, "stroke"),
  ],
  gradient: [
    R(-10, -5, 20, 10, 1),
    L(-6, -5, -6, 5),
    L(-2, -5, -2, 5),
    L(2, -5, 2, 5),
    L(6, -5, 6, 5),
  ],
  dither: [
    R(-10, -10, 4, 4, 0, "stroke"),
    R(-2, -10, 4, 4, 0, "stroke"),
    R(6, -10, 4, 4, 0, "stroke"),
    R(-6, -6, 4, 4, 0, "stroke"),
    R(2, -6, 4, 4, 0, "stroke"),
    R(-10, -2, 4, 4, 0, "stroke"),
    R(-2, -2, 4, 4, 0, "stroke"),
    R(6, -2, 4, 4, 0, "stroke"),
    R(-6, 2, 4, 4, 0, "stroke"),
    R(2, 2, 4, 4, 0, "stroke"),
    R(-10, 6, 4, 4, 0, "stroke"),
    R(-2, 6, 4, 4, 0, "stroke"),
    R(6, 6, 4, 4, 0, "stroke"),
  ],
  target: [C(0, 0, 10, "background"), C(0, 0, 5.5, "background"), C(0, 0, 1.8, "stroke")],
  signal: [P("M -10 4 C -6 -6 -2 -6 0 0 C 2 6 6 6 10 -4"), P("M -10 8 L 10 8")],
  piston: [R(-8, -3, 16, 12, 1), P("M -3 -3 L -3 -10 L 3 -10 L 3 -3"), P("M -8 3 L 8 3")],
  circuit: [
    P("M -10 -6 L -4 -6 L -4 6 L 4 6 L 4 -6 L 10 -6"),
    C(-4, -6, 2, "stroke"),
    C(4, -6, 2, "stroke"),
  ],
  clockTick: [
    C(0, 0, 10, "background"),
    P("M 0 -10 L 0 -7 M 10 0 L 7 0 M 0 10 L 0 7 M -10 0 L -7 0 M 0 0 L 4 -4"),
  ],
  file: [P("M -7 -11 L 3 -11 L 8 -6 L 8 11 L -7 11 Z"), P("M 3 -11 L 3 -6 L 8 -6")],
  detect: [C(-2, -2, 7, "background"), P("M 3 3 L 10 10")],
  export: [P("M -8 2 L -8 10 L 8 10 L 8 2 M 0 -10 L 0 5 M -5 -5 L 0 -10 L 5 -5")],
  bridge: [
    P(
      "M -11 4 L -8 4 C -6 -4 6 -4 8 4 L 11 4 M -6 4 L -6 9 M 6 4 L 6 9 M 0 -2 L 0 9 M -11 9 L 11 9",
    ),
  ],
  languages: [
    P("M -10 -6 L -4 -6 L -4 6 M -10 6 L -4 6 M -10 0 L -6 0"),
    P("M 2 -6 L 8 -6 M 5 -6 L 5 6 M 2 6 L 8 6"),
  ],
  rust: [
    C(0, 0, 9),
    C(0, 0, 3.5),
    P(
      "M 0 -12 L 0 -9 M 0 9 L 0 12 M -12 0 L -9 0 M 9 0 L 12 0 M -8.5 -8.5 L -6.4 -6.4 M 6.4 6.4 L 8.5 8.5 M 8.5 -8.5 L 6.4 -6.4 M -6.4 6.4 L -8.5 8.5",
    ),
  ],
  texture: [
    R(-10, -10, 20, 20, 1),
    P("M -10 -3 L 10 -3 M -10 3 L 10 3 M -3 -10 L -3 10 M 3 -10 L 3 10"),
  ],
  lightbulb: [
    P("M -6 -2 C -6 -8 6 -8 6 -2 C 6 2 3 3 3 6 L -3 6 C -3 3 -6 2 -6 -2 Z"),
    P("M -3 9 L 3 9 M -2 12 L 2 12"),
  ],
  eye: [P("M -11 0 C -6 -8 6 -8 11 0 C 6 8 -6 8 -11 0 Z"), C(0, 0, 3.2, "stroke")],
  spark: [P("M 0 -11 L 2 -2 L 11 0 L 2 2 L 0 11 L -2 2 L -11 0 L -2 -2 Z")],
  timeline: [
    P("M -11 0 L 11 0"),
    C(-6, 0, 2.2, "stroke"),
    C(0, 0, 2.2, "stroke"),
    C(6, 0, 2.2, "stroke"),
    P("M -6 -2 L -6 -7 M 6 -2 L 6 -7 M 0 2 L 0 7"),
  ],
  diamond: [P("M 0 -10 L 10 0 L 0 10 L -10 0 Z")],
};

export function motifShapes(name: string): readonly MotifShape[] {
  return MOTIFS[name] ?? MOTIFS.diamond ?? [];
}

export const MOTIF_NAMES: readonly string[] = Object.keys(MOTIFS);
