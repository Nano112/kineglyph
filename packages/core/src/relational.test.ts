import { describe, expect, it } from "vitest";
import { defineRelationalDiagram, rel, validateRelationalDiagram } from "./relational.js";

describe("relational technical geometry", () => {
  it("authors named ports, constraints, leaders, brackets, and dimensions as plain data", () => {
    const diagram = defineRelationalDiagram(
      rel.diagram(
        "adder-layout",
        [
          {
            id: "xor",
            ports: [
              rel.port("a", rel.anchor(0, 0.3), { direction: "input" }),
              rel.port("b", rel.anchor(0, 0.7), { direction: "input" }),
              rel.port("sum", "right", { direction: "output" }),
            ],
          },
          {
            id: "register",
            ports: [rel.port("d", "left", { direction: "input", width: 8 })],
          },
          { id: "shell" },
        ],
        {
          constraints: [
            rel.align("y", ["xor", "register"]),
            rel.distribute("x", ["xor", "register"], { gap: 48 }),
            rel.attach(rel.ref("xor", "sum"), rel.ref("register", "d")),
            rel.contain("shell", ["xor", "register"], 16),
            rel.distance(rel.at("xor", "right"), rel.at("register", "left"), 48, "x"),
          ],
          annotations: [
            rel.leader("sum-note", "sum bit", rel.ref("xor", "sum"), { side: "top" }),
            rel.bracket(
              "logic-bracket",
              rel.at("xor", "top-left"),
              rel.at("register", "top-right"),
              {
                label: "one pipeline stage",
                style: "brace",
              },
            ),
            rel.dimension(
              "stage-width",
              rel.at("xor", "bottom-left"),
              rel.at("register", "bottom-right"),
              {
                unit: "px",
                precision: 0,
              },
            ),
          ],
        },
      ),
    );
    expect(diagram.constraints).toHaveLength(5);
    expect(diagram.annotations?.map(({ kind }) => kind)).toEqual([
      "leader",
      "bracket",
      "dimension",
    ]);
    expect(JSON.parse(JSON.stringify(diagram))).toEqual(diagram);
  });

  it("reports bad named relationships together", () => {
    const result = validateRelationalDiagram(
      rel.diagram(
        "broken",
        [
          {
            id: "gate",
            ports: [rel.port("a", rel.anchor(2, 0)), rel.port("a", "left", { width: 0 })],
          },
          { id: "gate" },
        ],
        {
          constraints: [
            rel.align("x", ["gate"]),
            rel.attach(rel.ref("missing"), rel.ref("gate", "missing")),
          ],
          annotations: [
            rel.dimension("bad-dimension", rel.ref("gate"), rel.ref("missing"), { precision: 20 }),
          ],
        },
      ),
    );
    expect(result.ok).toBe(false);
    expect(result.diagnostics.map(({ code }) => code)).toEqual(
      expect.arrayContaining([
        "duplicate-id",
        "invalid-anchor",
        "invalid-port",
        "invalid-constraint",
        "unknown-node",
        "unknown-port",
        "invalid-annotation",
      ]),
    );
  });
});
