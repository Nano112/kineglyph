import type { EdgeInsets, Point, Rect, Size } from "./schema.js";

export type PipelineLayoutMode = "auto" | "wide" | "stacked";
export type ResolvedPipelineLayoutMode = Exclude<PipelineLayoutMode, "auto">;

export interface PipelineLayoutItem {
  readonly id: string;
  readonly minWidth?: number;
  readonly preferredWidth?: number;
  readonly maxWidth?: number;
  readonly height?: number;
  /** Relative share of surplus horizontal space after preferred widths are met. */
  readonly grow?: number;
}

export interface PipelineLayoutConstraints {
  readonly mode?: PipelineLayoutMode;
  readonly padding?: number | Partial<EdgeInsets>;
  readonly gap?: number;
  readonly stackedGap?: number;
  readonly minItemWidth?: number;
  readonly preferredItemWidth?: number;
  readonly maxItemWidth?: number;
  readonly itemHeight?: number;
  readonly maxStackedWidth?: number;
  readonly precision?: number;
}

export interface ResolvedPipelineItem {
  readonly id: string;
  readonly index: number;
  readonly bounds: Rect;
  readonly entry: Point;
  readonly exit: Point;
}

export interface PipelineConnector {
  readonly from: string;
  readonly to: string;
  readonly start: Point;
  readonly end: Point;
}

export interface PipelineLayoutResult {
  readonly mode: ResolvedPipelineLayoutMode;
  readonly size: Size;
  readonly padding: EdgeInsets;
  readonly items: readonly ResolvedPipelineItem[];
  readonly connectors: readonly PipelineConnector[];
}

const DEFAULTS = {
  gap: 24,
  stackedGap: 16,
  minItemWidth: 168,
  preferredItemWidth: 224,
  maxItemWidth: 320,
  itemHeight: 128,
  maxStackedWidth: 640,
  padding: 24,
  precision: 3,
} as const;

function finiteNonNegative(value: number, label: string): number {
  if (!Number.isFinite(value) || value < 0)
    throw new RangeError(`${label} must be a finite, non-negative number`);
  return value;
}

function normalisePadding(value: PipelineLayoutConstraints["padding"]): EdgeInsets {
  if (typeof value === "number") {
    const side = finiteNonNegative(value, "padding");
    return { top: side, right: side, bottom: side, left: side };
  }
  return {
    top: finiteNonNegative(value?.top ?? DEFAULTS.padding, "padding.top"),
    right: finiteNonNegative(value?.right ?? DEFAULTS.padding, "padding.right"),
    bottom: finiteNonNegative(value?.bottom ?? DEFAULTS.padding, "padding.bottom"),
    left: finiteNonNegative(value?.left ?? DEFAULTS.padding, "padding.left"),
  };
}

function round(value: number, precision: number): number {
  const scale = 10 ** precision;
  return Math.round((value + Number.EPSILON) * scale) / scale;
}

interface WidthSpec {
  readonly min: number;
  readonly preferred: number;
  readonly max: number;
  readonly grow: number;
}

/** Deterministic capped water-filling. Input ordering is the tie-breaker. */
function allocateWidths(specs: readonly WidthSpec[], available: number): number[] {
  const widths = specs.map((spec) => spec.min);
  let remaining = available - widths.reduce((sum, width) => sum + width, 0);

  const fillTowards = (target: (spec: WidthSpec) => number, weighted: boolean): void => {
    while (remaining > 1e-9) {
      const active = specs
        .map((spec, index) => ({
          index,
          capacity: target(spec) - (widths[index] ?? 0),
          weight: weighted ? spec.grow : 1,
        }))
        .filter(({ capacity, weight }) => capacity > 1e-9 && weight > 0);
      if (active.length === 0) return;
      const totalWeight = active.reduce((sum, item) => sum + item.weight, 0);
      let consumed = 0;
      for (const item of active) {
        const addition = Math.min(item.capacity, remaining * (item.weight / totalWeight));
        widths[item.index] = (widths[item.index] ?? 0) + addition;
        consumed += addition;
      }
      if (consumed <= 1e-9) return;
      remaining -= consumed;
    }
  };

  fillTowards((spec) => spec.preferred, false);
  fillTowards((spec) => spec.max, true);
  return widths;
}

/**
 * Resolves a horizontal pipeline whenever all minimum widths fit; otherwise it
 * falls back to a vertically stacked layout. No viewport or renderer state is read.
 */
