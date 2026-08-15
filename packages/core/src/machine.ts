/**
 * Deterministic state machines for interactive explanations.
 *
 * Definitions are plain serializable data. `sendMachineEvent` is a pure function of the current
 * machine state and the event, so any state can be reconstructed without transition history.
 */

export type VariableValue = string | number | boolean | null;
export type Variables = Readonly<Record<string, VariableValue>>;

export type ComparisonOperator =
  "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "in" | "truthy" | "falsy";

export type Condition =
  | {
      readonly var: string;
      readonly op?: ComparisonOperator;
      readonly value?: VariableValue | readonly VariableValue[];
    }
  | { readonly state: string | readonly string[] }
  | { readonly selection: string | null }
  | { readonly all: readonly Condition[] }
  | { readonly any: readonly Condition[] }
  | { readonly not: Condition };

export type ActionValue = VariableValue | { readonly fromEvent: true };

export type MachineAction =
  | { readonly type: "set"; readonly var: string; readonly value: ActionValue }
  | { readonly type: "toggle"; readonly var: string }
  | {
      readonly type: "increment";
      readonly var: string;
      readonly by?: number;
      readonly min?: number;
      readonly max?: number;
    }
  | { readonly type: "select"; readonly node: string | null }
  | { readonly type: "seek"; readonly time: number | "start" | "end" };

export interface MachineTransition {
  readonly target: string;
  readonly guard?: Condition;
  readonly actions?: readonly MachineAction[];
  readonly description?: string;
}

export type TransitionSpec = string | MachineTransition | readonly MachineTransition[];

export interface MachineStateDefinition {
  readonly label?: string;
  readonly description?: string;
  readonly entry?: readonly MachineAction[];
  readonly exit?: readonly MachineAction[];
  readonly on?: Readonly<Record<string, TransitionSpec>>;
}

/** Serializable derived-value expressions evaluated against the current machine state. */
export type SignalExpression =
  | VariableValue
  | { readonly var: string }
  | { readonly signal: string }
  | { readonly state: true }
  | { readonly selection: true }
  | { readonly when: Condition; readonly then: SignalExpression; readonly else?: SignalExpression }
  | {
      readonly match: SignalExpression;
      readonly cases: Readonly<Record<string, SignalExpression>>;
      readonly default?: SignalExpression;
    }
  | { readonly concat: readonly SignalExpression[]; readonly separator?: string }
  | { readonly not: SignalExpression };

export interface StateMachineDefinition {
  readonly id: string;
  readonly initial: string;
  readonly variables?: Variables;
  readonly states: Readonly<Record<string, MachineStateDefinition>>;
  readonly signals?: Readonly<Record<string, SignalExpression>>;
  /** Event names the machine advertises; unknown events are still accepted and ignored. */
  readonly events?: readonly string[];
}

export interface MachineState {
  readonly state: string;
  readonly variables: Variables;
  readonly selection: string | null;
}

export interface MachineEvent {
  readonly type: string;
  readonly value?: VariableValue;
}

export interface MachineEffect {
  readonly type: "seek";
  readonly time: number | "start" | "end";
}

export interface MachineStep {
  readonly previous: MachineState;
  readonly next: MachineState;
  readonly event: MachineEvent;
  readonly changed: boolean;
  readonly transition?: { readonly from: string; readonly to: string; readonly event: string };
  readonly effects: readonly MachineEffect[];
}

export interface MachineDiagnostic {
  readonly severity: "error" | "warning";
  readonly code: string;
  readonly message: string;
  readonly path?: string;
}

export interface MachineValidationOptions {
  /** Node ids that `select` actions and `selection` conditions may reference. */
  readonly nodeIds?: ReadonlySet<string> | readonly string[];
}

export interface MachineValidationResult {
  readonly ok: boolean;
  readonly diagnostics: readonly MachineDiagnostic[];
}

// ---------------------------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------------------------

function normaliseTransitions(spec: TransitionSpec): readonly MachineTransition[] {
  if (typeof spec === "string") return [{ target: spec }];
  return Array.isArray(spec) ? (spec as readonly MachineTransition[]) : [spec as MachineTransition];
}

