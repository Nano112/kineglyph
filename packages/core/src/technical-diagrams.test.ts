import { describe, expect, it } from "vitest";
import { rel } from "./relational.js";
import {
  defineTechnicalDiagram,
  technical,
  validateTechnicalDiagram,
  type TechnicalDiagram,
} from "./technical-diagrams.js";

describe("technical diagram grammar", () => {
  it("dogfoods semantic nets, buses, junctions, gates, and timing", () => {
    const a = technical.component(
      "a",
      "input",
      [rel.port("out", "right", { direction: "output" })],
      { label: "A" },
    );
    const xor = technical.gate("xor", "xor", { label: "XOR" });
    const split = technical.junction("split", { label: "fan-out" });
    const register = technical.component(
      "result",
      "register",
      [rel.port("d", "left", { direction: "input", width: 8 })],
      { bits: 8, label: "RESULT" },
    );
    const circuit = defineTechnicalDiagram(
      technical.circuit(
        "byte-adder",
        [a, xor, split, register],
        [
          technical.net("a-xor", rel.ref("a", "out"), rel.ref("xor", "a"), {
            signal: "aHigh",
            animated: true,
          }),
          technical.net("xor-split", rel.ref("xor", "y"), rel.ref("split")),
          technical.bus("result-bus", 8, rel.ref("split"), rel.ref("result", "d"), {
            label: "sum[7:0]",
          }),
        ],
        {
          constraints: [rel.align("y", ["a", "xor", "split", "result"])],
          annotations: [rel.leader("carry-note", "carry joins here", rel.ref("split"))],
        },
      ),
    );
    expect(circuit.nets[2]).toMatchObject({ kind: "bus", width: 8 });
    expect(JSON.parse(JSON.stringify(circuit))).toEqual(circuit);

    const timing = defineTechnicalDiagram(
      technical.timing(
        "write-cycle",
        [
          technical.clock("clk", 3),
          technical.timingSignal("data", [
            { value: "x", duration: 0.5 },
            { value: 13, duration: 2, label: "0x0d" },
            { value: "z", duration: 0.5 },
          ]),
          technical.timingSignal("write", [
            { value: 0, duration: 1 },
            { value: 1, duration: 1 },
            { value: 0, duration: 1 },
          ]),
        ],
        { unit: "ns", markers: [{ id: "sample", at: 1.5, label: "sample" }] },
      ),
    );
    expect(timing.signals[0]?.segments).toHaveLength(6);
  });

  it("authors every reusable explanatory recipe with minimal and customised data", () => {
    const diagrams: readonly TechnicalDiagram[] = [
      technical.stateChart(
        "request-state",
        [
          { id: "idle", label: "Idle", initial: true },
          { id: "loading", label: "Loading", tone: "info" },
          { id: "done", label: "Done", terminal: true, tone: "success" },
        ],
        [
          { id: "fetch", from: "idle", to: "loading", event: "FETCH" },
          { id: "resolve", from: "loading", to: "done", event: "RESOLVE" },
        ],
      ),
      technical.sequence(
        "cache-hit",
        [
          { id: "browser", label: "Browser" },
          { id: "cache", label: "Cache" },
          { id: "origin", label: "Origin" },
        ],
        [
          { id: "lookup", from: "browser", to: "cache", label: "GET", style: "call" },
          { id: "miss", from: "cache", to: "origin", label: "miss", style: "async" },
        ],
        { notes: [{ id: "ttl", label: "TTL expired", over: ["cache"] }] },
      ),
      technical.neural("tiny-network", [
        { id: "input", label: "Input", units: 3 },
        { id: "hidden", label: "Hidden", units: 4, activation: "ReLU" },
        { id: "output", label: "Output", units: 2 },
      ]),
      technical.dataflow(
        "build-flow",
        [{ id: "source" }, { id: "parse" }, { id: "emit" }],
        [
          { id: "source-parse", from: "source", to: "parse" },
          { id: "parse-emit", from: "parse", to: "emit" },
        ],
      ),
      technical.dag(
        "tasks",
        [{ id: "a" }, { id: "b" }, { id: "c" }],
        [
          { id: "a-b", from: "a", to: "b" },
          { id: "a-c", from: "a", to: "c" },
        ],
        { direction: "top-to-bottom" },
      ),
      technical.convergence(
        "merge",
        [{ id: "one" }, { id: "two" }, { id: "result" }],
        [
          { id: "one-result", from: "one", to: "result" },
          { id: "two-result", from: "two", to: "result" },
        ],
      ),
      technical.memory(
        "stack",
        [
          { address: "0xff00", value: 42, label: "counter", changed: true },
          { address: "0xff08", value: 7, label: "limit" },
        ],
        { wordSize: 64, columns: ["address", "value", "label"] },
      ),
      technical.register("flags", [1, 0, 1, 0], {
        labels: ["Z", "N", "C", "V"],
        msbFirst: true,
      }),
      technical.buffer(
        "event-queue",
        4,
        [
          { id: "e1", label: "click" },
          { id: "e2", label: "paint" },
        ],
        { discipline: "fifo", head: 0, tail: 2 },
      ),
      technical.comparison(
        "formats",
        [
          { id: "svg", label: "SVG", emphasis: true },
          { id: "canvas", label: "Canvas" },
        ],
        [
          { id: "sharp", label: "Sharp at any size", values: { svg: true, canvas: false } },
          { id: "marks", label: "Many marks", values: { svg: "good", canvas: "best" } },
        ],
      ),
    ];
    diagrams.forEach((diagram) =>
      expect(validateTechnicalDiagram(diagram)).toEqual({ ok: true, diagnostics: [] }),
    );
    expect(diagrams.map(({ kind }) => kind)).toEqual([
      "state-chart",
      "sequence",
      "neural",
      "dataflow",
      "dag",
      "convergence",
      "memory",
      "register",
      "buffer",
      "comparison",
    ]);
  });

  it("validates duplicate ids, references, cycles, sizes, and capacities", () => {
    const invalid = [
      technical.dag(
        "cyclic",
        [{ id: "a" }, { id: "b" }],
        [
          { id: "ab", from: "a", to: "b" },
          { id: "ba", from: "b", to: "a" },
        ],
      ),
      technical.buffer("overflow", 1, [{ id: "a" }, { id: "b" }]),
      technical.stateChart("no-initial", [{ id: "a" }], [{ id: "bad", from: "a", to: "missing" }]),
      technical.timing("empty-timing", []),
    ];
    const diagnostics = invalid.flatMap((diagram) => validateTechnicalDiagram(diagram).diagnostics);
    expect(diagnostics.map(({ code }) => code)).toEqual(
      expect.arrayContaining(["invalid-value", "unknown-reference", "empty-diagram"]),
    );
  });
});
