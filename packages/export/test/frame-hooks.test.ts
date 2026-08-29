import { describe, expect, it } from "vitest";
import { drafting, figure, resolveScene } from "@kineglyph/core";
import { exportSvg } from "../src/index.js";

const REST = "M 100 100 L 200 200";
const MOVED = "M 300 300 L 400 400";

const scene = resolveScene(
  figure("hooks", { title: "Hooks", signals: { leader: REST } }, (f) => {
    const leader = drafting.layer(f, REST, { id: "leader", bind: { path: "leader" } });
    const view = f.image("fallback.png", "Live view", {
      id: "view",
      live: true,
      position: drafting.at(400, 400),
      width: "40%",
      height: "40%",
    });
    f.root(drafting.sheet(f, { id: "sheet", title: "Hooks", layers: [leader, view] }));
    f.sequence([f.reveal(leader, { duration: 1000 })]);
  }),
  { width: 960 },
);

describe("export frame hooks", () => {
  it("applies frame signals at the exported time", () => {
    const svg = exportSvg(scene, {
      time: 800,
      frameSignals: (time) => ({ leader: time >= 500 ? MOVED : REST }),
    });
    expect(svg).toContain(MOVED);
    expect(exportSvg(scene, { time: 100, frameSignals: () => ({ leader: REST }) })).toContain(REST);
  });

  it("substitutes a live surface's fallback image per frame", () => {
    const svg = exportSvg(scene, {
      time: 0,
      surfaces: (time) => ({ view: `data:image/png;base64,${time}` }),
    });
    expect(svg).toContain('href="data:image/png;base64,0"');
    expect(svg).not.toContain("fallback.png");
    expect(exportSvg(scene, { time: 0 })).toContain("fallback.png");
  });
});