function conditionVariables(condition: Condition, out: string[]): void {
  if ("var" in condition) out.push(condition.var);
  else if ("all" in condition) condition.all.forEach((entry) => conditionVariables(entry, out));
  else if ("any" in condition) condition.any.forEach((entry) => conditionVariables(entry, out));
  else if ("not" in condition) conditionVariables(condition.not, out);
}

function conditionStates(condition: Condition, out: string[]): void {
  if ("state" in condition)
    out.push(...(typeof condition.state === "string" ? [condition.state] : condition.state));
  else if ("all" in condition) condition.all.forEach((entry) => conditionStates(entry, out));
  else if ("any" in condition) condition.any.forEach((entry) => conditionStates(entry, out));
  else if ("not" in condition) conditionStates(condition.not, out);
}

function conditionSelections(condition: Condition, out: string[]): void {
  if ("selection" in condition && condition.selection !== null) out.push(condition.selection);
  else if ("all" in condition) condition.all.forEach((entry) => conditionSelections(entry, out));
  else if ("any" in condition) condition.any.forEach((entry) => conditionSelections(entry, out));
  else if ("not" in condition) conditionSelections(condition.not, out);
}

function isExpressionObject(
  expression: SignalExpression,
): expression is Exclude<SignalExpression, VariableValue> {
  return typeof expression === "object" && expression !== null;
}

function expressionReferences(
  expression: SignalExpression,
  refs: { vars: string[]; signals: string[]; conditions: Condition[] },
): void {
  if (!isExpressionObject(expression)) return;
  if ("var" in expression) refs.vars.push(expression.var);
  else if ("signal" in expression) refs.signals.push(expression.signal);
  else if ("when" in expression) {
    refs.conditions.push(expression.when);
    expressionReferences(expression.then, refs);
    if (expression.else !== undefined) expressionReferences(expression.else, refs);
  } else if ("match" in expression) {
    expressionReferences(expression.match, refs);
    for (const value of Object.values(expression.cases)) expressionReferences(value, refs);
    if (expression.default !== undefined) expressionReferences(expression.default, refs);
  } else if ("concat" in expression) {
    for (const part of expression.concat) expressionReferences(part, refs);
  } else if ("not" in expression) expressionReferences(expression.not, refs);
}

