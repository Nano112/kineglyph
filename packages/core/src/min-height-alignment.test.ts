import { describe, expect, it } from "vitest";
import { motif, row, stack, tileNode } from "./recipes.js";
import { resolveScene } from "./resolve.js";

describe("minimum-height alignment", () => {
  for (const width of [960, 640, 320]) {
    it(`centres an icon inside a minimum-height tile at ${width}px`, () => {
      const scene = resolveScene(
        {
          schemaVersion: 2,
          id: "test",
          title: "Test",
          root: tileNode("tile", { icon: "shield", size: 64 }),
        },
        { width },
      );
      const tile = scene.nodes.find((n) => n.id === "tile")!;
      const icon = scene.nodes.find((n) => n.id === "tile-icon")!;
      expect(icon.x + icon.width / 2).toBeCloseTo(tile.x + tile.width / 2);
      expect(icon.y + icon.height / 2).toBeCloseTo(tile.y + tile.height / 2);
    });
  }
  for (const layout of [row, stack]) {
    for (const align of ["center", "end"] as const) {
      it(`${layout.name} respects ${align} within minHeight without constraining taller content`, () => {
        const root = layout("root", [motif("icon", "shield", { size: 24 })], {
          minHeight: 100,
          padding: 10,
          align,
          justify: align,
        });
        const scene = resolveScene(
          { schemaVersion: 2, id: "test", title: "Test", root },
          { width: 320 },
        );
        const outer = scene.nodes.find((n) => n.id === "root")!;
        const icon = scene.nodes.find((n) => n.id === "icon")!;
        expect(icon.y - outer.y).toBeCloseTo(align === "center" ? 38 : 66);
        const tall = resolveScene(
          {
            schemaVersion: 2,
            id: "tall",
            title: "Tall",
            root: layout("root", [motif("icon", "shield", { size: 120 })], {
              minHeight: 100,
              padding: 10,
              align,
              justify: align,
            }),
          },
          { width: 320 },
        );
        expect(tall.nodes.find((n) => n.id === "root")!.height).toBe(140);
      });
    }
  }
});
