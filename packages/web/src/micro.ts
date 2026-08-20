import {
  parseMicroValues,
  renderMicroSvg,
  resolveMicrochart,
  type MicrochartInput,
  type MicrochartOptions,
  type ResolvedMicrochart,
  type ResolvedMicrochartMark,
} from "@kineglyph/svg";

export { microchart } from "@kineglyph/svg";
export type { MicrochartInput, MicrochartOptions, MicrochartType } from "@kineglyph/svg";

export type MicrochartTarget = number | string | HTMLElement;
const PREPARED_UPDATE: unique symbol = Symbol("kineglyph.microchart.prepared-update");

export interface MicrochartController {
  readonly element: HTMLElement;
  readonly values: readonly number[];
  readonly options: MicrochartOptions;
  update(values: MicrochartInput, options?: Partial<MicrochartOptions>): void;
  destroy(): void;
}

interface PreparedMicrochartController extends MicrochartController {
  [PREPARED_UPDATE](values: number[], options?: Partial<MicrochartOptions>): void;
}

export interface MicrochartBatchUpdate {
  readonly target: MicrochartTarget;
  readonly values: MicrochartInput;
  readonly options?: Partial<MicrochartOptions>;
}

export interface MicrochartBatchOptions {
  readonly selector?: string;
  readonly root?: ParentNode;
  /** Mount only charts intersecting the viewport. Falls back to eager mounting without IO. */
  readonly defer?: "visible" | false;
  /** Remove SVG DOM again when a cell leaves the viewport. Defaults to true. */
  readonly recycle?: boolean;
  readonly rootMargin?: string;
  /** Defaults shared by the collection; element data attributes take precedence. */
  readonly defaults?: MicrochartOptions;
}

export interface MicrochartCollectionOptions extends MicrochartOptions {
  readonly selector?: string;
  /** Mount only charts intersecting the viewport. Defaults to `"visible"`. */
  readonly defer?: "visible" | false;
  /** Remove SVG DOM again when a chart leaves the viewport. Defaults to true. */
  readonly recycle?: boolean;
  readonly rootMargin?: string;
}

export interface MicrochartBatchController {
  readonly size: number;
  readonly mounted: number;
  update(
    target: MicrochartTarget,
    values: MicrochartInput,
    options?: Partial<MicrochartOptions>,
  ): void;
  updateMany(updates: readonly MicrochartBatchUpdate[]): void;
  /** Concise alias for `update()`. String targets use `data-kineglyph-key` or the element id. */
  set(
    target: MicrochartTarget,
    values: MicrochartInput,
    options?: Partial<MicrochartOptions>,
  ): void;
  /** Updates keyed charts in one coalesced frame. */
  setMany(values: Readonly<Record<string, MicrochartInput>>): void;
  /** Applies queued changes synchronously; useful before export or deterministic measurement. */
  flush(): void;
  destroy(): void;
}

function optionsFromElement(
  element: HTMLElement,
  defaults: MicrochartOptions = {},
): MicrochartOptions {
  const type = element.getAttribute("data-kineglyph-microchart");
  return {
    ...defaults,
    ...(type === null || type === "" ? {} : { type: type as MicrochartOptions["type"] }),
    ...(element.dataset.width === undefined ? {} : { width: Number(element.dataset.width) }),
    ...(element.dataset.height === undefined ? {} : { height: Number(element.dataset.height) }),
    ...(element.getAttribute("aria-label") === null
      ? {}
      : { label: element.getAttribute("aria-label")! }),
  } as MicrochartOptions;
}

const SVG_NAMESPACE = "http://www.w3.org/2000/svg";
const microNumber = (value: number): string => {
  const result = Math.round(value * 100) / 100;
  return String(Object.is(result, -0) ? 0 : result);
};

const OPTIONAL_MARK_ATTRIBUTES = {
  circle: ["stroke", "stroke-width"],
  path: ["fill-opacity", "stroke", "stroke-width", "stroke-linecap", "stroke-linejoin"],
  rect: [],
} as const;

function patchAttributes(element: SVGElement, attributes: Readonly<Record<string, string>>): void {
  const optional =
    OPTIONAL_MARK_ATTRIBUTES[element.localName as keyof typeof OPTIONAL_MARK_ATTRIBUTES];
  for (const name of optional ?? []) {
    if (!(name in attributes)) element.removeAttribute(name);
  }
  for (const name in attributes) {
    const value = attributes[name]!;
    if (element.getAttribute(name) !== value) element.setAttribute(name, value);
  }
}

