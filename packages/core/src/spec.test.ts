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
    expect(children?.type === "group" ? children.layout : undefined).toBe("row");
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
