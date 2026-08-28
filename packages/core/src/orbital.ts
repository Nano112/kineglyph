/**
 * Two-body and restricted three-body mechanics for drafting-sheet figures.
 *
 * Everything here is pure and deterministic: kilometres, seconds, radians in, plain numbers out.
 * The functions exist so a scene can bind geometry to *real* orbital quantities and recompute them
 * from a control (see `deriveSignals` in `@kineglyph/web`) instead of carrying hand-typed numbers.
 */

/** Earth's gravitational parameter, km³·s⁻². */
export const MU_EARTH = 398600.4418;
/** Earth's equatorial radius, km. */
export const R_EARTH = 6378.137;
/** Earth's second zonal harmonic. */
export const J2_EARTH = 1.08262668e-3;
/** One sidereal rotation of the Earth, seconds. */
export const SIDEREAL_DAY = 86164.0905;
/** Moon mass over Earth + Moon mass. */
export const MU_EARTH_MOON = 0.0121505856;
/** Earth–Moon mean separation, km. */
export const EARTH_MOON_DISTANCE = 384400;

const TAU = Math.PI * 2;

export function degrees(radians: number): number {
  return (radians * 180) / Math.PI;
}

export function radians(deg: number): number {
  return (deg * Math.PI) / 180;
}

/** Orbital period of a semi-major axis, seconds. */
export function period(a: number, mu = MU_EARTH): number {
  return TAU * Math.sqrt((a * a * a) / mu);
}

/** Speed at radius `r` on an orbit of semi-major axis `a` (vis-viva), km·s⁻¹. */
export function visViva(r: number, a: number, mu = MU_EARTH): number {
  return Math.sqrt(Math.max(0, mu * (2 / r - 1 / a)));
}

/** Circular orbit speed at radius `r`, km·s⁻¹. */
export function circularSpeed(r: number, mu = MU_EARTH): number {
  return Math.sqrt(mu / r);
}

/** Specific orbital energy, km²·s⁻². */
export function specificEnergy(a: number, mu = MU_EARTH): number {
  return -mu / (2 * a);
}

/** Specific angular momentum, km²·s⁻¹. */
export function angularMomentum(a: number, e: number, mu = MU_EARTH): number {
  return Math.sqrt(mu * a * (1 - e * e));
}

export interface HohmannTransfer {
  readonly r1: number;
  readonly r2: number;
  /** Transfer ellipse semi-major axis, km. */
  readonly a: number;
  /** Transfer ellipse semi-minor axis, km. */
  readonly b: number;
  /** Centre-to-focus distance, km. */
  readonly c: number;
  readonly e: number;
  /** Circular speeds on the initial and target orbits, km·s⁻¹. */
  readonly v1: number;
  readonly v2: number;
  /** Transfer-ellipse speeds at periapsis and apoapsis, km·s⁻¹. */
  readonly vt1: number;
  readonly vt2: number;
  readonly dv1: number;
  readonly dv2: number;
  readonly dvTotal: number;
  /** Periods of the initial and target circular orbits, seconds. */
  readonly period1: number;
  readonly period2: number;
  /** Half the transfer-ellipse period, seconds. */
  readonly transferTime: number;
  /** Characteristic energy of the transfer ellipse, km²·s⁻². */
  readonly c3: number;
}

/** Minimum-energy coplanar transfer between two circular orbits (either direction). */
export function hohmann(r1: number, r2: number, mu = MU_EARTH): HohmannTransfer {
  const a = (r1 + r2) / 2;
  const e = Math.abs(r2 - r1) / (r1 + r2);
  const c = a * e;
  const b = Math.sqrt(Math.max(0, a * a - c * c));
  const v1 = circularSpeed(r1, mu);
  const v2 = circularSpeed(r2, mu);
  const vt1 = visViva(r1, a, mu);
  const vt2 = visViva(r2, a, mu);
  const dv1 = vt1 - v1;
  const dv2 = v2 - vt2;
  return {
    r1,
    r2,
    a,
    b,
    c,
    e,
    v1,
    v2,
    vt1,
    vt2,
    dv1,
    dv2,
    dvTotal: Math.abs(dv1) + Math.abs(dv2),
    period1: period(r1, mu),
    period2: period(r2, mu),
    transferTime: period(a, mu) / 2,
    c3: -mu / a,
  };
}

