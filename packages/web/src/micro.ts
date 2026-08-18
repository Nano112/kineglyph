import { parseMicroValues, renderMicroSvg, type MicrochartOptions } from "@kineglyph/svg";

export interface MicrochartController {
  readonly element: HTMLElement;
  readonly values: readonly number[];
  readonly options: MicrochartOptions;
  update(values: string | readonly number[], options?: Partial<MicrochartOptions>): void;
  destroy(): void;
}

export interface MicrochartBatchUpdate {
  readonly target: number | HTMLElement;
  readonly values: string | readonly number[];
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
}

export interface MicrochartBatchController {
  readonly size: number;
  readonly mounted: number;
  update(
    target: number | HTMLElement,
    values: string | readonly number[],
    options?: Partial<MicrochartOptions>,
  ): void;
  updateMany(updates: readonly MicrochartBatchUpdate[]): void;
  /** Applies queued changes synchronously; useful before export or deterministic measurement. */
  flush(): void;
  destroy(): void;
}

function optionsFromElement(element: HTMLElement): MicrochartOptions {
  return {
    type: (element.dataset.kineglyphMicrochart as MicrochartOptions["type"]) ?? "line",
    ...(element.dataset.width === undefined ? {} : { width: Number(element.dataset.width) }),
    ...(element.dataset.height === undefined ? {} : { height: Number(element.dataset.height) }),
    ...(element.getAttribute("aria-label") === null
      ? {}
      : { label: element.getAttribute("aria-label")! }),
  };
}

/**
 * Mounts a runtime-free microchart into one table cell or inline label. Updating replaces only its
 * tiny SVG; no Kineglyph figure shell, observers, timeline, or controls are created.
 */
export function mountMicrochart(
  element: HTMLElement,
  input: string | readonly number[],
  initialOptions: MicrochartOptions = {},
): MicrochartController {
  const original = element.innerHTML;
  const originalType = element.getAttribute("data-kineglyph-microchart");
  let values = parseMicroValues(input);
  let options: MicrochartOptions = { ...initialOptions };
  let destroyed = false;
  const draw = (): void => {
    element.innerHTML = renderMicroSvg(values, options);
    element.dataset.kineglyphMicrochart = options.type ?? "line";
  };
  draw();
  return {
    element,
    get values() {
      return values;
    },
    get options() {
      return options;
    },
    update(next, overrides = {}) {
      if (destroyed) throw new Error("microchart controller has been destroyed");
      values = parseMicroValues(next);
      options = { ...options, ...overrides };
      draw();
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      element.innerHTML = original;
      if (originalType === null) delete element.dataset.kineglyphMicrochart;
      else element.setAttribute("data-kineglyph-microchart", originalType);
    },
  };
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
    options: optionsFromElement(element),
    visible: options.defer === false,
    controller: undefined as MicrochartController | undefined,
  }));
  const indexes = new Map(elements.map((element, index) => [element, index]));
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
  let cancelScheduled: (() => void) | undefined;

  const cancelFrame = (): void => {
    cancelScheduled?.();
    cancelScheduled = undefined;
    scheduled = false;
  };

  const draw = (index: number): void => {
    const record = records[index];
    if (record === undefined || !record.visible) return;
    if (record.controller === undefined)
      record.controller = mountMicrochart(record.element, record.values, record.options);
    else record.controller.update(record.values, record.options);
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
    target: number | HTMLElement,
    values: string | readonly number[],
    overrides: Partial<MicrochartOptions> = {},
  ): void => {
    if (destroyed) throw new Error("microchart batch controller has been destroyed");
    const index = typeof target === "number" ? target : indexes.get(target);
    if (index === undefined || records[index] === undefined)
      throw new RangeError("microchart batch target is outside this batch");
    const record = records[index];
    record.values = parseMicroValues(values);
    record.options = { ...record.options, ...overrides };
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
      return records.reduce((count, record) => count + Number(record.controller !== undefined), 0);
    },
    update,
    updateMany(updates) {
      updates.forEach((entry) => update(entry.target, entry.values, entry.options));
    },
    flush,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      cancelFrame();
      observer?.disconnect();
      records.forEach((record) => record.controller?.destroy());
      dirty.clear();
    },
  };
}
