import { expect, it } from "vitest";
import { parseQuery, chartUrl } from "../src/client.js";
import { parseRequest } from "../src/schema.js";
import { render } from "../src/render.js";
it("supports named series, axis bounds/labels and defaults to line", () => {
  const r = parseQuery(
    new URLSearchParams(
      "series.cpu=12,18&series.memory=62,63&y.min=0&y.max=100&x.label=Time&y.label=Usage&theme=blueprint&unit=percent",
    ),
  );
  expect(r.chart?.series).toEqual([
    { name: "cpu", data: [12, 18] },
    { name: "memory", data: [62, 63] },
  ]);
  expect(r.chart?.mark).toBe("line");
  expect(r.chart?.yDomain).toEqual([0, 100]);
  expect(r.chart?.xLabel).toBe("Time");
});
it("uses pleasant compact URLs for minimal input", () => {
  expect(chartUrl("https://example.test", { data: [12, 18, 45] })).toBe(
    "https://example.test/chart.png?data=12%2C18%2C45",
  );
});
it("keeps missing samples missing and allows structured per-series styling", async () => {
  const input = {
    chart: {
      unit: "percent",
      series: [{ name: "cpu", data: [12, null, 18], mark: "line", tone: "chart2" }],
    },
    theme: "blueprint",
  };
  expect(parseRequest(input).chart?.series[0]?.data[1]).toBeNull();
  const svg = new TextDecoder().decode(await render(input, "svg"));
  expect(svg).toContain("%");
  expect(svg).not.toContain("percent");
});
it.each([
  "data=1&series.cpu=2",
  "series.cpu=1&series.ram=1,2",
  "data=1&y.min=0",
  "data=1&y.min=10&y.max=0",
])("rejects ambiguous named input %s", (query) =>
  expect(() => parseQuery(new URLSearchParams(query))).toThrow(),
);