export function resolvePipelineLayout(
  containerWidth: number,
  items: readonly PipelineLayoutItem[],
  constraints: PipelineLayoutConstraints = {},
): PipelineLayoutResult {
  finiteNonNegative(containerWidth, "containerWidth");
  const precision = constraints.precision ?? DEFAULTS.precision;
  if (!Number.isInteger(precision) || precision < 0 || precision > 10) {
    throw new RangeError("precision must be an integer between 0 and 10");
  }

  const ids = new Set<string>();
  for (const item of items) {
    if (item.id.length === 0) throw new Error("pipeline item ids must not be empty");
    if (ids.has(item.id)) throw new Error(`duplicate pipeline item id: ${item.id}`);
    ids.add(item.id);
  }

  const padding = normalisePadding(constraints.padding);
  const gap = finiteNonNegative(constraints.gap ?? DEFAULTS.gap, "gap");
  const stackedGap = finiteNonNegative(constraints.stackedGap ?? DEFAULTS.stackedGap, "stackedGap");
  const defaultMin = finiteNonNegative(
    constraints.minItemWidth ?? DEFAULTS.minItemWidth,
    "minItemWidth",
  );
  const defaultPreferred = finiteNonNegative(
    constraints.preferredItemWidth ?? DEFAULTS.preferredItemWidth,
    "preferredItemWidth",
  );
  const defaultMax = finiteNonNegative(
    constraints.maxItemWidth ?? DEFAULTS.maxItemWidth,
    "maxItemWidth",
  );
  const defaultHeight = finiteNonNegative(
    constraints.itemHeight ?? DEFAULTS.itemHeight,
    "itemHeight",
  );
  const maxStackedWidth = finiteNonNegative(
    constraints.maxStackedWidth ?? DEFAULTS.maxStackedWidth,
    "maxStackedWidth",
  );
  const innerWidth = Math.max(0, containerWidth - padding.left - padding.right);

  const specs = items.map((item, index) => {
    const min = finiteNonNegative(item.minWidth ?? defaultMin, `items[${index}].minWidth`);
    const preferred = finiteNonNegative(
      item.preferredWidth ?? defaultPreferred,
      `items[${index}].preferredWidth`,
    );
    const max = finiteNonNegative(item.maxWidth ?? defaultMax, `items[${index}].maxWidth`);
    if (min > preferred || preferred > max) {
      throw new RangeError(
        `items[${index}] widths must satisfy minWidth <= preferredWidth <= maxWidth`,
      );
    }
    return {
      min,
      preferred,
      max,
      grow: finiteNonNegative(item.grow ?? 1, `items[${index}].grow`),
      height: finiteNonNegative(item.height ?? defaultHeight, `items[${index}].height`),
    };
  });

  const minWideWidth =
    specs.reduce((sum, spec) => sum + spec.min, 0) + gap * Math.max(0, items.length - 1);
  const requestedMode = constraints.mode ?? "auto";
  const mode: ResolvedPipelineLayoutMode =
    requestedMode === "auto" ? (minWideWidth <= innerWidth ? "wide" : "stacked") : requestedMode;

  if (mode === "wide" && minWideWidth > innerWidth) {
    throw new RangeError(
      `wide layout requires at least ${minWideWidth + padding.left + padding.right}px`,
    );
  }

  if (items.length === 0) {
    return {
      mode,
      size: {
        width: round(containerWidth, precision),
        height: round(padding.top + padding.bottom, precision),
      },
      padding,
      items: [],
      connectors: [],
    };
  }

  const resolved: ResolvedPipelineItem[] = [];
  if (mode === "wide") {
    const widthBudget = innerWidth - gap * Math.max(0, items.length - 1);
    const widths = allocateWidths(specs, widthBudget);
    const tallest = Math.max(...specs.map((spec) => spec.height));
    let x = padding.left;
    items.forEach((item, index) => {
      const width = widths[index] ?? 0;
      const height = specs[index]?.height ?? defaultHeight;
      const y = padding.top + (tallest - height) / 2;
      const bounds = {
        x: round(x, precision),
        y: round(y, precision),
        width: round(width, precision),
        height: round(height, precision),
      };
      resolved.push({
        id: item.id,
        index,
        bounds,
        entry: { x: bounds.x, y: round(bounds.y + bounds.height / 2, precision) },
        exit: {
          x: round(bounds.x + bounds.width, precision),
          y: round(bounds.y + bounds.height / 2, precision),
        },
      });
      x += width + gap;
    });
  } else {
    const width = Math.min(innerWidth, maxStackedWidth);
    const x = padding.left + (innerWidth - width) / 2;
    let y = padding.top;
    items.forEach((item, index) => {
      const height = specs[index]?.height ?? defaultHeight;
      const bounds = {
        x: round(x, precision),
        y: round(y, precision),
        width: round(width, precision),
        height: round(height, precision),
      };
      resolved.push({
        id: item.id,
        index,
        bounds,
        entry: { x: round(bounds.x + bounds.width / 2, precision), y: bounds.y },
        exit: {
          x: round(bounds.x + bounds.width / 2, precision),
          y: round(bounds.y + bounds.height, precision),
        },
      });
      y += height + stackedGap;
    });
  }

  const connectors = resolved.slice(0, -1).map((item, index) => {
    const next = resolved[index + 1];
    if (next === undefined) throw new Error("unreachable: missing next pipeline item");
    return { from: item.id, to: next.id, start: item.exit, end: next.entry };
  });
  const last = resolved[resolved.length - 1];
  const contentBottom = last === undefined ? padding.top : last.bounds.y + last.bounds.height;
  const wideHeight = Math.max(
    ...resolved.map((item) => item.bounds.y + item.bounds.height),
    padding.top,
  );

  return {
    mode,
    size: {
      width: round(containerWidth, precision),
      height: round((mode === "wide" ? wideHeight : contentBottom) + padding.bottom, precision),
    },
    padding,
    items: resolved,
    connectors,
  };
}
