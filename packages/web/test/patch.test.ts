// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { patchStageSvg } from "../src/patch.js";

describe("keyed SVG reconciliation", () => {
  it("retains compatible semantic nodes and patches content, attributes, and order", () => {
    document.body.innerHTML = '<div id="stage"></div>';
    const stage = document.querySelector<HTMLElement>("#stage")!;
    patchStageSvg(
      stage,
      '<svg viewBox="0 0 10 10"><g data-node-id="a"><text>old</text></g><g data-node-id="b" opacity=".5"/></svg>',
    );
    const a = stage.querySelector('[data-node-id="a"]');
    const b = stage.querySelector('[data-node-id="b"]');
    patchStageSvg(
      stage,
      '<svg viewBox="0 0 20 10"><g data-node-id="b" opacity="1"/><g data-node-id="a"><text>new</text></g><g data-node-id="c"/></svg>',
    );
    expect(stage.querySelector('[data-node-id="a"]')).toBe(a);
    expect(stage.querySelector('[data-node-id="b"]')).toBe(b);
    expect(stage.querySelector('[data-node-id="a"]')?.textContent).toBe("new");
    expect(stage.querySelector('[data-node-id="b"]')?.getAttribute("opacity")).toBe("1");
    expect(
      [...stage.querySelectorAll("[data-node-id]")].map((node) =>
        node.getAttribute("data-node-id"),
      ),
    ).toEqual(["b", "a", "c"]);
  });

  it("leaves non-SVG live layers in the stage untouched", () => {
    document.body.innerHTML = '<div id="stage"><div data-live="yes"></div></div>';
    const stage = document.querySelector<HTMLElement>("#stage")!;
    const live = stage.querySelector("[data-live]");
    patchStageSvg(stage, '<svg><g data-node-id="a"/></svg>');
    patchStageSvg(stage, '<svg><g data-node-id="a" opacity=".4"/></svg>');
    expect(stage.querySelector("[data-live]")).toBe(live);
  });
});
