// @vitest-environment jsdom
import { describe, expect, it, beforeEach } from "vitest";
import { defineScene, stack, heading } from "@kineglyph/core";
import { detectSource, mountAll, type EmbedSource } from "../src/embed.js";

const scene = defineScene({
  schemaVersion: 2,
  id: "embed-test",
  title: "Embed",
  root: stack("r", [heading("h", "Embedded")], { padding: 8, width: "fill" }),
});

beforeEach(() => {
  document.body.innerHTML = "";
});

describe("detectSource", () => {
  it("prefers inline script, then data-scene, then registered id", () => {
    const el = document.createElement("figure");
    el.className = "kg";
    el.innerHTML = `<script type="text/kineglyph">export default 1</script>`;
    el.dataset.scene = "x.mjs";
    el.dataset.kineglyph = "reg";
    expect(detectSource(el)).toEqual({ kind: "inline", source: "export default 1" });
    el.querySelector("script")!.remove();
    expect(detectSource(el)).toEqual({ kind: "module", url: "x.mjs" });
    delete el.dataset.scene;
    expect(detectSource(el)).toEqual({ kind: "registered", id: "reg" });
    delete el.dataset.kineglyph;
    expect(detectSource(el)).toBeUndefined();
  });
});

describe("mountAll", () => {
  it("mounts inline and module figures via the injected loader and hides the static image", async () => {
    document.body.innerHTML = `
      <figure class="kg" id="a"><img data-static src="a.svg"><script type="text/kineglyph">A</script></figure>
      <figure class="kg" id="b" data-scene="scenes/b.mjs"><img src="b.svg"></figure>
      <figure class="kg" id="c"><img src="c.svg"></figure>`;
    const seen: string[] = [];
    const figures = await mountAll({
      load: (src) => {
        seen.push(src.kind);
        return Promise.resolve(scene);
      },
    });
    expect(figures.map((f) => f.element.id)).toEqual(["a", "b"]);
    expect(seen).toEqual(["inline", "module"]);
    expect(document.querySelector<HTMLElement>("#a")!.dataset.kineglyphMounted).toBe("true");
    expect(document.querySelector<HTMLImageElement>("#a img")!.hidden).toBe(true);
    expect(document.querySelector<HTMLImageElement>("#c img")!.hidden).toBe(false);
    expect(document.querySelector("#c")!.hasAttribute("data-kineglyph-mounted")).toBe(false);
  });

  it("hides an inlined SVG frame, and shows it again when the figure is torn down", async () => {
    // An embedder that wants the page's CSS to reach its diagram cannot use `<img>` — an image is
    // a separate document — so it inlines the SVG and marks the wrapper instead.
    document.body.innerHTML = `
      <figure class="kg" id="inlined" data-scene="scenes/b.mjs">
        <div data-kg-static><svg class="kg-scene" role="img"></svg></div>
      </figure>`;
    const [figure] = await mountAll({ load: () => Promise.resolve(scene) });
    const frame = document.querySelector<HTMLElement>("#inlined [data-kg-static]")!;

    expect(frame.hidden).toBe(true);
    figure!.controller.destroy();
    expect(frame.hidden).toBe(false);
  });

  it("keeps the static image and records an error when loading fails", async () => {
    document.body.innerHTML = `<figure class="kg" id="bad" data-scene="nope.mjs"><img src="s.svg"></figure>`;
    const figures = await mountAll({
      load: () => Promise.reject(new Error("boom")),
    });
    expect(figures).toEqual([]);
    const el = document.querySelector<HTMLElement>("#bad")!;
    expect(el.dataset.kineglyphError).toContain("boom");
    expect(el.querySelector("img")!.hidden).toBe(false);
  });

  it("does not mount the same figure twice", async () => {
    document.body.innerHTML = `<figure class="kg" id="a"><script type="text/kineglyph">A</script></figure>`;
    await mountAll({ load: () => Promise.resolve(scene) });
    const again = await mountAll({ load: () => Promise.resolve(scene) });
    expect(again).toEqual([]);
  });

  it("re-loads a figure on kineglyph:update, cache-busting the module URL", async () => {
    document.body.innerHTML = `<figure class="kg" id="a" data-scene="scenes/a.mjs"></figure>`;
    let calls = 0;
    const sources: EmbedSource[] = [];
    const [fig] = await mountAll({
      load: (src) => {
        calls++;
        sources.push(src);
        return Promise.resolve(scene);
      },
    });
    document.dispatchEvent(new CustomEvent("kineglyph:update", { detail: { selector: "#a" } }));
    await new Promise((r) => setTimeout(r, 0));
    expect(calls).toBe(2);
    expect(fig!.controller.scene.id).toBe("embed-test");
    const reloaded = sources[1]!;
    expect(reloaded.kind).toBe("module");
    if (reloaded.kind === "module") {
      expect(reloaded.url).not.toBe("scenes/a.mjs");
      expect(reloaded.url).toMatch(/scenes\/a\.mjs\?t=\d+$/);
    }
  });

  it("re-loads a figure on kineglyph:update keyed by url (matched by data-scene pathname)", async () => {
    document.body.innerHTML = `<figure class="kg" id="a" data-scene="scenes/a.mjs"></figure>`;
    let calls = 0;
    await mountAll({
      load: () => {
        calls++;
        return Promise.resolve(scene);
      },
    });
    document.dispatchEvent(
      new CustomEvent("kineglyph:update", { detail: { url: "scenes/a.mjs" } }),
    );
    await new Promise((r) => setTimeout(r, 0));
    expect(calls).toBe(2);
  });

  it("recovers a figure whose first mount failed when kineglyph:update fires", async () => {
    document.body.innerHTML = `<figure class="kg" id="flaky" data-scene="scenes/flaky.mjs"><img src="s.svg"></figure>`;
    let ok = false;
    const figures = await mountAll({
      load: () => (ok ? Promise.resolve(scene) : Promise.reject(new Error("boom"))),
    });
    const el = document.querySelector<HTMLElement>("#flaky")!;
    expect(figures).toEqual([]);
    expect(el.dataset.kineglyphError).toContain("boom");
    expect(el.hasAttribute("data-kineglyph-mounted")).toBe(false);

    ok = true;
    document.dispatchEvent(new CustomEvent("kineglyph:update", { detail: { selector: "#flaky" } }));
    await new Promise((r) => setTimeout(r, 0));
    expect(el.dataset.kineglyphMounted).toBe("true");
    expect(el.hasAttribute("data-kineglyph-error")).toBe(false);
    expect(document.querySelector<HTMLImageElement>("#flaky img")!.hidden).toBe(true);
  });

  it("does not double-mount when kineglyph:update fires while the initial load is still pending", async () => {
    document.body.innerHTML = `<figure class="kg" id="a"><script type="text/kineglyph">A</script></figure>`;
    let calls = 0;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const mountPromise = mountAll({
      load: () => {
        calls++;
        return gate.then(() => scene);
      },
    });

    // Fire the update before the first load resolves: without the in-flight guard this used to
    // find no registry record yet and trigger a second, overlapping mountOne.
    document.dispatchEvent(new CustomEvent("kineglyph:update", { detail: { selector: "#a" } }));
    await new Promise((r) => setTimeout(r, 0));

    release();
    await mountPromise;
    await new Promise((r) => setTimeout(r, 0));

    expect(calls).toBe(1);
    const el = document.querySelector<HTMLElement>("#a")!;
    expect(el.querySelectorAll("[data-kg-stage]")).toHaveLength(1);
    expect(document.querySelectorAll('[data-kineglyph-mounted="true"]')).toHaveLength(1);
  });
});

