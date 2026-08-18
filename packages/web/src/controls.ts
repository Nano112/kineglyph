export interface RangeParameter {
  readonly id: string;
  readonly label: string;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly value: number;
  readonly format?: (value: number) => string;
}

export interface ParameterChange {
  readonly id: string;
  readonly value: number;
  readonly values: Readonly<Record<string, number>>;
}

export interface ParameterPanelOptions {
  readonly parameters: readonly RangeParameter[];
  readonly debounceMs?: number;
  readonly ariaLabel?: string;
  readonly onInput?: (change: ParameterChange) => void;
  readonly onChange: (change: ParameterChange) => void;
}

export interface ParameterPanelHandle {
  readonly element: HTMLDivElement;
  readonly values: () => Readonly<Record<string, number>>;
  readonly update: (parameters: readonly RangeParameter[]) => void;
  readonly destroy: () => void;
}

export interface CodeSample {
  readonly id: string;
  readonly label: string;
  readonly code: string;
}

export interface CodeDrawerOptions {
  readonly samples: readonly CodeSample[];
  readonly label?: string;
  readonly activeId?: string;
}

export interface CodeDrawerHandle {
  readonly element: HTMLDetailsElement;
  readonly update: (samples: readonly CodeSample[]) => void;
  readonly destroy: () => void;
}

function finite(name: string, value: number): number {
  if (!Number.isFinite(value)) throw new RangeError(`${name} must be finite`);
  return value;
}

function normalise(parameter: RangeParameter): RangeParameter {
  const min = finite(`${parameter.id}.min`, parameter.min);
  const max = finite(`${parameter.id}.max`, parameter.max);
  const step = finite(`${parameter.id}.step`, parameter.step);
  if (parameter.id.length === 0) throw new Error("parameter id must not be empty");
  if (max <= min) throw new RangeError(`${parameter.id}.max must be greater than min`);
  if (step <= 0) throw new RangeError(`${parameter.id}.step must be positive`);
  return {
    ...parameter,
    min,
    max,
    step,
    value: Math.min(max, Math.max(min, finite(`${parameter.id}.value`, parameter.value))),
  };
}

function decimals(step: number): number {
  const source = String(step);
  const exponent = /e-(\d+)$/i.exec(source)?.[1];
  if (exponent !== undefined) return Number(exponent);
  return Math.min(6, source.split(".")[1]?.length ?? 0);
}

function formatted(parameter: RangeParameter, value: number): string {
  return parameter.format?.(value) ?? value.toFixed(decimals(parameter.step));
}

let parameterPanelSequence = 0;

/**
 * Creates a framework-neutral range panel for a live surface. Input callbacks are immediate;
 * change callbacks are debounced while dragging and flushed when the pointer or keyboard commits.
 */
