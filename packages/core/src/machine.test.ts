import { describe, expect, it } from "vitest";
import {
  MachineController,
  createMachineState,
  defineStateMachine,
  evaluateSignals,
  resolveMachineState,
  sendMachineEvent,
  validateStateMachine,
  type StateMachineDefinition,
} from "./machine.js";
import { resolveScene } from "./resolve.js";
import type { SceneDefinition } from "./scene.js";

const machine: StateMachineDefinition = {
  id: "engine-picker",
  initial: "idle",
  variables: { intent: "none", ticks: 0, verbose: false },
  states: {
    idle: {
      on: {
        CHOOSE: [
          { target: "shorthand", guard: { var: "intent", op: "eq", value: "comparator" } },
          { target: "placement", guard: { var: "intent", op: "eq", value: "placement" } },
          { target: "idle" },
        ],
        SET_INTENT: {
          target: "idle",
          actions: [{ type: "set", var: "intent", value: { fromEvent: true } }],
        },
        TICK: { target: "idle", actions: [{ type: "increment", var: "ticks", max: 3 }] },
      },
    },
    shorthand: {
      entry: [
        { type: "select", node: "shorthand-card" },
        { type: "seek", time: "end" },
      ],
      exit: [{ type: "select", node: null }],
      on: {
        RESET: "idle",
        TOGGLE: { target: "shorthand", actions: [{ type: "toggle", var: "verbose" }] },
      },
    },
    placement: { on: { RESET: "idle" } },
  },
  signals: {
    engine: {
      match: { state: true },
      cases: { shorthand: "Signal shorthand", placement: "Simulated placement" },
      default: "Choose an intent",
    },
    isDecided: { not: { when: { state: "idle" }, then: true, else: false } },
    summary: { concat: [{ signal: "engine" }, " · ", { var: "intent" }], separator: "" },
  },
};

