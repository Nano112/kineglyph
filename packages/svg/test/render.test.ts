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
    expect(svg).toContain(`--kg-color-accent:${resolved.theme.tokens.colors.accent}`);
  });

  it("renders deterministic accessible scene and node metadata", () => {
    const first = renderSvg(scene as never, { idPrefix: "diagram" });
    const second = renderSvg(scene as never, { idPrefix: "diagram" });

    expect(first).toBe(second);
    expect(first).toContain('id="diagram-title"');
    expect(first).toContain('aria-labelledby="diagram-title diagram-description"');
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

    expect(svg).toContain("--kg-background:#010101");
    expect(svg).toContain("--kg-radius-md:9px");
    expect(svg).toContain('fill="var(--kg-color-surface)"');
    expect(svg).toContain('stroke="var(--kg-color-border)"');
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

    expect(svg).toContain('transform="translate(4 -2) scale(0.9)"');
    expect(svg).toContain(">Build</tspan>");
    expect(svg).toContain(">Compile and test</desc>");
    expect(svg).toContain(">Compile and</tspan>");
    expect(svg).toContain(">test</tspan>");
    expect(svg).toContain('data-icon="build"');
  });

  it("uses semantic theme tokens and has stable metadata ordering", () => {
    const svg = renderSvg({
      width: 100,
      height: 50,
      theme: { semantic: { surface: "papayawhip", foreground: "midnightblue" } },
      nodes: [{ id: "n", x: 0, y: 0, width: 10, height: 10, metadata: { z: 1, a: 2 } }],
      edges: [],
    } as never);

    expect(svg).toContain("--kg-node-fill:papayawhip");
    expect(svg).toContain("--kg-node-stroke:midnightblue");
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
    [820, "wide"],
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
