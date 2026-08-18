// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { defineScene, heading, stack, type FigureSource } from "@kineglyph/core";
import { mountAllKineglyphLabs, mountKineglyphLab } from "../src/lab.js";

const scene = (title: string): FigureSource =>
  defineScene({
    schemaVersion: 2,
    id: `lab-${title}`,
    title,
    root: stack("root", [heading("title", title)], { padding: 12, width: "fill" }),
  });

beforeEach(() => {
  document.body.innerHTML = "";
});

describe("mountKineglyphLab", () => {
  it("renders the initial module, exposes three views, and swaps a successful edit in place", async () => {
    const host = document.createElement("figure");
    host.dataset.kineglyphLab = "";
    document.body.append(host);
    const load = vi.fn((source: string) => Promise.resolve(scene(source)));
    const lab = mountKineglyphLab(host, { source: "first", view: "preview", load });

    expect(await lab.ready).toBe(true);
    expect(lab.figure?.scene.id).toBe("lab-first");
    expect(host.querySelectorAll('[role="tab"]')).toHaveLength(3);

    lab.setSource("second", { run: false });
    expect(await lab.run()).toBe(true);
    expect(load).toHaveBeenLastCalledWith("second", host);
    expect(lab.figure?.scene.id).toBe("lab-second");
    expect(host.querySelector(".kg-lab__preview-host")).not.toBeNull();
  });

  it("keeps the last good preview visible and reports a bad edit", async () => {
    const host = document.createElement("figure");
    document.body.append(host);
    const lab = mountKineglyphLab(host, {
      source: "good",
      view: "preview",
      load: (source) =>
        source === "bad"
          ? Promise.reject(new Error("Unexpected token"))
          : Promise.resolve(scene(source)),
    });
    await lab.ready;
    const original = lab.figure;

    lab.setSource("bad", { run: false });
    expect(await lab.run()).toBe(false);
    expect(lab.figure).toBe(original);
    expect(lab.figure?.scene.id).toBe("lab-good");
    expect(host.dataset.kineglyphError).toBe("Unexpected token");
    expect(host.querySelector(".kg-lab__status")?.textContent).toContain("Unexpected token");
  });

  it("restores its authored source and static fallback", async () => {
    const host = document.createElement("figure");
    host.innerHTML =
      '<div data-kg-static>fallback</div><script type="text/kineglyph">original</script>';
    document.body.append(host);
    const lab = mountKineglyphLab(host, {
      view: "preview",
      load: (source) => Promise.resolve(scene(source)),
    });
    await lab.ready;
    expect(host.querySelector<HTMLElement>("[data-kg-static]")?.hidden).toBe(true);
    lab.setSource("changed", { run: false });
    lab.reset();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(lab.source).toBe("original");
    lab.destroy();
    expect(host.querySelector<HTMLElement>("[data-kg-static]")?.hidden).toBe(false);
  });
});

describe("mountAllKineglyphLabs", () => {
  it("finds inline lab modules and does not mount a host twice", async () => {
    document.body.innerHTML = `
      <figure data-kineglyph-lab data-view="preview"><script type="text/kineglyph">one</script></figure>
      <figure><script type="text/kineglyph">ordinary</script></figure>`;
    const options = { load: (source: string) => Promise.resolve(scene(source)) };
    const first = await mountAllKineglyphLabs(options);
    const second = await mountAllKineglyphLabs(options);
    expect(first).toHaveLength(1);
    expect(first[0]?.source).toBe("one");
    expect(second).toEqual([]);
  });
});