function patchMicroSvg(
  svg: SVGSVGElement,
  chart: ResolvedMicrochart,
  marks: SVGElement[],
  title: SVGTitleElement | undefined,
): SVGTitleElement | undefined {
  const width = microNumber(chart.width);
  const height = microNumber(chart.height);
  const viewBox = `0 0 ${width} ${height}`;
  if (svg.getAttribute("viewBox") !== viewBox) svg.setAttribute("viewBox", viewBox);
  if (svg.getAttribute("width") !== width) svg.setAttribute("width", width);
  if (svg.getAttribute("height") !== height) svg.setAttribute("height", height);
  if (chart.label === undefined) {
    svg.removeAttribute("role");
    svg.removeAttribute("aria-label");
    svg.setAttribute("aria-hidden", "true");
    title?.remove();
    title = undefined;
  } else {
    svg.removeAttribute("aria-hidden");
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", chart.label);
    title ??= svg.ownerDocument.createElementNS(SVG_NAMESPACE, "title");
    if (title.textContent !== chart.label) title.textContent = chart.label;
    if (title.parentNode !== svg) svg.insertBefore(title, marks[0] ?? null);
  }

  chart.marks.forEach((mark: ResolvedMicrochartMark, index) => {
    let element = marks[index];
    if (element === undefined || element.localName !== mark.name) {
      const replacement = svg.ownerDocument.createElementNS(SVG_NAMESPACE, mark.name);
      if (element === undefined) svg.append(replacement);
      else element.replaceWith(replacement);
      element = replacement;
      marks[index] = replacement;
    }
    patchAttributes(element, mark.attributes);
  });
  while (marks.length > chart.marks.length) marks.pop()?.remove();
  return title;
}

/**
 * Mounts a runtime-free microchart into one table cell or inline label. Updates patch persistent
 * SVG geometry in place; no Kineglyph figure shell, observers, timeline, or controls are created.
 */
export function mountMicrochart(
  element: HTMLElement,
  input: MicrochartInput,
  initialOptions: MicrochartOptions = {},
): MicrochartController {
  const original = element.innerHTML;
  const originalType = element.getAttribute("data-kineglyph-microchart");
  let values = parseMicroValues(input);
  let options: MicrochartOptions = { ...initialOptions };
  let destroyed = false;
  element.innerHTML = renderMicroSvg(values, options);
  const svg = element.firstElementChild as SVGSVGElement;
  let title =
    svg.firstElementChild?.localName === "title"
      ? (svg.firstElementChild as SVGTitleElement)
      : undefined;
  const marks = [...svg.children].filter((child) => child.localName !== "title") as SVGElement[];
  const draw = (): void => {
    title = patchMicroSvg(svg, resolveMicrochart(values, options), marks, title);
    element.dataset.kineglyphMicrochart = options.type ?? "line";
  };
  element.dataset.kineglyphMicrochart = options.type ?? "line";
  const updatePrepared = (next: number[], overrides?: Partial<MicrochartOptions>): void => {
    if (destroyed) throw new Error("microchart controller has been destroyed");
    values = next;
    if (overrides !== undefined) options = { ...options, ...overrides };
    draw();
  };
  const controller: PreparedMicrochartController = {
    element,
    get values() {
      return values;
    },
    get options() {
      return options;
    },
    update(next, overrides) {
      updatePrepared(parseMicroValues(next), overrides);
    },
    [PREPARED_UPDATE]: updatePrepared,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      element.innerHTML = original;
      if (originalType === null) delete element.dataset.kineglyphMicrochart;
      else element.setAttribute("data-kineglyph-microchart", originalType);
    },
  };
  return controller;
}

/** Converts every matching text node (for example `5,3,9,6`) into a tiny inline SVG. */
export function mountAllMicrocharts(
  selector = "[data-kineglyph-microchart]",
  root: ParentNode = document,
): MicrochartController[] {
  return [...root.querySelectorAll<HTMLElement>(selector)].map((element) =>
    mountMicrochart(element, element.textContent ?? "", optionsFromElement(element)),
  );
}

/**
 * Progressive enhancement for very large or frequently updating tables. One observer virtualizes
 * every chart and one frame queue coalesces all dirty cells; no per-cell listeners or observers are
 * created. Offscreen records retain their newest values without retaining SVG DOM.
 */
