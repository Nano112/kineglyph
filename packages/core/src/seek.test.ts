import { describe, expect, it } from "vitest";
import { drafting } from "./drafting.js";
import { figure } from "./figure.js";
import { resolveScene } from "./resolve.js";
import { seekTimeline } from "./seek.js";

const scene = figure(
  "frame-signals",
  {
    title: "Frame signals",
    signals: { d: "M 0 0 L 10 10", label: "start", fade: 1, gone: false },
  },
  (f) => {
    const leader = drafting.layer(f, "M 0 0 L 10 10", {
      id: "leader",
      bind: { path: "d", opacity: "fade" },
    });
    const readout = drafting.text(f, "start", 200, 200, "top-left", {
      id: "readout",
      bind: { text: "label", hidden: "gone" },
    });
    f.root(drafting.sheet(f, { id: "sheet", title: "t", layers: [leader, readout] }));
  },
);

describe("seekTimeline frame signals", () => {
  it("keeps bindings on resolved nodes", () => {
    const resolved = resolveScene(scene, { width: 400 });
    expect(resolved.nodes.find((node) => node.id === "leader")?.bind).toEqual({
      path: "d",
      opacity: "fade",
    });
    expect(resolved.nodes.find((node) => node.id === "readout")?.bind).toEqual({
      text: "label",
      hidden: "gone",
    });
  });

  it("overrides bound path, text, opacity and hidden for one frame", () => {
    const resolved = resolveScene(scene, { width: 400 });
    const duration = resolved.timeline?.duration ?? 0;
    const frame = seekTimeline(resolved, duration, {
      signals: { d: "M 1 2 L 3 4", label: "landed", fade: 0.5, gone: true },
    });
    const leader = frame.nodes.find((node) => node.id === "leader");
    const readout = frame.nodes.find((node) => node.id === "readout");
    expect(leader?.path?.d).toBe("M 1 2 L 3 4");
    expect(leader?.state.opacity).toBeCloseTo(0.5);
    expect(readout?.text?.lines[0]?.text).toBe("landed");
    expect(readout?.hidden).toBe(true);

    const plain = seekTimeline(resolved, duration);
    expect(plain.nodes.find((node) => node.id === "leader")?.path?.d).toBe("M 0 0 L 10 10");
    expect(plain.nodes.find((node) => node.id === "readout")?.hidden).not.toBe(true);
  });

  it("leaves nodes untouched when no bound key is present", () => {
    const resolved = resolveScene(scene, { width: 400 });
    const a = seekTimeline(resolved, 0);
    const b = seekTimeline(resolved, 0, { signals: { unrelated: 1 } });
    expect(b.nodes.find((node) => node.id === "leader")?.path?.d).toBe(
      a.nodes.find((node) => node.id === "leader")?.path?.d,
    );
  });
});
