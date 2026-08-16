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
      load: async (src) => {
        seen.push(src.kind);
        return scene;
      },
    });
    expect(figures.map((f) => f.element.id)).toEqual(["a", "b"]);
    expect(seen).toEqual(["inline", "module"]);
    expect(document.querySelector<HTMLElement>("#a")!.dataset.kineglyphMounted).toBe("true");
    expect(document.querySelector<HTMLImageElement>("#a img")!.hidden).toBe(true);
    expect(document.querySelector<HTMLImageElement>("#c img")!.hidden).toBe(false);
    expect(document.querySelector("#c")!.hasAttribute("data-kineglyph-mounted")).toBe(false);
  });

  it("keeps the static image and records an error when loading fails", async () => {
    document.body.innerHTML = `<figure class="kg" id="bad" data-scene="nope.mjs"><img src="s.svg"></figure>`;
    const figures = await mountAll({ load: async () => { throw new Error("boom"); } });
    expect(figures).toEqual([]);
    const el = document.querySelector<HTMLElement>("#bad")!;
    expect(el.dataset.kineglyphError).toContain("boom");
    expect(el.querySelector("img")!.hidden).toBe(false);
  });

  it("does not mount the same figure twice", async () => {
    document.body.innerHTML = `<figure class="kg" id="a"><script type="text/kineglyph">A</script></figure>`;
    await mountAll({ load: async () => scene });
    const again = await mountAll({ load: async () => scene });
    expect(again).toEqual([]);
  });

  it("re-loads a figure on kineglyph:update, cache-busting the module URL", async () => {
    document.body.innerHTML = `<figure class="kg" id="a" data-scene="scenes/a.mjs"></figure>`;
    let calls = 0;
    const sources: EmbedSource[] = [];
    const [fig] = await mountAll({
      load: async (src) => {
        calls++;
        sources.push(src);
        return scene;
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
    await mountAll({ load: async () => { calls++; return scene; } });
    document.dispatchEvent(new CustomEvent("kineglyph:update", { detail: { url: "scenes/a.mjs" } }));
    await new Promise((r) => setTimeout(r, 0));
    expect(calls).toBe(2);
  });
});