/** Solves Kepler's equation `M = E − e·sin E` for the eccentric anomaly, radians. */
export function solveKepler(meanAnomaly: number, e: number): number {
  const M = meanAnomaly;
  let E = e < 0.8 ? M : Math.PI;
  for (let i = 0; i < 32; i += 1) {
    const f = E - e * Math.sin(E) - M;
    const step = f / (1 - e * Math.cos(E));
    E -= step;
    if (Math.abs(step) < 1e-13) break;
  }
  return E;
}

export function trueToEccentric(nu: number, e: number): number {
  return 2 * Math.atan2(Math.sqrt(1 - e) * Math.sin(nu / 2), Math.sqrt(1 + e) * Math.cos(nu / 2));
}

export function eccentricToTrue(E: number, e: number): number {
  return 2 * Math.atan2(Math.sqrt(1 + e) * Math.sin(E / 2), Math.sqrt(1 - e) * Math.cos(E / 2));
}

export function eccentricToMean(E: number, e: number): number {
  return E - e * Math.sin(E);
}

export interface OrbitState {
  /** True anomaly, radians. */
  readonly nu: number;
  /** Eccentric anomaly, radians. */
  readonly E: number;
  /** Mean anomaly, radians, in [0, 2π). */
  readonly M: number;
  /** Radius, km. */
  readonly r: number;
  /** Speed, km·s⁻¹. */
  readonly v: number;
  /** Flight-path angle, radians (positive climbing away from periapsis). */
  readonly gamma: number;
  /** Time since periapsis, seconds, in [0, period). */
  readonly t: number;
  /** Periapsis and apoapsis radii, km. */
  readonly rp: number;
  readonly ra: number;
  readonly period: number;
}

/** The state on an ellipse (`a`, `e`) at true anomaly `nu` (radians). */
export function orbitState(a: number, e: number, nu: number, mu = MU_EARTH): OrbitState {
  const p = a * (1 - e * e);
  const r = p / (1 + e * Math.cos(nu));
  const v = visViva(r, a, mu);
  const gamma = Math.atan2(e * Math.sin(nu), 1 + e * Math.cos(nu));
  const E = trueToEccentric(nu, e);
  const M = ((eccentricToMean(E, e) % TAU) + TAU) % TAU;
  const T = period(a, mu);
  return {
    nu,
    E,
    M,
    r,
    v,
    gamma,
    t: (M / TAU) * T,
    rp: a * (1 - e),
    ra: a * (1 + e),
    period: T,
  };
}

export interface GroundTrackOptions {
  /** Inclination, degrees. */
  readonly inclination: number;
  /** Altitude above `R_EARTH`, km. */
  readonly altitude: number;
  /** How many orbits to propagate. */
  readonly revolutions?: number;
  /** Longitude of the first ascending node, degrees east. */
  readonly ascendingNodeLongitude?: number;
  /** Samples per revolution. */
  readonly samplesPerRevolution?: number;
  readonly mu?: number;
  readonly bodyRadius?: number;
  readonly rotationPeriod?: number;
}

export interface GroundTrack {
  /** Orbital period, seconds. */
  readonly period: number;
  /** [longitude, latitude] polylines in degrees, split wherever the track crosses ±180°. */
  readonly segments: readonly (readonly (readonly [number, number])[])[];
  /** Ascending-node longitudes of each revolution, degrees. */
  readonly nodes: readonly number[];
  /** Highest latitude the track reaches, degrees. */
  readonly maxLatitude: number;
  /** J2 nodal regression, degrees per day (negative is westward). */
  readonly nodalRegression: number;
  /** Mean motion, revolutions per day. */
  readonly meanMotion: number;
}

