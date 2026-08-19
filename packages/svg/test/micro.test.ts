import { describe, expect, it } from "vitest";
import { parseMicroValues, renderMicroSvg } from "../src/micro.js";

describe("micro SVG charts", () => {
  it("parses compact table-cell data", () => {
    expect(parseMicroValues("5, 3,-1")).toEqual([5, 3, -1]);
    expect(parseMicroValues("3/5")).toEqual([3, 5]);
    expect(() => parseMicroValues("nope")).toThrow(/finite/);
  });

  it("renders an accessible line or area in a few hundred bytes", () => {
    const line = renderMicroSvg([5, 3, 9, 6, 5], { label: "Five recent builds" });
    expect(line).toContain('viewBox="0 0 64 16"');
    expect(line).toContain('role="img" aria-label="Five recent builds"');
    expect(line).toContain("<title>Five recent builds</title>");
    expect(line).toContain("<path");
    expect(line).toContain("var(--kg-color-chart1,currentColor)");
    expect(line.length).toBeLessThan(500);

    const area = renderMicroSvg([2, 4, 3], { type: "area", fill: "#7c3aed" });
    expect(area).toContain('fill-opacity=".18"');
  });

  it("uses the full vertical range for unfilled sparklines", () => {
    const line = renderMicroSvg([90, 100, 95]);
    expect(line).toContain('d="M0 16L32 0L64 8"');
  });

  it("renders positive and negative bars around the zero baseline", () => {
    const svg = renderMicroSvg([3, -2, 4], {
      type: "bar",
      fill: "#16a34a",
      negativeFill: "#dc2626",
    });
    expect(svg.match(/<rect/g)).toHaveLength(3);
    expect(svg).toContain('fill="#16a34a"');
    expect(svg).toContain('fill="#dc2626"');
    expect(svg.length).toBeLessThan(600);
  });

  it("renders pie and donut segments without the scene runtime", () => {
    const pie = renderMicroSvg("1,2,3", { type: "pie" });
    const donut = renderMicroSvg("3/5", { type: "donut", label: "Three of five" });
    expect(pie.match(/<path/g)).toHaveLength(3);
    expect(pie).toContain("var(--kg-color-chart2,#2f7bd9)");
    expect(donut).toContain("A8 8");
    expect(donut).toContain('aria-label="Three of five"');
  });

  it("escapes labels and rejects invalid geometry", () => {
    expect(renderMicroSvg([1], { label: 'A < B & "safe"' })).toContain(
      'aria-label="A &lt; B &amp; &quot;safe&quot;"',
    );
    expect(renderMicroSvg([1], { label: 'A < B & "safe"' })).toContain(
      "<title>A &lt; B &amp; &quot;safe&quot;</title>",
    );
    expect(() => renderMicroSvg([1], { width: 0 })).toThrow(/width must be positive/);
  });

  it("keeps a thousand table-cell charts lightweight", () => {
    const page = Array.from({ length: 1_000 }, (_, index) =>
      renderMicroSvg([index % 7, (index + 3) % 11, (index + 5) % 13]),
    ).join("");
    expect(page.length).toBeLessThan(300_000);
  });
});