/** Validates a machine definition and returns every diagnostic rather than the first failure. */
export function validateStateMachine(
  machine: StateMachineDefinition,
  options: MachineValidationOptions = {},
): MachineValidationResult {
  const diagnostics: MachineDiagnostic[] = [];
  const error = (code: string, message: string, path?: string): void => {
    diagnostics.push({ severity: "error", code, message, ...(path === undefined ? {} : { path }) });
  };
  const warn = (code: string, message: string, path?: string): void => {
    diagnostics.push({
      severity: "warning",
      code,
      message,
      ...(path === undefined ? {} : { path }),
    });
  };
  const nodeIds =
    options.nodeIds === undefined
      ? undefined
      : options.nodeIds instanceof Set
        ? options.nodeIds
        : new Set(options.nodeIds as readonly string[]);
  const variables = new Set(Object.keys(machine.variables ?? {}));
  const stateIds = Object.keys(machine.states);
  const signalIds = Object.keys(machine.signals ?? {});
  const stateSet = new Set(stateIds);

  if (machine.id.length === 0) error("empty-id", "machine id must not be empty");
  if (stateIds.length === 0) error("no-states", `machine ${machine.id} declares no states`);
  if (!stateSet.has(machine.initial))
    error(
      "unknown-initial",
      `machine ${machine.id} initial state "${machine.initial}" is not defined`,
    );
  for (const name of variables) {
    if (name.length === 0) error("empty-variable", "variable names must not be empty");
    if (name.startsWith("$"))
      error("reserved-variable", `variable "${name}" uses the reserved "$" prefix`);
  }
  for (const name of signalIds) {
    if (variables.has(name))
      error("signal-collision", `signal "${name}" collides with a variable of the same name`);
    if (name.startsWith("$"))
      error("reserved-signal", `signal "${name}" uses the reserved "$" prefix`);
  }

  const checkCondition = (condition: Condition, path: string): void => {
    const vars: string[] = [];
    const states: string[] = [];
    const selections: string[] = [];
    conditionVariables(condition, vars);
    conditionStates(condition, states);
    conditionSelections(condition, selections);
    for (const name of vars)
      if (!variables.has(name))
        error("unknown-variable", `${path} refers to unknown variable "${name}"`, path);
    for (const name of states)
      if (!stateSet.has(name))
        error("unknown-state", `${path} refers to unknown state "${name}"`, path);
    if (nodeIds !== undefined)
      for (const node of selections)
        if (!nodeIds.has(node))
          error("unknown-node", `${path} refers to unknown node "${node}"`, path);
  };

  const checkActions = (actions: readonly MachineAction[] | undefined, path: string): void => {
    (actions ?? []).forEach((action, index) => {
      const actionPath = `${path}.actions[${index}]`;
      if (action.type === "set" || action.type === "toggle" || action.type === "increment") {
        if (!variables.has(action.var))
          error(
            "unknown-variable",
            `${actionPath} refers to unknown variable "${action.var}"`,
            actionPath,
          );
        if (action.type === "increment" && action.by !== undefined && !Number.isFinite(action.by))
          error("invalid-action", `${actionPath} increment step must be finite`, actionPath);
      } else if (action.type === "select") {
        if (nodeIds !== undefined && action.node !== null && !nodeIds.has(action.node))
          error("unknown-node", `${actionPath} selects unknown node "${action.node}"`, actionPath);
      } else if (action.type === "seek") {
        if (typeof action.time === "number" && (!Number.isFinite(action.time) || action.time < 0))
          error(
            "invalid-action",
            `${actionPath} seek time must be finite and non-negative`,
            actionPath,
          );
      } else {
        error("invalid-action", `${actionPath} has an unknown action type`, actionPath);
      }
    });
  };

  const reachable = new Set<string>();
  const queue = stateSet.has(machine.initial) ? [machine.initial] : [];
  for (const [stateId, state] of Object.entries(machine.states)) {
    const path = `states.${stateId}`;
    if (stateId.length === 0) error("empty-id", "state ids must not be empty");
    checkActions(state.entry, `${path}.entry`);
    checkActions(state.exit, `${path}.exit`);
    for (const [eventName, spec] of Object.entries(state.on ?? {})) {
      if (eventName.length === 0)
        error("empty-event", `${path} declares an empty event name`, path);
      const transitions = normaliseTransitions(spec);
      if (transitions.length === 0)
        error("empty-transition", `${path}.on.${eventName} declares no transitions`, path);
      transitions.forEach((transition, index) => {
        const transitionPath = `${path}.on.${eventName}[${index}]`;
        if (!stateSet.has(transition.target))
          error(
            "unknown-target",
            `${transitionPath} targets unknown state "${transition.target}"`,
            transitionPath,
          );
        if (transition.guard !== undefined)
          checkCondition(transition.guard, `${transitionPath}.guard`);
        checkActions(transition.actions, transitionPath);
        if (index < transitions.length - 1 && transition.guard === undefined)
          warn(
            "unreachable-transition",
            `${transitionPath} has no guard, so later transitions for "${eventName}" can never fire`,
            transitionPath,
          );
      });
    }
  }
  while (queue.length > 0) {
    const current = queue.shift();
    if (current === undefined || reachable.has(current)) continue;
    reachable.add(current);
    for (const spec of Object.values(machine.states[current]?.on ?? {}))
      for (const transition of normaliseTransitions(spec))
        if (stateSet.has(transition.target) && !reachable.has(transition.target))
          queue.push(transition.target);
  }
  for (const stateId of stateIds)
    if (!reachable.has(stateId) && stateSet.has(machine.initial))
      warn(
        "unreachable-state",
        `state "${stateId}" is unreachable from "${machine.initial}"`,
        stateId,
      );

  const declaredSignals = new Set<string>();
  for (const [signalId, expression] of Object.entries(machine.signals ?? {})) {
    const path = `signals.${signalId}`;
    const refs = { vars: [] as string[], signals: [] as string[], conditions: [] as Condition[] };
    expressionReferences(expression, refs);
    for (const name of refs.vars)
      if (!variables.has(name))
        error("unknown-variable", `${path} refers to unknown variable "${name}"`, path);
    for (const name of refs.signals) {
      if (name === signalId) error("signal-cycle", `${path} refers to itself`, path);
      else if (!declaredSignals.has(name))
        error(
          "signal-order",
          `${path} refers to signal "${name}" which is not declared earlier (signals evaluate in order)`,
          path,
        );
    }
    for (const condition of refs.conditions) checkCondition(condition, path);
    declaredSignals.add(signalId);
  }

  return { ok: diagnostics.every((entry) => entry.severity !== "error"), diagnostics };
}

