import { describe, expect, it } from "vitest";
import { resolveFigure } from "./resolve.js";
import { validateScene, type GroupNode, type SceneNode } from "./scene.js";
import { seekTimeline } from "./seek.js";
import { sceneFromSpec, validateSpec, type SimpleNode, type SimpleSceneSpec } from "./spec.js";
import { defaultTheme } from "./theme.js";

const flowSpec: SimpleSceneSpec = {
  version: 1,
  id: "simple-flow",
  title: "Simple flow",
  description: "Detect, model, export.",
  layout: "stack",
  gap: 16,
  padding: 24,
  background: "canvas",
  nodes: [
    { id: "intro", kind: "heading", text: "Parse, model, export" },
    { id: "detail", kind: "caption", text: "Every parser converges on one model." },
    { id: "snippet", kind: "code", text: "schematic.toSchem()" },
  ],
  edges: [
    { from: "intro", to: "detail", label: "then" },
    { from: "detail", to: "snippet", head: "arrow", style: "dashed" },
  ],
};

function errorDiagnostics(diagnostics: readonly { readonly severity: string }[] = []): unknown[] {
  return diagnostics.filter((entry) => entry.severity === "error");
}

function childIds(node: SceneNode): readonly string[] {
  return node.type === "group" ? node.children.map((child) => child.id) : [];
}

function findNode(root: GroupNode, id: string): SceneNode | undefined {
  if (root.id === id) return root;
  for (const child of root.children) {
    if (child.id === id) return child;
    if (child.type === "group") {
      const found = findNode(child, id);
      if (found !== undefined) return found;
    }
  }
  return undefined;
}

describe("validateSpec", () => {
  it("accepts a well-formed spec", () => {
    expect(validateSpec(flowSpec)).toEqual({ ok: true, errors: [] });
  });

  it("rejects non-objects and wrong versions with named paths", () => {
    expect(validateSpec(null).errors[0]).toMatch(/^spec:/);
    expect(validateSpec({ ...flowSpec, version: 2 }).errors).toContainEqual(
      expect.stringMatching(/^version:/),
    );
  });

  it("names the path of a node missing its id", () => {
    const spec = { ...flowSpec, nodes: [{ kind: "heading", text: "No id" }] };
    const result = validateSpec(spec);
    expect(result.ok).toBe(false);
    expect(result.errors).toContainEqual(expect.stringMatching(/^nodes\[0\]\.id:/));
  });

  it("names the path of an unknown kind", () => {
    const spec = {
      ...flowSpec,
      nodes: [...flowSpec.nodes, { id: "odd", kind: "sparkline", text: "?" }],
    };
    const result = validateSpec(spec);
    expect(result.ok).toBe(false);
    expect(result.errors).toContainEqual(expect.stringMatching(/^nodes\[3\]\.kind:/));
  });

  it("names the path of a nested child and of duplicate ids", () => {
    const spec = {
      ...flowSpec,
      nodes: [
        {
          id: "box",
          kind: "box",
          title: "Box",
          children: [
            { id: "ok", kind: "caption", text: "fine" },
            { id: "bad", kind: "widget", text: "nope" },
          ],
        },
        { id: "box", kind: "heading", text: "Repeat" },
      ],
    };
    const result = validateSpec(spec);
    expect(result.errors).toContainEqual(
      expect.stringMatching(/^nodes\[0\]\.children\[1\]\.kind:/),
    );
    expect(result.errors).toContainEqual(expect.stringMatching(/^nodes\[1\]\.id:/));
  });

  it("names the path of an edge pointing at an unknown node", () => {
    const spec = { ...flowSpec, edges: [{ from: "intro", to: "ghost" }] };
    const result = validateSpec(spec);
    expect(result.ok).toBe(false);
    expect(result.errors).toContainEqual(expect.stringMatching(/^edges\[0\]\.to:/));
  });

  it("rejects unusable text, tones, layouts, and timelines", () => {
    const result = validateSpec({
      ...flowSpec,
      layout: "diagonal",
      timeline: "sweep",
      gap: -4,
      nodes: [{ id: "a", kind: "heading", text: "", tone: "chartreuse" }],
      edges: [],
    });
    expect(result.errors).toContainEqual(expect.stringMatching(/^layout:/));
    expect(result.errors).toContainEqual(expect.stringMatching(/^timeline:/));
    expect(result.errors).toContainEqual(expect.stringMatching(/^gap:/));
    expect(result.errors).toContainEqual(expect.stringMatching(/^nodes\[0\]\.text:/));
    expect(result.errors).toContainEqual(expect.stringMatching(/^nodes\[0\]\.tone:/));
  });
});

