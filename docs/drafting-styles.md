# Drafting styles

_The same sheet, three papers_

The [drafting sheets](./drafting-sheets.md) are built on a palette-neutral toolkit: every
primitive paints with semantic tokens, the paper is a gradient between `surface` and `canvas`,
grain and vignette are alpha, and plates use `surfaceRaised`. Swap the theme and the whole sheet
follows. `draftingThemes` ships three:

| Theme                    | Paper                   | Ink      | Emphasis                         |
| ------------------------ | ----------------------- | -------- | -------------------------------- |
| `draftingTheme`          | graphite, dark vignette | white    | amber · green · violet           |
| `blueprintDraftingTheme` | Prussian blue           | white    | amber · mint · pale blue         |
| `paperDraftingTheme`     | cream, warm edges       | graphite | red pencil · blue pencil · green |

Both sheets below are parametric, use `drafting.plate`, `drafting.dimension`, `drafting.callout`,
and typeset formulas, and were written with the same helpers as the orbital series — nothing on
this page is specific to its subject.

## Blueprint — building section

An architectural section on blueprint paper. Change the span, eave height, and roof pitch; the
outline, rafters, dimensions, rafter length, and roof area follow.

```kineglyph live id=drafting-style-blueprint view=preview height=640
import { blueprintDraftingTheme, drafting as D, figure, loadMath, parametric } from "kineglyph";

export const theme = blueprintDraftingTheme;
const math = await loadMath();

const CX = 1240, GROUND = 1330, K = 92; // sheet units per metre
const WALL = 0.3;

function model(v) {
  const span = v.span, eave = v.eave, pitch = v.pitch;
  const rad = (pitch * Math.PI) / 180;
  const rise = (span / 2) * Math.tan(rad);
  const rafter = span / 2 / Math.cos(rad);
  const left = CX - (span / 2) * K, right = CX + (span / 2) * K;
  const eaveY = GROUND - eave * K, ridgeY = eaveY - rise * K;
  const ridge = { x: CX, y: ridgeY };
  const inner = WALL * K;
  const rafters = [];
  for (let i = 1; i < 6; i += 1) {
    const t = i / 6;
    rafters.push(D.line(left + (CX - left) * t, GROUND - inner, left + (CX - left) * t, eaveY + (ridgeY - eaveY) * t - 6));
    rafters.push(D.line(right - (right - CX) * t, GROUND - inner, right - (right - CX) * t, eaveY + (ridgeY - eaveY) * t - 6));
  }
  const dSpan = D.dimension(left, GROUND, right, GROUND, { offset: 150 });
  const dEave = D.dimension(left, GROUND, left, eaveY, { offset: 420 - left });
  const dRidge = D.dimension(right, GROUND, right, ridgeY, { offset: 1960 - right });
  const arc = D.arc(right, eaveY, 150, 180, 180 + pitch);
  const ridgeLead = D.calloutLeader(2020, 260, "top-left");
  const eaveLead = D.calloutLeader(840, 640, "top-right");
  const footingLead = D.calloutLeader(840, 1430, "top-right");
  return {
    outline: D.polyline([{ x: left, y: GROUND }, { x: left, y: eaveY }, ridge, { x: right, y: eaveY }, { x: right, y: GROUND }]),
    walls: `${D.line(left + inner, GROUND, left + inner, eaveY + inner * Math.tan(rad))} ${D.line(right - inner, GROUND, right - inner, eaveY + inner * Math.tan(rad))}`,
    roof: D.polyline([{ x: left - 40, y: eaveY + 40 * Math.tan(rad) }, ridge, { x: right + 40, y: eaveY + 40 * Math.tan(rad) }]),
    ceiling: D.polyline([{ x: left + inner, y: eaveY + inner * Math.tan(rad) }, { x: CX, y: ridgeY + inner / Math.cos(rad) }, { x: right - inner, y: eaveY + inner * Math.tan(rad) }]),
    rafters: rafters.join(" "),
    footings: `${D.rect(left - 30, GROUND, inner + 60, 40)} ${D.rect(right - inner - 30, GROUND, inner + 60, 40)}`,
    dims: `${dSpan.d} ${dEave.d} ${dRidge.d}`,
    pitchArc: arc,
    leadAmber: `${ridgeLead(ridge.x, ridge.y)} ${eaveLead(left, eaveY)}`,
    leadInk: footingLead(left, GROUND + 40),
    dimSpan: `S ${span.toFixed(1)} m`,
    dimEave: `h ${eave.toFixed(2)} m`,
    dimRidge: `ridge ${(eave + rise).toFixed(2)} m`,
    ridgeb: `${(eave + rise).toFixed(2)} m · pitch ${pitch.toFixed(0)}°`,
    ridgec: `rafter L ${rafter.toFixed(2)} m`,
    eaveb: `h ${eave.toFixed(2)} m · gutter 125`,
    footb: `600 × 400 · C25/30`,
    sched1: `${(span * 2 + eave * 4).toFixed(1)} m`,
    sched2: `${(2 * rafter * 10).toFixed(1)} m²`,
    sched3: `${rafter.toFixed(2)} m @ 600 c/c`,
    sched4: `${pitch.toFixed(0)}° · rise ${rise.toFixed(2)} m`,
  };
}

const params = parametric(
  {
    span: { value: 9, label: "Span (m)", min: 6, max: 14, step: 0.5 },
    eave: { value: 2.7, label: "Eave height (m)", min: 2.2, max: 4, step: 0.1 },
    pitch: { value: 30, label: "Roof pitch (°)", min: 12, max: 45, step: 1 },
  },
  model,
  { group: "section" },
);
export const deriveSignals = params.deriveSignals;

export default figure("drafting-style-blueprint", {
  title: "Building section",
  description: "A parametric gable section on blueprint paper.",
  background: "canvas",
  padding: 0,
  hold: 900,
  signals: params.signals,
}, (f) => {
  const s = params.signals;
  const { layer: L, text: T } = D.bound(f, s);
  const groundLine = D.layer(f, D.line(300, GROUND, 2180, GROUND), { id: "ground", strokeWidth: 1.4, opacity: 0.8 });
  const hatch = [];
  for (let x = 320; x < 2180; x += 40) hatch.push(D.line(x, GROUND, x - 26, GROUND + 26));
  const hatchLayer = D.layer(f, hatch.join(" "), { id: "hatch", strokeWidth: 0.7, opacity: 0.28 });
  const footings = L("footings", { strokeWidth: 0.9, opacity: 0.55 });
  const outline = L("outline", { strokeWidth: 1.6, opacity: 0.92 });
  const walls = L("walls", { strokeWidth: 0.9, opacity: 0.6 });
  const ceiling = L("ceiling", { strokeWidth: 0.9, opacity: 0.6 });
  const rafters = L("rafters", { strokeWidth: 0.7, opacity: 0.32, dash: "dashed" });
  const roof = L("roof", { stroke: "accent", strokeWidth: 2, opacity: 0.92 });
  const pitchArc = L("pitchArc", { stroke: "accent", strokeWidth: 1, opacity: 0.7 });
  const dims = L("dims", { fill: "textMuted", stroke: "textMuted", strokeWidth: 0.8, opacity: 0.6 });
  const leadAmber = L("leadAmber", { fill: "none", stroke: "accent", strokeWidth: 0.8, opacity: 0.6 });
  const leadInk = L("leadInk", { fill: "none", stroke: "text", strokeWidth: 0.8, opacity: 0.5 });
  const labels = [
    T("dimSpan", CX, GROUND + 140, "bottom"),
    T("dimEave", 400, GROUND - 1.4 * K, "right"),
    T("dimRidge", 1940, GROUND + 6, "top-right"),
  ];
  const notes = [
    D.callout(f, 2020, 260, ["RIDGE", { text: s.ridgeb, bind: "ridgeb" }, { text: s.ridgec, bind: "ridgec" }], { id: "ridge-note", tone: "accent" }).node,
    D.callout(f, 840, 640, ["EAVE · GUTTER", { text: s.eaveb, bind: "eaveb" }], { id: "eave-note", anchor: "top-right", tone: "accent" }).node,
    D.callout(f, 840, 1430, ["STRIP FOOTING", { text: s.footb, bind: "footb" }], { id: "footing-note", anchor: "top-right" }).node,
  ];
  const rows = [["WALL LENGTH", "sched1"], ["ROOF AREA", "sched2"], ["RAFTERS", "sched3"], ["PITCH", "sched4"]];
  const schedule = [
    ...D.plate(f, 2000, 660, 790, 76 + rows.length * 54, { id: "schedule", seed: 5 }),
    D.layer(f, D.line(2000, 716, 2790, 716), { id: "schedule-rule", strokeWidth: 0.7, opacity: 0.3 }),
    D.text(f, "SCHEDULE", 2024, 688, "left", { style: "label", tone: "textMuted" }),
    ...rows.flatMap(([k, bind], i) => [
      D.text(f, k, 2024, 750 + i * 54, "left", { style: "code", tone: "textMuted" }),
      T(bind, 2766, 750 + i * 54, "right", { tone: "text" }),
    ]),
  ];
  const formulas = [
    D.text(f, "GEOMETRY", 2000, 1000, "top-left", { style: "label", tone: "textMuted" }),
    D.math(f, math.tex("\\tan\\theta = \\frac{2 h_r}{S}", { display: true }), 2000, 1046, "top-left", { id: "pitch-formula", size: 13, opacity: 0.92 }),
    D.math(f, math.tex("L = \\frac{S}{2\\cos\\theta}", { display: true }), 2000, 1200, "top-left", { id: "rafter-formula", size: 13, opacity: 0.92 }),
  ];

  f.root(D.sheet(f, {
    id: "sheet",
    title: "Building section",
    subtitle: "Gable roof  /  section A–A  ·  1:50",
    ident: "Sheet A-01 · Rev B",
    seed: 5,
    titleBlock: { title: "A-01 — Section", rows: [["Project", "Studio, plot 12"], ["Scale", "1:50 @ A3"], ["Drawn", "Kineglyph"]] },
    layers: [hatchLayer, groundLine, footings, walls, ceiling, rafters, outline, roof, pitchArc, dims, ...labels, leadAmber, leadInk, ...notes, ...schedule, ...formulas],
  }));

  f.sequence([
    [f.progress(groundLine, { duration: 700 }), f.reveal(hatchLayer, { duration: 500 })],
    [f.reveal(footings, { duration: 300 }), f.progress(outline, { duration: 1200, easing: "easeInOut" })],
    [f.progress([walls, ceiling], { duration: 700 }), f.progress(rafters, { duration: 900, stagger: 40 })],
    [f.progress(roof, { duration: 900 }), f.progress(pitchArc, { duration: 400 })],
    [f.progress(dims, { duration: 600 }), f.reveal(labels, { duration: 300 })],
    [f.progress([leadAmber, leadInk], { duration: 500 }), f.reveal([...notes, ...schedule, ...formulas], { duration: 320, stagger: 40 })],
  ], { gap: 80 });
  params.install(f);
});
```