/** Validates and returns the definition; throws with every error message when invalid. */
export function defineStateMachine(
  machine: StateMachineDefinition,
  options: MachineValidationOptions = {},
): StateMachineDefinition {
  const result = validateStateMachine(machine, options);
  const errors = result.diagnostics.filter((entry) => entry.severity === "error");
  if (errors.length > 0)
    throw new Error(
      `invalid state machine ${machine.id || "(unnamed)"}:\n${errors
        .map((entry) => `- ${entry.message}`)
        .join("\n")}`,
    );
  return machine;
}

// ---------------------------------------------------------------------------------------------
// Evaluation
// ---------------------------------------------------------------------------------------------

function truthy(value: VariableValue | undefined): boolean {
  return value !== undefined && value !== null && value !== false && value !== 0 && value !== "";
}

function compare(left: VariableValue | undefined, op: ComparisonOperator, right: unknown): boolean {
  switch (op) {
    case "eq":
      return left === right;
    case "neq":
      return left !== right;
    case "gt":
      return typeof left === "number" && typeof right === "number" && left > right;
    case "gte":
      return typeof left === "number" && typeof right === "number" && left >= right;
    case "lt":
      return typeof left === "number" && typeof right === "number" && left < right;
    case "lte":
      return typeof left === "number" && typeof right === "number" && left <= right;
    case "in":
      return Array.isArray(right) && (right as readonly unknown[]).includes(left);
    case "truthy":
      return truthy(left);
    case "falsy":
      return !truthy(left);
  }
}

/** Evaluates a serializable condition against a machine state. Unknown variables are undefined. */
export function evaluateCondition(condition: Condition, state: MachineState): boolean {
  if ("var" in condition) {
    const op = condition.op ?? (condition.value === undefined ? "truthy" : "eq");
    return compare(state.variables[condition.var], op, condition.value);
  }
  if ("state" in condition)
    return typeof condition.state === "string"
      ? state.state === condition.state
      : condition.state.includes(state.state);
  if ("selection" in condition) return state.selection === condition.selection;
  if ("all" in condition) return condition.all.every((entry) => evaluateCondition(entry, state));
  if ("any" in condition) return condition.any.some((entry) => evaluateCondition(entry, state));
  return !evaluateCondition(condition.not, state);
}

function stringify(value: VariableValue | undefined): string {
  if (value === undefined || value === null) return "";
  return typeof value === "string" ? value : String(value);
}