export function mountMicrochartBatch(
  options: MicrochartBatchOptions = {},
): MicrochartBatchController {
  const selector = options.selector ?? "[data-kineglyph-microchart]";
  const root = options.root ?? document;
  const elements = [...root.querySelectorAll<HTMLElement>(selector)];
  const records = elements.map((element) => ({
    element,
    values: parseMicroValues(element.textContent ?? ""),
    options: optionsFromElement(element, options.defaults),
    optionsDirty: false,
    visible: options.defer === false,
    controller: undefined as PreparedMicrochartController | undefined,
  }));
  const indexes = new Map(elements.map((element, index) => [element, index]));
  const keys = new Map<string, number>();
  elements.forEach((element, index) => {
    const key = element.dataset.kineglyphKey || element.id;
    if (!key) return;
    if (keys.has(key)) throw new RangeError(`duplicate microchart key: ${key}`);
    keys.set(key, index);
  });
  const dirty = new Set<number>();
  const doc = elements[0]?.ownerDocument ?? (root as Node).ownerDocument ?? document;
  const view = doc.defaultView;
  const Observer =
    view?.IntersectionObserver ??
    (typeof IntersectionObserver === "undefined" ? undefined : IntersectionObserver);
  const deferred = options.defer !== false && Observer !== undefined;
  const recycle = options.recycle ?? true;
  let destroyed = false;
  let scheduled = false;
  let mountedCount = 0;
  let cancelScheduled: (() => void) | undefined;

  const cancelFrame = (): void => {
    cancelScheduled?.();
    cancelScheduled = undefined;
    scheduled = false;
  };

  const draw = (index: number): void => {
    const record = records[index];
    if (record === undefined || !record.visible) return;
    if (record.controller === undefined) {
      record.controller = mountMicrochart(
        record.element,
        record.values,
        record.options,
      ) as PreparedMicrochartController;
      mountedCount += 1;
    } else {
      record.controller[PREPARED_UPDATE](
        record.values,
        record.optionsDirty ? record.options : undefined,
      );
      record.optionsDirty = false;
    }
  };

  const flush = (): void => {
    if (destroyed) return;
    cancelFrame();
    const pending = [...dirty];
    dirty.clear();
    pending.forEach(draw);
  };

  const schedule = (): void => {
    if (scheduled || destroyed || dirty.size === 0) return;
    scheduled = true;
    const run = (): void => {
      scheduled = false;
      cancelScheduled = undefined;
      flush();
    };
    if (view?.requestAnimationFrame !== undefined) {
      const frame = view.requestAnimationFrame(run);
      cancelScheduled = () => view.cancelAnimationFrame(frame);
    } else {
      const timer = setTimeout(run, 0);
      cancelScheduled = () => clearTimeout(timer);
    }
  };

  const observer =
    deferred && Observer !== undefined
      ? new Observer(
          (entries) => {
            for (const entry of entries) {
              const index = indexes.get(entry.target as HTMLElement);
              if (index === undefined) continue;
              const record = records[index]!;
              record.visible = entry.isIntersecting;
              if (record.visible) dirty.add(index);
              else if (recycle && record.controller !== undefined) {
                record.controller.destroy();
                record.controller = undefined;
                mountedCount -= 1;
                dirty.delete(index);
              }
            }
            schedule();
          },
          {
            root: root.nodeType === 1 ? (root as Element) : null,
            rootMargin: options.rootMargin ?? "160px 0px",
          },
        )
      : undefined;

  if (observer === undefined) {
    records.forEach((record, index) => {
      record.visible = true;
      dirty.add(index);
    });
    flush();
  } else records.forEach((record) => observer.observe(record.element));

  const update = (
    target: MicrochartTarget,
    values: MicrochartInput,
    overrides?: Partial<MicrochartOptions>,
  ): void => {
    if (destroyed) throw new Error("microchart batch controller has been destroyed");
    const index =
      typeof target === "number"
        ? target
        : typeof target === "string"
          ? keys.get(target)
          : indexes.get(target);
    if (index === undefined || records[index] === undefined)
      throw new RangeError("microchart batch target is outside this batch");
    const record = records[index];
    record.values = parseMicroValues(values);
    if (overrides !== undefined) {
      record.options = { ...record.options, ...overrides };
      record.optionsDirty = true;
    }
    if (record.visible) {
      dirty.add(index);
      schedule();
    }
  };

  return {
    get size() {
      return records.length;
    },
    get mounted() {
      return mountedCount;
    },
    update,
    updateMany(updates) {
      updates.forEach((entry) => update(entry.target, entry.values, entry.options));
    },
    set: update,
    setMany(values) {
      Object.entries(values).forEach(([target, input]) => update(target, input));
    },
    flush,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      cancelFrame();
      observer?.disconnect();
      records.forEach((record) => record.controller?.destroy());
      mountedCount = 0;
      dirty.clear();
    },
  };
}

/**
 * Mounts every declarative microchart below one root through the virtualized, frame-batched path.
 * Elements can opt into simple keyed updates with `data-kineglyph-key="latency"`.
 */
export function mountMicrocharts(
  root: ParentNode | string = document,
  options: MicrochartCollectionOptions = {},
): MicrochartBatchController {
  let resolvedRoot: ParentNode;
  if (typeof root === "string") {
    const found = document.querySelector(root);
    if (found === null) throw new RangeError(`microchart root not found: ${root}`);
    resolvedRoot = found;
  } else resolvedRoot = root;
  const { selector, defer, recycle, rootMargin, ...defaults } = options;
  return mountMicrochartBatch({
    root: resolvedRoot,
    ...(selector === undefined ? {} : { selector }),
    ...(defer === undefined ? {} : { defer }),
    ...(recycle === undefined ? {} : { recycle }),
    ...(rootMargin === undefined ? {} : { rootMargin }),
    defaults,
  });
}
