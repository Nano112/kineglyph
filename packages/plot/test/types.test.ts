import { describe, expectTypeOf, it } from "vitest";
import { area, dot, heatmap, line, plot, range, rule, type PlotResult } from "../src/index.js";

interface Row {
  category: string;
  dense: number;
  sparse: number | null;
  enabled: boolean;
  note: string;
  tone: "chart1" | "chart2";
}

const rows: readonly Row[] = [];

describe("typed plot channels", () => {
  it("retains literal wide-data handle keys and accepts layers", () => {
    const result = plot(rows, {
      x: "category",
      y: ["dense", "sparse"],
      tone: "tone",
      label: "note",
      marks: [area(), line(), dot()],
      seriesBindings: {
        dense: { hidden: "hideDense", highlight: "emphasiseDense" },
        sparse: { opacity: "sparseOpacity" },
      },
    });
    expectTypeOf(result).toEqualTypeOf<PlotResult<"dense" | "sparse">>();
    expectTypeOf(result.handles.series.dense.line).toEqualTypeOf<string | undefined>();
    expectTypeOf(result.handles.series.sparse.dots).toEqualTypeOf<readonly string[]>();
    expectTypeOf(result.handles.axes.x).toEqualTypeOf<string | undefined>();
  });

  it("checks heatmap channels and the advanced IR overload", () => {
    const heat = plot(rows, {
      marks: heatmap({ row: "category", column: "note", value: "dense" }),
    });
    expectTypeOf(heat).toEqualTypeOf<PlotResult<"heatmap">>();

    const advanced = plot({
      series: [{ id: "s", label: "S", mark: "line", data: [{ x: 0, y: 1 }] }],
    });
    expectTypeOf(advanced).toEqualTypeOf<PlotResult<string>>();
  });

  it("rejects misspelled and value-incompatible channels", () => {
    // @ts-expect-error y must name a numeric/null field
    plot(rows, { x: "category", y: "note" });
    // @ts-expect-error x must name a string/number field
    plot(rows, { x: "enabled", y: "dense" });
    // @ts-expect-error tone values must be Paint tokens
    plot(rows, { x: "category", y: "dense", tone: "note" });
    // @ts-expect-error label values must be strings
    plot(rows, { x: "category", y: "dense", label: "enabled" });
    // @ts-expect-error misspelled fields are rejected
    plot(rows, { x: "category", y: "dens" });
    // @ts-expect-error cartesian plots require y
    plot(rows, { x: "category", marks: line() });
    // @ts-expect-error heatmap value must be numeric/null
    plot(rows, { marks: heatmap({ row: "category", column: "note", value: "enabled" }) });
    // @ts-expect-error heatmap row must be categorical
    plot(rows, { marks: heatmap({ row: "enabled", column: "note", value: "dense" }) });
    // @ts-expect-error wide-data binding keys are exactly the inferred y fields
    plot(rows, { y: ["dense", "sparse"], seriesBindings: { other: { hidden: "hide" } } });
    // @ts-expect-error mark-specific motion is selected by auto, not by an incompatible preset
    plot(rows, { y: "dense", motion: "rise" });
    // @ts-expect-error heatmaps do not expose cartesian stacking
    plot(rows, {
      marks: heatmap({ row: "category", column: "note", value: "dense" }),
      stack: true,
    });
    // @ts-expect-error heatmaps do not expose cartesian value labels
    plot(rows, {
      marks: heatmap({ row: "category", column: "note", value: "dense" }),
      valueLabels: true,
    });
    // @ts-expect-error heatmaps do not expose cartesian orientation
    plot(rows, {
      marks: heatmap({ row: "category", column: "note", value: "dense" }),
      orientation: "horizontal",
    });
    // @ts-expect-error heatmaps do not expose cartesian grid settings
    plot(rows, {
      marks: heatmap({ row: "category", column: "note", value: "dense" }),
      grid: "both",
    });
    // @ts-expect-error rule needs exactly one axis
    rule({ label: "ambiguous" });
    // @ts-expect-error rule cannot target both axes
    rule({ x: "category", y: 2 });
    // @ts-expect-error range needs exactly one axis
    range({ tone: "muted" });
    // @ts-expect-error range cannot target both axes
    range({ x: ["A", "B"], y: [0, 1] });
    // @ts-expect-error advanced plots cannot silently mix Cartesian series and a heatmap
    plot({
      series: [{ id: "s", label: "S", mark: "line", data: [{ x: 0, y: 1 }] }],
      heatmap: { rows: ["A"], columns: ["X"], values: [[1]] },
    });
  });
});