function evaluateExpression(
  expression: SignalExpression,
  state: MachineState,
  signals: Record<string, VariableValue>,
): VariableValue {
  if (!isExpressionObject(expression)) return expression;
  if ("var" in expression) return state.variables[expression.var] ?? null;
  if ("signal" in expression) return signals[expression.signal] ?? null;
  if ("state" in expression) return state.state;
  if ("selection" in expression) return state.selection;
  if ("when" in expression)
    return evaluateCondition(expression.when, state)
      ? evaluateExpression(expression.then, state, signals)
      : expression.else === undefined
        ? null
        : evaluateExpression(expression.else, state, signals);
  if ("match" in expression) {
    const key = stringify(evaluateExpression(expression.match, state, signals));
    const branch = Object.hasOwn(expression.cases, key) ? expression.cases[key] : undefined;
    if (branch !== undefined) return evaluateExpression(branch, state, signals);
    return expression.default === undefined
      ? null
      : evaluateExpression(expression.default, state, signals);
  }
  if ("concat" in expression)
    return expression.concat
      .map((part) => stringify(evaluateExpression(part, state, signals)))
      .join(expression.separator ?? "");
  return !truthy(evaluateExpression(expression.not, state, signals));
}

/**
 * Derived signals plus variables and the reserved `$state` / `$selection` values.
 * Signals evaluate in declaration order, so later signals may reference earlier ones.
 */
export function evaluateSignals(
  machine: StateMachineDefinition,
  state: MachineState,
): Readonly<Record<string, VariableValue>> {
  const signals: Record<string, VariableValue> = { ...state.variables };
  signals.$state = state.state;
  signals.$selection = state.selection;
  for (const [signalId, expression] of Object.entries(machine.signals ?? {}))
    signals[signalId] = evaluateExpression(expression, state, signals);
  return signals;
}

function applyActions(
  actions: readonly MachineAction[] | undefined,
  state: MachineState,
  event: MachineEvent | undefined,
  effects: MachineEffect[],
): MachineState {
  let variables: Record<string, VariableValue> | undefined;
  let selection = state.selection;
  for (const action of actions ?? []) {
    switch (action.type) {
      case "set": {
        variables ??= { ...state.variables };
        const value =
          typeof action.value === "object" && action.value !== null
            ? (event?.value ?? null)
            : action.value;
        variables[action.var] = value;
        break;
      }
      case "toggle": {
        variables ??= { ...state.variables };
        variables[action.var] = !truthy(variables[action.var]);
        break;
      }
      case "increment": {
        variables ??= { ...state.variables };
        const current = variables[action.var];
        const base = typeof current === "number" ? current : 0;
        let next = base + (action.by ?? 1);
        if (action.min !== undefined) next = Math.max(action.min, next);
        if (action.max !== undefined) next = Math.min(action.max, next);
        variables[action.var] = next;
        break;
      }
      case "select":
        selection = action.node;
        break;
      case "seek":
        effects.push({ type: "seek", time: action.time });
        break;
    }
  }
  return { state: state.state, variables: variables ?? state.variables, selection };
}

/** The machine's initial state with entry actions of the initial state applied. */
export function createMachineState(machine: StateMachineDefinition): MachineState {
  return resolveMachineState(machine, machine.initial);
}

/**
 * Random-access construction of the machine state for a named state: default variables, then
 * that state's entry actions, then explicit overrides. No history is required.
 */
export function resolveMachineState(
  machine: StateMachineDefinition,
  stateId: string,
  overrides: { readonly variables?: Variables; readonly selection?: string | null } = {},
): MachineState {
  if (!Object.hasOwn(machine.states, stateId))
    throw new Error(`machine ${machine.id} has no state "${stateId}"`);
  const base: MachineState = {
    state: stateId,
    variables: { ...(machine.variables ?? {}) },
    selection: null,
  };
  const entered = applyActions(machine.states[stateId]?.entry, base, undefined, []);
  return {
    state: stateId,
    variables: { ...entered.variables, ...(overrides.variables ?? {}) },
    selection: overrides.selection === undefined ? entered.selection : overrides.selection,
  };
}

