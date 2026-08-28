# Drafting sheets

_Graphite paper · white drafting ink · colour only where the sheet annotates_

Five engineering drawings of orbital mechanics, rebuilt from a set of hand-generated wallpapers
as living Kineglyph figures. Every sheet is one `figure()` whose geometry is real: the ellipses,
ground tracks, and libration points come from the two-body and three-body solvers in `orbital`,
and every control under a sheet changes a real input — periapsis altitude, eccentricity,
inclination, mass ratio — with the drawing, the dimensions, and the callout numbers recomputed
from it.

The look is a theme plus two tools:

- `draftingTheme` — paper, ink, and three annotation colours: amber (`accent`) for burns and
  critical callouts, green (`success`) for the live trajectory, violet (`info`) for swept areas and
  halo orbits.
- `drafting` — the vocabulary of a drawing sheet as deterministic path data in a fixed 2880 × 1800
  sheet space: `frame`, `grid`, `titleBlock`, `dimension`, `vector`, `leader`, `radialTicks`,
  `ellipseArc`, and friends. `drafting.sheet(f, …)` assembles a whole sheet — grained paper, grids,
  indexed frame, header, and a title-block cartouche that lies on the drawing as a raised second
  sheet with a drop shadow; `drafting.plate` gives any data table the same treatment. `drafting.layer`
  and `drafting.at` put paths and text into that space at any container width.
- `sketch()` — a material effect that displaces strokes with seeded fractal noise, so a plotted
  line reads as a hand that never quite followed the ruler. It is portable: SVG, PNG, and GIF export
  carry it.