/** Sub-satellite path of a circular orbit over a rotating spherical body. */
export function groundTrack(options: GroundTrackOptions): GroundTrack {
  const mu = options.mu ?? MU_EARTH;
  const R = options.bodyRadius ?? R_EARTH;
  const rotation = options.rotationPeriod ?? SIDEREAL_DAY;
  const inc = radians(options.inclination);
  const a = R + options.altitude;
  const T = period(a, mu);
  const revolutions = Math.max(0.01, options.revolutions ?? 3);
  const perRev = Math.max(8, Math.round(options.samplesPerRevolution ?? 480));
  const lon0 = options.ascendingNodeLongitude ?? 0;
  const total = Math.max(2, Math.round(perRev * revolutions));
  const segments: (readonly [number, number])[][] = [];
  let current: (readonly [number, number])[] = [];
  let previous: number | undefined;
  for (let k = 0; k <= total; k += 1) {
    const t = (revolutions * T * k) / total;
    const theta = (TAU * t) / T;
    const lat = degrees(Math.asin(Math.sin(inc) * Math.sin(theta)));
    const raw =
      lon0 +
      degrees(Math.atan2(Math.cos(inc) * Math.sin(theta), Math.cos(theta))) -
      (360 * t) / rotation;
    const lon = ((((raw + 180) % 360) + 360) % 360) - 180;
    if (previous !== undefined && Math.abs(lon - previous) > 180) {
      segments.push(current);
      current = [];
    }
    current.push([lon, lat]);
    previous = lon;
  }
  segments.push(current);
  const nodes: number[] = [];
  for (let rev = 0; rev <= Math.floor(revolutions); rev += 1) {
    const raw = lon0 - (360 * rev * T) / rotation;
    nodes.push(((((raw + 180) % 360) + 360) % 360) - 180);
  }
  const n = TAU / T;
  const meanMotion = 86400 / T;
  const nodalRegression = degrees(-1.5 * n * J2_EARTH * (R / a) * (R / a) * Math.cos(inc)) * 86400;
  return {
    period: T,
    segments,
    nodes,
    maxLatitude:
      Math.abs(options.inclination) > 90
        ? 180 - Math.abs(options.inclination)
        : Math.abs(options.inclination),
    nodalRegression,
    meanMotion,
  };
}

export interface LibrationPoints {
  readonly mu: number;
  /** Collinear points, measured from the primary along the primary–secondary line, in units of the separation. */
  readonly l1: number;
  readonly l2: number;
  readonly l3: number;
  /** Triangular points, from the primary, in units of the separation. */
  readonly l4: { readonly x: number; readonly y: number };
  readonly l5: { readonly x: number; readonly y: number };
  /** Barycentre, from the primary, in units of the separation. */
  readonly barycentre: number;
  /** Routh's criterion: the triangular points are linearly stable below this mass ratio. */
  readonly stableLimit: number;
  readonly triangularStable: boolean;
  /** Jacobi constants at rest at each point (synodic frame, dimensionless). */
  readonly jacobi: {
    readonly l1: number;
    readonly l2: number;
    readonly l3: number;
    readonly l4: number;
  };
}

const ROUTH_LIMIT = (1 - Math.sqrt(23 / 27)) / 2;

function collinearRoot(mu: number, guess: number): number {
  // f(x) is the x-acceleration in the synodic frame; its zeros are the collinear points.
  let x = guess;
  for (let i = 0; i < 64; i += 1) {
    const r1 = x + mu;
    const r2 = x - 1 + mu;
    const s1 = Math.sign(r1) || 1;
    const s2 = Math.sign(r2) || 1;
    const f = x - ((1 - mu) * s1) / (r1 * r1) - (mu * s2) / (r2 * r2);
    const df = 1 + (2 * (1 - mu)) / Math.abs(r1 * r1 * r1) + (2 * mu) / Math.abs(r2 * r2 * r2);
    const step = f / df;
    x -= step;
    if (Math.abs(step) < 1e-14) break;
  }
  return x;
}

function jacobi(mu: number, x: number, y: number): number {
  const r1 = Math.hypot(x + mu, y);
  const r2 = Math.hypot(x - 1 + mu, y);
  return x * x + y * y + (2 * (1 - mu)) / r1 + (2 * mu) / r2;
}

/** Lagrange points of the circular restricted three-body problem for mass ratio `mu`. */
export function librationPoints(mu: number): LibrationPoints {
  const seed = Math.cbrt(mu / 3);
  const l1 = collinearRoot(mu, 1 - mu - seed);
  const l2 = collinearRoot(mu, 1 - mu + seed);
  const l3 = collinearRoot(mu, -1 - (5 * mu) / 12);
  const l4 = { x: 0.5 - mu, y: Math.sqrt(3) / 2 };
  return {
    mu,
    l1: l1 + mu,
    l2: l2 + mu,
    l3: l3 + mu,
    l4: { x: 0.5, y: l4.y },
    l5: { x: 0.5, y: -l4.y },
    barycentre: mu,
    stableLimit: ROUTH_LIMIT,
    triangularStable: mu < ROUTH_LIMIT,
    jacobi: {
      l1: jacobi(mu, l1, 0),
      l2: jacobi(mu, l2, 0),
      l3: jacobi(mu, l3, 0),
      l4: jacobi(mu, l4.x, l4.y),
    },
  };
}