/** Pure, deterministic transition. Unknown events and failed guards leave the state unchanged. */
export function sendMachineEvent(
  machine: StateMachineDefinition,
  current: MachineState,
  input: string | MachineEvent,
): MachineStep {
  const event: MachineEvent = typeof input === "string" ? { type: input } : input;
  const definition = machine.states[current.state];
  if (definition === undefined)
    throw new Error(`machine ${machine.id} is in unknown state "${current.state}"`);
  const spec = definition.on?.[event.type];
  const effects: MachineEffect[] = [];
  const unchanged: MachineStep = {
    previous: current,
    next: current,
    event,
    changed: false,
    effects,
  };
  if (spec === undefined) return unchanged;
  const transition = normaliseTransitions(spec).find(
    (candidate) => candidate.guard === undefined || evaluateCondition(candidate.guard, current),
  );
  if (transition === undefined) return unchanged;
  const target = machine.states[transition.target];
  if (target === undefined)
    throw new Error(
      `machine ${machine.id} transition targets unknown state "${transition.target}"`,
    );
  let next = applyActions(definition.exit, current, event, effects);
  next = applyActions(transition.actions, next, event, effects);
  next = { ...next, state: transition.target };
  next = applyActions(target.entry, next, event, effects);
  const changed =
    next.state !== current.state ||
    next.selection !== current.selection ||
    !shallowEqualVariables(next.variables, current.variables) ||
    effects.length > 0;
  return {
    previous: current,
    next,
    event,
    changed,
    transition: { from: current.state, to: transition.target, event: event.type },
    effects,
  };
}

function shallowEqualVariables(a: Variables, b: Variables): boolean {
  const keys = Object.keys(a);
  if (keys.length !== Object.keys(b).length) return false;
  return keys.every((key) => a[key] === b[key]);
}

/** Events that have at least one transition from the given state (guards not evaluated). */
export function availableEvents(
  machine: StateMachineDefinition,
  state: MachineState,
): readonly string[] {
  return Object.keys(machine.states[state.state]?.on ?? {});
}

// ---------------------------------------------------------------------------------------------
// Live controller
// ---------------------------------------------------------------------------------------------

export interface MachineHistoryEntry {
  readonly event: MachineEvent;
  readonly from: string;
  readonly to: string;
}

export interface MachineControllerOptions {
  readonly initialState?: MachineState;
  /** Retain a transition log for debugging and inspection. Never required to resolve a frame. */
  readonly history?: boolean;
  readonly onChange?: (step: MachineStep) => void;
}

/** Stateful convenience wrapper over the pure transition functions. */
export class MachineController {
  readonly machine: StateMachineDefinition;
  #state: MachineState;
  readonly #history: MachineHistoryEntry[] | undefined;
  readonly #onChange: MachineControllerOptions["onChange"];

  constructor(machine: StateMachineDefinition, options: MachineControllerOptions = {}) {
    this.machine = machine;
    this.#state = options.initialState ?? createMachineState(machine);
    this.#history = options.history === true ? [] : undefined;
    this.#onChange = options.onChange;
  }

  get state(): MachineState {
    return this.#state;
  }

  get signals(): Readonly<Record<string, VariableValue>> {
    return evaluateSignals(this.machine, this.#state);
  }

  get history(): readonly MachineHistoryEntry[] {
    return this.#history ?? [];
  }

  send(event: string | MachineEvent): MachineStep {
    const step = sendMachineEvent(this.machine, this.#state, event);
    if (step.transition !== undefined) {
      this.#state = step.next;
      this.#history?.push({
        event: step.event,
        from: step.transition.from,
        to: step.transition.to,
      });
      this.#onChange?.(step);
    }
    return step;
  }

  reset(): MachineStep {
    const previous = this.#state;
    this.#state = createMachineState(this.machine);
    this.#history?.splice(0, this.#history.length);
    const step: MachineStep = {
      previous,
      next: this.#state,
      event: { type: "$reset" },
      changed: true,
      transition: { from: previous.state, to: this.#state.state, event: "$reset" },
      effects: [{ type: "seek", time: "start" }],
    };
    this.#onChange?.(step);
    return step;
  }

  select(node: string | null): void {
    if (this.#state.selection === node) return;
    const previous = this.#state;
    this.#state = { ...this.#state, selection: node };
    this.#onChange?.({
      previous,
      next: this.#state,
      event: { type: "$select", value: node },
      changed: true,
      effects: [],
    });
  }
}