Formulas are typeset: `loadMath()` (from `@kineglyph/web`) imports the TeX renderer on demand and
`drafting.math(f, math.tex("…"), x, y)` places the result as an ordinary path mark — font-free
outlines that export exactly as they render. See [Formulas](#formulas) below.

Physics that the signal expression language cannot express — trigonometry, Kepler's equation,
numerical roots, propagated tracks — runs on the host through the `deriveSignals` export. It is
called after every machine transition with the machine's variables and returns bound path and
text signals; the figure builds its initial state from the same function so the static prerender
and the export CLI draw the same sheet without JavaScript.

## Sheet 01 — Hohmann transfer

Change the parking altitude and the target radius, then move the spacecraft along the coast arc.
The transfer ellipse, both burns, the dimensions, and the Δv budget follow. The planet is drawn to
the same scale as the orbits.

```kineglyph live id=drafting-hohmann view=preview height=640
import { drafting as D, draftingTheme, figure, loadMath, orbital as O } from "kineglyph";

export const theme = draftingTheme;
const math = await loadMath();

const CX = 1200, CY = 965, R2PX = 600;
const km = (v, d = 0) => `${O.formatGrouped(v, d)} km`;

function model(vars) {
  const r1 = O.R_EARTH + Number(vars.altitude);
  const r2 = Number(vars.target);
  const nu = O.radians(Number(vars.nu));
  const t = O.hohmann(r1, r2);
  const k = R2PX / r2;
  const R1 = r1 * k, RE = O.R_EARTH * k, a = t.a * k, b = t.b * k, c = t.c * k;
  const EX = CX + c;
  const peri = { x: CX - R1, y: CY }, apo = { x: CX + R2PX, y: CY };
  const f2 = { x: EX + c, y: CY };
  const E = O.degrees(O.trueToEccentric(nu, t.e));
  const s = D.ellipsePoint(EX, CY, a, b, 0, 180 + E);
  const heading = D.ellipseTangent(a, b, 0, 180 + E);
  const state = O.orbitState(t.a, t.e, nu);
  const onR1 = (deg) => ({ x: CX + R1 * Math.cos(O.radians(deg)), y: CY + R1 * Math.sin(O.radians(deg)) });
  const onR2 = (deg) => ({ x: CX + R2PX * Math.cos(O.radians(deg)), y: CY + R2PX * Math.sin(O.radians(deg)) });
  const ell = D.ellipsePoint(EX, CY, a, b, 0, 320);
  const d1 = D.dimension(CX, CY, peri.x, CY, { offset: 124 });
  const d2 = D.dimension(CX, CY, apo.x, CY, { offset: 178 });
  const d3 = D.dimension(peri.x, CY, apo.x, CY, { offset: -300 });
  const park = onR1(146), targ = onR2(48);
  return {
    spokes: D.radialTicks(CX, CY, Math.max(RE * 0.4, 40), R2PX + 62, 24),
    earth: D.circle(CX, CY, RE),
    atmosphere: D.circle(CX, CY, RE + 24),
    parking: D.circle(CX, CY, R1),
    coast: D.ellipseArc(EX, CY, a, b, 0, 180, 360),
    ghost: D.ellipseArc(EX, CY, a, b, 0, 0, 180),
    axis: D.line(peri.x - 130, CY, apo.x + 130, CY),
    vacant: D.crosshair(f2.x, f2.y, 20),
    burnDots: `${D.circle(peri.x, peri.y, 15)} ${D.circle(apo.x, apo.y, 15)}`,
    burnRings: `${D.circle(peri.x, peri.y, 30)} ${D.circle(apo.x, apo.y, 30)}`,
    burnVectors: `${D.vector(peri.x, peri.y, peri.x, peri.y - 118)} ${D.vector(apo.x, apo.y, apo.x, apo.y + 118)}`,
    craftRadius: D.line(CX, CY, s.x, s.y),
    craftDot: D.circle(s.x, s.y, 11),
    craftVector: D.vector(s.x, s.y, s.x + 140 * Math.cos(heading), s.y + 140 * Math.sin(heading)),
    dims: `${d1.d} ${d2.d} ${d3.d}`,
    leadAmber: [
      D.leader(peri.x, peri.y - 118, 782, 440, { stub: -34 }),
      D.leader(ell.x, ell.y, 1958, 560),
      D.leader(apo.x, apo.y + 118, 1958, 900),
    ].join(" "),
    leadInk: `${D.leader(park.x, park.y, 782, 1144, { stub: -34 })} ${D.leader(targ.x, targ.y, 1958, 1200)}`,
    leadGreen: D.leader(s.x, s.y, 782, 780, { stub: -34 }),
    dimR1: `r₁ ${km(r1)}`,
    dimR2: `r₂ ${km(r2)}`,
    dim2a: `2a ${km(2 * t.a)}`,
    burn1b: `Δv₁ ${t.dv1.toFixed(4)} km/s`,
    burn1c: `${t.v1.toFixed(3)} → ${t.vt1.toFixed(3)} km/s`,
    craftb: `ν ${O.degrees(nu).toFixed(0)}° · r ${km(state.r)}`,
    craftc: `v ${state.v.toFixed(3)} · t ${O.formatDuration(state.t)}`,
    parkb: `T ${O.formatDuration(t.period1)}`,
    parkc: `v ${t.v1.toFixed(4)} km/s`,
    ellb: `a ${km(t.a)} · e ${t.e.toFixed(4)}`,
    ellc: `b ${km(t.b)} · coplanar`,
    burn2b: `Δv₂ ${t.dv2.toFixed(4)} km/s`,
    burn2c: `at T+${O.formatDuration(t.transferTime)}`,
    targb: `T ${O.formatDuration(t.period2)}`,
    targc: `v ${t.v2.toFixed(4)} km/s`,
    fact1: `Δv TOTAL   ${t.dvTotal.toFixed(4)} km/s`,
    fact2: `FLIGHT     ${O.formatDuration(t.transferTime)}`,
    fact3: `C₃         ${O.formatGrouped(t.c3, 3)} km²/s²`,
  };
}

const defaults = { altitude: 400, target: 42164, nu: 132 };
export const deriveSignals = (vars) => model({ ...defaults, ...vars });

export default figure("drafting-hohmann", {
  title: "Hohmann transfer",
  description: "Minimum-energy coplanar transfer between two circular orbits, drawn to scale.",
  background: "canvas",
  padding: 0,
  hold: 900,
  signals: model(defaults),
}, (f) => {
  const s = model(defaults);
  const L = (key, o) => D.layer(f, s[key], { id: key, bind: { path: key }, ...o });
  const ink = { sketch: { seed: 11 } };
  const spokes = L("spokes", { stroke: "textMuted", strokeWidth: 0.7, opacity: 0.16 });
  const cross = D.layer(f, D.crosshair(CX, CY), { id: "centre", strokeWidth: 0.8, opacity: 0.45 });
  const target = D.layer(f, D.circle(CX, CY, R2PX), { id: "target", strokeWidth: 1.3, opacity: 0.44, dash: "dashed", ...ink });
  const parking = L("parking", { strokeWidth: 1.3, opacity: 0.52, dash: "dashed", ...ink });
  const earthFill = L("earth", { fill: "text", stroke: "none", strokeWidth: 0, opacity: 0.1 });
  const earth = L("earth", { id: "earth-ring", strokeWidth: 1.5, opacity: 0.72, ...ink });
  const atmosphere = L("atmosphere", { strokeWidth: 0.7, opacity: 0.22, dash: "dotted" });
  const axis = L("axis", { stroke: "textMuted", strokeWidth: 0.7, opacity: 0.34, dash: "dashed" });
  const vacant = L("vacant", { stroke: "textMuted", strokeWidth: 0.8, opacity: 0.45 });
  const ghost = L("ghost", { stroke: "accent", strokeWidth: 1, opacity: 0.22, dash: "dashed" });
  const coast = L("coast", { stroke: "accent", strokeWidth: 2.1, opacity: 0.92, ...ink });
  const burnRings = L("burnRings", { stroke: "accent", strokeWidth: 1, opacity: 0.5 });
  const burnDots = L("burnDots", { fill: "accent", stroke: "none", strokeWidth: 0, opacity: 0.95 });
  const burnVectors = L("burnVectors", { fill: "accent", stroke: "accent", strokeWidth: 1.7, opacity: 0.9 });
  const craftRadius = L("craftRadius", { stroke: "success", strokeWidth: 0.8, opacity: 0.4, dash: "dashed" });
  const craftDot = L("craftDot", { fill: "success", stroke: "none", strokeWidth: 0, opacity: 0.95 });
  const craftVector = L("craftVector", { fill: "success", stroke: "success", strokeWidth: 1.4, opacity: 0.85 });
  const dims = L("dims", { fill: "textMuted", stroke: "textMuted", strokeWidth: 0.8, opacity: 0.6 });
  const leadAmber = L("leadAmber", { fill: "none", stroke: "accent", strokeWidth: 0.8, opacity: 0.55 });
  const leadInk = L("leadInk", { fill: "none", stroke: "text", strokeWidth: 0.8, opacity: 0.5 });
  const leadGreen = L("leadGreen", { fill: "none", stroke: "success", strokeWidth: 0.8, opacity: 0.55 });
  const T = (key, x, y, anchor) => D.text(f, s[key], x, y, anchor, { id: key, bind: { text: key }, style: "code", tone: "textMuted" });
  const dimLabels = [T("dimR1", CX - 130, CY + 134, "top-right"), T("dimR2", CX + 300, CY + 168, "bottom"), T("dim2a", CX + 180, CY - 310, "bottom")];
  const note = (id, x, y, anchor, lines, tone) => D.annotation(f, x, y, lines, { id, anchor, tone });
  const notes = [
    note("burn1", 740, 406, "top-right", ["BURN 1 — INJECTION", { text: s.burn1b, bind: "burn1b" }, { text: s.burn1c, bind: "burn1c" }], "accent"),
    note("craft", 740, 746, "top-right", ["SPACECRAFT", { text: s.craftb, bind: "craftb" }, { text: s.craftc, bind: "craftc" }], "success"),
    note("park", 740, 1110, "top-right", ["PARKING ORBIT", { text: s.parkb, bind: "parkb" }, { text: s.parkc, bind: "parkc" }], "text"),
    note("ellipse", 2000, 526, "top-left", ["TRANSFER ELLIPSE", { text: s.ellb, bind: "ellb" }, { text: s.ellc, bind: "ellc" }], "accent"),
    note("burn2", 2000, 866, "top-left", ["BURN 2 — CIRCULARISE", { text: s.burn2b, bind: "burn2b" }, { text: s.burn2c, bind: "burn2c" }], "accent"),
    note("targetNote", 2000, 1166, "top-left", ["TARGET ORBIT", { text: s.targb, bind: "targb" }, { text: s.targc, bind: "targc" }], "text"),
  ];
  const visviva = [
    D.text(f, "VIS-VIVA", 2000, 330, "top-left", { style: "label", tone: "textMuted" }),
    D.math(f, math.tex("v^2 = \\mu\\left(\\frac{2}{r} - \\frac{1}{a}\\right)", { display: true }), 2000, 378, "top-left", { id: "visviva", size: 13, opacity: 0.92 }),
  ];
  const facts = D.annotation(f, 150, 1410, ["fact1", "fact2", "fact3"].map((bind) => ({ text: s[bind], bind })), { id: "facts", tone: "text", headStyle: "code", gap: 4, opacity: 0.62 });
  const f1 = D.text(f, "F₁", CX - 24, CY + 150, "top", { style: "code", tone: "textMuted" });

  f.root(D.sheet(f, {
    id: "sheet",
    title: "Hohmann transfer",
    subtitle: "Minimum-energy coplanar transfer  /  parking → target",
    ident: "Sheet 1 of 5 · Rev D · to scale",
    seed: 11,
    titleBlock: { title: "Sheet 01 — Transfer", rows: [["Frame", "ECI J2000"], ["Method", "Impulsive 2-body"], ["Drawn", "Kineglyph"]] },
    layers: [
      spokes, cross, target, parking, earthFill, earth, atmosphere, axis, vacant, ghost, coast,
      burnRings, burnDots, burnVectors, craftRadius, craftDot, craftVector, dims, ...dimLabels,
      leadAmber, leadInk, leadGreen, ...notes, ...visviva, facts, f1,
    ],
  }));

  f.sequence([
    [f.reveal([spokes, cross, earthFill, earth, atmosphere], { duration: 500 })],
    [f.progress(parking, { duration: 900 }), f.progress(target, { duration: 900 })],
    [f.reveal([burnDots, burnRings, burnVectors], { duration: 320, scale: 0.4 }), f.reveal([axis, vacant, ghost], { duration: 320 })],
    f.progress(coast, { duration: 1600, easing: "easeInOut" }),
    [f.reveal([craftRadius, craftDot, craftVector], { duration: 260, scale: 0.5 }), f.pulse(craftDot, { duration: 500 })],
    [f.progress(dims, { duration: 500 }), f.reveal(dimLabels, { duration: 300 })],
    [f.progress([leadAmber, leadInk, leadGreen], { duration: 500 }), f.reveal([...notes, ...visviva, facts, f1], { duration: 320, stagger: 70 })],
  ], { gap: 90 });

  f.machine({
    initial: "drafting",
    variables: { ...defaults },
    states: { drafting: { on: {
      SET_ALTITUDE: { target: "drafting", actions: [{ type: "set", var: "altitude", value: { fromEvent: true } }] },
      SET_TARGET: { target: "drafting", actions: [{ type: "set", var: "target", value: { fromEvent: true } }] },
      SET_NU: { target: "drafting", actions: [{ type: "set", var: "nu", value: { fromEvent: true } }] },
    } } },
  });
  f.controls([
    { label: "Parking altitude (km)", kind: "range", event: "SET_ALTITUDE", bind: "altitude", min: 200, max: 2000, step: 50, group: "transfer" },
    { label: "Target radius (km)", kind: "range", event: "SET_TARGET", bind: "target", min: 8000, max: 60000, step: 500, group: "transfer" },
    { label: "Spacecraft ν (°)", kind: "range", event: "SET_NU", bind: "nu", min: 0, max: 180, step: 1, group: "transfer" },
    { label: "Reset", kind: "reset", group: "transfer" },
  ]);
});
```

## Sheet 02 — Orbital elements

Keplerian geometry: the true anomaly ν at the focus, the eccentric anomaly E at the centre through
the auxiliary circle, and two swept sectors of equal area. Raise the eccentricity and watch the
apoapsis sector stretch to keep the same area as the periapsis one.

```kineglyph live id=drafting-elements view=preview height=640
import { drafting as D, draftingTheme, figure, loadMath, orbital as O } from "kineglyph";

export const theme = draftingTheme;
const math = await loadMath();

const CX = 1240, CY = 985, A = 600, A_KM = 26560;
const km = (v, d = 0) => `${O.formatGrouped(v, d)} km`;

function model(vars) {
  const e = Number(vars.e);
  const nuDeg = Number(vars.nu);
  const B = A * Math.sqrt(1 - e * e), C = A * e;
  const F1 = { x: CX - C, y: CY }, F2 = { x: CX + C, y: CY };
  const peri = { x: CX - A, y: CY }, apo = { x: CX + A, y: CY };
  const E = O.degrees(O.trueToEccentric(O.radians(nuDeg), e));
  const P = D.ellipsePoint(CX, CY, A, B, 0, 180 + E);
  const above = P.y <= CY;
  const AUX = { x: P.x, y: CY + (above ? -1 : 1) * Math.sqrt(Math.max(A * A - (P.x - CX) ** 2, 0)) };
  const heading = D.ellipseTangent(A, B, 0, 180 + E);
  const sectorPoints = (t0, t1, n = 72) => {
    const pts = [F1];
    for (let k = 0; k <= n; k += 1) pts.push(D.ellipsePoint(CX, CY, A, B, 0, t0 + ((t1 - t0) * k) / n));
    return pts;
  };
  const PSPAN = 62;
  const targetArea = D.polygonArea(sectorPoints(180 - PSPAN, 180 + PSPAN));
  let lo = 1, hi = 179;
  for (let i = 0; i < 48; i += 1) {
    const mid = (lo + hi) / 2;
    if (D.polygonArea(sectorPoints(-mid, mid)) < targetArea) lo = mid; else hi = mid;
  }
  const ASPAN = (lo + hi) / 2;
  const state = O.orbitState(A_KM, e, O.radians(nuDeg));
  const nuSpan = (((O.degrees(Math.atan2(P.y - F1.y, P.x - F1.x)) - 180) % 360) + 360) % 360;
  const eSpan = (((O.degrees(Math.atan2(AUX.y - CY, AUX.x - CX)) - 180) % 360) + 360) % 360;
  const dA = D.dimension(CX, CY, apo.x, CY, { offset: -84 });
  const dB = D.dimension(CX, CY, CX, CY - B, { offset: -88 });
  const dC = D.dimension(CX, CY, F1.x, CY, { offset: 84 });
  const swept = (targetArea / (A * A)) * A_KM * A_KM;
  return {
    sectors: `${D.polyline(sectorPoints(180 - PSPAN, 180 + PSPAN), true)} ${D.polyline(sectorPoints(-ASPAN, ASPAN), true)}`,
    ellipse: D.ellipse(CX, CY, A, B),
    axes: `${D.line(peri.x - 105, CY, apo.x + 105, CY)} ${D.line(CX, CY - B - 105, CX, CY + B + 105)}`,
    foci: `${D.crosshair(F1.x, F1.y, 22)} ${D.crosshair(F2.x, F2.y, 22)}`,
    body: D.circle(F1.x, F1.y, 58),
    construction: `${D.line(P.x, P.y, AUX.x, AUX.y)} ${D.line(CX, CY, AUX.x, AUX.y)} ${D.line(P.x, P.y, P.x, CY)}`,
    auxDot: D.circle(AUX.x, AUX.y, 7),
    radius: D.vector(F1.x, F1.y, P.x, P.y),
    craftDot: D.circle(P.x, P.y, 12),
    velocity: D.vector(P.x, P.y, P.x + 150 * Math.cos(heading), P.y + 150 * Math.sin(heading)),
    apsides: `${D.circle(peri.x, peri.y, 11)} ${D.circle(apo.x, apo.y, 11)}`,
    nuArc: D.arc(F1.x, F1.y, 150, 180, 180 + nuSpan),
    eArc: D.arc(CX, CY, 112, 180, 180 + eSpan),
    dims: `${dA.d} ${dB.d} ${dC.d}`,
    leadGreen: D.leader(P.x, P.y, 602, 430, { stub: -34 }),
    leadViolet: D.leader(...Object.values(D.ellipsePoint(CX, CY, A, B, 0, 28)), 1958, 1234),
    leadAmber: `${D.leader(peri.x, peri.y, 602, 1174, { stub: -34 })} ${D.leader(apo.x, apo.y, 1958, 1094)}`,
    dimA: `a ${km(A_KM)}`,
    dimB: `b ${km(A_KM * Math.sqrt(1 - e * e))}`,
    dimC: `c = a·e`,
    stateb: `r ${km(state.r)}`,
    statec: `v ${state.v.toFixed(3)} km/s`,
    stated: `ν ${nuDeg.toFixed(0)}° · E ${O.degrees(state.E).toFixed(1)}°`,
    areab: `ΔA₁ = ΔA₂`,
    areac: `${O.formatGrouped(swept / 1e6, 1)}×10⁶ km²`,
    perib: `r_p ${km(state.rp)}`,
    apoc: `r_a ${km(state.ra)}`,
    elE: e.toFixed(4),
    elT: O.formatDuration(state.period),
    elN: `${(86400 / state.period).toFixed(3)} rev/d`,
    elM: `${O.degrees(state.M).toFixed(2)}°`,
    fact1: `ε  ${O.specificEnergy(A_KM).toFixed(4)} km²/s²`,
    fact2: `h  ${O.formatGrouped(O.angularMomentum(A_KM, e))} km²/s`,
    fact3: `γ  ${O.degrees(state.gamma) >= 0 ? "+" : ""}${O.degrees(state.gamma).toFixed(2)}°`,
  };
}

const defaults = { e: 0.6896, nu: 235 };
export const deriveSignals = (vars) => model({ ...defaults, ...vars });

export default figure("drafting-elements", {
  title: "Orbital elements",
  description: "True, eccentric and mean anomaly on one ellipse, with Kepler's equal areas.",
  background: "canvas",
  padding: 0,
  hold: 900,
  signals: model(defaults),
}, (f) => {
  const s = model(defaults);
  const L = (key, o) => D.layer(f, s[key], { id: key, bind: { path: key }, ...o });
  const ink = { sketch: { seed: 23 } };
  const sectors = L("sectors", { fill: "info", stroke: "info", strokeWidth: 0.8, opacity: 0.16 });
  const aux = D.layer(f, D.circle(CX, CY, A), { id: "aux-circle", stroke: "textMuted", strokeWidth: 0.8, opacity: 0.26, dash: "dashed" });
  const ellipse = L("ellipse", { strokeWidth: 2, opacity: 0.88, ...ink });
  const axes = L("axes", { stroke: "textMuted", strokeWidth: 0.8, opacity: 0.36, dash: "dashed" });
  const foci = L("foci", { strokeWidth: 1, opacity: 0.55 });
  const bodyFill = L("body", { fill: "text", stroke: "none", strokeWidth: 0, opacity: 0.13 });
  const body = L("body", { id: "body-ring", strokeWidth: 1.4, opacity: 0.72, ...ink });
  const construction = L("construction", { stroke: "textMuted", strokeWidth: 0.8, opacity: 0.48, dash: "dashed" });
  const auxDot = L("auxDot", { stroke: "textMuted", strokeWidth: 1, opacity: 0.75 });
  const radius = L("radius", { fill: "success", stroke: "success", strokeWidth: 1.4, opacity: 0.85 });
  const craftDot = L("craftDot", { fill: "success", stroke: "none", strokeWidth: 0, opacity: 0.95 });
  const velocity = L("velocity", { fill: "success", stroke: "success", strokeWidth: 1.3, opacity: 0.8 });
  const apsides = L("apsides", { fill: "accent", stroke: "none", strokeWidth: 0, opacity: 0.92 });
  const nuArc = L("nuArc", { stroke: "success", strokeWidth: 1, opacity: 0.68 });
  const eArc = L("eArc", { stroke: "textMuted", strokeWidth: 1, opacity: 0.72 });
  const dims = L("dims", { fill: "textMuted", stroke: "textMuted", strokeWidth: 0.8, opacity: 0.55 });
  const leadGreen = L("leadGreen", { fill: "none", stroke: "success", strokeWidth: 0.8, opacity: 0.55 });
  const leadViolet = L("leadViolet", { fill: "none", stroke: "info", strokeWidth: 0.8, opacity: 0.55 });
  const leadAmber = L("leadAmber", { fill: "none", stroke: "accent", strokeWidth: 0.8, opacity: 0.55 });
  const T = (key, x, y, anchor) => D.text(f, s[key], x, y, anchor, { id: key, bind: { text: key }, style: "code", tone: "textMuted" });
  const labels = [
    T("dimA", CX + 300, CY - 94, "bottom"),
    T("dimB", CX - 100, CY - 260, "right"),
    T("dimC", CX - 200, CY + 96, "top"),
    D.text(f, "F₁", CX - 414, CY + 80, "top", { style: "code", tone: "textMuted" }),
    D.text(f, "E", CX - 60, CY - 150, "center", { style: "code", tone: "textMuted" }),
    D.text(f, "ν", CX - 414 - 200, CY - 120, "center", { style: "body", tone: "success" }),
  ];
  const note = (id, x, y, anchor, lines, tone) => D.annotation(f, x, y, lines, { id, anchor, tone });
  const notes = [
    note("state", 560, 396, "top-right", ["SPACECRAFT", { text: s.stateb, bind: "stateb" }, { text: s.statec, bind: "statec" }, { text: s.stated, bind: "stated" }], "success"),
    note("areas", 2000, 1200, "top-left", ["EQUAL AREAS", { text: s.areab, bind: "areab" }, { text: s.areac, bind: "areac" }], "info"),
    note("peri", 560, 1140, "top-right", ["PERIAPSIS", { text: s.perib, bind: "perib" }], "accent"),
    note("apo", 2000, 1060, "top-left", ["APOAPSIS", { text: s.apoc, bind: "apoc" }], "accent"),
  ];
  const tableRows = [["a", km(A_KM)], ["e", s.elE, "elE"], ["M", s.elM, "elM"], ["n", s.elN, "elN"], ["T", s.elT, "elT"]];
  const table = [
    ...D.plate(f, 2000, 320, 790, 76 + tableRows.length * 54, { id: "elements-box", seed: 23 }),
    D.layer(f, D.line(2000, 376, 2790, 376), { id: "elements-rule", strokeWidth: 0.7, opacity: 0.24 }),
    D.text(f, "CLASSICAL ELEMENTS", 2024, 348, "left", { style: "label", tone: "textMuted" }),
    ...tableRows.flatMap(([k, v, bind], i) => [
      D.text(f, k, 2024, 410 + i * 54, "left", { style: "code" }),
      D.text(f, v, 2766, 410 + i * 54, "right", { style: "code", tone: "textMuted", ...(bind ? { id: bind, bind: { text: bind } } : {}) }),
    ]),
  ];
  const equations = [
    D.text(f, "KEPLER", 2000, 740, "top-left", { style: "label", tone: "textMuted" }),
    D.math(f, math.tex("r = \\frac{a(1 - e^2)}{1 + e\\cos\\nu}", { display: true }), 2000, 788, "top-left", { id: "kepler-orbit", size: 13, opacity: 0.92 }),
    D.math(f, math.tex("M = E - e\\sin E"), 2000, 942, "top-left", { id: "kepler-equation", size: 13, opacity: 0.92 }),
  ];
  const facts = D.annotation(f, 150, 1390, ["fact1", "fact2", "fact3"].map((bind) => ({ text: s[bind], bind })), { id: "facts", tone: "text", headStyle: "code", gap: 6, opacity: 0.62 });

  f.root(D.sheet(f, {
    id: "sheet",
    title: "Orbital elements",
    subtitle: "Keplerian geometry  /  true, eccentric and mean anomaly",
    ident: "Sheet 2 of 5 · Rev D",
    seed: 23,
    titleBlock: { title: "Sheet 02 — Elements", rows: [["Frame", "ECI J2000"], ["Source", "Two-body analytic"], ["Drawn", "Kineglyph"]] },
    layers: [
      sectors, aux, ellipse, axes, foci, bodyFill, body, construction, auxDot, apsides, radius, craftDot, velocity,
      nuArc, eArc, dims, ...labels, leadGreen, leadViolet, leadAmber, ...notes, ...table, ...equations, facts,
    ],
  }));

  f.sequence([
    [f.reveal([bodyFill, body, foci, axes], { duration: 400 }), f.progress(aux, { duration: 800 })],
    f.progress(ellipse, { duration: 1400, easing: "easeInOut" }),
    [f.reveal(apsides, { duration: 260, scale: 0.4 }), f.reveal(sectors, { duration: 600 })],
    [f.progress(construction, { duration: 500 }), f.reveal(auxDot, { duration: 200 })],
    [f.progress(radius, { duration: 500 }), f.reveal(craftDot, { duration: 220, scale: 0.4 }), f.progress(velocity, { duration: 400 })],
    [f.progress([nuArc, eArc], { duration: 500 }), f.progress(dims, { duration: 600 }), f.reveal(labels, { duration: 300 })],
    [f.progress([leadGreen, leadViolet, leadAmber], { duration: 500 }), f.reveal([...notes, ...table, ...equations, facts], { duration: 320, stagger: 40 })],
  ], { gap: 80 });

  f.machine({
    initial: "drafting",
    variables: { ...defaults },
    states: { drafting: { on: {
      SET_E: { target: "drafting", actions: [{ type: "set", var: "e", value: { fromEvent: true } }] },
      SET_NU: { target: "drafting", actions: [{ type: "set", var: "nu", value: { fromEvent: true } }] },
    } } },
  });
  f.controls([
    { label: "Eccentricity e", kind: "range", event: "SET_E", bind: "e", min: 0.05, max: 0.9, step: 0.01, group: "elements" },
    { label: "True anomaly ν (°)", kind: "range", event: "SET_NU", bind: "nu", min: 0, max: 359, step: 1, group: "elements" },
    { label: "Reset", kind: "reset", group: "elements" },
  ]);
});
```

## Sheet 03 — Ground track

The sub-satellite path of a circular orbit over a rotating Earth, split at the ±180° seam, with the
latitude envelope at ±i. Inclination, altitude, and how many revolutions to propagate are live; the
summary reads the period, mean motion, and J2 nodal regression off the same orbit.

```kineglyph live id=drafting-ground-track view=preview height=640
import { drafting as D, draftingTheme, figure, loadMath, orbital as O } from "kineglyph";

export const theme = draftingTheme;
const math = await loadMath();

const MX = 330, MY = 360, MW = 1610, MH = 900;
const xy = (lon, lat) => ({ x: MX + ((lon + 180) / 360) * MW, y: MY + ((90 - lat) / 180) * MH });
const STATION = { lon: -106.6, lat: 32.5 };

function model(vars) {
  const inclination = Number(vars.inclination);
  const altitude = Number(vars.altitude);
  const revolutions = Number(vars.revolutions);
  const track = O.groundTrack({ inclination, altitude, revolutions, ascendingNodeLongitude: -74 });
  const envelope = Math.min(track.maxLatitude, 89.9);
  const nodes = track.nodes.map((lon) => xy(lon, 0)).filter((p) => p.x > MX && p.x < MX + MW);
  const start = xy(-74, 0);
  return {
    track: track.segments.filter((seg) => seg.length > 1).map((seg) => D.polyline(seg.map(([lon, lat]) => xy(lon, lat)))).join(" "),
    envelope: `${D.line(MX, xy(0, envelope).y, MX + MW, xy(0, envelope).y)} ${D.line(MX, xy(0, -envelope).y, MX + MW, xy(0, -envelope).y)}`,
    nodes: nodes.map((p) => D.circle(p.x, p.y, 9)).join(" "),
    leadAmber: `${D.leader(start.x, start.y, start.x - 18, 1390, { stub: 34 })} ${D.leader(MX + MW, xy(0, envelope).y, 1958, 930)}`,
    envb: `φ_max = ± i = ± ${inclination.toFixed(2)}°`,
    nodeb: `λ 74°W · ${revolutions.toFixed(1)} revolutions`,
    nodec: `Ω̇ ${track.nodalRegression.toFixed(2)}°/day (J2)`,
    passPeriod: O.formatDuration(track.period),
    passAlt: `${O.formatGrouped(altitude)} km`,
    passMotion: `${track.meanMotion.toFixed(3)} rev/d`,
    passNodal: `${track.nodalRegression.toFixed(2)}°/day`,
    passSpeed: `${O.circularSpeed(O.R_EARTH + altitude).toFixed(3)} km/s`,
    passInc: `${inclination.toFixed(2)}°`,
    passModel: "2-body + J2 · WGS-84",
  };
}

const defaults = { inclination: 51.6386, altitude: 408, revolutions: 3.2 };
export const deriveSignals = (vars) => model({ ...defaults, ...vars });

export default figure("drafting-ground-track", {
  title: "Ground track",
  description: "Sub-satellite path of a circular orbit over a rotating Earth, plate carrée.",
  background: "canvas",
  padding: 0,
  hold: 900,
  signals: model(defaults),
}, (f) => {
  const s = model(defaults);
  const L = (key, o) => D.layer(f, s[key], { id: key, bind: { path: key }, ...o });
  const ink = { sketch: { seed: 41, strength: 3.4, frequency: 0.008 } };
  const fine = [], bold = [];
  for (let lon = -165; lon < 180; lon += 15) fine.push(D.line(xy(lon, 0).x, MY, xy(lon, 0).x, MY + MH));
  for (let lat = -75; lat < 90; lat += 15) fine.push(D.line(MX, xy(0, lat).y, MX + MW, xy(0, lat).y));
  for (const lon of [-120, -60, 0, 60, 120]) bold.push(D.line(xy(lon, 0).x, MY, xy(lon, 0).x, MY + MH));
  for (const lat of [-60, -30, 30, 60]) bold.push(D.line(MX, xy(0, lat).y, MX + MW, xy(0, lat).y));
  const [mapPaper, map] = D.plate(f, MX, MY, MW, MH, { id: "map", seed: 41, strokeOpacity: 0.42, sketch: ink.sketch });
  const graticule = D.layer(f, fine.join(" "), { id: "graticule", strokeWidth: 0.6, opacity: 0.16 });
  const meridians = D.layer(f, bold.join(" "), { id: "meridians", strokeWidth: 0.8, opacity: 0.34 });
  const equator = D.layer(f, D.line(MX, xy(0, 0).y, MX + MW, xy(0, 0).y), { id: "equator", strokeWidth: 1.3, opacity: 0.62 });
  const envelope = L("envelope", { stroke: "accent", strokeWidth: 0.9, opacity: 0.3, dash: "dashed" });
  const track = L("track", { stroke: "success", strokeWidth: 1.7, opacity: 0.92, ...ink });
  const nodes = L("nodes", { stroke: "accent", strokeWidth: 1.2, opacity: 0.9 });
  const st = xy(STATION.lon, STATION.lat);
  const footprint = D.layer(f, D.circle(st.x, st.y, (21 / 180) * MH), { id: "footprint", fill: "accent", stroke: "accent", strokeWidth: 1, opacity: 0.12, dash: "dashed" });
  const station = D.layer(f, D.crosshair(st.x, st.y, 16), { id: "station", stroke: "accent", strokeWidth: 1.2, opacity: 0.9 });
  const stationLabel = D.text(f, "WSMR-01", st.x + 28, st.y - 6, "bottom-left", { style: "code", tone: "accent" });
  const leadAmber = L("leadAmber", { fill: "none", stroke: "accent", strokeWidth: 0.8, opacity: 0.55 });
  const axisLabels = [];
  for (let lon = -180; lon <= 180; lon += 60)
    axisLabels.push(D.text(f, `${Math.abs(lon)}°${lon === 0 ? "" : lon > 0 ? "E" : "W"}`, xy(lon, 0).x, MY + MH + 14, "top", { style: "code", tone: "textMuted" }));
  for (let lat = -60; lat <= 60; lat += 30)
    axisLabels.push(D.text(f, `${Math.abs(lat)}°${lat === 0 ? "" : lat > 0 ? "N" : "S"}`, MX - 20, xy(0, lat).y, "right", { style: "code", tone: "textMuted" }));
  const nodeNote = D.annotation(f, xy(-74, 0).x + 24, 1356, ["ASCENDING NODE · REV 0", { text: s.nodeb, bind: "nodeb" }, { text: s.nodec, bind: "nodec" }], { id: "node-note", tone: "accent" });
  const rows = [["PERIOD", "passPeriod"], ["ALTITUDE", "passAlt"], ["INCLINATION", "passInc"], ["SPEED", "passSpeed"], ["MEAN MOTION", "passMotion"], ["NODAL REG.", "passNodal"], ["MODEL", "passModel"]];
  const table = [
    ...D.plate(f, 2000, 380, 790, 76 + rows.length * 54, { id: "pass-box", seed: 41 }),
    D.layer(f, D.line(2000, 436, 2790, 436), { id: "pass-rule", strokeWidth: 0.7, opacity: 0.24 }),
    D.text(f, "ORBIT SUMMARY", 2024, 408, "left", { style: "label", tone: "textMuted" }),
    ...rows.flatMap(([k, bind], i) => [
      D.text(f, k, 2024, 470 + i * 54, "left", { style: "code", tone: "textMuted" }),
      D.text(f, s[bind], 2766, 470 + i * 54, "right", { id: bind, style: "code", bind: { text: bind } }),
    ]),
  ];
  const envelopeNote = D.annotation(f, 2000, 896, ["LATITUDE ENVELOPE", { text: s.envb, bind: "envb" }], { id: "envelope-note", tone: "accent" });
  const equations = [
    D.math(f, math.tex("\\varphi = \\arcsin(\\sin i \\, \\sin\\theta)"), 2000, 1090, "top-left", { id: "sub-satellite-lat", size: 13, opacity: 0.92 }),
    D.math(f, math.tex("\\lambda = \\lambda_0 + \\Delta\\lambda(\\theta) - \\omega_E\\, t"), 2000, 1170, "top-left", { id: "sub-satellite-lon", size: 13, opacity: 0.92 }),
  ];

  f.root(D.sheet(f, {
    id: "sheet",
    title: "Ground track",
    subtitle: "Sub-satellite path  /  circular orbit  ·  plate carrée",
    ident: "Sheet 3 of 5 · Rev D",
    seed: 41,
    titleBlock: { title: "Sheet 03 — Track", rows: [["Frame", "ECEF WGS-84"], ["Projection", "Plate carrée"], ["Drawn", "Kineglyph"]] },
    layers: [mapPaper, map, graticule, meridians, equator, envelope, track, nodes, footprint, station, stationLabel, leadAmber, ...axisLabels, nodeNote, ...table, envelopeNote, ...equations],
  }));

  f.sequence([
    [f.reveal([mapPaper, graticule], { duration: 500 }), f.progress(map, { duration: 900 })],
    [f.progress([meridians, equator], { duration: 700 }), f.reveal(axisLabels, { duration: 300, stagger: 20 })],
    f.progress(envelope, { duration: 600 }),
    f.progress(track, { duration: 2400, easing: "linear" }),
    [f.reveal([nodes, footprint, station, stationLabel], { duration: 300, scale: 0.5 })],
    [f.progress(leadAmber, { duration: 500 }), f.reveal([nodeNote, envelopeNote, ...table, ...equations], { duration: 320, stagger: 40 })],
  ], { gap: 80 });

  f.machine({
    initial: "drafting",
    variables: { ...defaults },
    states: { drafting: { on: {
      SET_INCLINATION: { target: "drafting", actions: [{ type: "set", var: "inclination", value: { fromEvent: true } }] },
      SET_ALTITUDE: { target: "drafting", actions: [{ type: "set", var: "altitude", value: { fromEvent: true } }] },
      SET_REVOLUTIONS: { target: "drafting", actions: [{ type: "set", var: "revolutions", value: { fromEvent: true } }] },
    } } },
  });
  f.controls([
    { label: "Inclination (°)", kind: "range", event: "SET_INCLINATION", bind: "inclination", min: 0, max: 98, step: 0.5, group: "track" },
    { label: "Altitude (km)", kind: "range", event: "SET_ALTITUDE", bind: "altitude", min: 300, max: 2000, step: 10, group: "track" },
    { label: "Revolutions", kind: "range", event: "SET_REVOLUTIONS", bind: "revolutions", min: 1, max: 5, step: 0.2, group: "track" },
    { label: "Reset", kind: "reset", group: "track" },
  ]);
});
```

## Sheet 04 — Libration points

The circular restricted three-body problem: five equilibria in the frame that rotates with the two
bodies. The collinear points come from Newton–Raphson on the synodic acceleration; the triangular
ones are the equilateral corners. Raise the mass ratio past Routh's limit (μ ≈ 0.0385) and L₄/L₅
lose their stability — the sheet recolours them.

```kineglyph live id=drafting-libration view=preview height=640
import { drafting as D, draftingTheme, figure, loadMath, orbital as O } from "kineglyph";

export const theme = draftingTheme;
const math = await loadMath();

const P1 = { x: 1150, y: 1000 }, SEP = 660;
const km = (v) => `${O.formatGrouped(v)} km`;

function model(vars) {
  const mu = Number(vars.mu);
  const pts = O.librationPoints(mu);
  const at = (x, y = 0) => ({ x: P1.x + x * SEP, y: P1.y - y * SEP });
  const P2 = at(1), BC = at(pts.barycentre);
  const L1 = at(pts.l1), L2 = at(pts.l2), L3 = at(pts.l3), L4 = at(pts.l4.x, pts.l4.y), L5 = at(pts.l5.x, pts.l5.y);
  const secondary = 34 * Math.cbrt(mu / O.MU_EARTH_MOON);
  const node = (p, r) => D.circle(p.x, p.y, r);
  const ring = (p, r) => D.circle(p.x, p.y, r + 18);
  const tone = pts.triangularStable ? "success" : "danger";
  return {
    orbit: D.circle(BC.x, BC.y, SEP * (1 - mu)),
    triangles: `${D.polyline([P1, L4, P2])} ${D.polyline([P1, L5, P2])}`,
    axis: D.line(L3.x - 120, P1.y, L2.x + 140, P1.y),
    primary: D.circle(P1.x, P1.y, 86),
    secondary: D.circle(P2.x, P2.y, secondary),
    barycentre: `${D.crosshair(BC.x, BC.y, 18)} ${D.circle(BC.x, BC.y, 13)}`,
    halo: D.ellipse(L2.x, L2.y, 50, 96, -24),
    lissajous: D.ellipse(L1.x, L1.y, 36, 70, -24),
    collinearDots: `${node(L1, 15)} ${node(L2, 15)} ${node(L3, 15)}`,
    collinearRings: `${ring(L1, 15)} ${ring(L2, 15)} ${ring(L3, 15)}`,
    triangularDots: `${node(L4, 16)} ${node(L5, 16)}`,
    triangularRings: `${ring(L4, 16)} ${ring(L5, 16)}`,
    triangularTone: tone,
    sixty: D.arc(P1.x, P1.y, 210, 0, -60),
    dims: D.dimension(P1.x, P1.y, L1.x, L1.y, { offset: 190 }).d,
    leadViolet: D.leader(L2.x + 26, L2.y - 92, 2018, 414),
    leadAmber: `${D.leader(L1.x, L1.y + 33, 2018, 1154)} ${D.leader(L3.x, L3.y - 33, 602, 734, { stub: -34 })}`,
    leadTri: `${D.leader(L4.x, L4.y - 34, 602, 440, { stub: -34 })} ${D.leader(L5.x, L5.y + 34, 1002, 1474, { stub: -34 })}`,
    dimL1: km(pts.l1 * O.EARTH_MOON_DISTANCE),
    halob: `r ${km(pts.l2 * O.EARTH_MOON_DISTANCE)}`,
    haloc: `C ${pts.jacobi.l2.toFixed(4)} · T 14.8 d`,
    l1b: `r ${km(pts.l1 * O.EARTH_MOON_DISTANCE)}`,
    l1c: `C ${pts.jacobi.l1.toFixed(4)} · saddle`,
    l4a: pts.triangularStable ? "L₄ STABLE" : "L₄ UNSTABLE",
    l4b: pts.triangularStable ? `μ < ${pts.stableLimit.toFixed(5)}` : `μ > ${pts.stableLimit.toFixed(5)}`,
    l5a: pts.triangularStable ? "L₅ STABLE" : "L₅ UNSTABLE",
    l3b: `r ${km(-pts.l3 * O.EARTH_MOON_DISTANCE)}`,
    fact1: `μ      ${mu.toFixed(6)}`,
    fact2: `C(L₁)  ${pts.jacobi.l1.toFixed(5)}`,
    fact3: `C(L₂)  ${pts.jacobi.l2.toFixed(5)}`,
    fact4: `C(L₄)  ${pts.jacobi.l4.toFixed(5)}`,
    fact5: `a      ${km(O.EARTH_MOON_DISTANCE)}`,
  };
}

const defaults = { mu: 0.0121506 };
export const deriveSignals = (vars) => model({ ...defaults, ...vars });

export default figure("drafting-libration", {
  title: "Libration points",
  description: "Lagrange points of the circular restricted three-body problem in the rotating frame.",
  background: "canvas",
  padding: 0,
  hold: 900,
  signals: model(defaults),
}, (f) => {
  const s = model(defaults);
  const L = (key, o) => D.layer(f, s[key], { id: key, bind: { path: key }, ...o });
  const ink = { sketch: { seed: 59 } };
  const orbit = L("orbit", { strokeWidth: 1, opacity: 0.3, dash: "dashed", ...ink });
  const triangles = L("triangles", { stroke: "textMuted", strokeWidth: 0.8, opacity: 0.34, dash: "dashed" });
  const axis = L("axis", { stroke: "textMuted", strokeWidth: 0.8, opacity: 0.38, dash: "dashed" });
  const primaryFill = L("primary", { fill: "text", stroke: "none", strokeWidth: 0, opacity: 0.13 });
  const primary = L("primary", { id: "primary-ring", strokeWidth: 1.7, opacity: 0.78, ...ink });
  const secondaryFill = L("secondary", { fill: "text", stroke: "none", strokeWidth: 0, opacity: 0.15 });
  const secondary = L("secondary", { id: "secondary-ring", strokeWidth: 1.4, opacity: 0.78, ...ink });
  const barycentre = L("barycentre", { strokeWidth: 0.9, opacity: 0.5 });
  const halo = L("halo", { stroke: "info", strokeWidth: 1.5, opacity: 0.85, ...ink });
  const lissajous = L("lissajous", { stroke: "info", strokeWidth: 1, opacity: 0.4, dash: "dashed" });
  const collinearDots = L("collinearDots", { fill: "accent", stroke: "none", strokeWidth: 0, opacity: 0.95 });
  const collinearRings = L("collinearRings", { stroke: "accent", strokeWidth: 1, opacity: 0.5, dash: "dashed" });
  const triangularDots = L("triangularDots", { fill: "success", stroke: "none", strokeWidth: 0, opacity: 0.95, bind: { path: "triangularDots", tone: "triangularTone" } });
  const triangularRings = L("triangularRings", { stroke: "success", strokeWidth: 1, opacity: 0.5, bind: { path: "triangularRings", tone: "triangularTone" } });
  const sixty = L("sixty", { stroke: "success", strokeWidth: 1, opacity: 0.6 });
  const dims = L("dims", { fill: "textMuted", stroke: "textMuted", strokeWidth: 0.8, opacity: 0.55 });
  const leadViolet = L("leadViolet", { fill: "none", stroke: "info", strokeWidth: 0.8, opacity: 0.55 });
  const leadAmber = L("leadAmber", { fill: "none", stroke: "accent", strokeWidth: 0.8, opacity: 0.55 });
  const leadTri = L("leadTri", { fill: "none", stroke: "success", strokeWidth: 0.8, opacity: 0.55, bind: { path: "leadTri", tone: "triangularTone" } });
  const labels = [
    D.text(f, "L₁", P1.x + 0.849 * SEP, P1.y - 96, "bottom", { style: "code", tone: "accent" }),
    D.text(f, "L₂", P1.x + 1.168 * SEP + 66, P1.y, "left", { style: "code", tone: "accent" }),
    D.text(f, "L₃", P1.x - 0.993 * SEP, P1.y - 48, "bottom", { style: "code", tone: "accent" }),
    D.text(f, "L₄", P1.x + 0.5 * SEP + 40, P1.y - 0.866 * SEP, "left", { style: "code", tone: "success", bind: { tone: "triangularTone" } }),
    D.text(f, "L₅", P1.x + 0.5 * SEP + 40, P1.y + 0.866 * SEP, "left", { style: "code", tone: "success", bind: { tone: "triangularTone" } }),
    D.text(f, "M₁ PRIMARY", P1.x, P1.y + 108, "top", { style: "code", tone: "textMuted" }),
    D.text(f, "M₂", P1.x + SEP, P1.y + 60, "top", { style: "code", tone: "textMuted" }),
    D.text(f, "60°", P1.x + 232, P1.y - 100, "left", { style: "code", tone: "success" }),
    D.text(f, s.dimL1, P1.x + 0.42 * SEP, P1.y + 204, "top", { id: "dimL1", style: "code", tone: "textMuted", bind: { text: "dimL1" } }),
  ];
  const note = (id, x, y, anchor, lines, tone) => D.annotation(f, x, y, lines, { id, anchor, tone });
  const notes = [
    note("halo-note", 2060, 380, "top-left", ["L₂ HALO ORBIT", { text: s.halob, bind: "halob" }, { text: s.haloc, bind: "haloc" }], "info"),
    note("l1-note", 2060, 1120, "top-left", ["L₁ COLLINEAR", { text: s.l1b, bind: "l1b" }, { text: s.l1c, bind: "l1c" }], "accent"),
    note("l4-note", 560, 406, "top-right", [{ text: s.l4a, bind: "l4a" }, { text: s.l4b, bind: "l4b" }], "success"),
    note("l5-note", 960, 1440, "top-right", [{ text: s.l5a, bind: "l5a" }, "equilateral"], "success"),
    note("l3-note", 560, 700, "top-right", ["L₃ COLLINEAR", { text: s.l3b, bind: "l3b" }], "accent"),
  ];
  const facts = D.annotation(f, 150, 1300, ["fact1", "fact2", "fact3", "fact5"].map((bind) => ({ text: s[bind], bind })), { id: "facts", tone: "text", headStyle: "code", gap: 6, opacity: 0.62 });
  const root = [
    D.text(f, "COLLINEAR ROOT", 2060, 700, "top-left", { style: "label", tone: "textMuted" }),
    D.math(f, math.tex("x - \\frac{1 - \\mu}{r_1^{2}} \\mp \\frac{\\mu}{r_2^{2}} = 0", { display: true }), 2060, 748, "top-left", { id: "root-equation", size: 13, opacity: 0.92 }),
    D.text(f, "Newton–Raphson", 2060, 910, "top-left", { style: "code", tone: "textMuted" }),
  ];

  f.root(D.sheet(f, {
    id: "sheet",
    title: "Libration points",
    subtitle: "Circular restricted three-body problem  /  rotating frame",
    ident: "Sheet 4 of 5 · Rev D",
    seed: 59,
    titleBlock: { title: "Sheet 04 — Libration", rows: [["System", "Earth–Moon CR3BP"], ["Frame", "Synodic, rotating"], ["Drawn", "Kineglyph"]] },
    layers: [
      orbit, triangles, axis, primaryFill, primary, secondaryFill, secondary, barycentre, halo, lissajous,
      collinearRings, collinearDots, triangularRings, triangularDots, sixty, dims, ...labels,
      leadViolet, leadAmber, leadTri, ...notes, facts, ...root,
    ],
  }));

  f.sequence([
    [f.reveal([primaryFill, primary, secondaryFill, secondary, barycentre], { duration: 500 }), f.progress(orbit, { duration: 1000 })],
    [f.progress([axis, triangles], { duration: 800 }), f.progress(sixty, { duration: 400 })],
    [f.reveal([collinearDots, collinearRings], { duration: 300, scale: 0.4 }), f.reveal([triangularDots, triangularRings], { duration: 300, scale: 0.4 })],
    [f.progress([halo, lissajous], { duration: 900 })],
    [f.progress(dims, { duration: 600 }), f.reveal(labels, { duration: 300, stagger: 30 })],
    [f.progress([leadViolet, leadAmber, leadTri], { duration: 500 }), f.reveal([...notes, facts, ...root], { duration: 320, stagger: 40 })],
  ], { gap: 80 });

  f.machine({
    initial: "drafting",
    variables: { ...defaults },
    states: { drafting: { on: {
      SET_MU: { target: "drafting", actions: [{ type: "set", var: "mu", value: { fromEvent: true } }] },
    } } },
  });
  f.controls([
    { label: "Mass ratio μ", kind: "range", event: "SET_MU", bind: "mu", min: 0.001, max: 0.06, step: 0.0005, group: "cr3bp" },
    { label: "Reset", kind: "reset", group: "cr3bp" },
  ]);
});
```

## Sheet 05 — Ascent profile

A gravity-turn shaped ascent over a curved planet: vertical rise, pitch-over, and a climb that
flattens toward insertion. The insertion altitude and the shape of the climb are live; the
insertion speed, orbit period, and ideal Δv come from the target orbit.

```kineglyph live id=drafting-ascent view=preview height=640
import { drafting as D, draftingTheme, figure, loadMath, orbital as O } from "kineglyph";

export const theme = draftingTheme;
const math = await loadMath();

const OX = 1440, OY = 5600, R = 4200, S = 3.4, PHI0 = -0.2;
const at = (h, phi) => ({ x: OX + (R + S * h) * Math.sin(phi), y: OY - (R + S * h) * Math.cos(phi) });
const arcAt = (h, x0 = 210, x1 = 2670, n = 160) => {
  const r = R + S * h;
  const a0 = Math.asin(Math.max(-1, Math.min(1, (x0 - OX) / r)));
  const a1 = Math.asin(Math.max(-1, Math.min(1, (x1 - OX) / r)));
  const pts = [];
  for (let k = 0; k <= n; k += 1) pts.push(at(h, a0 + ((a1 - a0) * k) / n));
  return pts;
};
const onArc = (h, x) => at(h, Math.asin((x - OX) / (R + S * h)));
const EVENTS = [
  { w: 0, name: "LIFTOFF", tx: 718, ty: 1264, tone: "accent" },
  { w: 0.055, name: "MAX-Q", tx: 108, ty: 1080, tone: "accent" },
  { w: 0.3, name: "MECO / SEP", tx: 930, ty: 640, tone: "accent" },
  { w: 0.52, name: "FAIRING", tx: 1520, ty: 430, tone: "text" },
  { w: 1, name: "SECO / INSERTION", tx: 2058, ty: 934, tone: "success" },
];

function model(vars) {
  const targetAltitude = Number(vars.altitude);
  const climbExponent = Number(vars.climb);
  const profile = O.ascentProfile({ targetAltitude, climbExponent });
  const point = (w) => { const s = profile.at(w); return at(s.altitude, PHI0 + s.phi); };
  const speed = (w) => profile.insertionSpeed * (0.58 * w + 0.42 * w ** 2.1);
  const traj = profile.samples.map((s) => at(s.altitude, PHI0 + s.phi));
  const pI = point(1), pP = point(0.99);
  const heading = Math.atan2(pI.y - pP.y, pI.x - pP.x);
  const IX = 250, IY = 400, IW = 620, IH = 330;
  const curve = (fn) => D.polyline(Array.from({ length: 121 }, (_, k) => ({ x: IX + (IW * k) / 120, y: IY + IH - 20 - (IH - 90) * fn(k / 120) })));
  const gravityLoss = 1214 * (0.7 + (0.3 * climbExponent) / 0.62);
  const lead = (tone) => EVENTS.filter((e) => e.tone === tone).map((e) => { const p = point(e.w); return D.leader(p.x, p.y, e.tx, e.ty, { stub: 34 }); }).join(" ");
  const out = {
    trajectory: D.polyline(traj),
    insertionArc: D.polyline(arcAt(targetAltitude)),
    insertionLabel: `${targetAltitude} km ORBIT`,
    events: EVENTS.map((e) => { const p = point(e.w); return D.circle(p.x, p.y, 13); }).join(" "),
    eventRings: EVENTS.map((e) => { const p = point(e.w); return D.circle(p.x, p.y, 27); }).join(" "),
    heading: D.vector(pI.x, pI.y, pI.x + 128 * Math.cos(heading), pI.y + 128 * Math.sin(heading)),
    leadAmber: lead("accent"),
    leadInk: lead("text"),
    leadGreen: lead("success"),
    velocityCurve: curve((w) => speed(w) / profile.insertionSpeed),
    altitudeCurve: curve((w) => profile.at(w).altitude / targetAltitude),
    budget1: `IDEAL     ${O.formatGrouped(profile.idealDeltaV * 1000)} m/s`,
    budget2: `GRAVITY  +${O.formatGrouped(gravityLoss)} m/s`,
    budget3: `DRAG     +  142 m/s`,
    budget4: `ROTATION −  408 m/s`,
    budget5: `REQUIRED  ${O.formatGrouped(profile.idealDeltaV * 1000 + gravityLoss + 142 - 408)} m/s`,
    vehicle1: `${profile.insertionSpeed.toFixed(3)} km/s`,
    vehicle2: O.formatDuration(profile.insertionPeriod),
    vehicle3: `${O.formatGrouped(targetAltitude)} km circular`,
  };
  EVENTS.forEach((e, i) => {
    const s = profile.at(e.w);
    out[`event${i}b`] = `h ${s.altitude.toFixed(1)} km`;
    out[`event${i}c`] = `v ${speed(e.w).toFixed(3)} km/s`;
  });
  return out;
}

const defaults = { altitude: 200, climb: 0.62 };
export const deriveSignals = (vars) => model({ ...defaults, ...vars });

export default figure("drafting-ascent", {
  title: "Ascent profile",
  description: "Gravity-turn ascent over a curved planet to a circular insertion orbit.",
  background: "canvas",
  padding: 0,
  hold: 900,
  signals: model(defaults),
}, (f) => {
  const s = model(defaults);
  const L = (key, o) => D.layer(f, s[key], { id: key, bind: { path: key }, ...o });
  const ink = { sketch: { seed: 77, strength: 3.6, frequency: 0.008 } };
  const body = D.layer(f, D.polyline([...arcAt(0), { x: 2670, y: 1682 }, { x: 210, y: 1682 }], true), { id: "body", fill: "text", stroke: "none", strokeWidth: 0, opacity: 0.05 });
  const surface = D.layer(f, D.polyline(arcAt(0)), { id: "surface", strokeWidth: 1.7, opacity: 0.8, ...ink });
  const layers = [[12, 0.26], [50, 0.22], [85, 0.2], [100, 0.48]].map(([h, op]) =>
    D.layer(f, D.polyline(arcAt(h)), { id: `layer-${h}`, stroke: h === 100 ? "accent" : "text", strokeWidth: h === 100 ? 1.6 : 1.2, opacity: op, dash: "dashed" }));
  const insertionArc = L("insertionArc", { strokeWidth: 0.9, opacity: 0.3, dash: "dotted" });
  const spokes = [];
  for (let k = -5; k <= 5; k += 1) { const a = at(-40, k * 0.05), b = at(235, k * 0.05); spokes.push(D.line(a.x, a.y, b.x, b.y)); }
  const spokesLayer = D.layer(f, spokes.join(" "), { id: "spokes", stroke: "textMuted", strokeWidth: 0.6, opacity: 0.13 });
  const trajectory = L("trajectory", { stroke: "success", strokeWidth: 2.1, opacity: 0.92, ...ink });
  const heading = L("heading", { fill: "success", stroke: "success", strokeWidth: 1.4, opacity: 0.8 });
  const events = L("events", { fill: "accent", stroke: "none", strokeWidth: 0, opacity: 0.95 });
  const eventRings = L("eventRings", { stroke: "accent", strokeWidth: 1, opacity: 0.5 });
  const leadAmber = L("leadAmber", { fill: "none", stroke: "accent", strokeWidth: 0.8, opacity: 0.55 });
  const leadInk = L("leadInk", { fill: "none", stroke: "text", strokeWidth: 0.8, opacity: 0.5 });
  const leadGreen = L("leadGreen", { fill: "none", stroke: "success", strokeWidth: 0.8, opacity: 0.55 });
  const altitudeLabels = [[12, "12 km"], [50, "50 km"], [100, "100 km KÁRMÁN"]].map(([h, label]) => {
    const p = onArc(h, 1100);
    return D.text(f, label, p.x + 2, p.y - 8, "bottom-left", { style: "code", tone: h === 100 ? "accent" : "textMuted" });
  });
  const insertionLabelPos = onArc(200, 1560);
  const insertionLabel = D.text(f, s.insertionLabel, insertionLabelPos.x + 2, insertionLabelPos.y - 8, "bottom-left", { id: "insertionLabel", style: "code", tone: "textMuted", bind: { text: "insertionLabel" } });
  const notes = EVENTS.map((e, i) => D.annotation(f, e.tx + 42, e.ty - 34, [e.name, { text: s[`event${i}b`], bind: `event${i}b` }, ...(e.w === 0 ? [] : [{ text: s[`event${i}c`], bind: `event${i}c` }])], { id: `event-${i}`, anchor: "top-left", tone: e.tone }));
  const IX = 250, IY = 400, IW = 620, IH = 330;
  const insetGrid = [];
  for (let k = 1; k < 6; k += 1) insetGrid.push(D.line(IX + (IW * k) / 6, IY, IX + (IW * k) / 6, IY + IH));
  for (let k = 1; k < 4; k += 1) insetGrid.push(D.line(IX, IY + (IH * k) / 4, IX + IW, IY + (IH * k) / 4));
  const inset = [
    ...D.plate(f, IX, IY, IW, IH, { id: "inset-box", seed: 77 }),
    D.layer(f, insetGrid.join(" "), { id: "inset-grid", strokeWidth: 0.6, opacity: 0.1 }),
    D.text(f, "v · h vs PROGRESS", IX + 16, IY + 14, "top-left", { style: "label", tone: "textMuted" }),
    L("velocityCurve", { stroke: "success", strokeWidth: 1.4, opacity: 0.85 }),
    L("altitudeCurve", { stroke: "accent", strokeWidth: 1.1, opacity: 0.68, dash: "dashed" }),
  ];
  const vehicleRows = [["INSERTION v", "vehicle1"], ["PERIOD", "vehicle2"], ["TARGET", "vehicle3"]];
  const vehicle = [
    ...D.plate(f, 1300, 1150, 700, 76 + vehicleRows.length * 54, { id: "vehicle-box", seed: 77 }),
    D.layer(f, D.line(1300, 1206, 2000, 1206), { id: "vehicle-rule", strokeWidth: 0.7, opacity: 0.24 }),
    D.text(f, "TARGET ORBIT", 1324, 1178, "left", { style: "label", tone: "textMuted" }),
    ...vehicleRows.flatMap(([k, bind], i) => [
      D.text(f, k, 1324, 1240 + i * 54, "left", { style: "code", tone: "textMuted" }),
      D.text(f, s[bind], 1976, 1240 + i * 54, "right", { id: bind, style: "code", bind: { text: bind } }),
    ]),
  ];
  const budget = D.annotation(f, 2000, 280, ["Δv BUDGET", ...["budget1", "budget2", "budget3", "budget4", "budget5"].map((bind) => ({ text: s[bind], bind }))], { id: "budget", tone: "text", gap: 5, opacity: 0.7 });

  f.root(D.sheet(f, {
    id: "sheet",
    title: "Ascent profile",
    subtitle: "Gravity-turn trajectory  /  two-stage to circular insertion",
    ident: "Sheet 5 of 5 · Rev D",
    seed: 77,
    titleBlock: { title: "Sheet 05 — Ascent", rows: [["Pad", "LC-39A  28.608°N"], ["Azimuth", "44.9° true"], ["Drawn", "Kineglyph"]] },
    layers: [body, surface, ...layers, insertionArc, spokesLayer, trajectory, heading, eventRings, events, leadAmber, leadInk, leadGreen, ...altitudeLabels, insertionLabel, ...notes, ...inset, ...vehicle, budget],
  }));

  f.sequence([
    [f.reveal([body, spokesLayer], { duration: 500 }), f.progress(surface, { duration: 900 })],
    [f.progress([...layers, insertionArc], { duration: 900, stagger: 80 }), f.reveal([...altitudeLabels, insertionLabel], { duration: 300, stagger: 60 })],
    f.progress(trajectory, { duration: 2200, easing: "easeIn" }),
    [f.reveal([events, eventRings, heading], { duration: 300, scale: 0.4 })],
    [f.progress([leadAmber, leadInk, leadGreen], { duration: 500 }), f.reveal([...notes, ...inset, ...vehicle, budget], { duration: 320, stagger: 40 })],
  ], { gap: 80 });

  f.machine({
    initial: "drafting",
    variables: { ...defaults },
    states: { drafting: { on: {
      SET_ALTITUDE: { target: "drafting", actions: [{ type: "set", var: "altitude", value: { fromEvent: true } }] },
      SET_CLIMB: { target: "drafting", actions: [{ type: "set", var: "climb", value: { fromEvent: true } }] },
    } } },
  });
  f.controls([
    { label: "Insertion altitude (km)", kind: "range", event: "SET_ALTITUDE", bind: "altitude", min: 120, max: 400, step: 10, group: "ascent" },
    { label: "Climb exponent", kind: "range", event: "SET_CLIMB", bind: "climb", min: 0.4, max: 0.9, step: 0.02, group: "ascent" },
    { label: "Reset", kind: "reset", group: "ascent" },
  ]);
});
```

## Formulas

`@kineglyph/math` wraps MathJax's TeX input and SVG output, then folds the transformed glyph
tree into one absolute path per formula (`M L C Q Z` only, 1000 units per em, baseline reported).
A formula is therefore a `path` mark: it takes semantic paint, reveals and binds like any other
mark, and renders identically in the browser, static SVG, and PNG/GIF export. The package carries
MathJax, so `@kineglyph/web` exposes it lazily:

```ts
import { loadMath, mathMark } from "@kineglyph/web";

const math = await loadMath();
const glyph = math.tex("v^2 = \\mu\\left(\\frac{2}{r} - \\frac{1}{a}\\right)", { display: true });
const mark = mathMark(glyph, { size: 14 });
f.path(mark.d, mark.viewBox, {
  width: mark.width,
  height: mark.height,
  fill: "text",
  stroke: "none",
});
```

On a sheet, `drafting.math(f, glyph, x, y, anchor, { size, tone })` does the sizing and placement.

## Using the drafting system

A sheet is an ordinary figure. `drafting.sheet` returns a `coordinates` group whose height follows
the 2880 × 1800 sheet aspect at any container width; `drafting.layer` turns path data into a
full-sheet `path` mark, and `drafting.text` / `drafting.annotation` place type in the same space.
Because every layer is a path with a `bind.path` and every number is a text with a `bind.text`,
a control changes real physics through `deriveSignals` while the entrance timeline keeps playing.
Type does not scale with the sheet — it stays legible at every width — so a sheet meant for a
narrow column carries fewer, shorter annotations than one meant for a wallpaper.

```ts
import { drafting, draftingTheme, figure, orbital } from "@kineglyph/core";

const transfer = orbital.hohmann(6778, 42164);
const scene = figure("sheet", { title: "Sheet", padding: 0 }, (f) => {
  const coast = drafting.layer(
    f,
    drafting.ellipseArc(1440, 900, 500, 500 * Math.sqrt(1 - transfer.e ** 2), 0, 180, 360),
    {
      stroke: "accent",
      strokeWidth: 2.1,
      sketch: { seed: 11 },
    },
  );
  f.root(drafting.sheet(f, { title: "Hohmann transfer", layers: [coast] }));
  f.sequence([f.progress(coast, { duration: 1600 })]);
});
```

The export CLI draws the same sheet as a 2880 × 1800 wallpaper: `kineglyph-export png --scene
./sheet.mjs#default --theme ./sheet.mjs#theme --width 2880 --out sheet.png`; `gif` samples the
entrance timeline. The `sketch` material is portable, so the exported PNG keeps the hand-drawn
displacement.
