/** Serializable easing values shared by timelines, scenes, plots, and exporters. */
export type EasingName =
  | "linear"
  | "easeIn"
  | "easeOut"
  | "easeInOut"
  | "easeInCubic"
  | "easeOutCubic"
  | "easeInOutCubic"
  | "easeOutBack"
  | "easeOutExpo";

export interface CubicBezierEasing {
  readonly type: "cubic-bezier";
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
}

export interface SpringEasing {
  readonly type: "spring";
  /** Oscillation frequency in radians over the normalised duration. */
  readonly frequency: number;
  /** Exponential damping strength. Zero produces an undamped curve. */
  readonly damping: number;
}

export type Easing = EasingName | CubicBezierEasing | SpringEasing;

function finite(value: number, label: string): number {
  if (!Number.isFinite(value)) throw new RangeError(`${label} must be finite`);
  return value;
}

/** CSS-like cubic Bézier easing that stays data rather than becoming a callback. */
export function cubicBezier(x1: number, y1: number, x2: number, y2: number): CubicBezierEasing {
  finite(x1, "x1");
  finite(y1, "y1");
  finite(x2, "x2");
  finite(y2, "y2");
  if (x1 < 0 || x1 > 1 || x2 < 0 || x2 > 1)
    throw new RangeError("cubic Bézier x control points must be between 0 and 1");
  return { type: "cubic-bezier", x1, y1, x2, y2 };
}

/** A deterministic damped spring curve suitable for serialisation and random-access rendering. */
export function spring(
  options: { readonly frequency?: number; readonly damping?: number } = {},
): SpringEasing {
  const frequency = finite(options.frequency ?? 10.5, "spring frequency");
  const damping = finite(options.damping ?? 7, "spring damping");
  if (frequency <= 0) throw new RangeError("spring frequency must be greater than zero");
  if (damping < 0) throw new RangeError("spring damping must be non-negative");
  return { type: "spring", frequency, damping };
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function cubic(a: number, b: number, t: number): number {
  const inverse = 1 - t;
  return 3 * inverse * inverse * t * a + 3 * inverse * t * t * b + t * t * t;
}

function cubicDerivative(a: number, b: number, t: number): number {
  const inverse = 1 - t;
  return 3 * inverse * inverse * a + 6 * inverse * t * (b - a) + 3 * t * t * (1 - b);
}

function evaluateBezier(curve: CubicBezierEasing, progress: number): number {
  let parameter = progress;
  for (let iteration = 0; iteration < 8; iteration += 1) {
    const error = cubic(curve.x1, curve.x2, parameter) - progress;
    if (Math.abs(error) < 1e-7) break;
    const slope = cubicDerivative(curve.x1, curve.x2, parameter);
    if (Math.abs(slope) < 1e-7) break;
    parameter = clamp01(parameter - error / slope);
  }

  // Newton iteration can stall on nearly-flat handles. Bisection makes the result dependable.
  let lower = 0;
  let upper = 1;
  for (let iteration = 0; iteration < 12; iteration += 1) {
    const x = cubic(curve.x1, curve.x2, parameter);
    if (Math.abs(x - progress) < 1e-7) break;
    if (x < progress) lower = parameter;
    else upper = parameter;
    parameter = (lower + upper) / 2;
  }
  return cubic(curve.y1, curve.y2, parameter);
}

function evaluateSpring(curve: SpringEasing, progress: number): number {
  const raw = 1 - Math.exp(-curve.damping * progress) * Math.cos(curve.frequency * progress);
  const end = 1 - Math.exp(-curve.damping) * Math.cos(curve.frequency);
  return Math.abs(end) < 1e-9 ? raw : raw / end;
}

/** Evaluate any easing at a normalised point. Endpoints are exact; springs may overshoot between. */
export function applyEasing(easing: Easing | undefined, progress: number): number {
  const t = clamp01(progress);
  if (t === 0 || t === 1) return t;
  if (typeof easing === "object")
    return easing.type === "cubic-bezier" ? evaluateBezier(easing, t) : evaluateSpring(easing, t);
  switch (easing ?? "linear") {
    case "easeIn":
      return t * t;
    case "easeOut":
      return 1 - (1 - t) ** 2;
    case "easeInOut":
      return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
    case "easeInCubic":
      return t ** 3;
    case "easeOutCubic":
      return 1 - (1 - t) ** 3;
    case "easeInOutCubic":
      return t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2;
    case "easeOutBack": {
      const overshoot = 1.70158;
      return 1 + (overshoot + 1) * (t - 1) ** 3 + overshoot * (t - 1) ** 2;
    }
    case "easeOutExpo":
      return 1 - 2 ** (-10 * t);
    case "linear":
      return t;
  }
}
