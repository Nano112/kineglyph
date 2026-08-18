// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTheme, defineScene, heading, stack, type FigureSource } from "@kineglyph/core";
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
    expect(host.querySelector(".kg-figure__controls")).toBeNull();
    expect(host.querySelector(".kg-figure__readout")).toBeNull();
    const edit = host.querySelector<HTMLButtonElement>(".kg-lab__edit");
    expect(edit?.textContent).toBe("Edit figure");
    edit?.click();
    expect(lab.view).toBe("split");

    lab.setSource("second", { run: false });
    expect(await lab.run()).toBe(true);
    expect(load).toHaveBeenLastCalledWith("second", host);
    expect(lab.figure?.scene.id).toBe("lab-second");
    expect(host.querySelector(".kg-lab__preview-host")).not.toBeNull();
    expect(document.querySelector("#kineglyph-lab-styles")?.textContent).toContain(
      "@container kg-lab (max-width:640px)",
    );
    expect(document.querySelector("#kineglyph-lab-styles")?.textContent).toContain(
      ".kg-lab[data-view=preview] .kg-lab__bar",
    );
    expect(document.querySelector("#kineglyph-lab-styles")?.textContent).toContain(
      ".kg-lab[data-view=preview] .kg-lab__workspace",
    );
    expect(document.querySelector("#kineglyph-lab-styles")?.textContent).toContain(
      ".kg-lab[data-view=preview] .kg-canvas{fill:transparent}",
    );
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

  it("applies an optional theme exported beside the scene", async () => {
    const host = document.createElement("figure");
    document.body.append(host);
    const themed = defineScene({
      schemaVersion: 2,
      id: "themed",
      title: "Themed",
      root: stack("root", [heading("title", "Themed")], { padding: 12, width: "fill" }),
    });
    const lab = mountKineglyphLab(host, {
      source: "themed",
      view: "preview",
      load: () =>
        Promise.resolve({
          scene: themed,
          theme: createTheme({ name: "editorial-test", colors: { canvas: "#010101" } }),
        }),
    });
    expect(await lab.ready).toBe(true);
    expect(
      host.querySelector<SVGElement>("svg")?.style.getPropertyValue("--kg-background"),
    ).toContain("#010101");
    expect(
      host
        .querySelector<HTMLElement>(".kg-lab__preview-host")
        ?.style.getPropertyValue("--kg-color-canvas"),
    ).toBe("#010101");
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

  it('keeps "auto" transport and readout chrome quiet, but honours an explicit opt-in', async () => {
    document.body.innerHTML = `
      <figure id="quiet" data-kineglyph-lab data-view="preview" data-controls="auto" data-readout="auto"><script type="text/kineglyph">quiet</script></figure>
      <figure id="explicit" data-kineglyph-lab data-view="preview" data-controls="true" data-readout="true"><script type="text/kineglyph">explicit</script></figure>`;
    await mountAllKineglyphLabs({
      load: (source: string) => Promise.resolve(scene(source)),
      controls: "auto",
      readout: "auto",
    });
    expect(document.querySelector("#quiet .kg-figure__controls")).toBeNull();
    expect(document.querySelector("#quiet .kg-figure__readout")).toBeNull();
    expect(document.querySelector("#explicit .kg-figure__controls")).not.toBeNull();
    expect(document.querySelector("#explicit .kg-figure__readout")).not.toBeNull();
  });
});
