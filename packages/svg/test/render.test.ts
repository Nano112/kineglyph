import { describe, expect, it } from "vitest";
import { resolvePipeline } from "@kineglyph/core";
import { renderSvg, wrapSvgText } from "../src/index.js";

const scene = {
  id: "release map",
  width: 400,
  height: 200,
  label: "Release flow",
  description: "How a change reaches production",
  theme: {
    background: "#f8fafc",
    node: { fill: "#fff", stroke: "#0f172a" },
    edge: { stroke: "#475569" },
    accent: "#7c3aed",
  },
  nodes: [
    {
      id: "source",
      kind: "rect",
      x: 10,
      y: 20,
      width: 80,
      height: 40,
      label: "Source <code>",
      description: "Editable repository",
      body: "Push a commit",
      icon: "repository",
      interactive: true,
      metadata: { command: "open", ignored: { nested: true } },
      appearance: { radius: 8 },
    },
    {
      id: "prod",
      kind: "circle",
      x: 310,
      y: 20,
      width: 40,
      height: 40,
      label: "Production",
      state: { opacity: 0.5, progress: 0.25 },
    },
  ],
  edges: [{ id: "deploy", from: "source", to: "prod", progress: 0.75, label: "deploy" }],
};

describe("renderSvg", () => {
  it("renders a scene produced by the core pipeline resolver", () => {
    const resolved = resolvePipeline(
      {
        id: "release",
        title: "Release pipeline",
        description: "A deterministic delivery path",
        nodes: [
          {
            id: "build",
            label: "Build",
            description: "Compile and test",
            metadata: { motif: "blocks" },
          },
          { id: "ship", label: "Ship", description: "Deploy safely", interactive: true },
        ],
        edges: [{ id: "delivery", from: "build", to: "ship", directed: true }],
      },
      { width: 640 },
    );

    const svg = renderSvg(resolved);

    expect(svg).toContain('data-kineglyph-scene="release"');
    expect(svg).toContain('data-kineglyph-node="build"');
    expect(svg).toContain(">Compile and test</tspan>");
    expect(svg).toContain('data-motif="blocks"');
    expect(svg).toContain('data-kineglyph-edge="delivery"');
    expect(svg).toContain(`viewBox="0 0 ${resolved.width} ${resolved.height}"`);
    expect(svg).toContain(`var(--kg-color-accent, ${resolved.theme.tokens.colors.accent})`);
  });

  it("renders deterministic accessible scene and node metadata", () => {
    const first = renderSvg(scene as never, { idPrefix: "diagram" });
    const second = renderSvg(scene as never, { idPrefix: "diagram" });

    expect(first).toBe(second);
    expect(first).toContain('id="diagram-title"');
    // Name and description are separate relationships: run together in `aria-labelledby` they
    // become one very long label and no description at all.
    expect(first).toContain('aria-labelledby="diagram-title"');
    expect(first).toContain('aria-describedby="diagram-description"');
    expect(first).toContain('role="group"');
    expect(first).toContain('id="diagram-node-source"');
    expect(first).toContain('tabindex="0" focusable="true"');
    expect(first).toContain('data-command="open"');
    expect(first).toContain('data-kineglyph-node="source"');
    expect(first).not.toContain("data-ignored");
    expect(first).toContain("Source &lt;code&gt;");
    expect(first).toContain(">Push</tspan>");
    expect(first).toContain('data-wrap-lines="3"');
    expect(first).toContain('data-icon="repository"');
  });

  it("renders edge geometry, arrow markers, opacity, and progress", () => {
    const svg = renderSvg(scene as never, { idPrefix: "diagram" });

    // Marker ids are scoped by root, kind, and colour so several figures can share a page.
    expect(svg).toContain('id="diagram-m-arrow-64748b"');
    expect(svg).toContain('d="M 50 40 L 330 40"');
    // Heads appear once the edge is fully revealed; at 75% the path is still drawing.
    expect(svg).not.toContain("marker-end=");
    expect(svg).toContain('data-kineglyph-edge="deploy"');
    expect(svg).toContain('stroke-dasharray="0.75 1"');
    expect(svg).toContain('id="diagram-node-prod"');
    expect(svg).toContain('opacity="0.5" data-node-id="prod"');
    expect(svg).toContain('data-progress="0.25"');

    const complete = renderSvg({ ...scene, edges: [{ ...scene.edges[0], progress: 1 }] } as never, {
      idPrefix: "diagram",
    });
    expect(complete).toContain('marker-end="url(#diagram-m-arrow-64748b)"');
  });

  it("maps core semantic theme colors, radii, and bounds", () => {
    const svg = renderSvg({
      width: 100,
      height: 50,
      theme: {
        colors: {
          canvas: "#010101",
          surface: "#020202",
          border: "#030303",
          connector: "#040404",
          text: "#050505",
          textMuted: "#060606",
          accent: "#070707",
        },
        radii: { md: 9 },
      },
      nodes: [
        {
          id: "bounded",
          type: "shape",
          shape: "rectangle",
          bounds: { x: 2, y: 3, width: 40, height: 20 },
          style: { fill: "surface", stroke: "border", radius: "md" },
          name: "Bounded",
        },
      ],
      edges: [],
    } as never);

    expect(svg).toContain("--kg-background:var(--kg-color-canvas, #010101)");
    // Radii are geometry: baked, not offered as a re-themable token.
    expect(svg).toContain("--kg-radius-md:9px");
    expect(svg).toContain('fill="var(--kg-color-surface, #020202)"');
    expect(svg).toContain('stroke="var(--kg-color-border, #030303)"');
    expect(svg).toContain('x="2" y="3" width="40" height="20"');
    expect(svg).toContain(">Bounded</title>");
    expect(svg).toContain('class="kg-node-label"');
  });

  it("renders resolved descriptions visibly and applies animated transforms", () => {
    const svg = renderSvg({
      width: 200,
      height: 100,
      nodes: [
        {
          id: "animated",
          x: 10,
          y: 10,
          width: 120,
          height: 60,
          label: "Build",
          description: "Compile and test",
          metadata: { icon: "build" },
          state: { translateX: 4, translateY: -2, scale: 0.9 },
        },
      ],
      edges: [],
    } as never);

    // Scale is applied about the node centre (10,10 120x60 → centre 70,40), matching the runtime.
    expect(svg).toContain('transform="translate(11 2) scale(0.9)"');
    expect(svg).toContain(">Build</tspan>");
    expect(svg).toContain(">Compile and test</desc>");
    expect(svg).toContain(">Compile and</tspan>");
    expect(svg).toContain(">test</tspan>");
    expect(svg).toContain('data-icon="build"');
  });

  it("rotates around the node centre while preserving translation and scale", () => {
    const svg = renderSvg({
      width: 200,
      height: 100,
      nodes: [
        {
          id: "dial",
          x: 10,
          y: 20,
          width: 80,
          height: 40,
          state: { translateX: 6, translateY: -3, scale: 0.5, rotation: 45 },
        },
      ],
      edges: [],
    } as never);

    // Centre is (50, 40); centre-scale compensation follows rotation in SVG transform order.
    expect(svg).toContain(
      'transform="translate(6 -3) rotate(45 50 40) translate(25 20) scale(0.5)"',
    );
  });

  it("uses semantic theme tokens and has stable metadata ordering", () => {
    const svg = renderSvg({
      width: 100,
      height: 50,
      theme: { semantic: { surface: "papayawhip", foreground: "midnightblue" } },
      nodes: [{ id: "n", x: 0, y: 0, width: 10, height: 10, metadata: { z: 1, a: 2 } }],
      edges: [],
    } as never);

    expect(svg).toContain("--kg-node-fill:var(--kg-color-surface, papayawhip)");
    expect(svg).toContain("--kg-node-stroke:var(--kg-color-border, midnightblue)");
    expect(svg.indexOf('data-a="2"')).toBeLessThan(svg.indexOf('data-z="1"'));
    expect(svg).toContain('role="img"');
    expect(svg).toContain('aria-label="Kineglyph scene"');
  });

  it("clamps progress and produces safe, rounded attributes", () => {
    const svg = renderSvg(
      {
        id: "123 unsafe/id",
        width: 10.12345,
        height: 20,
        nodes: [{ id: "x/y", kind: "line", x1: -0, y1: 0, x2: 9.9999, y2: 20, progress: -4 }],
        edges: [],
      } as never,
      { precision: 2 },
    );

    expect(svg).toContain('id="kineglyph-123-unsafe-id"');
    expect(svg).toContain('width="10.12"');
    expect(svg).toContain('id="kineglyph-123-unsafe-id-node-x-y"');
    expect(svg).toContain('x1="0"');
    expect(svg).toContain('data-progress="0"');
  });

  it("wraps long labels and descriptions inside clipped card geometry", () => {
    const description =
      "Compose primitives and operations into one signed distance function without crossing the card edge.";
    const lines = wrapSvgText(description, 116, {
      averageCharacterWidth: 6.15,
      maxLines: 3,
    });

    expect(lines.length).toBeGreaterThan(1);
    expect(lines.length).toBeLessThanOrEqual(3);
    expect(lines.every((line) => line.measuredWidth <= 116)).toBe(true);

    const svg = renderSvg({
      id: "wrapping",
      width: 220,
      height: 152,
      nodes: [
        {
          id: "long-card",
          x: 20,
          y: 12,
          width: 168,
          height: 128,
          label: "Signed distance composition graph",
          description,
          metadata: { motif: "graph" },
        },
      ],
      edges: [],
    } as never);

    expect(svg).toContain('class="kg-node-label"');
    expect(svg).toContain('class="kg-node-body"');
    expect(svg).toContain('data-wrap-lines="3"');
    expect(svg).toContain("<tspan");
    expect(svg).toContain('lengthAdjust="spacingAndGlyphs"');
    expect(svg).toContain('clip-path="url(#kineglyph-wrapping-node-long-card-content-clip)"');
    expect(svg).not.toContain(`>${description}</text>`);
  });

  it.each([
    [840, "wide"],
    [390, "stacked"],
  ] as const)("keeps every rendered text line within its card at %ipx (%s)", (width, mode) => {
    const resolved = resolvePipeline(
      {
        id: `responsive-${mode}`,
        title: "Responsive field pipeline",
        nodes: ["field", "graph", "boundary", "blocks"].map((id, index) => ({
          id,
          label: `${index + 1}. Signed distance transformation`,
          description:
            "Compose primitives and operations into one bounded representation without crossing the card edge.",
          metadata: { motif: id },
        })),
        edges: [
          { id: "a", from: "field", to: "graph" },
          { id: "b", from: "graph", to: "boundary" },
          { id: "c", from: "boundary", to: "blocks" },
        ],
      },
      { width, layout: mode },
    );
    const svg = renderSvg(resolved);
    const textBlocks = [
      ...svg.matchAll(
        /<text class="kg-node-(?:label|body)"[^>]*data-max-width="([\d.]+)"[^>]*>([\s\S]*?)<\/text>/g,
      ),
    ];

    expect(textBlocks).toHaveLength(8);
    for (const block of textBlocks) {
      const maximum = Number(block[1]);
      const lineWidths = [...(block[2] ?? "").matchAll(/data-line-width="([\d.]+)"/g)].map(
        (match) => Number(match[1]),
      );
      expect(lineWidths.length).toBeGreaterThan(0);
      expect(lineWidths.every((lineWidth) => lineWidth <= maximum)).toBe(true);
    }
    expect(svg.match(/clip-path="url\(#.+?-content-clip\)"/g)).toHaveLength(4);
  });
});

