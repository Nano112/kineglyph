/**
 * Parametric figures: a handful of numeric inputs, a model that turns them into signals, and the
 * machine + controls + derived-signal plumbing generated from one declaration.
 *
 * The pattern is: the *model* is a pure function from parameter values to the signals a figure
 * binds (path data, text, tones). The figure's initial signals are `model(defaults)`; a host
 * recomputes them after every control change through `deriveSignals`. Writing the state machine,
 * the range controls, and the two calls to the model by hand is the same forty lines every time —
 * `parametric()` writes them once.
 */
import type { FigureBuilder } from "./figure.js";
import type { StateMachineDefinition, Variables, VariableValue } from "./machine.js";
import type { SceneControl } from "./scene.js";

export interface ParameterSpec {
  /** Default value; also what `Reset` restores. */
  readonly value: number;
  readonly label: string;
  readonly min: number;
  readonly max: number;
  readonly step?: number;
  readonly description?: string;
}

export interface ParametricOptions {
  /** Control group label; defaults to `"parameters"`. */
  readonly group?: string;
  /** Add a `Reset` control (default true). */
  readonly reset?: boolean;
  /** Name of the single machine state (default `"tuning"`). */
  readonly state?: string;
}

export interface Parametric<V extends Record<string, number>, S extends Variables> {
  /** The declared default values. */
  readonly defaults: V;
  /** `model(defaults)` — pass as the figure's `signals` metadata. */
  readonly signals: S;
  /** Machine event that sets each parameter, e.g. `SET_ALTITUDE`. */
  readonly events: Readonly<Record<keyof V, string>>;
  /** Recomputes the signals for a machine's variables; the `deriveSignals` hook for hosts. */
  deriveSignals: (variables: Variables) => S;
  /** Declares the machine and the range controls on a figure builder. */
  install: (f: FigureBuilder) => void;
  /** The machine definition (without id) and controls, for hand assembly. */
  readonly machine: Omit<StateMachineDefinition, "id">;
  readonly controls: readonly Omit<SceneControl, "id">[];
}

function eventName(key: string): string {
  return `SET_${key.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toUpperCase()}`;
}

/**
 * Declares a figure's numeric parameters and the model that maps them to signals.
 *
 * ```ts
 * const params = parametric({ altitude: { value: 400, label: "Altitude (km)", min: 200, max: 2000, step: 50 } }, model);
 * export const deriveSignals = params.deriveSignals;
 * figure("orbit", { signals: params.signals }, (f) => { params.install(f); ... });
 * ```
 */
export function parametric<V extends Record<string, number>, S extends Variables>(
  spec: { readonly [K in keyof V]: ParameterSpec },
  model: (values: V) => S,
  options: ParametricOptions = {},
): Parametric<V, S> {
  const keys = Object.keys(spec) as (keyof V & string)[];
  const defaults = Object.fromEntries(keys.map((key) => [key, spec[key].value])) as V;
  // A range control displays `signals[bind]`, so a model output named like its parameter would
  // shadow the number with a path or label. Fail here, where the author can see it.
  const collisions = keys.filter((key) => key in model(defaults));
  if (collisions.length > 0)
    throw new Error(
      `parametric: model signal(s) ${collisions.map((key) => `"${key}"`).join(", ")} share a name with a parameter; rename the signal (for example "${collisions[0]}Path").`,
    );
  const events = Object.fromEntries(keys.map((key) => [key, eventName(key)])) as Record<
    keyof V,
    string
  >;
  const state = options.state ?? "tuning";
  const group = options.group ?? "parameters";
  const machine: Omit<StateMachineDefinition, "id"> = {
    initial: state,
    variables: { ...defaults },
    states: {
      [state]: {
        on: Object.fromEntries(
          keys.map((key) => [
            events[key],
            { target: state, actions: [{ type: "set", var: key, value: { fromEvent: true } }] },
          ]),
        ),
      },
    },
  };
  const controls: Omit<SceneControl, "id">[] = keys.map((key) => {
    const entry = spec[key];
    return {
      label: entry.label,
      kind: "range",
      event: events[key],
      bind: key,
      min: entry.min,
      max: entry.max,
      ...(entry.step === undefined ? {} : { step: entry.step }),
      ...(entry.description === undefined ? {} : { description: entry.description }),
      group,
    };
  });
  if (options.reset !== false) controls.push({ label: "Reset", kind: "reset", group });
  const values = (variables: Variables): V => {
    const merged: Record<string, number> = { ...defaults };
    for (const key of keys) {
      const value: VariableValue | undefined = variables[key];
      if (typeof value === "number" && Number.isFinite(value)) merged[key] = value;
      else if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value)))
        merged[key] = Number(value);
    }
    return merged as V;
  };
  return {
    defaults,
    signals: model(defaults),
    events,
    deriveSignals: (variables) => model(values(variables)),
    install: (f) => {
      f.machine(machine);
      f.controls(controls);
    },
    machine,
    controls,
  };
}
