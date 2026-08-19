/**
 * Deterministic state machines for interactive explanations.
 *
 * Definitions are plain serializable data. `sendMachineEvent` is a pure function of the current
 * machine state and the event, so any state can be reconstructed without transition history.
 */

export type ScalarValue = string | number | boolean | null;
export type VariableValue = ScalarValue | readonly ScalarValue[];
export type Variables = Readonly<Record<string, VariableValue>>;

export type ComparisonOperator =
  "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "in" | "truthy" | "falsy";

export type Condition =
  | {
      readonly var: string;
      readonly op?: ComparisonOperator;
      readonly value?: VariableValue;
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

export type ArithmeticExpressionOperator =
  | "add"
  | "subtract"
  | "multiply"
  | "divide"
  | "modulo"
  | "power"
  | "min"
  | "max"
  | "clamp"
  | "abs"
  | "floor"
  | "ceil"
  | "round";

export type BitwiseExpressionOperator =
  | "bitAnd"
  | "bitOr"
  | "bitXor"
  | "bitNot"
  | "shiftLeft"
  | "shiftRight"
  | "unsignedShiftRight"
  | "bit";

export type ComparisonExpressionOperator = "eq" | "neq" | "gt" | "gte" | "lt" | "lte";

export type CollectionExpressionOperator = "at" | "length" | "join" | "includes" | "slice" | "sum";

export type StringExpressionOperator = "upper" | "lower" | "trim" | "replace";

export type SignalExpressionOperator =
  | ArithmeticExpressionOperator
  | BitwiseExpressionOperator
  | ComparisonExpressionOperator
  | CollectionExpressionOperator
  | StringExpressionOperator;

export interface OperationExpression {
  readonly op: SignalExpressionOperator;
  readonly args: readonly SignalExpression[];
}

/** Deterministic, locale-independent scalar formatting. */
export interface FormatExpression {
  readonly format: SignalExpression;
  /** Integer radix, from 2 through 36. Omit for ordinary decimal formatting. */
  readonly radix?: number;
  /** Minimum character count, padded on the left. */
  readonly pad?: number;
  /** A single padding character. Defaults to `0`. */
  readonly padWith?: string;
  /** Fixed decimal places. Cannot be combined with `radix`. */
  readonly precision?: number;
  readonly uppercase?: boolean;
  readonly prefix?: string;
  readonly suffix?: string;
}

export interface ListExpression {
  readonly list: readonly SignalExpression[];
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
  | { readonly not: SignalExpression }
  | OperationExpression
  | FormatExpression
  | ListExpression;

export type FormatExpressionOptions = Omit<FormatExpression, "format">;

function operation(
  op: SignalExpressionOperator,
  args: readonly SignalExpression[],
): OperationExpression {
  return { op, args };
}

/**
 * Typed builders for the serializable signal-expression IR. The returned values are plain data:
 * they contain no callbacks and survive JSON serialization unchanged.
 */
export const expr = {
  var: (name: string): SignalExpression => ({ var: name }),
  signal: (name: string): SignalExpression => ({ signal: name }),
  state: (): SignalExpression => ({ state: true }),
  selection: (): SignalExpression => ({ selection: true }),
  when: (
    when: Condition,
    then: SignalExpression,
    otherwise?: SignalExpression,
  ): SignalExpression => ({ when, then, ...(otherwise === undefined ? {} : { else: otherwise }) }),
  match: (
    match: SignalExpression,
    cases: Readonly<Record<string, SignalExpression>>,
    fallback?: SignalExpression,
  ): SignalExpression => ({
    match,
    cases,
    ...(fallback === undefined ? {} : { default: fallback }),
  }),
  concat: (parts: readonly SignalExpression[], separator?: string): SignalExpression => ({
    concat: parts,
    ...(separator === undefined ? {} : { separator }),
  }),
  not: (value: SignalExpression): SignalExpression => ({ not: value }),
  list: (...items: readonly SignalExpression[]): SignalExpression => ({ list: items }),
  add: (...args: readonly SignalExpression[]): SignalExpression => operation("add", args),
  subtract: (left: SignalExpression, right: SignalExpression): SignalExpression =>
    operation("subtract", [left, right]),
  multiply: (...args: readonly SignalExpression[]): SignalExpression => operation("multiply", args),
  divide: (left: SignalExpression, right: SignalExpression): SignalExpression =>
    operation("divide", [left, right]),
  modulo: (left: SignalExpression, right: SignalExpression): SignalExpression =>
    operation("modulo", [left, right]),
  power: (base: SignalExpression, exponent: SignalExpression): SignalExpression =>
    operation("power", [base, exponent]),
  min: (...args: readonly SignalExpression[]): SignalExpression => operation("min", args),
  max: (...args: readonly SignalExpression[]): SignalExpression => operation("max", args),
  clamp: (
    value: SignalExpression,
    minimum: SignalExpression,
    maximum: SignalExpression,
  ): SignalExpression => operation("clamp", [value, minimum, maximum]),
  abs: (value: SignalExpression): SignalExpression => operation("abs", [value]),
  floor: (value: SignalExpression): SignalExpression => operation("floor", [value]),
  ceil: (value: SignalExpression): SignalExpression => operation("ceil", [value]),
  round: (value: SignalExpression): SignalExpression => operation("round", [value]),
  bitAnd: (...args: readonly SignalExpression[]): SignalExpression => operation("bitAnd", args),
  bitOr: (...args: readonly SignalExpression[]): SignalExpression => operation("bitOr", args),
  bitXor: (...args: readonly SignalExpression[]): SignalExpression => operation("bitXor", args),
  bitNot: (value: SignalExpression): SignalExpression => operation("bitNot", [value]),
  shiftLeft: (value: SignalExpression, count: SignalExpression): SignalExpression =>
    operation("shiftLeft", [value, count]),
  shiftRight: (value: SignalExpression, count: SignalExpression): SignalExpression =>
    operation("shiftRight", [value, count]),
  unsignedShiftRight: (value: SignalExpression, count: SignalExpression): SignalExpression =>
    operation("unsignedShiftRight", [value, count]),
  bit: (value: SignalExpression, index: SignalExpression): SignalExpression =>
    operation("bit", [value, index]),
  eq: (left: SignalExpression, right: SignalExpression): SignalExpression =>
    operation("eq", [left, right]),
  neq: (left: SignalExpression, right: SignalExpression): SignalExpression =>
    operation("neq", [left, right]),
  gt: (left: SignalExpression, right: SignalExpression): SignalExpression =>
    operation("gt", [left, right]),
  gte: (left: SignalExpression, right: SignalExpression): SignalExpression =>
    operation("gte", [left, right]),
  lt: (left: SignalExpression, right: SignalExpression): SignalExpression =>
    operation("lt", [left, right]),
  lte: (left: SignalExpression, right: SignalExpression): SignalExpression =>
    operation("lte", [left, right]),
  at: (collection: SignalExpression, index: SignalExpression): SignalExpression =>
    operation("at", [collection, index]),
  length: (collection: SignalExpression): SignalExpression => operation("length", [collection]),
  join: (collection: SignalExpression, separator: SignalExpression = ", "): SignalExpression =>
    operation("join", [collection, separator]),
  includes: (collection: SignalExpression, value: SignalExpression): SignalExpression =>
    operation("includes", [collection, value]),
  slice: (
    collection: SignalExpression,
    start: SignalExpression,
    end?: SignalExpression,
  ): SignalExpression =>
    operation("slice", end === undefined ? [collection, start] : [collection, start, end]),
  sum: (collection: SignalExpression): SignalExpression => operation("sum", [collection]),
  upper: (value: SignalExpression): SignalExpression => operation("upper", [value]),
  lower: (value: SignalExpression): SignalExpression => operation("lower", [value]),
  trim: (value: SignalExpression): SignalExpression => operation("trim", [value]),
  replace: (
    value: SignalExpression,
    search: SignalExpression,
    replacement: SignalExpression,
  ): SignalExpression => operation("replace", [value, search, replacement]),
  format: (value: SignalExpression, options: FormatExpressionOptions = {}): SignalExpression => ({
    format: value,
    ...options,
  }),
} as const;

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
  return typeof expression === "object" && expression !== null && !Array.isArray(expression);
}

function isExpressionArray(value: unknown): value is readonly SignalExpression[] {
  return Array.isArray(value);
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
  else if ("op" in expression) {
    if (isExpressionArray(expression.args))
      for (const argument of expression.args) expressionReferences(argument, refs);
  } else if ("format" in expression) expressionReferences(expression.format, refs);
  else if ("list" in expression)
    for (const item of expression.list) expressionReferences(item, refs);
}

type ExpressionKind = "string" | "number" | "boolean" | "null" | "collection" | "unknown";

interface OperationRule {
  readonly minArgs: number;
  readonly maxArgs: number;
  readonly numeric: boolean;
  readonly result: ExpressionKind;
}

const OPERATION_RULES: Readonly<Record<SignalExpressionOperator, OperationRule>> = {
  add: { minArgs: 2, maxArgs: Number.POSITIVE_INFINITY, numeric: true, result: "number" },
  subtract: { minArgs: 2, maxArgs: 2, numeric: true, result: "number" },
  multiply: { minArgs: 2, maxArgs: Number.POSITIVE_INFINITY, numeric: true, result: "number" },
  divide: { minArgs: 2, maxArgs: 2, numeric: true, result: "number" },
  modulo: { minArgs: 2, maxArgs: 2, numeric: true, result: "number" },
  power: { minArgs: 2, maxArgs: 2, numeric: true, result: "number" },
  min: { minArgs: 1, maxArgs: Number.POSITIVE_INFINITY, numeric: true, result: "number" },
  max: { minArgs: 1, maxArgs: Number.POSITIVE_INFINITY, numeric: true, result: "number" },
  clamp: { minArgs: 3, maxArgs: 3, numeric: true, result: "number" },
  abs: { minArgs: 1, maxArgs: 1, numeric: true, result: "number" },
  floor: { minArgs: 1, maxArgs: 1, numeric: true, result: "number" },
  ceil: { minArgs: 1, maxArgs: 1, numeric: true, result: "number" },
  round: { minArgs: 1, maxArgs: 1, numeric: true, result: "number" },
  bitAnd: { minArgs: 2, maxArgs: Number.POSITIVE_INFINITY, numeric: true, result: "number" },
  bitOr: { minArgs: 2, maxArgs: Number.POSITIVE_INFINITY, numeric: true, result: "number" },
  bitXor: { minArgs: 2, maxArgs: Number.POSITIVE_INFINITY, numeric: true, result: "number" },
  bitNot: { minArgs: 1, maxArgs: 1, numeric: true, result: "number" },
  shiftLeft: { minArgs: 2, maxArgs: 2, numeric: true, result: "number" },
  shiftRight: { minArgs: 2, maxArgs: 2, numeric: true, result: "number" },
  unsignedShiftRight: { minArgs: 2, maxArgs: 2, numeric: true, result: "number" },
  bit: { minArgs: 2, maxArgs: 2, numeric: true, result: "number" },
  eq: { minArgs: 2, maxArgs: 2, numeric: false, result: "boolean" },
  neq: { minArgs: 2, maxArgs: 2, numeric: false, result: "boolean" },
  gt: { minArgs: 2, maxArgs: 2, numeric: true, result: "boolean" },
  gte: { minArgs: 2, maxArgs: 2, numeric: true, result: "boolean" },
  lt: { minArgs: 2, maxArgs: 2, numeric: true, result: "boolean" },
  lte: { minArgs: 2, maxArgs: 2, numeric: true, result: "boolean" },
  at: { minArgs: 2, maxArgs: 2, numeric: false, result: "unknown" },
  length: { minArgs: 1, maxArgs: 1, numeric: false, result: "number" },
  join: { minArgs: 2, maxArgs: 2, numeric: false, result: "string" },
  includes: { minArgs: 2, maxArgs: 2, numeric: false, result: "boolean" },
  slice: { minArgs: 2, maxArgs: 3, numeric: false, result: "unknown" },
  sum: { minArgs: 1, maxArgs: 1, numeric: false, result: "number" },
  upper: { minArgs: 1, maxArgs: 1, numeric: false, result: "string" },
  lower: { minArgs: 1, maxArgs: 1, numeric: false, result: "string" },
  trim: { minArgs: 1, maxArgs: 1, numeric: false, result: "string" },
  replace: { minArgs: 3, maxArgs: 3, numeric: false, result: "string" },
};

function valueKind(value: VariableValue | undefined): ExpressionKind {
  if (value === undefined) return "unknown";
  if (value === null) return "null";
  if (Array.isArray(value)) return "collection";
  if (typeof value === "number") return "number";
  if (typeof value === "boolean") return "boolean";
  return "string";
}

function sharedKind(kinds: readonly ExpressionKind[]): ExpressionKind {
  const known = kinds.filter((kind) => kind !== "unknown");
  if (known.length === 0) return "unknown";
  return known.every((kind) => kind === known[0]) ? (known[0] ?? "unknown") : "unknown";
}

function validateExpressionOperands(
  expression: SignalExpression,
  path: string,
  variableKinds: ReadonlyMap<string, ExpressionKind>,
  signalKinds: ReadonlyMap<string, ExpressionKind>,
  error: (code: string, message: string, path?: string) => void,
): ExpressionKind {
  if (!isExpressionObject(expression)) {
    if (typeof expression === "number" && !Number.isFinite(expression))
      error("invalid-operand", `${path} contains a non-finite number`, path);
    return valueKind(expression);
  }
  if ("var" in expression) return variableKinds.get(expression.var) ?? "unknown";
  if ("signal" in expression) return signalKinds.get(expression.signal) ?? "unknown";
  if ("state" in expression || "selection" in expression)
    return "state" in expression ? "string" : "unknown";
  if ("when" in expression) {
    const thenKind = validateExpressionOperands(
      expression.then,
      `${path}.then`,
      variableKinds,
      signalKinds,
      error,
    );
    const elseKind =
      expression.else === undefined
        ? "null"
        : validateExpressionOperands(
            expression.else,
            `${path}.else`,
            variableKinds,
            signalKinds,
            error,
          );
    return sharedKind([thenKind, elseKind]);
  }
  if ("match" in expression) {
    validateExpressionOperands(
      expression.match,
      `${path}.match`,
      variableKinds,
      signalKinds,
      error,
    );
    const branchKinds = Object.entries(expression.cases).map(([key, branch]) =>
      validateExpressionOperands(branch, `${path}.cases.${key}`, variableKinds, signalKinds, error),
    );
    if (expression.default !== undefined)
      branchKinds.push(
        validateExpressionOperands(
          expression.default,
          `${path}.default`,
          variableKinds,
          signalKinds,
          error,
        ),
      );
    return sharedKind(branchKinds);
  }
  if ("concat" in expression) {
    expression.concat.forEach((part, index) =>
      validateExpressionOperands(
        part,
        `${path}.concat[${index}]`,
        variableKinds,
        signalKinds,
        error,
      ),
    );
    return "string";
  }
  if ("not" in expression) {
    validateExpressionOperands(expression.not, `${path}.not`, variableKinds, signalKinds, error);
    return "boolean";
  }
  if ("list" in expression) {
    expression.list.forEach((item, index) => {
      const kind = validateExpressionOperands(
        item,
        `${path}.list[${index}]`,
        variableKinds,
        signalKinds,
        error,
      );
      if (kind === "collection")
        error(
          "invalid-operand",
          `${path}.list[${index}] must be a scalar; nested collections are not supported`,
          `${path}.list[${index}]`,
        );
    });
    return "collection";
  }
  if ("op" in expression) {
    const rule = OPERATION_RULES[expression.op];
    if (rule === undefined) {
      error("invalid-expression", `${path} uses unknown operator "${String(expression.op)}"`, path);
      return "unknown";
    }
    const args = isExpressionArray(expression.args) ? expression.args : [];
    if (!isExpressionArray(expression.args))
      error("invalid-expression", `${path}.${expression.op} args must be an array`, path);
    if (args.length < rule.minArgs || args.length > rule.maxArgs) {
      const wanted =
        rule.minArgs === rule.maxArgs
          ? `${rule.minArgs}`
          : rule.maxArgs === Number.POSITIVE_INFINITY
            ? `at least ${rule.minArgs}`
            : `${rule.minArgs}–${rule.maxArgs}`;
      error(
        "invalid-operand",
        `${path}.${expression.op} expects ${wanted} operand${rule.maxArgs === 1 ? "" : "s"}, received ${args.length}`,
        path,
      );
    }
    const kinds = args.map((argument, index) =>
      validateExpressionOperands(
        argument,
        `${path}.args[${index}]`,
        variableKinds,
        signalKinds,
        error,
      ),
    );
    if (rule.numeric)
      kinds.forEach((kind, index) => {
        if (kind !== "number" && kind !== "unknown")
          error(
            "invalid-operand",
            `${path}.${expression.op} operand ${index + 1} must be a number, received ${kind}`,
            `${path}.args[${index}]`,
          );
      });
    const expectOperand = (
      index: number,
      accepted: readonly ExpressionKind[],
      description: string,
    ): void => {
      const kind = kinds[index] ?? "unknown";
      if (kind !== "unknown" && !accepted.includes(kind))
        error(
          "invalid-operand",
          `${path}.${expression.op} operand ${index + 1} must be ${description}, received ${kind}`,
          `${path}.args[${index}]`,
        );
    };
    switch (expression.op) {
      case "at":
        expectOperand(0, ["collection", "string"], "a collection or string");
        expectOperand(1, ["number"], "a number");
        break;
      case "length":
        expectOperand(0, ["collection", "string"], "a collection or string");
        break;
      case "join":
        expectOperand(0, ["collection"], "a collection");
        expectOperand(1, ["string"], "a string");
        break;
      case "includes":
        expectOperand(0, ["collection", "string"], "a collection or string");
        if (kinds[0] === "string") expectOperand(1, ["string"], "a string");
        break;
      case "slice":
        expectOperand(0, ["collection", "string"], "a collection or string");
        expectOperand(1, ["number"], "a number");
        if (args.length === 3) expectOperand(2, ["number"], "a number");
        break;
      case "sum":
        expectOperand(0, ["collection"], "a collection");
        break;
      case "upper":
      case "lower":
      case "trim":
        expectOperand(0, ["string"], "a string");
        break;
      case "replace":
        expectOperand(0, ["string"], "a string");
        expectOperand(1, ["string"], "a string");
        expectOperand(2, ["string"], "a string");
        break;
    }
    const second = args[1];
    if (
      (expression.op === "divide" || expression.op === "modulo") &&
      typeof second === "number" &&
      second === 0
    )
      error(
        "invalid-operand",
        `${path}.${expression.op} divisor must not be zero`,
        `${path}.args[1]`,
      );
    if (
      (expression.op === "bit" ||
        expression.op === "shiftLeft" ||
        expression.op === "shiftRight" ||
        expression.op === "unsignedShiftRight") &&
      typeof second === "number" &&
      (!Number.isInteger(second) || second < 0 || second > 31)
    )
      error(
        "invalid-operand",
        `${path}.${expression.op} index/count must be an integer from 0 through 31`,
        `${path}.args[1]`,
      );
    return rule.result;
  }
  if ("format" in expression) {
    const inputKind = validateExpressionOperands(
      expression.format,
      `${path}.format`,
      variableKinds,
      signalKinds,
      error,
    );
    if (
      expression.radix !== undefined &&
      (!Number.isInteger(expression.radix) || expression.radix < 2 || expression.radix > 36)
    )
      error("invalid-format", `${path}.radix must be an integer from 2 through 36`, path);
    if (expression.pad !== undefined && (!Number.isInteger(expression.pad) || expression.pad < 0))
      error("invalid-format", `${path}.pad must be a non-negative integer`, path);
    if (expression.padWith !== undefined && [...expression.padWith].length !== 1)
      error("invalid-format", `${path}.padWith must be exactly one character`, path);
    if (
      expression.precision !== undefined &&
      (!Number.isInteger(expression.precision) ||
        expression.precision < 0 ||
        expression.precision > 100)
    )
      error("invalid-format", `${path}.precision must be an integer from 0 through 100`, path);
    if (expression.radix !== undefined && expression.precision !== undefined)
      error("invalid-format", `${path} cannot combine radix and precision`, path);
    if (
      (expression.radix !== undefined || expression.precision !== undefined) &&
      inputKind !== "number" &&
      inputKind !== "unknown"
    )
      error(
        "invalid-operand",
        `${path}.format must be numeric when radix or precision is set, received ${inputKind}`,
        `${path}.format`,
      );
    return "string";
  }
  error("invalid-expression", `${path} is not a recognised signal expression`, path);
  return "unknown";
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
  const variableKinds = new Map<string, ExpressionKind>(
    Object.entries(machine.variables ?? {}).map(([name, value]) => [name, valueKind(value)]),
  );
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
  const signalKinds = new Map<string, ExpressionKind>();
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
    signalKinds.set(
      signalId,
      validateExpressionOperands(expression, path, variableKinds, signalKinds, error),
    );
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
  if (isScalarCollection(value)) return value.map((item) => stringify(item)).join(",");
  return typeof value === "string" ? value : String(value);
}

function isScalarCollection(value: VariableValue | undefined): value is readonly ScalarValue[] {
  return Array.isArray(value);
}

function isFiniteNumberCollection(value: VariableValue | undefined): value is readonly number[] {
  return (
    isScalarCollection(value) &&
    value.every((item) => typeof item === "number" && Number.isFinite(item))
  );
}

function finiteNumbers(values: readonly VariableValue[]): readonly number[] | undefined {
  if (values.some((value) => typeof value !== "number" || !Number.isFinite(value)))
    return undefined;
  return values as readonly number[];
}

function finiteResult(value: number): number | null {
  return Number.isFinite(value) ? value : null;
}

function evaluateOperation(
  expression: OperationExpression,
  state: MachineState,
  signals: Record<string, VariableValue>,
): VariableValue {
  const values = expression.args.map((argument) => evaluateExpression(argument, state, signals));
  if (expression.op === "eq") return values[0] === values[1];
  if (expression.op === "neq") return values[0] !== values[1];
  const collection = values[0];
  const operand = values[1];
  switch (expression.op) {
    case "at": {
      if (typeof operand !== "number" || !Number.isInteger(operand)) return null;
      if (typeof collection === "string") return collection.at(operand) ?? null;
      return isScalarCollection(collection) ? (collection.at(operand) ?? null) : null;
    }
    case "length":
      return typeof collection === "string" || isScalarCollection(collection)
        ? collection.length
        : null;
    case "join":
      return isScalarCollection(collection) && typeof operand === "string"
        ? collection.map((value) => stringify(value)).join(operand)
        : null;
    case "includes":
      if (typeof collection === "string")
        return typeof operand === "string" && collection.includes(operand);
      return (
        isScalarCollection(collection) &&
        operand !== undefined &&
        !isScalarCollection(operand) &&
        collection.includes(operand)
      );
    case "slice": {
      const end = values[2];
      if (
        typeof operand !== "number" ||
        !Number.isInteger(operand) ||
        (end !== undefined && (typeof end !== "number" || !Number.isInteger(end)))
      )
        return null;
      if (typeof collection === "string") return collection.slice(operand, end);
      return isScalarCollection(collection) ? collection.slice(operand, end) : null;
    }
    case "sum":
      return isFiniteNumberCollection(collection)
        ? finiteResult(collection.reduce((sum, value) => sum + value, 0))
        : null;
    case "upper":
      return typeof collection === "string" ? collection.toUpperCase() : null;
    case "lower":
      return typeof collection === "string" ? collection.toLowerCase() : null;
    case "trim":
      return typeof collection === "string" ? collection.trim() : null;
    case "replace": {
      const replacement = values[2];
      return typeof collection === "string" &&
        typeof operand === "string" &&
        typeof replacement === "string"
        ? collection.replaceAll(operand, replacement)
        : null;
    }
  }
  const numbers = finiteNumbers(values);
  if (numbers === undefined) return null;
  const first = numbers[0];
  const second = numbers[1];
  if (first === undefined) return null;
  switch (expression.op) {
    case "add":
      return finiteResult(numbers.reduce((sum, value) => sum + value, 0));
    case "subtract":
      return second === undefined ? null : finiteResult(first - second);
    case "multiply":
      return finiteResult(numbers.reduce((product, value) => product * value, 1));
    case "divide":
      return second === undefined || second === 0 ? null : finiteResult(first / second);
    case "modulo":
      return second === undefined || second === 0 ? null : finiteResult(first % second);
    case "power":
      return second === undefined ? null : finiteResult(first ** second);
    case "min":
      return Math.min(...numbers);
    case "max":
      return Math.max(...numbers);
    case "clamp": {
      const maximum = numbers[2];
      return second === undefined || maximum === undefined
        ? null
        : Math.min(maximum, Math.max(second, first));
    }
    case "abs":
      return Math.abs(first);
    case "floor":
      return Math.floor(first);
    case "ceil":
      return Math.ceil(first);
    case "round":
      return Math.round(first);
    case "bitAnd":
      return numbers.slice(1).reduce((result, value) => result & value, first);
    case "bitOr":
      return numbers.slice(1).reduce((result, value) => result | value, first);
    case "bitXor":
      return numbers.slice(1).reduce((result, value) => result ^ value, first);
    case "bitNot":
      return ~first;
    case "shiftLeft":
      return second === undefined || !Number.isInteger(second) || second < 0 || second > 31
        ? null
        : first << second;
    case "shiftRight":
      return second === undefined || !Number.isInteger(second) || second < 0 || second > 31
        ? null
        : first >> second;
    case "unsignedShiftRight":
      return second === undefined || !Number.isInteger(second) || second < 0 || second > 31
        ? null
        : first >>> second;
    case "bit":
      return second === undefined || !Number.isInteger(second) || second < 0 || second > 31
        ? null
        : (first >>> second) & 1;
    case "gt":
      return second === undefined ? false : first > second;
    case "gte":
      return second === undefined ? false : first >= second;
    case "lt":
      return second === undefined ? false : first < second;
    case "lte":
      return second === undefined ? false : first <= second;
  }
}

function evaluateFormat(
  expression: FormatExpression,
  state: MachineState,
  signals: Record<string, VariableValue>,
): string {
  const value = evaluateExpression(expression.format, state, signals);
  let rendered: string;
  if (expression.radix !== undefined) {
    if (
      typeof value !== "number" ||
      !Number.isFinite(value) ||
      !Number.isInteger(expression.radix) ||
      expression.radix < 2 ||
      expression.radix > 36
    )
      return "";
    rendered = Math.trunc(value).toString(expression.radix);
  } else if (expression.precision !== undefined) {
    if (
      typeof value !== "number" ||
      !Number.isFinite(value) ||
      !Number.isInteger(expression.precision) ||
      expression.precision < 0 ||
      expression.precision > 100
    )
      return "";
    rendered = value.toFixed(expression.precision);
  } else rendered = stringify(value);
  if (expression.uppercase === true) rendered = rendered.toUpperCase();
  if (expression.pad !== undefined && expression.pad > rendered.length) {
    const padding = expression.padWith ?? "0";
    if (rendered.startsWith("-"))
      rendered = `-${rendered.slice(1).padStart(expression.pad - 1, padding)}`;
    else rendered = rendered.padStart(expression.pad, padding);
  }
  return `${expression.prefix ?? ""}${rendered}${expression.suffix ?? ""}`;
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
  if ("not" in expression) return !truthy(evaluateExpression(expression.not, state, signals));
  if ("list" in expression) {
    const values = expression.list.map((item) => evaluateExpression(item, state, signals));
    return values.some((value) => Array.isArray(value)) ? null : (values as readonly ScalarValue[]);
  }
  if ("op" in expression) return evaluateOperation(expression, state, signals);
  return evaluateFormat(expression, state, signals);
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
