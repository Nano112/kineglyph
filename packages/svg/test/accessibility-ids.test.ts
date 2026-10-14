// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { figure, resolveScene } from "@kineglyph/core";
import { renderSvg } from "../src/index.js";

function expectUniqueAccessibleIds(svg: string): void {
  const doc = new DOMParser().parseFromString(svg, "image/svg+xml");
  const ids = [...doc.querySelectorAll("[id]")].map((node) => node.id);
  expect(ids.filter((id, index) => ids.indexOf(id) !== index)).toEqual([]);
  for (const node of doc.querySelectorAll("[aria-labelledby]")) {
    for (const id of node.getAttribute("aria-labelledby")!.split(" ")) {
      expect(["title", "desc"]).toContain(doc.getElementById(id)?.localName);
    }
  }
}

describe("SVG accessibility ID namespaces", () => {
  it("keeps card accessibility titles distinct from their title text nodes", () => {
    const scene = figure("cards", { title: "Cards" }, (f) => {
      const card = f.card({ title: "Scene", body: "Serializable structure" });
      f.root(f.stack([card]));
    });
    expectUniqueAccessibleIds(renderSvg(resolveScene(scene, { width: 720 })));
  });

  it("keeps legacy node title metadata distinct from nodes with title suffixes", () => {
    expectUniqueAccessibleIds(
      renderSvg({
        id: "legacy",
        width: 400,
        height: 200,
        nodes: [
          { id: "card", label: "Card", x: 0, y: 0, width: 100, height: 50 },
          { id: "card-title", label: "Title", x: 0, y: 70, width: 100, height: 50 },
        ],
        edges: [],
      } as never),
    );
  });
});
