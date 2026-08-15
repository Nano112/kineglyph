import { describe, expect, it } from "vitest";
import { cubicBezier, spring } from "./easing.js";
import { figure, type FigureBuilder } from "./figure.js";
import type { SceneFragment } from "./fragment.js";
import { resolveScene } from "./resolve.js";
import { defineScene, validateScene, walkScene, type SceneDefinition } from "./scene.js";
import { seekTimeline } from "./seek.js";
import { createTheme } from "./theme.js";

const theme = createTheme();
const WIDTHS = [1200, 820, 390] as const;
const LAYOUT_CODES = new Set(["overlap", "overflow", "text-truncated", "label-collision"]);

function nodeIds(scene: SceneDefinition): string[] {
  const ids: string[] = [];
  walkScene(scene.root, (node) => ids.push(node.id));
  return ids;
}

function track(scene: SceneDefinition, id: string) {
  const found = scene.timeline?.tracks.find((entry) => entry.id === id);
  if (found === undefined) throw new Error(`no track ${id}`);
  return found;
}

const chartFragment: SceneFragment = {
  nodes: [
    {
      id: "chart",
      type: "group",
      layout: "stack",
      gap: 4,
      children: [
        { id: "chart:bar", type: "rect", width: 40, height: 24, fill: "chart1" },
        { id: "chart:label", type: "text", text: "Bar" },
      ],
    },
  ],
  edges: [{ id: "chart:link", from: "chart:bar", to: "chart:label", head: "arrow" }],
  tracks: [
    {
      id: "chart:bar:revealY",
      target: "chart:bar",
      property: "revealY",
      keyframes: [
        { time: 0, value: 0 },
        { time: 400, value: 1 },
      ],
    },
  ],
  controls: [{ id: "chart:solo", label: "Solo", event: "SOLO" }],
  summary: "One bar.",
};

