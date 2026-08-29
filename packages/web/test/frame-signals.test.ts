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

const REST = "M 100 100 L 200 200";
const MOVED = "M 300 300 L 400 400";

const scene = figure(
  "frame",
  { title: "Frame signals", signals: { leader: REST, readout: "waiting" } },
  (f) => {
    const leader = drafting.layer(f, REST, { id: "leader", bind: { path: "leader" } });
    f.root(
      drafting.sheet(f, {
        id: "sheet",
        title: "Frame",
        layers: [
          leader,
          drafting.text(f, "waiting", 200, 400, "top-left", {
            id: "readout",
            bind: { text: "readout" },
          }),
        ],
      }),
    );
    f.sequence([f.reveal(leader, { duration: 1000 })]);
  },
);

function host(): HTMLDivElement {
  const element = document.createElement("div");
  Object.defineProperty(element, "clientWidth", { value: 960 });
  document.body.append(element);
  return element;
}

describe("frameSignals", () => {
  it("overrides bound values per frame in the stage and in toSvg", () => {
    const times: number[] = [];
    const controller = mountKineglyph(host(), {
      scene,
      autoplay: false,
      frameSignals: (time) => {
        times.push(time);
        return { leader: time >= 500 ? MOVED : REST, readout: time >= 500 ? "landed" : "waiting" };
      },
    });
    const leaderD = () =>
      controller.stage.querySelector('.kg-node-shape[data-shape-of="leader"]')?.getAttribute("d");
    expect(times.length).toBeGreaterThan(0);
    // A figure that does not autoplay presents its terminal frame first.
    expect(leaderD()).toBe(MOVED);
    controller.seek(0);
    expect(leaderD()).toBe(REST);
    controller.seek(1000);
    expect(leaderD()).toBe(MOVED);
    expect(controller.stage.innerHTML).toContain("landed");
    expect(controller.toSvg()).toContain(MOVED);
    controller.seek(0);
    expect(leaderD()).toBe(REST);
    // Export frames use the same overrides for any time, independent of the live position.
    expect(controller.frameSvg(1000)).toContain(MOVED);
    expect(controller.frameSvg(0)).toContain(REST);
    controller.destroy();
  });

  it("is forwarded from a live-block `frameSignals` export", async () => {
    const source = `
      export const frameSignals = (time) => ({ readout: "t=" + time });
      export default { schemaVersion: 2, id: "x", title: "x", root: { id: "r", type: "group", children: [] } };
    `;
    const create = vi
      .spyOn(URL, "createObjectURL")
      .mockImplementation(() => `data:text/javascript;base64,${btoa(source)}`);
    const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    try {
      const loaded = await loadKineglyphLabModule(source, document.createElement("div"));
      expect(typeof loaded.frameSignals).toBe("function");
      expect(loaded.frameSignals?.(250, {})).toEqual({ readout: "t=250" });
    } finally {
      create.mockRestore();
      revoke.mockRestore();
    }
  });
});