describe("state machines", () => {
  it("validates definitions and reports every problem", () => {
    const result = validateStateMachine(
      {
        id: "broken",
        initial: "nowhere",
        variables: { $bad: 1 },
        states: {
          a: {
            on: { GO: [{ target: "b" }, { target: "missing" }] },
            entry: [{ type: "set", var: "unknown", value: 1 }],
          },
          b: { on: { BACK: { target: "a", guard: { var: "ghost", op: "eq", value: 1 } } } },
          lonely: {},
        },
        signals: { late: { signal: "later" }, later: { var: "$bad" }, a: 1 },
      },
      { nodeIds: ["x"] },
    );
    expect(result.ok).toBe(false);
    const codes = result.diagnostics.map((entry) => entry.code);
    expect(codes).toEqual(
      expect.arrayContaining([
        "unknown-initial",
        "reserved-variable",
        "unknown-target",
        "unknown-variable",
        "signal-order",
        "unreachable-transition",
      ]),
    );
    expect(() => defineStateMachine({ id: "m", initial: "x", states: {} })).toThrow(/no states/);
    expect(defineStateMachine(machine, { nodeIds: ["shorthand-card"] })).toBe(machine);
    expect(validateStateMachine(machine, { nodeIds: ["other"] }).ok).toBe(false);
  });

  it("transitions deterministically with guards, actions, and effects", () => {
    const initial = createMachineState(machine);
    expect(initial).toEqual({
      state: "idle",
      variables: { intent: "none", ticks: 0, verbose: false },
      selection: null,
    });
    const unchanged = sendMachineEvent(machine, initial, "CHOOSE");
    expect(unchanged.next.state).toBe("idle");
    expect(unchanged.transition?.to).toBe("idle");
    const withIntent = sendMachineEvent(machine, initial, {
      type: "SET_INTENT",
      value: "comparator",
    }).next;
    expect(withIntent.variables.intent).toBe("comparator");
    const chosen = sendMachineEvent(machine, withIntent, "CHOOSE");
    expect(chosen.next.state).toBe("shorthand");
    expect(chosen.next.selection).toBe("shorthand-card");
    expect(chosen.effects).toEqual([{ type: "seek", time: "end" }]);
    expect(chosen.changed).toBe(true);
    // Random access: the same state is reachable without history.
    expect(
      resolveMachineState(machine, "shorthand", { variables: { intent: "comparator" } }),
    ).toEqual(chosen.next);
    const toggled = sendMachineEvent(machine, chosen.next, "TOGGLE").next;
    expect(toggled.variables.verbose).toBe(true);
    const reset = sendMachineEvent(machine, toggled, "RESET").next;
    expect(reset.state).toBe("idle");
    expect(reset.selection).toBeNull();
    let ticked = initial;
    for (let index = 0; index < 5; index += 1)
      ticked = sendMachineEvent(machine, ticked, "TICK").next;
    expect(ticked.variables.ticks).toBe(3);
    expect(sendMachineEvent(machine, initial, "UNKNOWN").changed).toBe(false);
  });

  it("evaluates derived signals in declaration order", () => {
    const state = resolveMachineState(machine, "shorthand", {
      variables: { intent: "comparator" },
    });
    const signals = evaluateSignals(machine, state);
    expect(signals.engine).toBe("Signal shorthand");
    expect(signals.isDecided).toBe(true);
    expect(signals.summary).toBe("Signal shorthand · comparator");
    expect(signals.$state).toBe("shorthand");
    expect(signals.$selection).toBe("shorthand-card");
    expect(evaluateSignals(machine, createMachineState(machine)).isDecided).toBe(false);
  });

  it("drives bound scene properties and keeps history optional", () => {
    const scene: SceneDefinition = {
      schemaVersion: 2,
      id: "bound",
      title: "Bound scene",
      machine,
      root: {
        id: "root",
        type: "group",
        layout: "row",
        gap: 12,
        children: [
          {
            id: "shorthand-card",
            type: "group",
            width: "fill",
            padding: 12,
            frame: { fill: "surface", stroke: "border" },
            bind: { highlight: "isDecided" },
            children: [{ id: "engine", type: "text", text: "?", bind: { text: "engine" } }],
          },
          { id: "note", type: "badge", text: "hidden while idle", bind: { hidden: "isDecided" } },
        ],
      },
      edges: [
        {
          id: "flow",
          from: "shorthand-card",
          to: "note",
          bind: { highlight: "isDecided", tone: "engine" },
        },
      ],
      controls: [{ id: "choose", label: "Choose", event: "CHOOSE" }],
    };
    const idle = resolveScene(scene, { width: 800 });
    expect(idle.nodes.find((node) => node.id === "engine")?.text?.lines[0]?.text).toBe(
      "Choose an intent",
    );
    expect(idle.nodes.find((node) => node.id === "note")?.hidden).toBeUndefined();
    expect(idle.nodes.find((node) => node.id === "shorthand-card")?.state.highlight).toBe(0);
    const decided = resolveScene(scene, {
      width: 800,
      machineState: resolveMachineState(machine, "shorthand", {
        variables: { intent: "comparator" },
      }),
    });
    expect(decided.nodes.find((node) => node.id === "engine")?.text?.lines[0]?.text).toBe(
      "Signal shorthand",
    );
    expect(decided.nodes.find((node) => node.id === "note")?.hidden).toBe(true);
    expect(decided.nodes.find((node) => node.id === "shorthand-card")?.state.highlight).toBe(1);
    expect(decided.edges[0]?.state.highlight).toBe(1);
    expect(() =>
      resolveScene({ ...scene, root: { ...scene.root, bind: { text: "nope" } } }, { width: 800 }),
    ).toThrow(/unknown signal "nope"/);

    const controller = new MachineController(machine, { history: true });
    controller.send({ type: "SET_INTENT", value: "placement" });
    controller.send("CHOOSE");
    expect(controller.state.state).toBe("placement");
    expect(controller.history.map((entry) => `${entry.from}>${entry.to}`)).toEqual([
      "idle>idle",
      "idle>placement",
    ]);
    const stateless = new MachineController(machine);
    stateless.send("CHOOSE");
    expect(stateless.history).toEqual([]);
    expect(controller.reset().next.state).toBe("idle");
    expect(controller.history).toEqual([]);
  });
});
