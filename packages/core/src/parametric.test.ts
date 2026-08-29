import { describe, expect, it } from "vitest";
import { drafting } from "./drafting.js";
import { figure } from "./figure.js";
import { parametric } from "./parametric.js";
import { resolveScene } from "./resolve.js";

const model = (v: { radius: number; turns: number }) => ({
  orbit: drafting.circle(1440, 900, v.radius),
  readout: `r ${v.radius} · ${v.turns} turns`,
});

const params = parametric(
  {
    radius: { value: 300, label: "Radius", min: 100, max: 600, step: 10 },
    turns: { value: 2, label: "Turns", min: 1, max: 5 },
  },
  model,
  { group: "orbit" },
);

const scene = () =>
  figure("parametric-test", { title: "Parametric", signals: params.signals }, (f) => {
    const orbit = drafting.layer(f, params.signals.orbit, { id: "orbit", bind: { path: "orbit" } });
    const readout = drafting.text(f, params.signals.readout, 200, 400, "top-left", {
      bind: { text: "readout" },
    });
    f.root(drafting.sheet(f, { id: "sheet", title: "Parametric", layers: [orbit, readout] }));
    params.install(f);
  });

describe("parametric", () => {
  it("derives events, defaults, controls, and initial signals from one spec", () => {
    expect(params.defaults).toEqual({ radius: 300, turns: 2 });
    expect(params.events).toEqual({ radius: "SET_RADIUS", turns: "SET_TURNS" });
    expect(params.signals.readout).toBe("r 300 · 2 turns");
    expect(params.controls.map((c) => c.kind)).toEqual(["range", "range", "reset"]);
    expect(params.controls[0]).toMatchObject({
      event: "SET_RADIUS",
      bind: "radius",
      min: 100,
      max: 600,
      step: 10,
      group: "orbit",
    });
    expect(params.machine.initial).toBe("tuning");
  });

  it("installs a valid machine and controls on a figure", () => {
    const definition = scene();
    expect(definition.machine?.variables).toEqual({ radius: 300, turns: 2 });
    expect(definition.controls?.map((c) => c.label)).toEqual(["Radius", "Turns", "Reset"]);
    const resolved = resolveScene(definition, { width: 960 });
    expect((resolved.diagnostics ?? []).filter((d) => d.severity === "error")).toEqual([]);
  });

  it("recomputes signals from machine variables, tolerating strings and missing keys", () => {
    expect(params.deriveSignals({ radius: 450 }).readout).toBe("r 450 · 2 turns");
    expect(params.deriveSignals({ radius: "500", turns: "3" }).readout).toBe("r 500 · 3 turns");
    expect(params.deriveSignals({}).orbit).toBe(params.signals.orbit);
  });

  it("is honoured by resolveScene through deriveSignals", () => {
    const definition = scene();
    const resolved = resolveScene(definition, {
      width: 960,
      machineState: { state: "tuning", variables: { radius: 120, turns: 4 }, selection: null },
      deriveSignals: params.deriveSignals,
    });
    const orbit = resolved.nodes.find((node) => node.id === "orbit");
    expect(orbit?.path?.d).toBe(drafting.circle(1440, 900, 120));
    expect(JSON.stringify(resolved.nodes)).toContain("r 120 · 4 turns");
  });

  it("names multi-word parameters with underscores", () => {
    const spec = parametric(
      { targetAltitude: { value: 1, label: "t", min: 0, max: 2 } },
      (v: { targetAltitude: number }) => ({
        h: v.targetAltitude,
      }),
    );
    expect(spec.events.targetAltitude).toBe("SET_TARGET_ALTITUDE");
  });
});
