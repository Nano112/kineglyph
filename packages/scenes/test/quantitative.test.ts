import { describe, expect, it } from "vitest";
import {
  createMachineState,
  evaluateSignals,
  resolveScene,
  seekTimeline,
  sendMachineEvent,
  validateScene,
  walkScene,
  type ResolvedScene,
  type SceneDefinition,
} from "@kineglyph/core";
import {
  benchmarkBreakdownScene,
  bottleneckLensScene,
  operationHeatmapScene,
  themes,
  throughputOverTimeScene,
} from "../src/index.js";

const SCENES = [
  benchmarkBreakdownScene,
  throughputOverTimeScene,
  operationHeatmapScene,
  bottleneckLensScene,
] as const;
const WIDTHS = [1200, 820, 390] as const;
const LAYOUT_CODES = new Set(["overlap", "overflow", "text-truncated", "label-collision"]);

function layoutProblems(resolved: ResolvedScene): string[] {
  return (resolved.diagnostics ?? [])
    .filter((entry) => LAYOUT_CODES.has(entry.code))
    .map((entry) => `${entry.code}: ${entry.message}`);
}

function ids(scene: SceneDefinition): Set<string> {
  const result = new Set<string>();
  walkScene(scene.root, (node) => result.add(node.id));
  return result;
}

describe("quantitative examples", () => {
  it("gives every product its own complete quantitative palette", () => {
    const keys = [
      "chart1",
      "chart2",
      "chart3",
      "chart4",
      "chart5",
      "chart6",
      "chartPositive",
      "chartNegative",
      "chartNeutral",
    ] as const;
    const palettes = Object.values(themes).map((theme) => keys.map((key) => theme.colors[key]));
    for (const palette of palettes) {
      expect(palette.every((color) => /^#[0-9a-f]{6}$/i.test(color))).toBe(true);
      expect(new Set(palette.slice(0, 6)).size).toBe(6);
    }
    expect(new Set(palettes.map((palette) => palette.join("|"))).size).toBe(3);
  });

  for (const scene of SCENES) {
    it(`${scene.id} validates, resolves responsively, and is deterministic`, () => {
      expect(validateScene(scene).diagnostics).toEqual([]);
      expect(scene.metadata?.data).toBe("illustrative");
      expect(scene.description).toMatch(/illustrative/i);
      for (const width of WIDTHS) {
        const first = resolveScene(scene, { width, theme: themes.nucleation });
        const second = resolveScene(scene, { width, theme: themes.nucleation });
        expect(first.width).toBe(width);
        expect(first.height).toBeGreaterThan(160);
        expect(layoutProblems(first)).toEqual([]);
        expect(JSON.stringify(second)).toBe(JSON.stringify(first));
      }
    });

    it(`${scene.id} has an authored, complete animation`, () => {
      const timeline = scene.timeline;
      expect(timeline).toBeDefined();
      if (timeline === undefined) return;
      expect(timeline.duration).toBeGreaterThan(1_000);
      expect(timeline.tracks.length).toBeGreaterThan(2);
      const resolved = resolveScene(scene, { width: 1200, theme: themes.schematio });
      const start = seekTimeline(resolved, 0);
      const end = seekTimeline(resolved, timeline.duration);
      expect(
        end.nodes.some((node, index) => node.state.opacity !== start.nodes[index]?.state.opacity),
      ).toBe(true);
      for (const node of end.nodes)
        if (node.hidden !== true) expect(node.state.opacity).toBeGreaterThan(0);
    });
  }

  it("keeps typed plot handles present in the composed scene", () => {
    const benchmarkIds = ids(benchmarkBreakdownScene);
    for (const id of [
      "benchmark-grouped:bar:scalar:0",
      "benchmark-grouped:bar:bulk:2",
      "benchmark-stacked:bar:binding:0",
      "benchmark-stacked:bar:writing:2",
    ])
      expect(benchmarkIds.has(id), id).toBe(true);

    const trendIds = ids(throughputOverTimeScene);
    for (const id of ["stream-trend:area:active", "stream-trend:line:active"])
      expect(trendIds.has(id), id).toBe(true);
    expect([...trendIds].filter((id) => id.startsWith("stream-trend:point:active:"))).toHaveLength(
      10,
    );

    const heatmapIds = ids(operationHeatmapScene);
    expect(
      [...heatmapIds].filter((id) => /^bulk-decision-matrix:cell:\d+:\d+$/.test(id)),
    ).toHaveLength(16);
  });

  it("composes the throughput plot inside a gradient card", () => {
    const resolved = resolveScene(throughputOverTimeScene, {
      width: 960,
      theme: themes.nucleation,
    });
    expect(resolved.nodes.find((node) => node.id === "stream-card")?.appearance.fill).toMatchObject(
      {
        type: "linear-gradient",
        angle: 118,
      },
    );
    expect(
      resolved.nodes.find((node) => node.id === "stream-trend:area:active")?.appearance.fill,
    ).toMatchObject({
      type: "linear-gradient",
      angle: 90,
      stops: [
        { color: themes.nucleation.colors.chart1, opacity: 0.5 },
        { color: themes.nucleation.colors.chart1, opacity: 0.015 },
      ],
    });
    expect(resolved.nodes.find((node) => node.id === "stream-trend")?.parent).toBe("stream-card");
    for (const id of ["average", "peak", "settled", "target"])
      expect(resolved.nodes.find((node) => node.id === id)?.parent).toBe("sample-stats");
  });

  it("uses machine state to change both chart emphasis and interpretation", () => {
    const machine = bottleneckLensScene.machine;
    expect(machine).toBeDefined();
    if (machine === undefined) return;
    const initial = createMachineState(machine);
    const reads = sendMachineEvent(machine, initial, "SHOW_READS").next;
    const writes = sendMachineEvent(machine, reads, "SHOW_WRITES").next;
    expect(evaluateSignals(machine, initial)).toMatchObject({
      readsOpacity: 1,
      writesOpacity: 1,
      readsFocus: 0,
      writesFocus: 0,
    });
    expect(evaluateSignals(machine, reads)).toMatchObject({
      readsOpacity: 1,
      writesOpacity: 0.24,
      readsFocus: 1,
      writesFocus: 0,
    });
    expect(evaluateSignals(machine, writes)).toMatchObject({
      readsOpacity: 0.24,
      writesOpacity: 1,
      readsFocus: 0,
      writesFocus: 1,
    });
    const focused = resolveScene(bottleneckLensScene, {
      width: 820,
      theme: themes.pock,
      machineState: writes,
    });
    const readSeries = focused.nodes.find((node) => node.id === "pressure-chart:series:reads");
    const writeLine = focused.nodes.find((node) => node.id === "pressure-chart:line:writes");
    const note = focused.nodes.find((node) => node.id.startsWith("callout-"));
    expect(readSeries?.state.opacity).toBe(0.24);
    expect(writeLine?.state.highlight).toBe(1);
    expect(note?.text?.lines.map((line) => line.text).join(" ")).toContain("peaks at 82%");
    expect(bottleneckLensScene.controls?.map((control) => control.event)).toEqual([
      "SHOW_ALL",
      "SHOW_READS",
      "SHOW_WRITES",
    ]);
  });
});
