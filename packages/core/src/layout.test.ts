import { describe, expect, it } from "vitest";
import { resolvePipelineLayout } from "./layout.js";

const stages = [{ id: "ingest" }, { id: "transform" }, { id: "publish" }];

describe("resolvePipelineLayout", () => {
  it("uses a deterministic wide layout when minimum constraints fit", () => {
    const first = resolvePipelineLayout(800, stages, { padding: 20, gap: 20 });
    const second = resolvePipelineLayout(800, stages, { padding: 20, gap: 20 });

    expect(first).toEqual(second);
    expect(first.mode).toBe("wide");
    expect(first.items.map((item) => item.bounds)).toEqual([
      { x: 20, y: 20, width: 240, height: 128 },
      { x: 280, y: 20, width: 240, height: 128 },
      { x: 540, y: 20, width: 240, height: 128 },
    ]);
    expect(first.connectors[0]).toMatchObject({
      from: "ingest",
      to: "transform",
      start: { x: 260, y: 84 },
      end: { x: 280, y: 84 },
    });
  });

  it("falls back to a centered stacked layout without changing document order", () => {
    const result = resolvePipelineLayout(430, stages, {
      padding: { top: 12, right: 15, bottom: 18, left: 15 },
      stackedGap: 10,
      itemHeight: 80,
      maxStackedWidth: 320,
    });

    expect(result.mode).toBe("stacked");
    expect(result.size).toEqual({ width: 430, height: 290 });
    expect(result.items.map((item) => [item.id, item.bounds])).toEqual([
      ["ingest", { x: 55, y: 12, width: 320, height: 80 }],
      ["transform", { x: 55, y: 102, width: 320, height: 80 }],
      ["publish", { x: 55, y: 192, width: 320, height: 80 }],
    ]);
    expect(result.connectors[1]?.start).toEqual({ x: 215, y: 182 });
    expect(result.connectors[1]?.end).toEqual({ x: 215, y: 192 });
  });

  it("honours width caps and grow weights while preserving exact placement", () => {
    const result = resolvePipelineLayout(
      700,
      [
        { id: "fixed", minWidth: 100, preferredWidth: 100, maxWidth: 100 },
        { id: "one", minWidth: 100, preferredWidth: 100, maxWidth: 400, grow: 1 },
        { id: "two", minWidth: 100, preferredWidth: 100, maxWidth: 400, grow: 2 },
      ],
      { padding: 0, gap: 0 },
    );

    expect(result.items.map((item) => item.bounds.width)).toEqual([100, 233.333, 366.667]);
    expect(result.items.map((item) => item.bounds.x)).toEqual([0, 100, 333.333]);
  });

  it("rejects ambiguous ids and infeasible forced-wide layouts", () => {
    expect(() => resolvePipelineLayout(800, [{ id: "same" }, { id: "same" }])).toThrow(/duplicate/);
    expect(() => resolvePipelineLayout(300, stages, { mode: "wide" })).toThrow(/requires at least/);
  });
});