/**
 * The contract that makes tokenising safe: on a page that defines no `--kg-color-*`, every
 * `var()` falls back to the literal the renderer would have written anyway. So the tests below
 * collapse each `var(--x, y)` to `y` and assert the result is the picture, unchanged.
 */
describe("re-themable colour", () => {
  const themed = {
    width: 200,
    height: 100,
    background: "#f7f8fa",
    theme: {
      colors: {
        canvas: "#f7f8fa",
        surface: "#ffffff",
        border: "#dfe2e7",
        connector: "#969da8",
        text: "#15171a",
        textMuted: "#626973",
        accent: "#5b5ce2",
        // Shares its value with `accent`; `accent` must win, every time.
        chart1: "#5b5ce2",
      },
    },
    nodes: [
      { id: "a", x: 0, y: 0, width: 80, height: 40, label: "A", fill: "#ffffff" },
      { id: "b", x: 110, y: 0, width: 80, height: 40, label: "B", fill: "#5b5ce2" },
    ],
    edges: [{ id: "e", from: "a", to: "b", directed: true }],
  } as never;

  /** What a viewer that sets none of the tokens actually paints. */
  const collapse = (svg: string): string => svg.replace(/var\((--[a-z0-9-]+), ([^)]*)\)/g, "$2");

  it("every paint carries the literal it had before as its fallback", () => {
    const svg = renderSvg(themed);
    const collapsed = collapse(svg);

    expect(collapsed).toContain('fill="#ffffff"');
    expect(collapsed).toContain('fill="#5b5ce2"');
    expect(collapsed).toContain("--kg-text:#15171a");
    expect(collapsed).toContain("--kg-accent:#5b5ce2");
    // Nothing is left referring to a token it did not also supply a value for.
    expect(collapsed).not.toMatch(/var\(--kg-color-/);
  });

  it("names a paint by the role it plays, and breaks a tie the same way every time", () => {
    const svg = renderSvg(themed);

    expect(svg).toContain('fill="var(--kg-color-surface, #ffffff)"');
    expect(svg).toContain('fill="var(--kg-color-accent, #5b5ce2)"');
    // `chart1` is the same colour; the general role wins, so re-tinting the accent moves it.
    expect(svg).not.toContain("--kg-color-chart1,");
    expect(renderSvg(themed)).toBe(svg);
  });

  it("pins its own aliases without pinning the tokens they read", () => {
    const style = /style="([^"]*)"/.exec(renderSvg(themed))?.[1] ?? "";

    // Every alias resolves *through* the contract, so a value inherited from the page reaches it.
    expect(style).toContain("--kg-node-fill:var(--kg-color-surface, #ffffff)");
    expect(style).toContain("--kg-edge-stroke:var(--kg-color-connector, #969da8)");
    // …and the contract itself is never defined here, which is what would defeat inheritance.
    expect(style).not.toMatch(/--kg-color-[a-z0-9-]+:/);
  });

  it("keeps the measured font out of the re-themable set", () => {
    // Text is measured at render time and frozen with `textLength`; re-fonting it at view time
    // would squeeze one font's glyphs into another's metrics.
    const style = /style="([^"]*)"/.exec(renderSvg(themed))?.[1] ?? "";

    expect(style).toMatch(/--kg-font-family:[^v]/);
  });
});

