// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createTheme,
  defineScene,
  heading,
  stack,
  type FigureSource,
  type SceneDefinition,
} from "@kineglyph/core";
import { mountAllKineglyphLabs, mountKineglyphLab } from "../src/lab.js";

const scene = (title: string): FigureSource =>
  defineScene({
    schemaVersion: 2,
    id: `lab-${title}`,
    title,
    root: stack("root", [heading("title", title)], { padding: 12, width: "fill" }),
  });

const animatedScene: SceneDefinition = defineScene({
  schemaVersion: 2,
  id: "animated-lab",
  title: "Animated lab",
  root: stack("root", [heading("title", "Animated")], { padding: 12, width: "fill" }),
  timeline: {
    duration: 400,
    tracks: [
      {
        id: "title-in",
        target: "title",
        property: "opacity",
        keyframes: [
          { time: 0, value: 0 },
          { time: 400, value: 1 },
        ],
      },
    ],
  },
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
    const exportToggle = host.querySelector<HTMLButtonElement>(".kg-lab__export-toggle");
    expect(exportToggle?.textContent).toContain("Export");
    expect(exportToggle?.closest<HTMLElement>(".kg-lab__export")?.hidden).toBe(false);
    exportToggle?.click();
    expect(exportToggle?.getAttribute("aria-expanded")).toBe("true");
    expect(host.querySelector<HTMLElement>(".kg-lab__export-menu")?.hidden).toBe(false);
    expect(
      Array.from(host.querySelectorAll<HTMLElement>('[role="menuitem"]')).map((item) =>
        item.textContent?.trim(),
      ),
    ).toEqual([
      "Download SVGvector · transparent",
      "Download PNG2× · transparent",
      "Download GIFfull timeline · themed",
    ]);
    expect(host.querySelector<HTMLButtonElement>('[data-format="gif"]')?.hidden).toBe(true);
    edit?.click();
    expect(lab.view).toBe("split");
    const doctor = host.querySelector<HTMLButtonElement>(".kg-lab__doctor");
    expect(doctor?.getAttribute("aria-pressed")).toBe("false");
    doctor?.click();
    expect(doctor?.getAttribute("aria-pressed")).toBe("true");
    expect(host.querySelector(".kg-doctor")).not.toBeNull();

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
    expect(document.querySelector("#kineglyph-lab-styles")?.textContent).not.toContain(
      ".kg-lab[data-view=preview] .kg-canvas{fill:transparent}",
    );
  });

  it("keeps an explicitly declared scene canvas in the unobtrusive preview", async () => {
    const host = document.createElement("figure");
    document.body.append(host);
    const lab = mountKineglyphLab(host, {
      source: "paper",
      view: "preview",
      load: () =>
        Promise.resolve(
          defineScene({
            schemaVersion: 2,
            id: "paper-scene",
            title: "Paper scene",
            background: "canvas",
            root: stack("root", [heading("title", "Paper")], { padding: 12, width: "fill" }),
          }),
        ),
    });

    expect(await lab.ready).toBe(true);
    expect(host.querySelector(".kg-canvas")?.getAttribute("fill")).toContain("--kg-color-canvas");
  });

  it("offers frame exports for still figures and adds GIF when an edit adds animation", async () => {
    const host = document.createElement("figure");
    document.body.append(host);
    const lab = mountKineglyphLab(host, {
      source: "still",
      view: "preview",
      autoplay: true,
      load: (source) => Promise.resolve(source === "animated" ? animatedScene : scene(source)),
    });
    await lab.ready;
    const exportGroup = host.querySelector<HTMLElement>(".kg-lab__export");
    expect(exportGroup?.hidden).toBe(false);
    expect(host.querySelector<HTMLButtonElement>('[data-format="gif"]')?.hidden).toBe(true);

    lab.setSource("animated", { run: false });
    expect(await lab.run()).toBe(true);
    expect(exportGroup?.hidden).toBe(false);
    expect(host.querySelector<HTMLButtonElement>('[data-format="gif"]')?.hidden).toBe(false);
    expect(lab.figure?.state.playing).toBe(true);
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

  it("starts module setup after mount and disposes it before reruns and destroy", async () => {
    const host = document.createElement("figure");
    document.body.append(host);
    let setups = 0;
    let cleanups = 0;
    const lab = mountKineglyphLab(host, {
      source: "first",
      view: "preview",
      load: (source) =>
        Promise.resolve({
          scene: scene(source),
          setup: () => {
            setups += 1;
            return () => {
              cleanups += 1;
            };
          },
        }),
    });

    expect(await lab.ready).toBe(true);
    expect(setups).toBe(1);
    expect(cleanups).toBe(0);
    expect(host.querySelector<HTMLElement>(".kg-lab__export")?.hidden).toBe(true);

    lab.setSource("second", { run: false });
    expect(await lab.run()).toBe(true);
    expect(setups).toBe(2);
    expect(cleanups).toBe(1);

    lab.destroy();
    expect(cleanups).toBe(2);
  });

  it("mounts and hot-swaps live surfaces exported beside an editable scene", async () => {
    const host = document.createElement("figure");
    document.body.append(host);
    const liveScene = (id: string) =>
      defineScene({
        schemaVersion: 2,
        id,
        title: id,
        root: stack(
          "root",
          [
            {
              id: "model",
              type: "image",
              src: "/fallback.png",
              alt: "Interactive model",
              live: true,
              width: "fill",
              height: 180,
            },
          ],
          { width: "fill" },
        ),
      });
    const renderer = vi.fn((context: { element: HTMLElement }) => {
      const marker = document.createElement("span");
      marker.dataset.surface = "mounted";
      context.element.append(marker);
      return { mounted: true };
    });
    const lab = mountKineglyphLab(host, {
      source: "first",
      view: "preview",
      load: (source) =>
        Promise.resolve({ scene: liveScene(source), liveSurfaces: { model: renderer } }),
    });

    expect(await lab.ready).toBe(true);
    await vi.waitFor(() => expect(host.querySelector('[data-surface="mounted"]')).not.toBeNull());
    expect(renderer).toHaveBeenCalledTimes(1);
    expect(host.querySelector<HTMLElement>(".kg-lab__export")?.hidden).toBe(false);

    lab.setSource("second", { run: false });
    expect(await lab.run()).toBe(true);
    await vi.waitFor(() => expect(renderer).toHaveBeenCalledTimes(2));
    expect(lab.figure?.scene.id).toBe("second");
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
