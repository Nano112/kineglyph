import { expect, it } from "vitest";
import { parseQuery, chartUrl } from "../src/client.js";
import { parseRequest } from "../src/schema.js";

it("round trips structured charts using a client-safe URL builder", () => {
  const input = {
    chart: {
      series: [{ name: "Latency", data: [1, 2] }],
      x: [10, 20],
      mark: "line" as const,
      yDomain: [0, 10] as [number, number],
    },
    width: 800,
    scale: 2,
    theme: "dark" as const,
  };
  const url = chartUrl("https://example.test", input, "png");
  expect(parseQuery(new URL(url).searchParams)).toEqual(parseRequest(input));
});
it("supports progressive shorthand", () => {
  const r = parseQuery(
    new URLSearchParams(
      "data=1,2;3,4&names=A,B&x=10,20&mark=line&title=Hello&unit=ms&theme=dark&width=800&scale=2&legend=true&yDomain=0,10&xDomain=10,20",
    ),
  );
  expect(r.chart?.series).toEqual([
    { name: "A", data: [1, 2] },
    { name: "B", data: [3, 4] },
  ]);
  expect(r.chart?.x).toEqual([10, 20]);
});
it.each([
  "data=1&data=2",
  "data=",
  "data=1,,2",
  "data=NaN",
  "data=Infinity",
  "data=0x10",
  "data=1&wat=3",
  "data=1&spec=%7B%7D",
  "data=1&legend=TRUE",
  "data=1,2;3",
  "data=1&width=",
  "data=1&scale=100",
  "spec=null",
])("rejects ambiguous or invalid %s", (query) => {
  expect(() => parseQuery(new URLSearchParams(query))).toThrow();
});
