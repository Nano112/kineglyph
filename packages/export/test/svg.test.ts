import { describe, expect, it } from "vitest";
import { renderSvg } from "@kineglyph/svg";
import { KineglyphExportError, exportSvg } from "../src/index.js";
import { animatedScene, attribute, progressValues, staticScene } from "./helpers.js";

const scene = animatedScene();

function expectCode(fn: () => unknown, code: KineglyphExportError["code"]): void {
  let caught: unknown;
  try {
    fn();
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeInstanceOf(KineglyphExportError);
  expect((caught as KineglyphExportError).code).toBe(code);
}

describe("exportSvg", () => {
  it("produces a standalone document with one root and a themed background", () => {
    const svg = exportSvg(scene);
    expect(svg.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n<svg ')).toBe(true);
    expect(svg.match(/<svg[\s>]/g)).toHaveLength(1);
    expect(svg.endsWith("</svg>")).toBe(true);
    const rect = /<rect class="kg-export-background"[^>]*\/>/.exec(svg)?.[0] ?? "";
    expect(rect).not.toBe("");
    expect(rect).toContain(`fill="${scene.theme.background}"`);
    // The background is the first child of the root element.
    expect(svg.indexOf(rect)).toBe(svg.indexOf(">", svg.indexOf("<svg")) + 1);
  });

  it("supports transparent and custom backgrounds", () => {
    expect(exportSvg(scene, { background: "transparent" })).not.toContain("kg-export-background");
    expect(exportSvg(scene, { background: "#123456" })).toContain(
      '<rect class="kg-export-background" x="0" y="0" width="640"',
    );
    expect(exportSvg(scene, { background: "#123456" })).toContain('fill="#123456"');
  });

  it("keeps the renderer output otherwise intact", () => {
    const rendered = renderSvg(scene);
    const exported = exportSvg(scene);
    const rootEnd = rendered.indexOf(">") + 1;
    // Everything after the root tag (plus the injected background) is unchanged.
    expect(exported.endsWith(rendered.slice(rootEnd))).toBe(true);
    expect(attribute(exported, "svg", "viewBox")).toBe(attribute(rendered, "svg", "viewBox"));
    expect(attribute(exported, "svg", "width")).toBe(String(scene.width));
    expect(attribute(exported, "svg", "height")).toBe(String(scene.height));
  });

  it("rewrites width/height uniformly and keeps the viewBox", () => {
    const viewBox = `0 0 ${scene.width} ${scene.height}`;
    const byWidth = exportSvg(scene, { width: 320 });
    expect(attribute(byWidth, "svg", "width")).toBe("320");
    expect(Number(attribute(byWidth, "svg", "height"))).toBeCloseTo(
      (320 * scene.height) / scene.width,
      2,
    );
    expect(attribute(byWidth, "svg", "viewBox")).toBe(viewBox);

    const byHeight = exportSvg(scene, { height: 100 });
    expect(attribute(byHeight, "svg", "height")).toBe("100");
    expect(Number(attribute(byHeight, "svg", "width"))).toBeCloseTo(
      (100 * scene.width) / scene.height,
      2,
    );

    const scaled = exportSvg(scene, { scale: 2 });
    expect(attribute(scaled, "svg", "width")).toBe(String(scene.width * 2));
    expect(attribute(scaled, "svg", "height")).toBe(String(scene.height * 2));
    expect(attribute(scaled, "svg", "viewBox")).toBe(viewBox);

    const boxed = exportSvg(scene, { width: 500, height: 500 });
    expect(attribute(boxed, "svg", "width")).toBe("500");
    expect(attribute(boxed, "svg", "height")).toBe("500");
    expect(attribute(boxed, "svg", "viewBox")).toBe(viewBox);
    expect(attribute(boxed, "svg", "preserveAspectRatio")).toBe("xMidYMid meet");
  });

  it("renders the final frame by default and honours an explicit time", () => {
    const final = exportSvg(scene);
    const start = exportSvg(scene, { time: 0 });
    const middle = exportSvg(scene, { time: 100 });
    expect(progressValues(final).every((value) => value === "1")).toBe(true);
    expect(progressValues(start)).toContain("0");
    expect(progressValues(middle)).toContain("0.5");
    expect(start).not.toBe(final);
    // Times beyond the duration clamp to the final frame.
    expect(exportSvg(scene, { time: 10_000 })).toBe(final);
    // Static scenes ignore time entirely.
    expect(exportSvg(staticScene(), { time: 250 })).toBe(exportSvg(staticScene()));
  });

  it("passes accessibility overrides through to the renderer", () => {
    const svg = exportSvg(scene, { title: "Custom title", description: "Custom desc" });
    expect(svg).toContain(">Custom title</title>");
    expect(svg).toContain(">Custom desc</desc>");
    expect(exportSvg(scene, { idPrefix: "demo" })).toContain('id="demo"');
  });

  it("crops to visible content or a semantic figure surface", () => {
    const base = staticScene();
    const first = base.nodes.find((node) => node.kind !== "group");
    expect(first).toBeDefined();
    if (first === undefined) return;
    const semantic = {
      ...base,
      nodes: base.nodes.map((node) =>
        node.id === first.id
          ? { ...node, metadata: { ...node.metadata, figureSurface: true } }
          : node,
      ),
    };
    const surface = exportSvg(semantic, { crop: "surface", cropPadding: 5 });
    expect(attribute(surface, "svg", "viewBox")).toBe(
      `${first.x - 5} ${first.y - 5} ${first.width + 10} ${first.height + 10}`,
    );
    const content = attribute(exportSvg(base, { crop: "content" }), "svg", "viewBox");
    expect(content).not.toBe(`0 0 ${base.width} ${base.height}`);
  });

  it("rejects invalid times and output settings", () => {
    expectCode(() => exportSvg(scene, { time: Number.NaN }), "invalid-time");
    expectCode(() => exportSvg(scene, { time: -1 }), "invalid-time");
    expectCode(() => exportSvg(scene, { time: Number.POSITIVE_INFINITY }), "invalid-time");
    expectCode(() => exportSvg(scene, { width: 100, scale: 2 }), "invalid-output");
    expectCode(() => exportSvg(scene, { width: 0 }), "invalid-output");
    expectCode(() => exportSvg(scene, { scale: -1 }), "invalid-output");
    expectCode(() => exportSvg(scene, { height: Number.NaN }), "invalid-output");
  });
});