/**
 * Inheriting is the default; declaring is the exception, and the exception is scoped.
 *
 * `colors` is always complete — something has to be drawn on a page that defines no tokens — so
 * "did this theme mean it?" cannot be read off the palette. `declaredColors` is that second
 * question, and these tests are about the one thing it changes: whether the role is *pinned* on the
 * drawing's own root, where it beats the page for this figure and reaches no other.
 */
describe("declared themes", () => {
  const scene = (theme: unknown) =>
    ({
      width: 200,
      height: 100,
      theme,
      nodes: [{ id: "a", x: 0, y: 0, width: 80, height: 40, label: "A" }],
      edges: [],
    }) as never;
  const palette = {
    canvas: "#101216",
    surface: "#16191e",
    text: "#e8eaed",
    accent: "#67cbbb",
    border: "#3d4552",
    connector: "#8a929e",
  };
  const rootStyle = (svg: string): string => /style="([^"]*)"/.exec(svg)?.[1] ?? "";
  const pins = (svg: string): string[] =>
    [...rootStyle(svg).matchAll(/(--kg-color-[a-z0-9-]+):([^;]*)/g)].map(
      (match) => `${match[1]}:${match[2]}`,
    );

  it("pins nothing when the theme declares nothing", () => {
    expect(pins(renderSvg(scene({ colors: palette })))).toEqual([]);
  });

  it("pins every declared role on the drawing's own root", () => {
    const svg = renderSvg(scene({ colors: palette, declaredColors: Object.keys(palette) }));

    expect(pins(svg)).toEqual([
      "--kg-color-canvas:#101216",
      "--kg-color-surface:#16191e",
      "--kg-color-border:#3d4552",
      "--kg-color-text:#e8eaed",
      "--kg-color-accent:#67cbbb",
      "--kg-color-connector:#8a929e",
    ]);
    // Pinned on the root element, never in the embedded stylesheet — an inlined SVG's `<style>`
    // is document-wide, and a rule there would repaint the figure next to this one.
    expect(svg).not.toMatch(/<style[^>]*>[^<]*--kg-color-/);
  });

  it("pins only what a partial theme names, and leaves the rest reading the page", () => {
    const svg = renderSvg(scene({ colors: palette, declaredColors: ["accent"] }));

    expect(pins(svg)).toEqual(["--kg-color-accent:#67cbbb"]);
    // The roles it did not claim are still references, so the page still decides them.
    expect(rootStyle(svg)).toContain("--kg-node-fill:var(--kg-color-surface, #16191e)");
  });

  it("still carries the literal as a fallback, so a token-less page is unchanged", () => {
    const declared = renderSvg(scene({ colors: palette, declaredColors: Object.keys(palette) }));
    const collapse = (svg: string): string =>
      svg
        .replace(/var\((--[a-z0-9-]+), ([^)]*)\)/g, "$2")
        .replace(/--kg-color-[a-z0-9-]+:[^;"]*;?/g, "");

    expect(collapse(declared)).toBe(collapse(renderSvg(scene({ colors: palette }))));
  });

  it("names a role it cannot see no differently than one it can", () => {
    // A role the theme does not carry a literal for is not pinnable; claiming it is a no-op
    // rather than a pin with no value, which would paint the figure with nothing at all.
    expect(
      pins(renderSvg(scene({ colors: { accent: "#67cbbb" }, declaredColors: ["danger"] }))),
    ).toEqual([]);
  });
});