export function createParameterPanel(
  document: Document,
  options: ParameterPanelOptions,
): ParameterPanelHandle {
  const element = document.createElement("div");
  const idPrefix = `kg-parameters-${++parameterPanelSequence}`;
  element.className = "kg-parameter-panel";
  element.setAttribute("role", "group");
  element.setAttribute("aria-label", options.ariaLabel ?? "Parameters");
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  let cleanups: Array<() => void> = [];
  let specs = options.parameters.map(normalise);
  const state = new Map(specs.map((parameter) => [parameter.id, parameter.value]));

  const snapshot = (): Readonly<Record<string, number>> => Object.fromEntries(state);
  const change = (parameter: RangeParameter, value: number): ParameterChange => ({
    id: parameter.id,
    value,
    values: snapshot(),
  });
  const flush = (parameter: RangeParameter): void => {
    const timer = timers.get(parameter.id);
    if (timer !== undefined) clearTimeout(timer);
    timers.delete(parameter.id);
    const value = state.get(parameter.id) ?? parameter.value;
    options.onChange(change(parameter, value));
  };

  const render = (): void => {
    for (const cleanup of cleanups) cleanup();
    cleanups = [];
    element.replaceChildren();
    for (const [index, parameter] of specs.entries()) {
      const label = document.createElement("label");
      label.className = "kg-parameter";
      label.dataset.parameter = parameter.id;
      const heading = document.createElement("span");
      heading.className = "kg-parameter__heading";
      const name = document.createElement("span");
      name.textContent = parameter.label;
      const output = document.createElement("output");
      const inputId = `${idPrefix}-${index}`;
      output.htmlFor = inputId;
      const input = document.createElement("input");
      input.id = inputId;
      input.type = "range";
      input.min = String(parameter.min);
      input.max = String(parameter.max);
      input.step = String(parameter.step);
      // Browsers restore form state on reload, bfcache, and SPA remounts; the
      // declared value must win over that stale state.
      input.autocomplete = "off";
      input.setAttribute("autocomplete", "off");
      input.defaultValue = String(state.get(parameter.id) ?? parameter.value);
      input.value = input.defaultValue;
      output.value = formatted(parameter, Number(input.value));
      output.textContent = output.value;
      heading.append(name, output);
      label.append(heading, input);
      const onInput = (): void => {
        const value = Number(input.value);
        state.set(parameter.id, value);
        output.value = formatted(parameter, value);
        output.textContent = output.value;
        options.onInput?.(change(parameter, value));
        const timer = timers.get(parameter.id);
        if (timer !== undefined) clearTimeout(timer);
        timers.set(
          parameter.id,
          setTimeout(() => flush(parameter), options.debounceMs ?? 180),
        );
      };
      const onChange = (): void => flush(parameter);
      const onRestore = (): void => {
        const declared = String(state.get(parameter.id) ?? parameter.value);
        if (input.value === declared) return;
        input.value = declared;
        output.value = formatted(parameter, Number(declared));
        output.textContent = output.value;
      };
      const view = document.defaultView;
      input.addEventListener("input", onInput);
      input.addEventListener("change", onChange);
      view?.addEventListener("pageshow", onRestore);
      cleanups.push(() => {
        input.removeEventListener("input", onInput);
        input.removeEventListener("change", onChange);
        view?.removeEventListener("pageshow", onRestore);
      });
      element.append(label);
    }
  };

  render();
  return {
    element,
    values: snapshot,
    update(parameters) {
      specs = parameters.map(normalise);
      const valid = new Set(specs.map(({ id }) => id));
      for (const id of state.keys()) if (!valid.has(id)) state.delete(id);
      for (const parameter of specs) state.set(parameter.id, parameter.value);
      render();
    },
    destroy() {
      for (const timer of timers.values()) clearTimeout(timer);
      timers.clear();
      for (const cleanup of cleanups) cleanup();
      cleanups = [];
      element.remove();
    },
  };
}

/** Creates a compact source drawer with accessible language tabs. */
export function createCodeDrawer(document: Document, options: CodeDrawerOptions): CodeDrawerHandle {
  const element = document.createElement("details");
  element.className = "kg-code-drawer";
  const summary = document.createElement("summary");
  summary.textContent = options.label ?? "Code";
  element.append(summary);
  const body = document.createElement("div");
  body.className = "kg-code-drawer__body";
  const tabs = document.createElement("div");
  tabs.className = "kg-code-drawer__tabs";
  tabs.setAttribute("role", "tablist");
  const pre = document.createElement("pre");
  const code = document.createElement("code");
  pre.append(code);
  body.append(tabs, pre);
  element.append(body);
  let samples = [...options.samples];
  let activeId = options.activeId ?? samples[0]?.id ?? "";
  let cleanups: Array<() => void> = [];

  const render = (): void => {
    for (const cleanup of cleanups) cleanup();
    cleanups = [];
    tabs.replaceChildren();
    if (!samples.some(({ id }) => id === activeId)) activeId = samples[0]?.id ?? "";
    for (const sample of samples) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = sample.label;
      button.setAttribute("role", "tab");
      button.setAttribute("aria-selected", sample.id === activeId ? "true" : "false");
      const activate = (): void => {
        activeId = sample.id;
        render();
      };
      button.addEventListener("click", activate);
      cleanups.push(() => button.removeEventListener("click", activate));
      tabs.append(button);
    }
    const active = samples.find(({ id }) => id === activeId);
    code.className = active === undefined ? "" : `language-${active.id}`;
    code.textContent = active?.code ?? "";
  };

  render();
  return {
    element,
    update(next) {
      samples = [...next];
      render();
    },
    destroy() {
      for (const cleanup of cleanups) cleanup();
      cleanups = [];
      element.remove();
    },
  };
}
