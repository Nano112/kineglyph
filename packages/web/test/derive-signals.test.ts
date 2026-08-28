// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { drafting, figure } from "@kineglyph/core";
import { mountKineglyph } from "../src/index.js";
import { loadKineglyphLabModule } from "../src/lab.js";

const mediaQuery = {
  matches: false,
  media: "(prefers-reduced-motion: reduce)",
  onchange: null,
  addListener: () => undefined,
  removeListener: () => undefined,
  addEventListener: () => undefined,
  removeEventListener: () => undefined,
  dispatchEvent: () => true,
} satisfies MediaQueryList;

beforeEach(() => {
  vi.stubGlobal("matchMedia", () => mediaQuery);
});

afterEach(() => {
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

const orbitPath = (radius: number) => drafting.circle(1440, 900, radius);

const scene = figure(
  "derive",
  { title: "Derived orbit", signals: { orbit: orbitPath(300), readout: "r = 300" } },
  (f) => {
    const orbit = drafting.layer(f, orbitPath(300), { id: "orbit", bind: { path: "orbit" } });
    f.root(
      drafting.sheet(f, {
        id: "sheet",
        title: "Derived",
        layers: [
          orbit,
          drafting.text(f, "r = 300", 200, 400, "top-left", { bind: { text: "readout" } }),
        ],
      }),
    );
    f.machine({
      initial: "tuning",
      variables: { radius: 300 },
      states: {
        tuning: {
          on: {
            SET_RADIUS: {
              target: "tuning",
              actions: [{ type: "set", var: "radius", value: { fromEvent: true } }],
            },
          },
        },
      },
    });
    f.controls([
      { label: "Radius", kind: "range", event: "SET_RADIUS", bind: "radius", min: 100, max: 600 },
    ]);
  },
);

function host(): HTMLDivElement {
  const element = document.createElement("div");
  Object.defineProperty(element, "clientWidth", { value: 960 });
  document.body.append(element);
  return element;
}

describe("deriveSignals", () => {
  it("recomputes bound signals from machine variables at mount and after every step", () => {
    const calls: number[] = [];
    const controller = mountKineglyph(host(), {
      scene,
      autoplay: false,
      deriveSignals: (variables) => {
        const radius = Number(variables.radius);
        calls.push(radius);
        return { orbit: orbitPath(radius), readout: `r = ${radius}` };
      },
    });
    const orbit = () => controller.scene.nodes.find((node) => node.id === "orbit")?.path?.d;
    expect(calls).toEqual([300]);
    expect(orbit()).toBe(orbitPath(300));

    controller.send({ type: "SET_RADIUS", value: 450 });
    expect(calls).toEqual([300, 450]);
    expect(orbit()).toBe(orbitPath(450));
    expect(controller.state.signals.readout).toBe("r = 450");
    expect(controller.stage.innerHTML).toContain("r = 450");
    controller.destroy();
  });

  it("is forwarded from a live-block `deriveSignals` export", async () => {
    const source = `
      export const deriveSignals = (variables) => ({ readout: "derived " + variables.radius });
      export default { schemaVersion: 2, id: "x", title: "x", root: { id: "r", type: "group", children: [] } };
    `;
    // jsdom cannot import blob: URLs; serve the module source as a data: URL instead.
    const create = vi
      .spyOn(URL, "createObjectURL")
      .mockImplementation(() => `data:text/javascript;base64,${btoa(source)}`);
    const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    try {
      const loaded = await loadKineglyphLabModule(source, document.createElement("div"));
      expect(typeof loaded.deriveSignals).toBe("function");
      expect(loaded.deriveSignals?.({ radius: 7 }, {})).toEqual({ readout: "derived 7" });
    } finally {
      create.mockRestore();
      revoke.mockRestore();
    }
  });
});