## Paper — four-bar linkage, hand-drawn

A crank-rocker mechanism sketched on cream paper. The `sketch` material is switched on for the
drawing layers here, because a pencil sketch should wobble. Turn the crank; the coupler position
comes from the circle intersection, the coupler curve is traced across a full revolution, and the
Grashof condition is checked live.

```kineglyph live id=drafting-style-paper view=preview height=640
import { drafting as D, figure, loadMath, paperDraftingTheme, parametric } from "kineglyph";

export const theme = paperDraftingTheme;
const math = await loadMath();

const A = { x: 960, y: 1150 };
const CRANK = 190;

function solve(phi, b, c, d) {
  const Dp = { x: A.x + d, y: A.y };
  const B = { x: A.x + CRANK * Math.cos(phi), y: A.y - CRANK * Math.sin(phi) };
  const dx = Dp.x - B.x, dy = Dp.y - B.y;
  const dist = Math.hypot(dx, dy);
  const reach = Math.min(Math.max(dist, Math.abs(b - c) + 1e-6), b + c - 1e-6);
  const a = (b * b - c * c + reach * reach) / (2 * reach);
  const h = Math.sqrt(Math.max(0, b * b - a * a));
  const ux = dx / dist, uy = dy / dist;
  const M = { x: B.x + ux * a, y: B.y + uy * a };
  const C = { x: M.x + uy * h, y: M.y - ux * h };
  const coupler = { x: (B.x + C.x) / 2 + (C.y - B.y) * 0.55, y: (B.y + C.y) / 2 - (C.x - B.x) * 0.55 };
  return { B, C, Dp, coupler };
}

function model(v) {
  const phi = (v.crank * Math.PI) / 180;
  const b = v.coupler, c = v.rocker, d = 520;
  const { B, C, Dp, coupler } = solve(phi, b, c, d);
  const trace = [];
  for (let k = 0; k <= 120; k += 1) trace.push(solve((k / 120) * 2 * Math.PI, b, c, d).coupler);
  const lengths = [CRANK, b, c, d];
  const sMin = Math.min(...lengths), lMax = Math.max(...lengths);
  const grashof = sMin + lMax <= lengths.reduce((t, x) => t + x, 0) - sMin - lMax;
  const pivot = (p) => `${D.circle(p.x, p.y, 10)} ${D.line(p.x - 26, p.y + 26, p.x + 26, p.y + 26)}`;
  const crankLead = D.calloutLeader(560, 700, "top-right");
  const couplerLead = D.calloutLeader(1900, 460, "top-left");
  const rockerLead = D.calloutLeader(1900, 900, "top-left");
  return {
    crankLink: D.line(A.x, A.y, B.x, B.y),
    couplerLink: D.polyline([B, coupler, C, B]),
    rockerLink: D.line(C.x, C.y, Dp.x, Dp.y),
    joints: `${D.circle(B.x, B.y, 9)} ${D.circle(C.x, C.y, 9)} ${D.circle(coupler.x, coupler.y, 7)}`,
    pivots: `${pivot(A)} ${pivot(Dp)}`,
    crankCircle: D.circle(A.x, A.y, CRANK),
    trace: D.polyline(trace, true),
    angle: D.arc(A.x, A.y, 70, 0, -(v.crank % 360)),
    ground: D.dimension(A.x, A.y + 60, Dp.x, Dp.y + 60, { offset: 60 }).d,
    leadRed: crankLead(B.x, B.y),
    leadBlue: `${couplerLead(coupler.x, coupler.y)} ${rockerLead(C.x, C.y)}`,
    angleLabel: `φ ${v.crank.toFixed(0)}°`,
    groundLabel: `d 520`,
    crankb: `a ${CRANK} · φ ${v.crank.toFixed(0)}°`,
    couplerb: `b ${b.toFixed(0)}`,
    couplerc: `P (${coupler.x.toFixed(0)}, ${(A.y - coupler.y).toFixed(0)})`,
    rockerb: `c ${c.toFixed(0)}`,
    rockerc: `θ ${((Math.atan2(Dp.y - C.y, C.x - Dp.x) * 180) / Math.PI).toFixed(1)}°`,
    grashofLabel: grashof ? "GRASHOF · crank-rocker ✓" : "NON-GRASHOF · rocker-rocker",
    grashofTone: grashof ? "success" : "danger",
    grashofb: `${sMin} + ${lMax} ${grashof ? "≤" : ">"} ${lengths.reduce((t, x) => t + x, 0) - sMin - lMax}`,
  };
}

const params = parametric(
  {
    crank: { value: 40, label: "Crank angle φ (°)", min: 0, max: 360, step: 2 },
    coupler: { value: 430, label: "Coupler b", min: 300, max: 560, step: 10 },
    rocker: { value: 320, label: "Rocker c", min: 220, max: 460, step: 10 },
  },
  model,
  { group: "linkage" },
);
export const deriveSignals = params.deriveSignals;

export default figure("drafting-style-paper", {
  title: "Four-bar linkage",
  description: "A hand-drawn crank-rocker with its coupler curve, on cream paper.",
  background: "canvas",
  padding: 0,
  hold: 900,
  signals: params.signals,
}, (f) => {
  const s = params.signals;
  const { layer: L, text: T } = D.bound(f, s);
  const pen = { sketch: { seed: 31, strength: 3, frequency: 0.006 } };
  const crankCircle = L("crankCircle", { stroke: "textMuted", strokeWidth: 0.8, opacity: 0.45, dash: "dashed", ...pen });
  const trace = L("trace", { stroke: "info", strokeWidth: 1.2, opacity: 0.7, dash: "dotted" });
  const groundDim = L("ground", { fill: "textMuted", stroke: "textMuted", strokeWidth: 0.8, opacity: 0.6 });
  const pivots = L("pivots", { strokeWidth: 1.4, opacity: 0.85, ...pen });
  const crank = L("crankLink", { stroke: "accent", strokeWidth: 3, opacity: 0.9, ...pen });
  const coupler = L("couplerLink", { stroke: "info", strokeWidth: 2.2, opacity: 0.85, ...pen });
  const rocker = L("rockerLink", { strokeWidth: 2.2, opacity: 0.85, ...pen });
  const joints = L("joints", { fill: "surfaceRaised", strokeWidth: 1.4, opacity: 0.95, ...pen });
  const angle = L("angle", { stroke: "accent", strokeWidth: 1, opacity: 0.7 });
  const leadRed = L("leadRed", { fill: "none", stroke: "accent", strokeWidth: 0.8, opacity: 0.6 });
  const leadBlue = L("leadBlue", { fill: "none", stroke: "info", strokeWidth: 0.8, opacity: 0.6 });
  const labels = [
    T("angleLabel", A.x + 84, A.y + 40, "top-left", { tone: "accent" }),
    T("groundLabel", A.x + 260, A.y + 150, "top"),
    D.text(f, "A", A.x - 30, A.y + 30, "top-right", { style: "code", tone: "textMuted" }),
    D.text(f, "D", A.x + 550, A.y + 30, "top-left", { style: "code", tone: "textMuted" }),
  ];
  const notes = [
    D.callout(f, 560, 700, ["CRANK", { text: s.crankb, bind: "crankb" }, "driven · 60 rpm"], { id: "crank-note", anchor: "top-right", tone: "accent" }).node,
    D.callout(f, 1900, 460, ["COUPLER", { text: s.couplerb, bind: "couplerb" }, { text: s.couplerc, bind: "couplerc" }], { id: "coupler-note", tone: "info" }).node,
    D.callout(f, 1900, 900, ["ROCKER", { text: s.rockerb, bind: "rockerb" }, { text: s.rockerc, bind: "rockerc" }], { id: "rocker-note", tone: "info" }).node,
  ];
  const grashof = [
    ...D.plate(f, 2000, 1080, 790, 250, { id: "grashof", seed: 31 }),
    D.text(f, s.grashofLabel, 2024, 1108, "top-left", { id: "grashofLabel", style: "label", tone: "success", bind: { text: "grashofLabel", tone: "grashofTone" } }),
    D.math(f, math.tex("s + l \\le p + q"), 2024, 1164, "top-left", { id: "grashof-formula", size: 13, opacity: 0.92 }),
    T("grashofb", 2024, 1250, "top-left"),
  ];

  f.root(D.sheet(f, {
    id: "sheet",
    title: "Four-bar linkage",
    subtitle: "Crank-rocker  /  coupler curve  ·  sketch",
    ident: "Notebook p. 14",
    seed: 31,
    titleBlock: { title: "Mechanism 03", rows: [["Type", "Planar 4R"], ["Units", "mm, degrees"], ["Drawn", "Kineglyph"]] },
    layers: [crankCircle, trace, groundDim, pivots, rocker, coupler, crank, joints, angle, ...labels, leadRed, leadBlue, ...notes, ...grashof],
  }));

  f.sequence([
    [f.reveal(pivots, { duration: 400 }), f.progress(crankCircle, { duration: 900 })],
    [f.progress(crank, { duration: 500 }), f.progress(coupler, { duration: 700 }), f.progress(rocker, { duration: 500 })],
    [f.reveal(joints, { duration: 300, scale: 0.4 }), f.progress(angle, { duration: 400 })],
    f.progress(trace, { duration: 1800, easing: "linear" }),
    [f.progress(groundDim, { duration: 500 }), f.reveal(labels, { duration: 300 })],
    [f.progress([leadRed, leadBlue], { duration: 500 }), f.reveal([...notes, ...grashof], { duration: 320, stagger: 40 })],
  ], { gap: 80 });
  params.install(f);
});
```

## Making a style

A drafting style is a theme with the sheet's vocabulary in mind: `surface` → `canvas` is the
paper's centre-to-edge fall-off, `surfaceRaised` is a plate lying on it, `text` is ink, and the
three emphasis colours are `accent`, `success`, and `info`. Start from any of the three presets:

```ts
import { createTheme, paperDraftingTheme } from "@kineglyph/core";

const sepia = createTheme({
  ...paperDraftingTheme,
  name: "sepia",
  colors: { ...paperDraftingTheme.colors, canvas: "#d9c9a8", surface: "#efe1c4", text: "#3a2c1a" },
});
```
