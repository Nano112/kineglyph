# Build a CPU from bits

A CPU is not one mysterious object. It is a ladder of small, deterministic ideas: a bit, a rule
for combining bits, a place to remember them, and a loop that moves them at the right moment.

This page builds that ladder visually. Every figure uses `editorialCircuitTheme`: the high-contrast
monospace language of the
[binary counter automaton](./gallery.md#interactive-simulation-binary-counter-automaton), with the
surface discipline of the Instrument specimens. Violet establishes structure, warm colours carry
active data, neutral wire casings separate crossings, and restrained contact shadows give terminal
cards hierarchy without glow. Some figures simply reveal themselves, some animate signal flow, and
the instruments with buttons are real state machines running entirely in the browser.

## 1. One bit, two meanings

_Animated · foundational_

A bit answers one yes-or-no question. The voltage is physical; `0` and `1` are the names we give
two safe ranges of that voltage. Everything later on this page is built by composing this choice.

```kineglyph live id=cpu-bit-basics view=preview height=430
import { editorialCircuitTheme, expr, figure, material } from "kineglyph";

export const theme = editorialCircuitTheme;

export default figure("cpu-bit-basics", { title: "One bit, two stable ranges", background: "transparent" }, (f) => {
  const zero = f.stack([
    f.eyebrow("LOW RANGE", { tone: "textMuted" }),
    f.code("0", { textStyle: "display" }),
    f.caption("off · false · no charge", { tone: "textMuted" }),
  ], { gap: 8, padding: 20, width: "fill", align: "center", frame: material("raised") });
  const one = f.stack([
    f.eyebrow("HIGH RANGE", { tone: "warning" }),
    f.code("1", { textStyle: "display", tone: "warning" }),
    f.caption("on · true · charged", { tone: "textMuted" }),
  ], { gap: 8, padding: 20, width: "fill", align: "center", frame: material("raised") });
  const switchNode = f.card({
    eyebrow: "ONE TRANSISTOR'S JOB",
    title: "Keep the ranges apart",
    body: "Noise may wobble the voltage, but the next gate still sees a clean 0 or 1.",
    motif: "toggle",
    tone: "info",
    frame: material("raised"),
  });

  f.root(f.stack([
    f.row([f.eyebrow("BIT", { tone: "info" }), f.caption("smallest addressable fact")], { justify: "between", width: "fill" }),
    f.flow([zero, one, switchNode], { gap: 16, align: "stretch", width: "fill" }),
  ], { gap: 18, width: "fill" }));
  f.sequence([f.reveal(zero), f.reveal(one), f.reveal(switchNode)]);
});
```

## 2. A row of bits becomes a number

_Interactive · toggle the bits directly_

Position gives a bit its weight. From right to left those weights are `1`, `2`, `4`, and `8`.
Click any bit to toggle it in place. The word, decimal value, and active-weight equation update
together, so you can construct all sixteen combinations directly.

```kineglyph live id=cpu-binary-place-value view=preview height=560
import { editorialCircuitTheme, expr, figure, material } from "kineglyph";

export const theme = editorialCircuitTheme;

const values = Array.from({ length: 16 }, (_, value) => value);
const weights = [8, 4, 2, 1];
const tones = ["chart1", "chart3", "chart4", "chart6"];
const formula = Object.fromEntries(values.map((value) => {
  const terms = weights.filter((weight, bit) => (value >> (3 - bit)) & 1);
  return [value, terms.length ? `${terms.join(" + ")} = ${value}` : "no active weights = 0"];
}));
const toggleTransitions = (weight) => values.map((value) => ({
  target: "choosing",
  guard: { var: "value", op: "eq", value },
  actions: [{ type: "set", var: "value", value: value ^ weight }],
}));

export default figure("cpu-binary-place-value", {
  title: "Four-bit place value",
  description: "An interactive four-bit word showing decimal value, binary digits, and active positional weights.",
  background: "transparent",
}, (f) => {
  const decimal = f.code("0", { textStyle: "display", bind: { text: "value" } });
  const word = f.code("0000", { textStyle: "title", tone: "info", bind: { text: "binary" } });
  const cells = weights.map((weight, bit) => f.stack([
    f.code(`2^${3 - bit}`, { tone: "textMuted" }),
    f.rect({
      id: `place-bit-${weight}`,
      label: `Toggle the ${weight} bit`,
      description: `Turn the bit with positional weight ${weight} on or off.`,
      interactive: true,
      onActivate: `TOGGLE_${weight}`,
      width: "fill", height: 48, radius: 7, fill: tones[bit], bind: { opacity: `bit${bit}` },
    }),
    f.caption(`weight ${weight}`, { tone: "textMuted" }),
  ], { gap: 6, width: "fill", align: "center" }));
  const equation = f.code("no active weights = 0", { tone: "warning", bind: { text: "formula" } });

  f.root(f.stack([
    f.row([
      f.stack([f.eyebrow("DECIMAL", { tone: "textMuted" }), decimal], { gap: 3 }),
      f.stack([f.eyebrow("BINARY WORD", { tone: "textMuted" }), word], { gap: 10, align: "end" }),
    ], { justify: "between", align: "end", width: "fill" }),
    f.grid(cells, { columns: { wide: 4, compact: 4, narrow: 2 }, gap: 10, width: "fill", focusGroup: true }),
    f.stack([f.eyebrow("ACTIVE WEIGHTS", { tone: "info" }), equation], { gap: 7, width: "fill" }),
  ], { gap: 22, width: "fill" }));

  f.machine({
    initial: "choosing",
    variables: { value: 0 },
    states: {
      choosing: { on: Object.fromEntries(weights.map((weight) => [`TOGGLE_${weight}`, toggleTransitions(weight)])) },
    },
    signals: {
      binary: expr.format(expr.var("value"), { radix: 2, pad: 4 }),
      formula: { match: { var: "value" }, cases: formula, default: "no active weights = 0" },
      ...Object.fromEntries(tones.map((_, bit) => [
        `bit${bit}`,
        expr.add(0.12, expr.multiply(expr.bit(expr.var("value"), 3 - bit), 0.88)),
      ])),
    },
  });
});
```

## 3. Gates turn bits into decisions

_Interactive · the complete half-adder truth table_

An **XOR** gate says “exactly one input is on.” An **AND** gate says “both inputs are on.” Put
them beside each other and the same two inputs produce the two answers needed for addition: a
sum bit and a carry bit.

```kineglyph live id=cpu-half-adder view=preview height=520
import { editorialCircuitTheme, expr, figure, material } from "kineglyph";

export const theme = editorialCircuitTheme;

const states = [
  ["q00", "0", "0", "0", "0"],
  ["q01", "0", "1", "1", "0"],
  ["q10", "1", "0", "1", "0"],
  ["q11", "1", "1", "0", "1"],
];
const toggle = (name) => [
  { target: "ready", guard: { var: name, op: "eq", value: 0 }, actions: [{ type: "set", var: name, value: 1 }] },
  { target: "ready", actions: [{ type: "set", var: name, value: 0 }] },
];

export default figure("cpu-half-adder", {
  title: "Two gates make a half adder",
  description: "Toggle A and B to trace their signals through parallel XOR and AND gates into sum and carry outputs.",
  background: "transparent",
}, (f) => {
  const terminal = (id, role, name, value, tone, bind, event) => f.tile({
    id, icon: role === "INPUT" ? "circle" : "arrow-right", eyebrow: role, title: name,
    detail: "0", detailStyle: "title", detailTone: tone, detailBind: { text: value },
    tone, variant: "compact", frame: material("flat"), bind: { highlight: bind },
    ...(event === undefined ? {} : { interactive: true, onActivate: event }),
  });
  const inputA = terminal("input-a", "INPUT", "A", "aValue", "accent", "aOn", "TOGGLE_A");
  const inputB = terminal("input-b", "INPUT", "B", "bValue", "info", "bOn", "TOGGLE_B");
  const xor = f.gate("xor", { id: "sum-gate", tone: "warning", bind: { highlight: "sumOn" } });
  const and = f.gate("and", { id: "carry-gate", tone: "success", bind: { highlight: "carryOn" } });
  const sum = terminal("output-sum", "OUTPUT", "SUM", "sum", "warning", "sumOn");
  const carry = terminal("output-carry", "OUTPUT", "CARRY", "carry", "success", "carryOn");
  const connections = [
    { from: inputA, to: [xor, and], kind: "flow", signal: { onTone: "accent" }, bind: { signal: "aOn" } },
    { from: inputB, to: [xor, and], kind: "flow", signal: { onTone: "info" }, bind: { signal: "bOn" } },
    { from: xor, to: sum, kind: "flow", signal: { onTone: "warning" }, bind: { signal: "sumOn" } },
    { from: and, to: carry, kind: "flow", signal: { onTone: "success" }, bind: { signal: "carryOn" } },
  ];
  const circuit = f.circuit([inputA, inputB, xor, and, sum, carry], connections, {
    direction: { wide: "horizontal", compact: "vertical", narrow: "vertical" },
    width: "fill",
  });
  const tableRows = states.map(([state, a, b, s, c]) => f.row([
    f.code(a, { width: 26 }), f.code(b, { width: 26 }),
    f.code(s, { width: 40, tone: "warning" }), f.code(c, { width: 48, tone: "success" }),
  ], { gap: 18, padding: [6, 10], width: "fill", frame: material("flat"), bind: { highlight: state } }));

  f.root(f.stack([
    circuit.root,
    f.stack([
      f.row([f.eyebrow("A", { tone: "textMuted" }), f.eyebrow("B", { tone: "textMuted" }), f.eyebrow("SUM", { tone: "warning" }), f.eyebrow("CARRY", { tone: "success" })], { gap: 18, padding: [0, 10], width: "fill" }),
      ...tableRows,
    ], { gap: 6, width: "fill" }),
  ], { gap: 22, width: "fill" }));

  f.sequence([circuit.entrance]);

  f.machine({
    initial: "ready",
    variables: { a: 0, b: 0 },
    states: { ready: { on: { TOGGLE_A: toggle("a"), TOGGLE_B: toggle("b") } } },
    signals: {
      sumBit: expr.bitXor(expr.var("a"), expr.var("b")),
      carryBit: expr.bitAnd(expr.var("a"), expr.var("b")),
      aValue: expr.format(expr.var("a")),
      bValue: expr.format(expr.var("b")),
      sum: expr.format(expr.signal("sumBit")),
      carry: expr.format(expr.signal("carryBit")),
      sumOn: expr.signal("sumBit"),
      carryOn: expr.signal("carryBit"),
      aOn: expr.var("a"),
      bOn: expr.var("b"),
      q00: expr.eq(expr.add(expr.multiply(expr.var("a"), 2), expr.var("b")), 0),
      q01: expr.eq(expr.add(expr.multiply(expr.var("a"), 2), expr.var("b")), 1),
      q10: expr.eq(expr.add(expr.multiply(expr.var("a"), 2), expr.var("b")), 2),
      q11: expr.eq(expr.add(expr.multiply(expr.var("a"), 2), expr.var("b")), 3),
    },
  });
});
```

## 4. A carry input completes the adder

_Interactive circuit · toggle A, B, and carry-in directly_

A half adder cannot accept a carry from the column on its right. A **full adder** solves that with
two XOR stages, two AND stages, and an OR. Toggle the three input terminals: live signals light the
gate outlines, junctions, and wires, while short ink trails travel only along nets currently
carrying a `1`. Gates and wires share the same neutral casing plus active signal ink, so the signal
reads as one continuous circuit. Each input lands on a distinct pin, and the whole schematic turns
downward on a narrow screen.

```kineglyph live id=cpu-full-adder view=preview height=430
import { editorialCircuitTheme, figure } from "kineglyph";

export const theme = editorialCircuitTheme;

export default figure("cpu-full-adder", {
  title: "Interactive one-bit full adder",
  description: "Toggle A, B, and carry-in to animate live Boolean signals through two XOR gates, two AND gates, and an OR.",
  background: "transparent",
}, (f) => {
  const adder = f.logicCircuit({
    inputs: {
      a:   { label: "A",   tone: "info" },
      b:   { label: "B",   tone: "accent" },
      cin: { label: "CIN", tone: "success" },
    },
    gates: {
      xor1:  { kind: "xor", inputs: ["a", "b"],       tone: "info" },
      and1:  { kind: "and", inputs: ["a", "b"],       tone: "accent" },
      xor2:  { kind: "xor", inputs: ["xor1", "cin"],  tone: "warning" },
      and2:  { kind: "and", inputs: ["xor1", "cin"],  tone: "success" },
      carry: { kind: "or",  inputs: ["and1", "and2"], tone: "success" },
    },
    outputs: {
      sum:  { from: "xor2",  label: "SUM",  tone: "warning" },
      cout: { from: "carry", label: "COUT", tone: "success" },
    },
  });
  f.root(f.surface(adder.root, { appearance: "card" }));
  f.sequence([adder.entrance]);
  f.machine(adder.machine);
});
```

## 5. Chain adders into a word

_Animated · a carry ripples from right to left_

Four full adders can add two four-bit words. Each slice owns one column. The sum appears locally;
the carry travels to the next slice, which is why this simple design is called a **ripple-carry
adder**.

```kineglyph live id=cpu-ripple-adder view=preview height=420
import { editorialCircuitTheme, expr, figure, material } from "kineglyph";

export const theme = editorialCircuitTheme;

export default figure("cpu-ripple-adder", {
  title: "Four-bit ripple-carry adder",
  description: "Four compact full-adder slices pass a carry signal from the least significant bit to the most significant bit.",
  background: "transparent",
}, (f) => {
  const bits = [0, 1, 2, 3].map((bit) => f.tile({
    id: `adder-${bit}`,
    eyebrow: `BIT ${bit}`,
    title: "FULL ADDER",
    detail: bit === 0 ? "A₀ + B₀ + 0" : `A${bit} + B${bit} + carry`,
    detailStyle: "code",
    icon: "circuit",
    variant: "labelled",
    tone: bit === 3 ? "warning" : bit === 2 ? "success" : bit === 1 ? "info" : "accent",
    frame: material("raised"),
  }));
  const inputs = f.row([
    f.code("A  0101", { tone: "info" }),
    f.code("B  0011", { tone: "success" }),
  ], { gap: 24, justify: "center", width: "fill" });
  const result = f.stack([
    f.eyebrow("FINAL WORD", { tone: "warning" }),
    f.code("1000", { textStyle: "display", tone: "warning" }),
    f.caption("5 + 3 = 8", { tone: "textMuted" }),
  ], { gap: 5, align: "center", width: "fill" });
  const chain = f.circuit(bits, bits.slice(0, -1).map((bit, index) => ({
    from: bit, to: bits[index + 1], kind: "flow", tone: "accent",
    labels: [{ text: `carry ${index + 1}`, placement: "middle", offset: -12 }],
  })), {
    direction: { wide: "horizontal", compact: "horizontal", narrow: "vertical" },
    layerGap: { wide: 28, compact: 18, narrow: 34 },
    padding: { wide: 14, compact: 10, narrow: 8 }, width: "fill",
  });
  f.root(f.stack([inputs, chain.root, result], { gap: 20, width: "fill" }));

  f.sequence([f.reveal(inputs), chain.entrance, f.reveal(result)]);
});
```

## 6. The ALU chooses which rule to apply

_Interactive · one datapath, four operations_

An arithmetic logic unit is a bank of useful circuits behind a selector. The inputs do not move;
the control word decides whether the output comes from addition, AND, OR, or XOR. Thick data buses
carry words through the bank and multiplexer; the dashed control wire only chooses a lane. That
separation keeps data flow and control flow visually distinct.

```kineglyph live id=cpu-alu view=preview height=650
import { editorialCircuitTheme, expr, figure, material } from "kineglyph";

export const theme = editorialCircuitTheme;

const operations = [
  ["add", "ADD"],
  ["and", "AND"],
  ["or", "OR"],
  ["xor", "XOR"],
];

export default figure("cpu-alu", { title: "A four-operation ALU", background: "transparent" }, (f) => {
  const a = f.card({ eyebrow: "REGISTER A", title: "0101", body: "decimal 5", motif: "blocks", tone: "info", compact: true, frame: material("raised") });
  const b = f.card({ eyebrow: "REGISTER B", title: "0011", body: "decimal 3", motif: "blocks", tone: "success", compact: true, frame: material("raised") });
  const selector = f.card({
    eyebrow: "CONTROL WORD",
    title: "SELECT 00",
    titleBind: { text: "selector" },
    body: "opens one lane",
    tone: "accent",
    compact: true,
    frame: material("flat"),
  });
  const units = operations.map(([state, label], index) => f.card({
    id: `alu-${state}`,
    eyebrow: `SELECT ${index.toString(2).padStart(2, "0")}`,
    title: label,
    motif: state === "add" ? "circuit" : "compare",
    tone: state === "add" ? "warning" : state === "and" ? "accent" : state === "or" ? "success" : "info",
    compact: true,
    frame: material("flat"),
    bind: { highlight: state },
  }));
  const bank = f.panel(units, {
    id: "function-bank",
    eyebrow: "ALL FOUR COMPUTE IN PARALLEL",
    title: "FUNCTION BANK",
    layout: "grid",
    columns: { wide: 4, compact: 4, narrow: 2 },
    gap: 10,
    width: "fill",
    tone: "info",
  });
  const mux = f.card({
    eyebrow: "MULTIPLEXER",
    title: "SELECTED LANE",
    body: "one result continues",
    tone: "warning",
    compact: true,
    frame: material("raised"),
  });
  const value = f.code("1000", { textStyle: "display", tone: "warning", bind: { text: "result" } });
  const flags = f.code("Z=0 · C=0", { tone: "textMuted", bind: { text: "flags" } });
  const output = f.stack([
    f.eyebrow("RESULT BUS", { tone: "warning" }), value, flags,
  ], { gap: 7, padding: 18, align: "center", width: "fill", frame: material("raised") });
  const operands = f.stack([
    f.row([
      f.eyebrow("OPERAND BUS", { tone: "info" }),
      f.code("A 0101  ·  B 0011", { tone: "textMuted" }),
    ], { justify: "between", align: "center", width: "fill" }),
    f.rect({ width: "fill", height: 9, radius: 4.5, fill: "chart3" }),
  ], { id: "operand-bus", gap: 7, padding: [9, 12], width: "fill", frame: material("inset") });
  f.root(f.graph([
    [a, b],
    operands,
    bank,
    { id: "selection-rank", nodes: [selector, mux], layout: "grid", columns: 2, gap: 16 },
    output,
  ], {
    style: "circuit",
    layerGap: { wide: 44, compact: 38, narrow: 34 },
    nodeGap: 12,
  }));

  f.wire({ node: a, side: "bottom" }, { node: operands, side: "top", offset: 0.32 }, { kind: "bus", tone: "info" });
  f.wire({ node: b, side: "bottom" }, { node: operands, side: "top", offset: 0.68 }, { kind: "bus", tone: "success" });
  f.wire({ node: operands, side: "bottom" }, { node: bank, side: "top" }, { kind: "bus", tone: "info" });
  f.wire({ node: bank, side: "bottom" }, { node: mux, side: "top" }, { kind: "bus", tone: "warning", head: "arrow" });
  f.wire({ node: selector, side: "right" }, { node: mux, side: "left" }, { kind: "control", tone: "accent", head: "arrow" });
  f.wire({ node: mux, side: "bottom" }, { node: output, side: "top" }, { kind: "bus", tone: "warning", head: "arrow" });

  f.machine({
    initial: "add",
    states: Object.fromEntries(operations.map(([state]) => [state, { on: Object.fromEntries(operations.filter(([other]) => other !== state).map(([other]) => [other.toUpperCase(), other])) }])),
    signals: {
      resultNumber: expr.match(expr.state(), {
        add: expr.add(5, 3),
        and: expr.bitAnd(5, 3),
        or: expr.bitOr(5, 3),
        xor: expr.bitXor(5, 3),
      }, 0),
      result: expr.format(expr.signal("resultNumber"), { radix: 2, pad: 4 }),
      zeroFlag: expr.eq(expr.signal("resultNumber"), 0),
      flags: expr.concat([
        "Z=",
        expr.match(expr.signal("zeroFlag"), { true: "1" }, "0"),
        " · C=0",
      ]),
      selector: expr.match(expr.state(), Object.fromEntries(operations.map(([state], index) => [state, `SELECT ${index.toString(2).padStart(2, "0")}`])), "SELECT 00"),
      ...Object.fromEntries(operations.map(([state]) => [state, expr.eq(expr.state(), state)])),
    },
  });
  f.controls(operations.map(([state, label]) => ({ label, event: state.toUpperCase(), activeWhen: { state }, group: "operation" })));
});
```

## 7. A clock tells memory when to listen

_Animated · the rising edge is the moment of commitment_

Combinational logic keeps changing as signals travel through it. A register samples its input on a
clock edge and holds that answer steady for the rest of the cycle. This rhythm turns a pile of gates
into a sequence of dependable steps.

```kineglyph live id=cpu-clocked-register view=preview height=520
import { editorialCircuitTheme, figure, material } from "kineglyph";

export const theme = editorialCircuitTheme;

export default figure("cpu-clocked-register", { title: "A register captures on the rising edge", background: "transparent" }, (f) => {
  const samples = [0, 1, 0, 1, 0, 1, 0, 1].map((high, index) => f.stack([
    f.rect({ id: `clock-${index}`, width: "fill", height: high ? 48 : 16, radius: 4, fill: high ? "chart6" : "surfaceMuted" }),
    f.code(String(index), { tone: "textMuted" }),
  ], { gap: 5, align: "center", justify: "end", width: "fill", minHeight: 74 }));
  const clock = f.grid(samples, { columns: 8, gap: 7, width: "fill", align: "end" });
  const before = f.card({ eyebrow: "D INPUT", title: "0110", body: "still settling", motif: "signal", tone: "info", frame: material("raised") });
  const edge = f.card({ eyebrow: "↑ RISING EDGE", title: "CAPTURE", body: "sample once", motif: "clockTick", tone: "warning", frame: material("floating") });
  const after = f.card({ eyebrow: "Q OUTPUT", title: "0110", body: "held for one cycle", motif: "blocks", tone: "success", frame: material("raised") });
  const path = f.flow([before, edge, after], { gap: 56, align: "stretch", width: "fill" });
  f.root(f.stack([
    f.stack([f.eyebrow("CLOCK", { tone: "warning" }), clock], { gap: 8, width: "fill" }),
    path,
  ], { gap: 22, width: "fill" }));
  const sample = f.connect(before, edge, { head: "arrow", labels: [{ text: "sample" }] });
  const hold = f.connect(edge, after, { head: "arrow", style: "flow", packets: { count: 2 }, labels: [{ text: "hold" }] });
  f.sequence([
    f.reveal(samples, { stagger: 60 }),
    f.reveal(before),
    [f.draw(sample), f.reveal(edge), f.pulse(edge)],
    [f.draw(hold), f.reveal(after), f.flow(hold)],
  ]);
});
```

## 8. Registers are the CPU's working memory

_Interactive · load, copy, increment, and clear_

Registers are tiny, fast words inside the CPU. This toy register file has only two locations, but
it already demonstrates the essential operations: accept a value, move it, transform it, and reset.

```kineglyph live id=cpu-register-file view=preview height=560
import { editorialCircuitTheme, figure, material } from "kineglyph";

export const theme = editorialCircuitTheme;

const snapshots = {
  empty: ["0000", "0000", "bus idle"],
  loaded: ["0101", "0000", "5 → A"],
  copied: ["0101", "0101", "A → B"],
  incremented: ["0110", "0101", "A + 1"],
};
const snapshotCases = (index) => Object.fromEntries(Object.entries(snapshots).map(([state, values]) => [state, values[index]]));

export default figure("cpu-register-file", { title: "A two-register scratchpad", background: "transparent" }, (f) => {
  const bus = f.stack([
    f.eyebrow("SHARED DATA BUS", { tone: "info" }),
    f.rect({ width: "fill", height: 12, radius: 6, fill: "chart3" }),
    f.code("bus idle", { tone: "textMuted", bind: { text: "bus" } }),
  ], { gap: 8, width: "fill", align: "center" });
  const registerA = f.card({ eyebrow: "REGISTER A", title: "0000", titleBind: { text: "a" }, body: "accumulator", motif: "blocks", tone: "warning", frame: material("raised"), bind: { highlight: "aHot" } });
  const registerB = f.card({ eyebrow: "REGISTER B", title: "0000", titleBind: { text: "b" }, body: "operand", motif: "blocks", tone: "info", frame: material("raised"), bind: { highlight: "bHot" } });
  const incrementer = f.card({ eyebrow: "TINY ALU", title: "+ 1", body: "increment A", motif: "circuit", tone: "success", frame: material("raised"), bind: { highlight: "incHot" } });
  f.root(f.stack([
    bus,
    f.flow([registerA, incrementer, registerB], { gap: 58, align: "stretch", width: "fill" }),
  ], { gap: 24, width: "fill" }));
  f.connect(bus, registerA, { head: "arrow" });
  f.connect(registerA, incrementer, { head: "arrow" });
  f.connect(registerA, registerB, { route: "curve", head: "arrow" });

  f.machine({
    initial: "empty",
    states: {
      empty: { on: { LOAD: "loaded", COPY: "copied", INC: "incremented" } },
      loaded: { on: { CLEAR: "empty", COPY: "copied", INC: "incremented" } },
      copied: { on: { CLEAR: "empty", LOAD: "loaded", INC: "incremented" } },
      incremented: { on: { CLEAR: "empty", LOAD: "loaded", COPY: "copied" } },
    },
    signals: {
      a: { match: { state: true }, cases: snapshotCases(0), default: "0000" },
      b: { match: { state: true }, cases: snapshotCases(1), default: "0000" },
      bus: { match: { state: true }, cases: snapshotCases(2), default: "bus idle" },
      aHot: { when: { state: ["loaded", "incremented"] }, then: 1, else: 0 },
      bHot: { when: { state: "copied" }, then: 1, else: 0 },
      incHot: { when: { state: "incremented" }, then: 1, else: 0 },
    },
  });
  f.controls([
    { label: "Load 5 → A", event: "LOAD", activeWhen: { state: "loaded" }, group: "registers" },
    { label: "Copy A → B", event: "COPY", activeWhen: { state: "copied" }, group: "registers" },
    { label: "Increment A", event: "INC", activeWhen: { state: "incremented" }, group: "registers" },
    { label: "Clear", event: "CLEAR", activeWhen: { state: "empty" }, group: "registers" },
  ]);
});
```

## 9. Control turns hardware into a sequence

_Animated · one instruction crosses four phases_

The datapath can move and transform data, but it still needs an organizer. A control unit advances
each instruction through **fetch**, **decode**, **execute**, and **write back**, opening the right
paths on each clock edge.

```kineglyph live id=cpu-instruction-cycle view=preview height=510
import { editorialCircuitTheme, figure, material } from "kineglyph";

export const theme = editorialCircuitTheme;

export default figure("cpu-instruction-cycle", { title: "The four-phase instruction cycle", background: "transparent" }, (f) => {
  const fetch = f.card({ eyebrow: "01", title: "FETCH", body: "Memory[PC] → IR", motif: "file", tone: "accent", frame: material("raised") });
  const decode = f.card({ eyebrow: "10", title: "DECODE", body: "bits → control lines", motif: "branch", tone: "info", frame: material("raised") });
  const execute = f.card({ eyebrow: "11", title: "EXECUTE", body: "ALU applies the rule", motif: "circuit", tone: "warning", frame: material("raised") });
  const writeback = f.card({ eyebrow: "00", title: "WRITE BACK", body: "result → register", motif: "blocks", tone: "success", frame: material("raised") });
  const phases = [fetch, decode, execute, writeback];
  f.root(f.stack([
    f.row([f.eyebrow("ONE CLOCKED LOOP", { tone: "info" }), f.code("PC → IR → ALU → REG", { tone: "textMuted" })], { justify: "between", width: "fill" }),
    f.flow(phases, { gap: 58, align: "stretch", width: "fill" }),
  ], { gap: 20, width: "fill" }));
  const edges = phases.slice(0, -1).map((phase, index) => f.connect(phase, phases[index + 1], {
    head: "arrow", style: "flow", packets: { count: 1 }, labels: [{ text: "clock" }],
  }));
  f.sequence([
    f.reveal(fetch),
    ...phases.slice(1).map((phase, index) => [f.draw(edges[index]), f.reveal(phase), f.flow(edges[index])]),
    f.highlight(phases, { stagger: 90 }),
  ]);
});
```

## 10. Put it together: a tiny CPU data loop

_Interactive simulation · two instructions, eight microsteps_

This final instrument is deliberately small enough to read. Program memory contains `LOAD 3` and
`ADD 2`. Each press of **Microstep** advances one clock phase. Watch the program counter select an
instruction, the instruction register hold it, and the accumulator change only when the result is
written back.

```kineglyph live id=cpu-data-loop view=preview height=900
import { editorialCircuitTheme, figure, material } from "kineglyph";

export const theme = editorialCircuitTheme;

const steps = Array.from({ length: 8 }, (_, step) => step);
const table = {
  phase: ["FETCH", "DECODE", "EXECUTE", "WRITE BACK", "FETCH", "DECODE", "EXECUTE", "WRITE BACK"],
  pc:    ["00", "01", "01", "01", "01", "10", "10", "10"],
  ir:    ["—", "LDI 3", "LDI 3", "LDI 3", "LDI 3", "ADD 2", "ADD 2", "ADD 2"],
  acc:   ["0000", "0000", "0000", "0011", "0011", "0011", "0011", "0101"],
  bus:   ["00 → memory", "LDI 3 → IR", "literal 3 → ALU", "0011 → ACC", "01 → memory", "ADD 2 → IR", "0011 + 0010", "0101 → ACC"],
};
const cases = (values) => Object.fromEntries(steps.map((step) => [step, values[step]]));
const active = (...wanted) => Object.fromEntries(steps.map((step) => [step, wanted.includes(step) ? 1 : 0]));

export default figure("cpu-data-loop", {
  title: "A two-instruction accumulator CPU",
  description: "Eight reversible microsteps across fetch, decode, execute, and write-back.",
  background: "transparent",
}, (f) => {
  const phaseWord = f.code("FETCH", { textStyle: "title", tone: "warning", bind: { text: "phase" } });
  const phaseCards = [
    ["fetch", "FETCH", "file", "accent"],
    ["decode", "DECODE", "branch", "info"],
    ["execute", "EXECUTE", "circuit", "warning"],
    ["write", "WRITE BACK", "blocks", "success"],
  ].map(([id, title, , tone]) => f.card({
    id: `phase-${id}`, title, tone, compact: true, frame: material("flat"), bind: { highlight: id },
  }));

  const memory0 = f.card({ id: "memory-0", eyebrow: "ADDRESS 00", title: "LDI 3", body: "load immediate", motif: "file", tone: "accent", compact: true, bind: { highlight: "memory0" } });
  const memory1 = f.card({ id: "memory-1", eyebrow: "ADDRESS 01", title: "ADD 2", body: "add immediate", motif: "file", tone: "info", compact: true, bind: { highlight: "memory1" } });
  const memory = f.stack([f.eyebrow("PROGRAM MEMORY", { tone: "textMuted" }), memory0, memory1], { gap: 9, width: "fill" });

  const pc = f.card({ eyebrow: "PROGRAM COUNTER", title: "00", titleBind: { text: "pc" }, body: "next address", motif: "clock", tone: "accent", frame: material("raised") });
  const ir = f.card({ eyebrow: "INSTRUCTION REG", title: "—", titleBind: { text: "ir" }, body: "current instruction", motif: "file", tone: "info", frame: material("raised"), bind: { highlight: "decode" } });
  const acc = f.card({ eyebrow: "ACCUMULATOR", title: "0000", titleBind: { text: "acc" }, body: "working value", motif: "blocks", tone: "success", frame: material("raised"), bind: { highlight: "write" } });
  const registers = f.grid([pc, ir, acc], { columns: { wide: 3, compact: 3, narrow: 1 }, gap: 10, width: "fill" });
  const decoder = f.card({ eyebrow: "CONTROL", title: "DECODER", body: "opens one route", motif: "branch", tone: "info", frame: material("raised"), bind: { highlight: "decode" } });
  const alu = f.card({ eyebrow: "DATAPATH", title: "ALU", body: "pass literal or add", motif: "circuit", tone: "warning", frame: material("raised"), bind: { highlight: "execute" } });
  const bus = f.stack([
    f.eyebrow("LIVE BUS", { tone: "warning" }),
    f.rect({ width: "fill", height: 12, radius: 6, fill: "chart4" }),
    f.code("00 → memory", { tone: "textMuted", bind: { text: "bus" } }),
  ], { gap: 8, align: "center", width: "fill" });
  const datapath = f.stack([registers, f.flow([decoder, alu], { gap: 44, align: "stretch", width: "fill" }), bus], { gap: 16, width: "fill" });

  f.root(f.stack([
    f.row([
      f.stack([f.eyebrow("MICROSTEP", { tone: "textMuted" }), f.code("0", { bind: { text: "step" } })], { gap: 3 }),
      f.stack([f.eyebrow("ACTIVE PHASE", { tone: "textMuted" }), phaseWord], { gap: 3, align: "end" }),
    ], { justify: "between", align: "end", width: "fill" }),
    f.grid(phaseCards, { columns: { wide: 4, compact: 4, narrow: 2 }, gap: 8, width: "fill" }),
    f.flow([memory, datapath], { gap: 52, align: "center", width: "fill" }),
  ], { gap: 22, width: "fill" }));

  f.connect(pc, memory, { route: "curve", head: "arrow" });
  f.connect(memory, ir, { route: "curve", head: "arrow" });
  f.connect(ir, decoder, { head: "arrow" });
  f.connect(decoder, alu, { head: "arrow" });
  f.connect(acc, alu, { route: "curve", head: "arrow" });
  f.connect(alu, acc, { route: "curve", head: "arrow" });

  f.machine({
    initial: "running",
    variables: { step: 0 },
    states: {
      running: { on: {
        STEP: [
          { target: "running", guard: { var: "step", op: "lt", value: 7 }, actions: [{ type: "increment", var: "step" }] },
          { target: "running", actions: [{ type: "set", var: "step", value: 0 }] },
        ],
        BACK: [
          { target: "running", guard: { var: "step", op: "gt", value: 0 }, actions: [{ type: "increment", var: "step", by: -1 }] },
          { target: "running", actions: [{ type: "set", var: "step", value: 7 }] },
        ],
      } },
    },
    signals: {
      phase: { match: { var: "step" }, cases: cases(table.phase), default: "FETCH" },
      pc: { match: { var: "step" }, cases: cases(table.pc), default: "00" },
      ir: { match: { var: "step" }, cases: cases(table.ir), default: "—" },
      acc: { match: { var: "step" }, cases: cases(table.acc), default: "0000" },
      bus: { match: { var: "step" }, cases: cases(table.bus), default: "bus idle" },
      fetch: { match: { var: "step" }, cases: active(0, 4), default: 0 },
      decode: { match: { var: "step" }, cases: active(1, 5), default: 0 },
      execute: { match: { var: "step" }, cases: active(2, 6), default: 0 },
      write: { match: { var: "step" }, cases: active(3, 7), default: 0 },
      memory0: { match: { var: "step" }, cases: active(0, 1, 2, 3), default: 0 },
      memory1: { match: { var: "step" }, cases: active(4, 5, 6, 7), default: 0 },
    },
  });
  f.controls([
    { label: "Back", event: "BACK", group: "clock" },
    { label: "Microstep", event: "STEP", group: "clock" },
    { label: "Reset", kind: "reset", group: "clock" },
  ]);
});
```

The complete loop is now visible: the program counter chooses an instruction, control selects a
path, the ALU produces a value, and a clock edge commits that value to a register. Real processors
repeat the pattern with wider words, many registers, parallel execution units, caches, prediction,
and several instructions in flight—but the vocabulary remains bits, rules, memory, and motion.