describe("figure(): ids", () => {
  it("infers stable ids from the helper kind and primary text, de-duplicated in creation order", () => {
    const scene = figure("ids", { title: "Ids" }, (f) => {
      f.heading("Where the time goes");
      f.heading("Where the time goes");
      f.heading("Where the time goes", { id: "custom" });
      f.card({ title: "Plan", body: "Bound the region." });
      f.pill("Beta");
      f.callout("Résumé — naïve façade!");
      f.stack([f.rect({ width: 10, height: 10 }), f.rect({ width: 10, height: 10 })]);
      f.stack([f.circle()], { label: "Dots" });
      f.keyValue("Cells", "512");
      f.icon("cube");
      f.text("A very long heading that certainly exceeds the thirty-two character slug limit");
    });
    const ids = nodeIds(scene);
    expect(ids).toContain("heading-where-the-time-goes");
    expect(ids).toContain("heading-where-the-time-goes-2");
    expect(ids).toContain("custom");
    expect(ids).toContain("card-plan");
    expect(ids).toContain("card-plan-title");
    expect(ids).toContain("card-plan-body");
    expect(ids).toContain("pill-beta");
    expect(ids).toContain("callout-resume-naive-facade");
    expect(ids).toContain("rect");
    expect(ids).toContain("rect-2");
    expect(ids).toContain("stack");
    expect(ids).toContain("stack-dots");
    expect(ids).toContain("key-value-cells");
    expect(ids).toContain("key-value-cells-key");
    expect(ids).toContain("icon-cube");
    expect(ids).toContain("text-a-very-long-heading-that-certain");
    expect(scene.root.id).toBe("root");
    expect(validateScene(scene).ok).toBe(true);
  });

  it("is deterministic across builds", () => {
    const build = () =>
      figure("twice", { title: "Twice" }, (f) => {
        const a = f.card({ title: "A" });
        const b = f.card({ title: "B" });
        const edge = f.connect(a, b);
        f.flow([a, b]);
        f.sequence([f.reveal(a), f.draw(edge), f.reveal(b)]);
      });
    expect(JSON.stringify(build())).toBe(JSON.stringify(build()));
  });

  it("rejects duplicate explicit ids with the origin of both", () => {
    expect(() =>
      figure("dup", { title: "Dup" }, (f) => {
        f.callout("Dense boxes need one bounds growth.", { id: "note" });
        f.text("Again", { id: "note" });
      }),
    ).toThrow(/figure "dup": duplicate id "note" \(first created by f\.callout\("Dense boxes/);
  });

  it("rejects invalid ids early", () => {
    expect(() =>
      figure("bad", { title: "Bad" }, (f) => {
        f.heading("A", { id: "has space" });
      }),
    ).toThrow(/figure "bad": id "has space"/);
    expect(() => figure("no good", { title: "Bad" }, () => undefined)).toThrow(/figure id/);
  });

  it("refuses to place the same node object twice", () => {
    expect(() =>
      figure("twice", { title: "Twice" }, (f) => {
        const a = f.heading("A");
        f.stack([a]);
        f.row([a]);
      }),
    ).toThrow(/"heading-a" is already inside another group/);
  });
});

describe("figure(): root inference", () => {
  it("defaults to a stack of top-level nodes in creation order", () => {
    const scene = figure("root", { title: "Root" }, (f) => {
      f.title("First");
      const a = f.card({ title: "A" });
      const b = f.card({ title: "B" });
      f.flow([a, b]);
      f.caption("Last");
    });
    expect(scene.root.layout).toBe("stack");
    expect(scene.root.children.map((node) => node.id)).toEqual([
      "title-first",
      "flow",
      "caption-last",
    ]);
  });

  it("uses an explicit root and reports nodes left outside it", () => {
    const scene = figure("root", { title: "Root" }, (f) => {
      const a = f.heading("A");
      f.root(f.stack([a], { id: "explicit" }));
    });
    expect(scene.root.id).toBe("explicit");
    expect(() =>
      figure("orphan", { title: "Orphan" }, (f) => {
        const a = f.heading("A");
        f.heading("B");
        f.root(f.stack([a]));
      }),
    ).toThrow(/"heading-b" \(f\.heading\("B"\)\) is not inside the root/);
  });

  it("requires at least one node", () => {
    expect(() => figure("empty", { title: "Empty" }, () => undefined)).toThrow(/no nodes/);
  });
});

describe("figure(): raw()", () => {
  it("registers hand-written nodes and nests embedded helper nodes", () => {
    const scene = figure("raw", { title: "Raw" }, (f) => {
      const inner = f.badge("Inner");
      f.raw({
        id: "custom",
        type: "group",
        layout: "overlay",
        children: [{ id: "custom-rect", type: "rect", width: 20, height: 20 }, inner],
      });
    });
    expect(scene.root.children.map((node) => node.id)).toEqual(["custom"]);
    expect(nodeIds(scene)).toContain("badge-inner");
    expect(() =>
      figure("raw", { title: "Raw" }, (f) => {
        f.heading("A", { id: "x" });
        f.raw({ id: "x", type: "rect" });
      }),
    ).toThrow(/duplicate id "x"/);
  });
});

describe("figure(): connect()", () => {
  it("creates edges between nodes or ids with inferred, de-duplicated ids", () => {
    const scene = figure("edges", { title: "Edges" }, (f) => {
      const a = f.card({ title: "A" });
      const b = f.card({ title: "B" });
      const first = f.connect(a, b, { head: "arrow", label: "first" });
      const second = f.connect("card-a", { node: b, side: "top", gap: 4 }, { route: "arc" });
      const third = f.connect(b, a, { id: "back", tail: "dot" });
      f.row([a, b]);
      expect(first.id).toBe("card-a-card-b");
      expect(second.id).toBe("card-a-card-b-2");
      expect(second.to).toEqual({ node: "card-b", side: "top", gap: 4 });
      expect(third.id).toBe("back");
    });
    expect(scene.edges?.map((edge) => edge.id)).toEqual([
      "card-a-card-b",
      "card-a-card-b-2",
      "back",
    ]);
    expect(validateScene(scene).ok).toBe(true);
  });

  it("rejects unknown endpoints and foreign node objects", () => {
    expect(() =>
      figure("edges", { title: "Edges" }, (f) => {
        const a = f.card({ title: "A" });
        f.connect(a, "chart:bar:v1:9");
      }),
    ).toThrow(/f\.connect: unknown target "chart:bar:v1:9"/);
    expect(() =>
      figure("edges", { title: "Edges" }, (f) => {
        const a = f.card({ title: "A" });
        f.connect(a, { id: "ghost", type: "rect" });
      }),
    ).toThrow(/node "ghost" was not created by this figure/);
  });
});

describe("figure(): motion", () => {
  it("sequences steps with the documented timing math", () => {
    const scene = figure("seq", { title: "Seq", hold: 400 }, (f) => {
      const a = f.rect({ width: 40, height: 20 });
      const b = f.rect({ width: 40, height: 20 });
      const c = f.rect({ width: 40, height: 20 });
      const edge = f.connect(a, b, { head: "arrow" });
      f.row([a, b, c], { gap: 20 });
      f.sequence([f.reveal(a), [f.draw(edge), f.reveal(b, { duration: 300 })], f.pulse(c)], {
        gap: 100,
      });
      f.at(2000, f.reveal(a));
    });
    expect(track(scene, "rect:opacity").keyframes).toEqual([
      { time: 0, value: 0 },
      { time: 500, value: 1, easing: "easeOut" },
    ]);
    // Second step starts at 500 + 100.
    expect(track(scene, "rect-rect-2:edgeReveal").keyframes.map((frame) => frame.time)).toEqual([
      0, 600, 1050,
    ]);
    expect(track(scene, "rect-2:opacity").keyframes.map((frame) => frame.time)).toEqual([
      0, 600, 900,
    ]);
    // Third step waits for the longest parallel member (draw, 450ms) plus the gap.
    expect(track(scene, "rect-3:highlight:1150").keyframes.map((frame) => frame.time)).toEqual([
      0, 1150, 1400, 1650,
    ]);
    // Absolute scheduling of a duplicate track gets a deterministic suffix.
    expect(track(scene, "rect:opacity#2").keyframes.map((frame) => frame.time)).toEqual([
      0, 2000, 2500,
    ]);
    expect(scene.timeline?.duration).toBe(2500 + 400);
    const resolved = resolveScene(scene, { width: 800, theme });
    expect(
      seekTimeline(resolved, 2500).nodes.find((node) => node.id === "rect")?.state.opacity,
    ).toBe(1);
  });

  it("honours sequence start, arrays with stagger, and edge-capable presets", () => {
    const scene = figure("motion", { title: "Motion" }, (f) => {
      const cards = [f.card({ title: "A" }), f.card({ title: "B" }), f.card({ title: "C" })];
      const edge = f.connect(cards[0] ?? "card-a", cards[1] ?? "card-b");
      const bar = f.rect({ width: 30, height: 60, revealAnchor: "bottom" });
      const line = f.polyline(
        [
          [0, 1],
          [1, 0],
        ],
        { height: 40 },
      );
      f.flow([...cards, bar, line]);
      f.sequence(
        [
          f.reveal(cards, { stagger: 80, duration: 200 }),
          f.rise(bar),
          f.wipe(line, { duration: 250 }),
          [f.flow(edge, { duration: 1000 }), f.highlight(edge), f.progress(bar, { to: 0.5 })],
          f.pulse(edge),
        ],
        { start: 100, gap: 0 },
      );
    });
    expect(track(scene, "card-a:opacity").keyframes.map((frame) => frame.time)).toEqual([
      0, 100, 300,
    ]);
    expect(track(scene, "card-b:opacity").keyframes.map((frame) => frame.time)).toEqual([
      0, 180, 380,
    ]);
    expect(track(scene, "card-c:opacity").keyframes.map((frame) => frame.time)).toEqual([
      0, 260, 460,
    ]);
    // Staggered arrays span duration + stagger × (n − 1) = 200 + 160 → the next step starts at 460.
    const rise = track(scene, "rect:revealY");
    expect(rise.property).toBe("revealY");
    expect(rise.keyframes.map((frame) => frame.time)).toEqual([0, 460, 960]);
    expect(track(scene, "polyline:revealX").keyframes.map((frame) => frame.time)).toEqual([
      0, 960, 1210,
    ]);
    const flow = track(scene, "card-a-card-b:flow");
    expect(flow.keyframes.map((frame) => frame.time)).toEqual([0, 1210, 1211, 2210, 2410]);
    expect(track(scene, "card-a-card-b:highlight").keyframes.map((frame) => frame.time)).toEqual([
      0, 1210, 1460, 1710,
    ]);
    expect(track(scene, "rect:progress").keyframes.at(-1)).toEqual({
      time: 1810,
      value: 0.5,
      easing: "easeInOut",
    });
    // The parallel group lasts as long as its longest member (flow: 1000 + 200 fade).
    expect(track(scene, "card-a-card-b:highlight:2410").keyframes[1]?.time).toBe(2410);
    expect(scene.timeline?.duration).toBe(2910);
    for (const width of WIDTHS)
      expect(() => seekTimeline(resolveScene(scene, { width, theme }), 1500)).not.toThrow();
  });

  it("applies custom easing to motion presets as serializable data", () => {
    const entrance = cubicBezier(0.16, 1, 0.3, 1);
    const settle = spring({ frequency: 9.5, damping: 7.5 });
    const scene = figure("curves", { title: "Curves" }, (f) => {
      const card = f.card({ title: "Sample" });
      f.root(card);
      f.sequence([
        f.reveal(card, { offset: 8, easing: entrance }),
        f.reveal(card, { scale: 0.96, easing: settle }),
      ]);
    });
    expect(track(scene, "card-sample:opacity").keyframes.at(-1)?.easing).toEqual(entrance);
    expect(track(scene, "card-sample:scale").keyframes.at(-1)?.easing).toEqual(settle);
  });

  it("keeps keyframes strictly increasing when steps start at zero", () => {
    const scene = figure("zero", { title: "Zero" }, (f) => {
      const a = f.rect({ width: 20, height: 20 });
      const b = f.rect({ width: 20, height: 20 });
      const edge = f.connect(a, b);
      f.row([a, b]);
      f.at(0, f.draw(edge), f.flow(edge), f.pulse(a), f.highlight(b));
    });
    for (const entry of scene.timeline?.tracks ?? []) {
      let previous = -1;
      for (const frame of entry.keyframes) {
        expect(frame.time).toBeGreaterThan(previous);
        previous = frame.time;
      }
    }
    expect(track(scene, "rect-rect-2:opacity").keyframes).toEqual([{ time: 0, value: 1 }]);
    expect(() => seekTimeline(resolveScene(scene, { width: 600, theme }), 0)).not.toThrow();
  });

  it("rejects unknown or mismatched targets with the helper name", () => {
    const build = (body: (f: FigureBuilder) => void) => () =>
      figure("targets", { title: "Targets" }, body);
    expect(build((f) => void f.reveal("nope"))).toThrow(/f\.reveal: unknown target "nope"/);
    expect(
      build((f) => {
        const a = f.rect();
        const b = f.rect();
        const edge = f.connect(a, b);
        f.row([a, b]);
        f.rise(edge.id);
      }),
    ).toThrow(/f\.rise: "rect-rect-2" is an edge, not a node/);
    expect(
      build((f) => {
        const a = f.rect();
        const b = f.rect();
        const edge = f.connect(a, b);
        f.row([a, b]);
        f.reveal(edge.id, { offset: 8 });
      }),
    ).toThrow(/f\.reveal: "rect-rect-2" is an edge, not a node/);
    expect(
      build((f) => {
        const a = f.rect();
        f.draw(a.id);
      }),
    ).toThrow(/f\.draw: "rect" is a node, not an edge/);
    expect(build((f) => f.at(-1, f.reveal(f.rect())))).toThrow(/f\.at: time must be/);
  });

  it("switches between the flow layout and the flow motion by argument", () => {
    const scene = figure("flow", { title: "Flow" }, (f) => {
      const a = f.rect({ width: 20, height: 20 });
      const b = f.rect({ width: 20, height: 20 });
      const edge = f.connect(a, b, { packets: { count: 2 } });
      const group = f.flow([a, b], { gap: 12 });
      expect(group.layout).toEqual({ wide: "row", compact: "stack" });
      const motion = f.flow(edge);
      expect(motion.kind).toBe("motion");
      f.at(300, motion);
    });
    expect(track(scene, "rect-rect-2:flow").keyframes.map((frame) => frame.time)).toEqual([
      0, 300, 301,
    ]);
  });
});

describe("figure(): add()", () => {
  it("keeps already-namespaced fragments, appends edges and controls, and plays their motion", () => {
    const scene = figure("frag", { title: "Fragments" }, (f) => {
      const chart = f.add(chartFragment);
      expect(chart.id).toBe("chart");
      const note = f.callout("A note");
      f.flow([chart, note]);
      f.sequence([f.reveal(chart), f.reveal(note)], { gap: 50 });
      f.machine({ initial: "all", states: { all: { on: { SOLO: "all" } } } });
    });
    expect(nodeIds(scene)).toEqual(expect.arrayContaining(["chart", "chart:bar", "chart:label"]));
    expect(scene.edges?.map((edge) => edge.id)).toEqual(["chart:link"]);
    expect(scene.controls?.map((control) => control.id)).toEqual(["chart:solo"]);
    expect(track(scene, "chart:bar:revealY").keyframes.map((frame) => frame.time)).toEqual([
      0, 400,
    ]);
    // The note starts after the fragment's own 400ms preset plus the gap.
    expect(track(scene, "callout-a-note:opacity").keyframes.map((frame) => frame.time)).toEqual([
      0, 450, 950,
    ]);
    expect(validateScene(scene).ok).toBe(true);
  });

  it("scopes ids under an explicit or de-duplicated inferred namespace and accepts { fragment }", () => {
    const scene = figure("frag", { title: "Fragments" }, (f) => {
      const first = f.add(chartFragment);
      const second = f.add({ fragment: chartFragment });
      const third = f.add(chartFragment, { id: "right", at: 1000 });
      expect(first.id).toBe("chart");
      expect(second.id).toBe("chart-2:chart");
      expect(third.id).toBe("right:chart");
      f.row([first, second, third]);
      f.machine({ initial: "all", states: { all: {} } });
    });
    const ids = nodeIds(scene);
    expect(ids).toEqual(expect.arrayContaining(["chart-2:chart:bar", "right:chart:label"]));
    expect(scene.edges?.map((edge) => edge.id)).toEqual([
      "chart:link",
      "chart-2:chart:link",
      "right:chart:link",
    ]);
    expect(scene.edges?.[2]?.from).toBe("right:chart:bar");
    expect(scene.controls?.map((control) => control.id)).toEqual([
      "chart:solo",
      "chart-2:chart:solo",
      "right:chart:solo",
    ]);
    expect(track(scene, "right:chart:bar:revealY").keyframes.map((frame) => frame.time)).toEqual([
      1000, 1400,
    ]);
    expect(scene.timeline?.duration).toBe(1400);
  });

  it("never silently invalidates stable compiler handles by re-scoping their ids", () => {
    const compiled = {
      fragment: chartFragment,
      handles: { bars: ["chart:bar"] as const },
    };
    expect(() =>
      figure("frag", { title: "Fragments" }, (f) => {
        const first = f.add(compiled);
        f.add(compiled);
        f.row([first]);
      }),
    ).toThrow(/exposes stable handles.*cannot be re-scoped.*set the id when compiling/s);
    expect(() =>
      figure("frag", { title: "Fragments" }, (f) => {
        f.add(compiled, { id: "renamed" });
      }),
    ).toThrow(/exposes stable handles.*cannot be re-scoped/s);
  });

  it("wraps multi-root fragments in a stack and rejects fragments with errors", () => {
    const scene = figure("multi", { title: "Multi" }, (f) => {
      const pair = f.add(
        {
          nodes: [
            { id: "a", type: "rect", width: 10, height: 10 },
            { id: "b", type: "rect", width: 10, height: 10 },
          ],
        },
        { id: "pair" },
      );
      expect(pair.type).toBe("group");
      expect(pair.id).toBe("pair");
      if (pair.type === "group")
        expect(pair.children.map((node) => node.id)).toEqual(["pair:a", "pair:b"]);
    });
    expect(scene.root.children.map((node) => node.id)).toEqual(["pair"]);
    expect(() =>
      figure("broken", { title: "Broken" }, (f) => {
        f.add({
          nodes: [{ id: "a", type: "rect" }],
          diagnostics: [{ severity: "error", code: "empty", message: "no data" }],
        });
      }),
    ).toThrow(/f\.add: the fragment reports errors:\n- no data/);
  });
});

describe("figure(): machine and controls", () => {
  it("defaults the machine id and slugs control ids", () => {
    const scene = figure("build-times", { title: "Build" }, (f) => {
      f.heading("A");
      f.machine({
        initial: "all",
        states: { all: { on: { SOLO: "solo" } }, solo: { on: { ALL: "all" } } },
      });
      f.controls([
        { label: "Solo fill_cuboid", event: "SOLO" },
        { label: "Show all", event: "ALL" },
        { label: "Show all", event: "ALL" },
        { label: "Reset", kind: "reset", id: "reset-me" },
      ]);
    });
    expect(scene.machine?.id).toBe("build-times-machine");
    expect(scene.controls?.map((control) => control.id)).toEqual([
      "solo-fill-cuboid",
      "show-all",
      "show-all-2",
      "reset-me",
    ]);
    expect(validateScene(scene).ok).toBe(true);
    expect(() =>
      figure("controls", { title: "Controls" }, (f) => {
        f.heading("A");
        f.controls([{ label: "Go", event: "GO" }]);
      }),
    ).toThrow(/controls need a state machine/);
    expect(() =>
      figure("controls", { title: "Controls" }, (f) => {
        f.heading("A");
        f.machine({ initial: "a", states: { a: {} } });
        f.controls([
          { id: "x", label: "Go", event: "GO" },
          { id: "x", label: "Go", event: "GO" },
        ]);
      }),
    ).toThrow(/duplicate control id "x"/);
  });

  it("validates the machine and every binding at build time", () => {
    expect(() =>
      figure("m", { title: "M" }, (f) => {
        f.heading("A");
        f.machine({ initial: "missing", states: { a: {} } });
      }),
    ).toThrow(/figure "m": invalid machine:\n- machine m-machine initial state "missing"/);
    expect(() =>
      figure("m", { title: "M" }, (f) => {
        f.heading("A", { bind: { text: "headline" } });
      }),
    ).toThrow(/"heading-a" binds text to signal "headline" but the figure has no machine/);
    expect(() =>
      figure("m", { title: "M" }, (f) => {
        f.heading("A", { bind: { text: "headline" } });
        f.machine({ initial: "a", states: { a: {} }, signals: { other: "x" } });
      }),
    ).toThrow(/"heading-a" binds text to unknown signal "headline"/);
    const ok = figure("m", { title: "M" }, (f) => {
      const a = f.heading("A", { bind: { text: "headline", hidden: "$state" } });
      const b = f.heading("B");
      f.connect(a, b, {
        bind: { highlight: "lit" },
        labels: [{ text: "x", bind: { hidden: "lit" } }],
      });
      f.machine({
        initial: "a",
        variables: { lit: 0 },
        states: { a: {} },
        signals: { headline: "Hello" },
      });
    });
    expect(validateScene(ok).ok).toBe(true);
    expect(() =>
      figure("m", { title: "M" }, (f) => {
        f.heading("A");
        f.machine({ initial: "a", states: { a: {} } });
        f.machine({ initial: "a", states: { a: {} } });
      }),
    ).toThrow(/f\.machine was called twice/);
  });
});

describe("figure(): a complete figure resolves cleanly", () => {
  const scene = figure(
    "complete",
    { title: "Complete", description: "Every helper at once.", metadata: { source: "test" } },
    (f) => {
      f.title("Everything in one place");
      f.caption("Cards, a chart-like coordinates group, a legend, and connectors.");
      const plan = f.card({
        eyebrow: "Stage 1",
        title: "Plan",
        body: "Bound the region and pick a brush.",
        motif: "graph",
        badge: "pure",
        extras: [f.keyValue("Cells", "512"), f.keyValue("Brush", "gradient")],
      });
      const place = f.card({
        title: "Place",
        body: "Visit every cell.",
        motif: "blocks",
        tone: "success",
      });
      const edge = f.connect(plan, place, {
        head: "arrow",
        route: { wide: "curve", compact: "orthogonal" },
      });
      const bars = [0.4, 0.8, 0.6].map((height, index) =>
        f.rect({
          position: { x: 0.1 + index * 0.3, y: 1, anchor: "bottom-left" },
          width: "20%",
          height: `${height * 100}%`,
          fill: "chart1",
          revealAnchor: "bottom",
          inspect: {
            role: "Bar",
            title: `Bar ${index + 1}`,
            fields: [{ label: "Value", value: `${height}` }],
          },
          interactive: true,
          label: `Bar ${index + 1}`,
        }),
      );
      const line = f.polyline(
        [
          [0, 0.8],
          [0.5, 0.2],
          [1, 0.5],
        ],
        {
          position: { x: 0, y: 0 },
          width: "100%",
          height: "100%",
          stroke: "chart3",
          curve: "monotone",
        },
      );
      const area = f.coordinates([...bars, line], {
        height: { wide: 160, compact: 120 },
        focusGroup: true,
      });
      const legend = f.legend(
        [
          { id: "bars", label: "Bars", swatch: "chart1" },
          { id: "line", label: "Trend", swatch: "chart3", shape: "line" },
        ],
        { direction: "row" },
      );
      const chart = f.panel([area, legend], { eyebrow: "Chart", title: "Coordinates" });
      f.flow([f.stack([plan, place], { gap: 16 }), chart], { gap: 24 });
      f.rule();
      f.row(
        [f.badge("v2"), f.icon("cube", { tone: "info" }), f.pill("ready", { tone: "success" })],
        {
          gap: 8,
          align: "center",
        },
      );
      f.callout("Bars rise from their anchor; the line wipes in.", { pointer: "up" });
      f.sequence([
        f.reveal(plan, { scale: 0.96 }),
        [f.draw(edge), f.reveal(place)],
        f.rise(bars, { stagger: 60 }),
        f.wipe(line),
        [f.highlight(plan, { rest: 0 }), f.progress(place)],
      ]);
    },
  );

  it("passes defineScene and validateScene", () => {
    expect(() => defineScene(scene)).not.toThrow();
    expect(validateScene(scene).ok).toBe(true);
    expect(scene.metadata).toEqual({ source: "test" });
  });

  for (const width of WIDTHS) {
    it(`resolves at ${width}px without layout diagnostics`, () => {
      const resolved = resolveScene(scene, { width, theme });
      const problems = (resolved.diagnostics ?? []).filter((entry) => LAYOUT_CODES.has(entry.code));
      expect(problems).toEqual([]);
      expect(resolved.nodes.length).toBeGreaterThan(20);
      expect(resolved.edges).toHaveLength(1);
      const duration = scene.timeline?.duration ?? 0;
      expect(duration).toBeGreaterThan(1000);
      const final = seekTimeline(resolved, duration);
      for (const node of final.nodes) if (node.hidden !== true) expect(node.state.opacity).toBe(1);
      const bar = final.nodes.find((node) => node.id === "rect-bar-1");
      expect(bar?.state.revealY).toBe(1);
    });
  }
});