/**
 * The connector is the diagram's verb, so what it looks like is a contract, not an accident.
 */
describe("connectors", () => {
  const twoBoxes = (dash: string) => ({
    id: "styles",
    width: 400,
    height: 120,
    root: "wrap",
    nodes: [
      {
        id: "wrap",
        kind: "rect",
        x: 0,
        y: 0,
        width: 400,
        height: 120,
        appearance: { fill: "#fff" },
      },
      { id: "a", parent: "wrap", kind: "rect", x: 20, y: 30, width: 120, height: 60 },
      { id: "b", parent: "wrap", kind: "rect", x: 220, y: 30, width: 120, height: 60 },
    ],
    edges: [
      {
        id: "e",
        from: "a",
        to: "b",
        start: { x: 140, y: 60 },
        end: { x: 220, y: 60 },
        length: 80,
        dash,
        head: "arrow",
        appearance: { stroke: "#5b6472", strokeWidth: 2 },
        state: { progress: 1, opacity: 1, flow: dash === "flow" ? 1 : 0 },
      },
    ],
  });

  const dashOf = (dash: string): string =>
    /stroke-dasharray="([^"]*)"/.exec(renderSvg(twoBoxes(dash) as never))?.[1] ?? "none";

  it("draws solid, dashed and flow as three different patterns", () => {
    const patterns = ["solid", "dashed", "flow"].map(dashOf);
    expect(new Set(patterns).size).toBe(3);
    expect(dashOf("solid")).toBe("none");
    // Dashed is broken (mark:gap 1:1); flow is a channel with notches (mark much longer than gap).
    const ratio = (pattern: string): number => {
      const [mark, gap] = pattern.split(" ").map(Number);
      return (mark ?? 0) / (gap === undefined || gap === 0 ? 1 : gap);
    };
    expect(ratio(dashOf("dashed"))).toBeLessThan(2);
    expect(ratio(dashOf("flow"))).toBeGreaterThan(3);
  });

  it("butts dashed marks so a short run keeps its rhythm", () => {
    expect(renderSvg(twoBoxes("dashed") as never)).toContain('stroke-linecap="butt"');
  });

  it("draws the arrowhead in stroke widths, at the line's own weight", () => {
    const svg = renderSvg(twoBoxes("solid") as never);
    const head = /<marker[^>]*kg-marker--arrow[\s\S]*?<\/marker>/.exec(svg)?.[0] ?? "";
    expect(head).toContain('markerUnits="strokeWidth"');
    // One viewBox unit is one stroke width, so the head's numbers read as multiples of the line.
    expect(head).toContain('viewBox="0 0 10 10"');
    expect(head).toContain('markerWidth="10"');
    expect(head).toContain('stroke-width="1"');
  });

  it("keeps connectors above the nodes, so a parent's fill cannot erase them", () => {
    const svg = renderSvg(twoBoxes("solid") as never);
    expect(svg.indexOf('class="kg-edges')).toBeGreaterThan(svg.indexOf('class="kg-nodes"'));
  });

  it("puts a connector behind the nodes only when it asks", () => {
    const scene = twoBoxes("solid");
    const behind = { ...scene, edges: [{ ...scene.edges[0], z: -1 }] };
    const svg = renderSvg(behind as never);
    expect(svg.indexOf('class="kg-edges"')).toBeLessThan(svg.indexOf('class="kg-nodes"'));
  });
});