describe("sceneFromSpec", () => {
  it("builds a valid, resolvable scene from a flat spec", () => {
    const scene = sceneFromSpec(flowSpec);
    expect(scene.schemaVersion).toBe(2);
    expect(scene.id).toBe("simple-flow");
    expect(scene.background).toBe("canvas");
    expect(errorDiagnostics(validateScene(scene).diagnostics)).toEqual([]);

    const resolved = resolveFigure(scene, { width: 800, theme: defaultTheme });
    expect(errorDiagnostics(resolved.diagnostics)).toEqual([]);
    expect(resolved.edges).toHaveLength(2);
  });

  it("renders every node's text in the final frame", () => {
    const scene = sceneFromSpec(flowSpec);
    const resolved = resolveFigure(scene, { width: 800, theme: defaultTheme });
    const frame = seekTimeline(resolved, resolved.timeline?.duration ?? 0);
    const rendered = frame.nodes
      .flatMap((node) => (node.text?.lines ?? []).map((line) => line.text))
      .join(" ");
    for (const node of flowSpec.nodes)
      if (node.kind !== "box") expect(rendered).toContain(node.text);
    for (const node of frame.nodes) expect(node.state.opacity).toBe(1);
  });

  it("uses deterministic ids derived from the spec", () => {
    const scene = sceneFromSpec(flowSpec);
    expect(scene.root.id).toBe("root");
    expect(childIds(scene.root)).toEqual(["n:intro", "n:detail", "n:snippet"]);
    expect(scene.edges?.map((edge) => edge.id)).toEqual(["e0:intro:detail", "e1:detail:snippet"]);
    expect(scene.edges?.[0]?.from).toBe("n:intro");
    expect(scene.edges?.[0]?.route).toBe("straight");
    expect(scene.edges?.[0]?.head).toBe("arrow");
    expect(scene.edges?.[1]?.stroke).toBe("dashed");
    expect(scene.edges?.[1]?.head).toBe("arrow");
    expect(sceneFromSpec(flowSpec)).toEqual(scene);
    expect(JSON.stringify(sceneFromSpec(flowSpec))).toBe(JSON.stringify(scene));
  });

  it("lays a box out as a framed group with its children", () => {
    const spec: SimpleSceneSpec = {
      version: 1,
      id: "boxed",
      title: "Boxed",
      layout: "stack",
      nodes: [
        {
          id: "pipeline",
          kind: "box",
          title: "Pipeline",
          body: "Three stages, one guarantee.",
          tone: "accent",
          layout: "row",
          children: [
            { id: "parse", kind: "caption", text: "Parse" },
            { id: "emit", kind: "caption", text: "Emit" },
          ],
        },
      ],
    };
    const scene = sceneFromSpec(spec);
    const box = findNode(scene.root, "n:pipeline");
    expect(box?.type).toBe("group");
    expect(box?.type === "group" ? box.frame?.material : undefined).toBe("flat");
    expect(childIds(box as SceneNode)).toEqual([
      "n:pipeline:title",
      "n:pipeline:body",
      "n:pipeline:children",
    ]);
    const children = findNode(scene.root, "n:pipeline:children");
    // A row is emitted as a responsive arrangement, not a bare `"row"`: it stays a row where there
    // is room and becomes a column below the narrow breakpoint. `stackWhenNarrow: false` is what
    // brings the plain string back — see "a row that has run out of room" below.
    expect(children?.type === "group" ? children.layout : undefined).toEqual({
      wide: "row",
      compact: "row",
      narrow: "stack",
    });
    expect(childIds(children as SceneNode)).toEqual(["n:parse", "n:emit"]);

    const resolved = resolveFigure(scene, { width: 800, theme: defaultTheme });
    expect(errorDiagnostics(resolved.diagnostics)).toEqual([]);
    const parse = resolved.nodes.find((node) => node.id === "n:parse");
    const emit = resolved.nodes.find((node) => node.id === "n:emit");
    expect(parse).toBeDefined();
    expect(emit).toBeDefined();
    expect(emit?.x ?? 0).toBeGreaterThan(parse?.x ?? 0);
    expect(emit?.y).toBeCloseTo(parse?.y ?? 0, 3);
  });

  it("reveals nodes before edges and honours timeline: none", () => {
    const revealed = sceneFromSpec(flowSpec);
    const tracks = revealed.timeline?.tracks ?? [];
    expect(revealed.timeline?.duration).toBeGreaterThan(0);
    const firstNodeStart = tracks.find((track) => track.target === "n:intro")?.keyframes[0]?.time;
    const edgeTrack = tracks.find((track) => track.target === "e0:intro:detail");
    expect(firstNodeStart).toBeDefined();
    expect(edgeTrack).toBeDefined();
    const edgeReveal = tracks.find(
      (track) => track.target === "e0:intro:detail" && track.property === "edgeReveal",
    );
    const nodeEnd = tracks.find((track) => track.target === "n:snippet")?.keyframes.at(-1)?.time;
    expect(edgeReveal?.keyframes.at(-1)?.time ?? 0).toBeGreaterThan(nodeEnd ?? 0);

    const still = sceneFromSpec({ ...flowSpec, timeline: "none" });
    expect(still.timeline).toBeUndefined();
    expect(resolveFigure(still, { width: 800, theme: defaultTheme }).timeline).toBeUndefined();
  });

  it("draws a row of unequal boxes as one band with level connectors", () => {
    // The reported defect: three stages in a row, the last one a line shorter than its neighbours.
    // Sized to its own content it is 16px shorter, its middle sits 8px higher, and the arrow into
    // it runs downhill over a 40px gap — a slope too shallow to mean anything and too visible to
    // ignore. A row is a band: equal heights, one centre line, level arrows.
    const row: SimpleSceneSpec = {
      version: 1,
      id: "row-band",
      title: "Read, plan, store",
      layout: "row",
      timeline: "none",
      nodes: [
        { id: "read", kind: "box", title: "Read", body: "One line." },
        {
          id: "plan",
          kind: "box",
          title: "Plan",
          body: "Three whole lines of body copy that wrap more than once at this width, and keep going well past the end of the second line.",
        },
        { id: "store", kind: "box", title: "Store", body: "One line." },
      ],
      edges: [
        { from: "read", to: "plan" },
        { from: "plan", to: "store" },
      ],
    };
    const scene = resolveFigure(sceneFromSpec(row), { width: 960, theme: defaultTheme });
    const boxes = (scene.nodes ?? []).filter((node) =>
      ["n:read", "n:plan", "n:store"].includes(node.id),
    );
    expect(boxes).toHaveLength(3);
    expect(new Set(boxes.map((node) => node.height)).size).toBe(1);
    expect(new Set(boxes.map((node) => node.y)).size).toBe(1);

    // The assertion that matters is on the emitted path, not on the boxes: every connector in the
    // row starts and ends at the same y, so `M x y L x' y` with one y.
    const paths = (scene.edges ?? []).map((edge) => edge.path);
    expect(paths).toHaveLength(2);
    for (const path of paths) {
      const match = /^M (-?[\d.]+) (-?[\d.]+) L (-?[\d.]+) (-?[\d.]+)$/.exec(path ?? "");
      expect(match, `expected a straight run, got ${String(path)}`).not.toBeNull();
      expect(Number(match?.[2])).toBe(Number(match?.[4]));
      expect(Number(match?.[3])).toBeGreaterThan(Number(match?.[1]));
    }
    for (const edge of scene.edges ?? []) expect(edge.start.y).toBe(edge.end.y);
  });

  describe("a row that has run out of room", () => {
    const row: SimpleSceneSpec = {
      version: 1,
      id: "reflow",
      title: "Read, plan, store",
      layout: "row",
      timeline: "none",
      nodes: [
        { id: "read", kind: "box", title: "Read", body: "Where the bytes come from." },
        { id: "plan", kind: "box", title: "Plan", body: "What is going to happen to them." },
        { id: "store", kind: "box", title: "Store", body: "Where they end up afterwards." },
      ],
      edges: [
        { from: "read", to: "plan", label: "then" },
        { from: "plan", to: "store", label: "then" },
      ],
    };
    const ids = ["n:read", "n:plan", "n:store"];
    const boxesOf = (width: number, spec: SimpleSceneSpec = row) => {
      const scene = resolveFigure(sceneFromSpec(spec), { width, theme: defaultTheme });
      return {
        boxes: (scene.nodes ?? []).filter((node) => ids.includes(node.id)),
        edges: scene.edges ?? [],
        scene,
      };
    };

    it("is a row where there is room for one", () => {
      const { boxes } = boxesOf(960);
      expect(boxes).toHaveLength(3);
      // Side by side: one shared y, three different x.
      expect(new Set(boxes.map((b) => b.y)).size).toBe(1);
      expect(new Set(boxes.map((b) => b.x)).size).toBe(3);
    });

    it("becomes a column when it is narrow, and the connectors turn with it", () => {
      const { boxes, edges } = boxesOf(390);
      expect(boxes).toHaveLength(3);
      // Stacked: one shared x, three different y — and each box now has the column's full width.
      expect(new Set(boxes.map((b) => b.x)).size).toBe(1);
      expect(new Set(boxes.map((b) => b.y)).size).toBe(3);
      expect(new Set(boxes.map((b) => b.width)).size).toBe(1);

      // The part most likely to look wrong: a connector drawn for a row is horizontal, and left
      // alone it would run *across* a column instead of down it. Every run is now vertical — one
      // shared x at both ends, and an end below the start.
      expect(edges).toHaveLength(2);
      for (const edge of edges) {
        expect(edge.start.x).toBe(edge.end.x);
        expect(edge.end.y).toBeGreaterThan(edge.start.y);
      }
    });

    it("keeps its row at every width when the row is the meaning", () => {
      const { boxes } = boxesOf(390, { ...row, stackWhenNarrow: false });
      expect(new Set(boxes.map((b) => b.y)).size).toBe(1);
      expect(new Set(boxes.map((b) => b.x)).size).toBe(3);
    });

    it("reflows a box's own row of children too", () => {
      const nested: SimpleSceneSpec = {
        version: 1,
        id: "reflow-children",
        title: "Nested",
        layout: "stack",
        timeline: "none",
        nodes: [
          {
            id: "outer",
            kind: "box",
            title: "Outer",
            layout: "row",
            children: [
              { id: "a", kind: "caption", text: "A caption long enough to need its own room." },
              { id: "b", kind: "caption", text: "Another caption of about the same length." },
            ],
          },
        ],
      };
      const at = (width: number) =>
        (resolveFigure(sceneFromSpec(nested), { width, theme: defaultTheme }).nodes ?? []).filter(
          (node) => node.id === "n:a" || node.id === "n:b",
        );
      expect(new Set(at(960).map((n) => n.y)).size).toBe(1);
      expect(new Set(at(390).map((n) => n.y)).size).toBe(2);
    });

    it("rejects a stackWhenNarrow that is not a boolean", () => {
      const bad = { ...row, stackWhenNarrow: "yes" } as unknown as SimpleSceneSpec;
      expect(validateSpec(bad).errors).toContain("stackWhenNarrow: expected a boolean");
    });
  });

  it("throws with the same path-named messages as validateSpec", () => {
    const spec = {
      ...flowSpec,
      nodes: [
        ...flowSpec.nodes,
        { id: "odd", kind: "sparkline", text: "?" } as unknown as SimpleNode,
      ],
    };
    expect(() => sceneFromSpec(spec)).toThrow(/nodes\[3\]\.kind/);
    expect(() => sceneFromSpec({ ...flowSpec, edges: [{ from: "intro", to: "ghost" }] })).toThrow(
      /edges\[0\]\.to/,
    );
  });
});
