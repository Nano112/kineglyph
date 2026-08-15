/**
 * The cookbook's "first figure": a compile-checked, sub-80-line interactive illustration built
 * with `figure()` alone (no `@kineglyph/plot`). The test resolves it at three widths, checks the
 * timeline, machine, and controls, and asserts the example stays under 80 readable lines.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { figure } from "./figure.js";
import {
  createMachineState,
  evaluateSignals,
  sendMachineEvent,
  type MachineTransition,
} from "./machine.js";
import { resolveScene } from "./resolve.js";
import type { Paint } from "./scene.js";
import { seekTimeline } from "./seek.js";
import { createTheme } from "./theme.js";

// example:start
export const buildExplainer = figure(
  "build-explainer",
  {
    title: "How a build request becomes blocks",
    description: "Plan the region, place the blocks, commit the result. Focus a stage to see why.",
  },
  (f) => {
    f.heading("Three stages, one guarantee: the world changes once");
    const stage = (n: number, title: string, motif: string, tone: Paint, body: string) =>
      f.card({
        eyebrow: `Stage ${n}`,
        title,
        body,
        motif,
        tone,
        interactive: true,
        onActivate: `FOCUS_${title.toUpperCase()}`,
        bind: { highlight: `${title.toLowerCase()}Focus` },
      });
    const plan = stage(1, "Plan", "graph", "info", "Bound the region and pick a brush.");
    const place = stage(2, "Place", "blocks", "accent", "Visit every cell and choose a block.");
    const commit = stage(3, "Commit", "cube", "success", "Write the blocks as one edit.");
    const toPlace = f.connect(plan, place, {
      head: "arrow",
      labels: [{ text: "region + brush", hidden: { compact: true } }],
    });
    const toCommit = f.connect(place, commit, { head: "triangle", packets: { count: 2 } });
    f.flow([plan, place, commit], { gap: { wide: 56, compact: 20 } });
    const note = f.callout("Pick a stage, or press Next stage, to read what it guarantees.", {
      pointer: "up",
      tone: "info",
      bind: { text: "note" },
    });
    // No f.root(): the root is a stack of the top-level nodes in creation order.
    f.sequence([
      f.reveal(plan, { scale: 0.96 }),
      [f.draw(toPlace), f.reveal(place, { scale: 0.96 })],
      [f.draw(toCommit), f.reveal(commit, { scale: 0.96 })],
      [f.flow(toCommit), f.reveal(note, { offset: 8 })],
    ]);
    const focus = (value: number): MachineTransition => ({
      target: "tour",
      actions: [{ type: "set", var: "stage", value }],
    });
    f.machine({
      initial: "tour",
      variables: { stage: 0 },
      states: {
        tour: {
          on: {
            NEXT: { target: "tour", actions: [{ type: "increment", var: "stage", max: 3 }] },
            FOCUS_PLAN: focus(1),
            FOCUS_PLACE: focus(2),
            FOCUS_COMMIT: focus(3),
          },
        },
      },
      signals: {
        note: {
          match: { var: "stage" },
          cases: {
            1: "Planning never touches the world: it only decides where and what.",
            2: "Placement is pure and repeatable: the same plan yields the same blocks.",
            3: "Commit is the only step with side effects, so undo is a single operation.",
          },
          default: "Pick a stage, or press Next stage, to read what it guarantees.",
        },
        planFocus: { when: { var: "stage", op: "eq", value: 1 }, then: 1, else: 0 },
        placeFocus: { when: { var: "stage", op: "eq", value: 2 }, then: 1, else: 0 },
        commitFocus: { when: { var: "stage", op: "eq", value: 3 }, then: 1, else: 0 },
      },
    });
    f.controls([
      { label: "Next stage", event: "NEXT" },
      { label: "Show all", kind: "reset" },
    ]);
  },
);
// example:end

const WIDTHS = [1200, 820, 390] as const;
const LAYOUT_CODES = new Set(["overlap", "overflow", "text-truncated", "label-collision"]);
const theme = createTheme();

describe("cookbook example: build explainer", () => {
  it("stays under 80 readable lines", () => {
    const source = readFileSync(fileURLToPath(import.meta.url), "utf8").split("\n");
    const start = source.findIndex((line) => line.includes("// example:start"));
    const end = source.findIndex((line) => line.includes("// example:end"));
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const lines = source.slice(start + 1, end);
    expect(lines.length).toBeLessThanOrEqual(80);
    expect(lines.length).toBeGreaterThan(40);

    const cookbook = readFileSync(
      fileURLToPath(new URL("../../../docs/cookbook.md", import.meta.url)),
      "utf8",
    );
    const documentedStart = cookbook.indexOf("export const buildExplainer = figure(");
    const documentedEnd = cookbook.indexOf("\n```", documentedStart);
    expect(documentedStart).toBeGreaterThan(-1);
    expect(documentedEnd).toBeGreaterThan(documentedStart);
    expect(cookbook.slice(documentedStart, documentedEnd)).toBe(lines.join("\n"));
  });

  it("infers stable ids and wires the connectors, machine, and controls", () => {
    const ids = JSON.stringify(buildExplainer.root);
    for (const id of [
      "card-plan",
      "card-place",
      "card-commit",
      "callout-pick-a-stage-or-press-next-stage",
    ])
      expect(ids).toContain(`"${id}"`);
    expect(buildExplainer.edges?.map((edge) => edge.id)).toEqual([
      "card-plan-card-place",
      "card-place-card-commit",
    ]);
    expect(buildExplainer.machine?.id).toBe("build-explainer-machine");
    expect(buildExplainer.controls?.map((control) => control.id)).toEqual([
      "next-stage",
      "show-all",
    ]);
    expect(buildExplainer.root.children.map((node) => node.id)).toEqual([
      "heading-three-stages-one-guarantee-the-w",
      "flow",
      "callout-pick-a-stage-or-press-next-stage",
    ]);
  });

  for (const width of WIDTHS) {
    it(`resolves at ${width}px without layout diagnostics`, () => {
      const resolved = resolveScene(buildExplainer, { width, theme });
      const problems = (resolved.diagnostics ?? []).filter((entry) => LAYOUT_CODES.has(entry.code));
      expect(problems).toEqual([]);
      expect(resolved.edges).toHaveLength(2);
      const again = resolveScene(buildExplainer, { width, theme });
      expect(JSON.stringify(again)).toBe(JSON.stringify(resolved));
    });
  }

  it("sequences the reveals and ends on a complete frame", () => {
    const timeline = buildExplainer.timeline;
    expect(timeline).toBeDefined();
    if (timeline === undefined) return;
    expect(timeline.duration).toBe(2360);
    const resolved = resolveScene(buildExplainer, { width: 1200, theme });
    const first = seekTimeline(resolved, 0);
    const plan = first.nodes.find((node) => node.id === "card-plan");
    const place = first.nodes.find((node) => node.id === "card-place");
    expect(plan?.state.opacity).toBe(0);
    expect(place?.state.opacity).toBe(0);
    const final = seekTimeline(resolved, timeline.duration);
    for (const node of final.nodes) if (node.hidden !== true) expect(node.state.opacity).toBe(1);
    for (const edge of final.edges) {
      expect(edge.state.opacity).toBe(1);
      expect(edge.state.progress).toBe(1);
    }
    expect(final.edges.find((edge) => edge.id === "card-place-card-commit")?.state.flow).toBe(1);
  });

  it("swaps the callout text and highlights a stage from the machine", () => {
    const machine = buildExplainer.machine;
    expect(machine).toBeDefined();
    if (machine === undefined) return;
    const initial = createMachineState(machine);
    expect(evaluateSignals(machine, initial).note).toContain("Pick a stage");
    const next = sendMachineEvent(machine, initial, { type: "NEXT" }).next;
    const signals = evaluateSignals(machine, next);
    expect(signals.note).toContain("Planning never touches");
    expect(signals.planFocus).toBe(1);
    expect(signals.placeFocus).toBe(0);
    const focused = sendMachineEvent(machine, next, { type: "FOCUS_COMMIT" }).next;
    expect(evaluateSignals(machine, focused).commitFocus).toBe(1);
    const resolved = resolveScene(buildExplainer, { width: 1200, theme, machineState: focused });
    const commit = resolved.nodes.find((node) => node.id === "card-commit");
    expect(commit?.state.highlight).toBe(1);
    const note = resolved.nodes.find((node) => node.id.startsWith("callout-"));
    expect(note?.text?.lines.map((line) => line.text).join(" ")).toContain("Commit is the only");
  });
});