/**
 * An embedder that pre-renders its figures can find that the live mount would redraw the frame
 * already on the page. Skipping it keeps the server-rendered SVG — which is the accessible one —
 * and costs the reader nothing, so `mountOptions` may answer `null`.
 */
describe("declining an element", () => {
  it("skips the mount without loading the scene, and leaves the static frame visible", async () => {
    document.body.innerHTML = `
      <figure class="kg" id="inert" data-kg-inert="true"><div data-kg-static>frame</div><script type="text/kineglyph">A</script></figure>
      <figure class="kg" id="live"><div data-kg-static>frame</div><script type="text/kineglyph">A</script></figure>`;
    let loads = 0;
    const figures = await mountAll({
      load: () => {
        loads++;
        return Promise.resolve(scene);
      },
      mountOptions: (el) => (el.dataset.kgInert === "true" ? null : {}),
    });

    // The saving is the fetch, so the decline has to happen before `load` — not after.
    expect(loads).toBe(1);
    expect(figures.map((f) => f.element.id)).toEqual(["live"]);

    const inert = document.querySelector<HTMLElement>("#inert")!;
    expect(inert.dataset.kineglyphMounted).toBeUndefined();
    expect(inert.querySelector("[data-kg-stage]")).toBeNull();
    expect(inert.querySelector<HTMLElement>("[data-kg-static]")!.hidden).toBe(false);
    expect(inert.hasAttribute("data-kineglyph-error")).toBe(false);

    const live = document.querySelector<HTMLElement>("#live")!;
    expect(live.dataset.kineglyphMounted).toBe("true");
    expect(live.querySelector<HTMLElement>("[data-kg-static]")!.hidden).toBe(true);
  });

  it("mounts a declined figure anyway when kineglyph:update asks for it", async () => {
    // Asking for a fresh scene is asking for a live figure: an editor preview and a dev-server
    // scene edit both go through this event, and both want to see the edit move.
    document.body.innerHTML = `<figure class="kg" id="inert" data-scene="s.mjs"><div data-kg-static>frame</div></figure>`;
    await mountAll({ load: () => Promise.resolve(scene), mountOptions: () => null });
    const el = document.querySelector<HTMLElement>("#inert")!;
    expect(el.dataset.kineglyphMounted).toBeUndefined();

    document.dispatchEvent(new CustomEvent("kineglyph:update", { detail: { selector: "#inert" } }));
    await new Promise((r) => setTimeout(r, 0));
    expect(el.dataset.kineglyphMounted).toBe("true");
  });
});