export interface AscentOptions {
  /** Insertion altitude, km. */
  readonly targetAltitude: number;
  /** Fraction of the profile flown vertically before the pitch-over. */
  readonly verticalRise?: number;
  /** Altitude reached at the end of the vertical rise, km. */
  readonly riseAltitude?: number;
  /** Shape of the climb after pitch-over (lower flattens sooner). */
  readonly climbExponent?: number;
  /** Downrange angle at insertion, radians. */
  readonly downrange?: number;
  readonly samples?: number;
  readonly mu?: number;
  readonly bodyRadius?: number;
}

export interface AscentSample {
  /** Progress along the profile, 0..1. */
  readonly w: number;
  /** Altitude, km. */
  readonly altitude: number;
  /** Downrange central angle from the pad, radians. */
  readonly phi: number;
}

export interface AscentProfile {
  readonly samples: readonly AscentSample[];
  readonly at: (w: number) => AscentSample;
  /** Circular speed at insertion, km·s⁻¹. */
  readonly insertionSpeed: number;
  /** Period of the insertion orbit, seconds. */
  readonly insertionPeriod: number;
  /** Ideal Δv to reach the insertion orbit from rest on the surface, km·s⁻¹. */
  readonly idealDeltaV: number;
}

/** A gravity-turn shaped ascent: vertical rise, then a pitch-over that flattens toward insertion. */
export function ascentProfile(options: AscentOptions): AscentProfile {
  const mu = options.mu ?? MU_EARTH;
  const R = options.bodyRadius ?? R_EARTH;
  const H = options.targetAltitude;
  const WV = options.verticalRise ?? 0.06;
  const h0 = Math.min(options.riseAltitude ?? 18, H);
  const k = options.climbExponent ?? 0.62;
  const span = options.downrange ?? 0.363;
  const at = (w: number): AscentSample => {
    const altitude = w <= WV ? h0 * (w / WV) : h0 + (H - h0) * ((w - WV) / (1 - WV)) ** k;
    const phi = span * (Math.max(w - 0.03, 0) / 0.97) ** 1.35;
    return { w, altitude, phi };
  };
  const count = Math.max(2, Math.round(options.samples ?? 400));
  const samples: AscentSample[] = [];
  for (let i = 0; i <= count; i += 1) samples.push(at(i / count));
  const r = R + H;
  const insertionSpeed = circularSpeed(r, mu);
  return {
    samples,
    at,
    insertionSpeed,
    insertionPeriod: period(r, mu),
    idealDeltaV: Math.sqrt(Math.max(0, insertionSpeed ** 2 + 2 * mu * (1 / R - 1 / r))),
  };
}

/** `05h 15m 24s` — a drafting-sheet duration. Hours are omitted below one hour. */
export function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const two = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${two(h)}h ${two(m)}m ${two(s)}s` : `${m}m ${two(s)}s`;
}

/** `42 164` — thin-space digit grouping the way engineering sheets print numbers. */
export function formatGrouped(value: number, decimals = 0): string {
  const fixed = Math.abs(value).toFixed(decimals);
  const [whole = "", fraction] = fixed.split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, "\x20");
  const sign = value < 0 ? "−" : "";
  return fraction === undefined ? `${sign}${grouped}` : `${sign}${grouped}.${fraction}`;
}

export const orbital = {
  MU_EARTH,
  R_EARTH,
  J2_EARTH,
  SIDEREAL_DAY,
  MU_EARTH_MOON,
  EARTH_MOON_DISTANCE,
  degrees,
  radians,
  period,
  visViva,
  circularSpeed,
  specificEnergy,
  angularMomentum,
  hohmann,
  solveKepler,
  trueToEccentric,
  eccentricToTrue,
  eccentricToMean,
  orbitState,
  groundTrack,
  librationPoints,
  ascentProfile,
  formatDuration,
  formatGrouped,
} as const;
