import { describe, expect, it } from "vitest";
import {
  createMachineState,
  evaluateSignals,
  resolveScene,
  seekTimeline,
  sendMachineEvent,
  validateScene,
  type ResolvedScene,
} from "@kineglyph/core";
import { renderSvg } from "@kineglyph/svg";
import { catalogue, themeNames, themes } from "../src/index.js";

const WIDTHS = [1200, 820, 390] as const;
const LAYOUT_CODES = new Set(["overlap", "overflow", "text-truncated", "label-collision"]);

function layoutProblems(resolved: ResolvedScene): string[] {
  return (resolved.diagnostics ?? [])
    .filter((entry) => LAYOUT_CODES.has(entry.code))
    .map((entry) => `${entry.code}: ${entry.message}`);
}

describe("illustration catalogue", () => {
  it("lists the Nucleation and quantitative illustrations with authored copy", () => {
    expect(catalogue.map((entry) => entry.slug)).toEqual([
      "fast-generation",
      "shapes-and-brushes",
      "sdf-and-fields",
      "palettes-and-color",
      "smart-simulation",
      "formats-and-io",
      "bindings-and-languages",
      "meshing-and-rendering",
      "benchmark-breakdown",
      "throughput-over-time",
      "operation-heatmap",
      "bottleneck-lens",
    ]);
    for (const entry of catalogue) {
      expect(entry.title).not.toMatch(/placeholder/i);
      expect(entry.summary).not.toMatch(/placeholder/i);
      expect(entry.scene.title).not.toMatch(/placeholder/i);
      expect(entry.scene.description?.length ?? 0).toBeGreaterThan(24);
      expect(validateScene(entry.scene).ok).toBe(true);
      expect(entry.scene.timeline?.duration ?? 0).toBeGreaterThan(1000);
      const interactive = JSON.stringify(entry.scene.root).includes('"interactive":true');
      expect(interactive || (entry.scene.controls?.length ?? 0) > 0).toBe(true);
    }
  });

  it("visibly demonstrates the edge grammar across the catalogue", () => {
    const routes = new Set<string>();
    const heads = new Set<string>();
    const strokes = new Set<string>();
    let labels = 0;
    let packets = 0;
    let twoWay = 0;
    for (const entry of catalogue) {
      const resolved = resolveScene(entry.scene, { width: 1200, theme: themes.nucleation });
      for (const edge of resolved.edges) {
        routes.add(edge.route ?? "straight");
        heads.add(edge.head ?? "none");
        heads.add(edge.tail ?? "none");
        strokes.add(edge.dash ?? "solid");
        labels += edge.labels?.length ?? 0;
        packets += (edge.metadata?.packetCount as number | undefined) ?? 0;
        if ((edge.head ?? "none") !== "none" && (edge.tail ?? "none") !== "none") twoWay += 1;
      }
    }
    expect([...routes].sort()).toEqual(["arc", "curve", "orthogonal", "straight"]);
    expect(heads.size).toBeGreaterThanOrEqual(4);
    expect(strokes.size).toBeGreaterThanOrEqual(3);
    expect(labels).toBeGreaterThan(0);
    expect(packets).toBeGreaterThan(0);
    expect(twoWay).toBeGreaterThan(0);
  });

  for (const entry of catalogue) {
    describe(entry.slug, () => {
      for (const width of WIDTHS) {
        for (const themeName of themeNames) {
          it(`resolves cleanly at ${width}px in ${themeName}`, () => {
            const theme = themes[themeName];
            const resolved = resolveScene(entry.scene, { width, theme });
            expect(resolved.width).toBe(width);
            expect(resolved.height).toBeGreaterThan(120);
            expect(resolved.nodes.length).toBeGreaterThanOrEqual(6);
            for (const node of resolved.nodes) {
              expect([node.x, node.y, node.width, node.height].every(Number.isFinite)).toBe(true);
              if (node.hidden !== true) {
                expect(node.x).toBeGreaterThanOrEqual(-0.001);
                expect(node.y).toBeGreaterThanOrEqual(-0.001);
                expect(node.x + node.width).toBeLessThanOrEqual(resolved.width + 0.001);
                expect(node.y + node.height).toBeLessThanOrEqual(resolved.height + 0.001);
              }
              if (node.text !== undefined)
                for (const line of node.text.lines)
                  expect(line.width).toBeLessThanOrEqual(node.text.box.width + 0.01);
            }
            for (const edge of resolved.edges) {
              expect(edge.path.length).toBeGreaterThan(0);
              expect(
                [edge.start.x, edge.start.y, edge.end.x, edge.end.y].every(Number.isFinite),
              ).toBe(true);
            }
            expect(layoutProblems(resolved)).toEqual([]);
            const again = resolveScene(entry.scene, { width, theme });
            expect(JSON.stringify(again)).toBe(JSON.stringify(resolved));
            const svg = renderSvg(resolved, { idPrefix: `${entry.slug}-${width}` });
            expect(svg.startsWith("<svg")).toBe(true);
            expect(svg).toContain(`data-kineglyph-scene="${entry.scene.id}"`);
          });
        }
      }

      it("ends in a complete, readable terminal frame", () => {
        const resolved = resolveScene(entry.scene, { width: 1200, theme: themes.nucleation });
        const duration = resolved.timeline?.duration ?? 0;
        const final = seekTimeline(resolved, duration);
        for (const node of final.nodes)
          if (node.hidden !== true) expect(node.state.opacity).toBeGreaterThan(0);
        for (const edge of final.edges)
          if (edge.hidden !== true) {
            expect(edge.state.opacity).toBeGreaterThanOrEqual(0.5);
            expect(edge.state.progress).toBe(1);
          }
        const start = seekTimeline(resolved, 0);
        const changes =
          final.nodes.some(
            (node, index) => node.state.opacity !== start.nodes[index]?.state.opacity,
          ) ||
          final.edges.some(
            (edge, index) => edge.state.progress !== start.edges[index]?.state.progress,
          );
        expect(changes).toBe(true);
      });

      if (entry.scene.machine !== undefined) {
        it("has a usable state machine whose events change bound output", () => {
          const machine = entry.scene.machine;
          if (machine === undefined) return;
          const initial = createMachineState(machine);
          const controls = entry.scene.controls ?? [];
          expect(controls.length).toBeGreaterThan(0);
          const events = controls.filter((control) => control.event !== undefined);
          let differed = false;
          for (const control of events) {
            const step = sendMachineEvent(machine, initial, control.event ?? "");
            const before = JSON.stringify(evaluateSignals(machine, initial));
            const after = JSON.stringify(evaluateSignals(machine, step.next));
            if (before !== after) differed = true;
            const resolved = resolveScene(entry.scene, {
              width: 1200,
              theme: themes.pock,
              machineState: step.next,
            });
            expect(layoutProblems(resolved)).toEqual([]);
          }
          expect(differed).toBe(true);
        });
      }
    });
  }
});
