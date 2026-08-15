import { describe, expect, it } from "vitest";
import { createTheme, resolveScene, seekTimeline, type SceneDefinition } from "@kineglyph/core";
import { edgeDashArray, markerId, renderSvg } from "../src/index.js";

const theme = createTheme();

const markerScene: SceneDefinition = {
  schemaVersion: 2,
  id: "markers",
  title: "Marker and route styles",
  description: "Every marker, stroke, and route in one figure.",
  root: {
    id: "root",
    type: "group",
    layout: "grid",
    columns: 3,
    gap: 40,
    children: Array.from({ length: 6 }, (_, index) => ({
      id: `n${index + 1}`,
      type: "rect" as const,
      width: "fill" as const,
      height: 48,
      label: `Node ${index + 1}`,
    })),
  },
  edges: [
    { id: "e-arrow", from: "n1", to: "n2", head: "arrow", route: "straight", description: "arrow" },
    { id: "e-triangle", from: "n2", to: "n3", head: "triangle", tail: "dot", route: "curve" },
    {
      id: "e-diamond",
      from: "n4",
      to: "n5",
      head: "diamond",
      tail: "bar",
      route: "orthogonal",
      stroke: "dashed",
    },
    {
      id: "e-none",
      from: "n5",
      to: "n6",
      head: "none",
      route: "arc",
      stroke: "dotted",
      tone: "warning",
    },
    {
      id: "e-flow",
      from: "n1",
      to: "n4",
      head: "arrow",
      stroke: "flow",
      tone: "accent",
      packets: { count: 2 },
    },
    { id: "e-two-way", from: "n3", to: "n6", head: "arrow", tail: "arrow", label: "sync", z: 1 },
  ],
};

const kindsScene: SceneDefinition = {
  schemaVersion: 2,
  id: "kinds",
  title: "All primitives",
  root: {
    id: "root",
    type: "group",
    layout: "stack",
    gap: 12,
    children: [
      { id: "heading", type: "text", text: "Heading", textStyle: "title" },
      { id: "eyebrow", type: "text", text: "eyebrow", textStyle: "label" },
      { id: "badge", type: "badge", text: "New", tone: "success", variant: "solid" },
      { id: "icon", type: "icon", icon: "layers", size: 28, tone: "info" },
      {
        id: "path",
        type: "path",
        d: "M 0 0 L 40 0 L 20 30 Z",
        viewBox: { width: 40, height: 30 },
        width: 80,
        stroke: "danger",
      },
      { id: "circle", type: "circle", radius: 16, fill: "accent" },
      {
        id: "image",
        type: "image",
        src: "data:image/png;base64,AAAA",
        alt: "A placeholder",
        width: 120,
        height: 60,
        radius: 6,
      },
      {
        id: "legend",
        type: "legend",
        items: [
          { id: "l1", label: "Opaque", swatch: "accent" },
          { id: "l2", label: "Cutout", swatch: "warning", shape: "circle" },
          { id: "l3", label: "Blend", swatch: "info", shape: "dashed" },
        ],
      },
      { id: "callout", type: "callout", text: "A short note", pointer: "up", tone: "accent" },
      {
        id: "card",
        type: "group",
        layout: "overlay",
        padding: 10,
        frame: { fill: "surface", stroke: "border" },
        interactive: true,
        label: "Card",
        description: "An interactive card",
        clip: true,
        children: [{ id: "card-text", type: "text", text: "Inside", align: "center" }],
      },
    ],
  },
};

describe("structured scene rendering", () => {
  it("emits every marker style with root-scoped ids and derived dash patterns", () => {
    const resolved = resolveScene(markerScene, { width: 900, theme });
    const svg = renderSvg(resolved, { idPrefix: "fig-a" });
    for (const kind of ["arrow", "triangle", "dot", "diamond", "bar"]) {
      expect(svg).toContain(`data-marker-kind="${kind}"`);
      expect(svg).toMatch(new RegExp(`id="fig-a-m-${kind}-[a-z0-9-]+"`));
    }
    expect(svg).toContain('marker-start="url(#fig-a-m-dot-');
    expect(svg).toContain('marker-start="url(#fig-a-m-arrow-');
    expect(svg).toContain('marker-end="url(#fig-a-m-arrow-');
    expect(svg).toContain('class="kg-edge kg-edge--dashed"');
    expect(svg).toContain('class="kg-edge kg-edge--dotted"');
    expect(svg).toContain('class="kg-edge kg-edge--flow"');
    expect(svg).toContain('data-edge-packet="e-flow"');
    expect(svg).toContain('class="kg-edges kg-edges--above"');
    expect(svg).toContain(">sync</text>");
    // Described edges are accessible images; decorative edges are hidden from assistive tech.
    expect(svg).toContain('data-edge-group="e-arrow" role="img" aria-label="arrow"');
    expect(svg).toContain('data-edge-group="e-triangle" aria-hidden="true"');
    expect(svg).toContain('data-edge-hit="e-arrow"');
    // The warning-toned dotted arc has no head marker at all.
    expect(svg).toMatch(/data-edge-id="e-none"[^>]*data-head="none"/);
    // Curved and orthogonal paths are derived, never hand authored.
    expect(svg).toMatch(/data-edge-id="e-triangle"/);
    expect(svg).toMatch(/d="M [\d.]+ [\d.]+ C [^"]+" fill="none"[^>]*data-edge-id="e-triangle"/);
  });

  it("isolates marker ids between two figures on one page", () => {
    const resolved = resolveScene(markerScene, { width: 900, theme });
    const first = renderSvg(resolved, { idPrefix: "fig-a" });
    const second = renderSvg(resolved, { idPrefix: "fig-b" });
    const ids = (svg: string): string[] =>
      [...svg.matchAll(/ id="([^"]+)"/g)].map((match) => match[1] ?? "");
    const firstIds = new Set(ids(first));
    for (const id of ids(second)) expect(firstIds.has(id)).toBe(false);
    expect(markerId("fig-a", "arrow", "#5b5ce2")).toBe("fig-a-m-arrow-5b5ce2");
    expect(first).toContain("url(#fig-a-m-arrow-");
    expect(second).toContain("url(#fig-b-m-arrow-");
    expect(second).not.toContain("fig-a-");
  });

  it("keeps dash patterns while revealing and hides heads until complete", () => {
    expect(edgeDashArray("solid", 2, 100, 1).dasharray).toBeUndefined();
    expect(edgeDashArray("solid", 2, 100, 0.4)).toEqual({
      dasharray: "0.4 1",
      pathLength: "1",
      linecap: undefined,
    });
    const dashed = edgeDashArray("dashed", 2, 100, 0.5);
    expect(dashed.pathLength).toBe("1");
    const parts = dashed.dasharray?.split(" ").map(Number) ?? [];
    expect(parts.length % 2).toBe(0);
    const covered =
      parts.slice(0, -2).reduce((sum, value) => sum + value, 0) + (parts[parts.length - 2] ?? 0);
    expect(covered).toBeCloseTo(0.5, 2);
    expect(parts[parts.length - 1]).toBe(1);
    expect(edgeDashArray("dotted", 2, 100, 1).linecap).toBe("round");
    const resolved = resolveScene(markerScene, { width: 900, theme });
    const partial = renderSvg(
      seekTimeline(
        {
          ...resolved,
          timeline: {
            duration: 100,
            tracks: [
              {
                id: "t",
                target: "e-arrow",
                property: "edgeReveal",
                keyframes: [
                  { time: 0, value: 0 },
                  { time: 100, value: 1 },
                ],
              },
            ],
          },
        },
        50,
      ),
      { idPrefix: "p" },
    );
    expect(partial).toMatch(/data-edge-id="e-arrow"[^>]*data-progress="0.5"/);
    expect(partial).not.toMatch(/marker-end="[^"]*"[^>]*data-edge-id="e-arrow"/);
  });

  it("renders every primitive kind with explicit presentation attributes", () => {
    const resolved = resolveScene(kindsScene, { width: 600, theme });
    const svg = renderSvg(resolved, { idPrefix: "kinds" });
    expect(svg).toContain('data-kind="text"');
    expect(svg).toContain(">EYEBROW</tspan>");
    expect(svg).toContain('data-kind="badge"');
    expect(svg).toContain(">NEW</tspan>");
    expect(svg).toContain('data-icon="layers"');
    expect(svg).toContain('class="kg-node-shape kg-path"');
    expect(svg).toContain('data-kind="circle"');
    expect(svg).toContain('role="img" aria-label="A placeholder"');
    expect(svg).toContain('data-legend-item="l2"');
    expect(svg).toContain('class="kg-node-shape kg-callout"');
    expect(svg).toContain('role="button" tabindex="0" focusable="true"');
    expect(svg).toContain(">Card</title>");
    expect(svg).toContain(">An interactive card</desc>");
    expect(svg).toContain('clip-path="url(#kinds-node-card-clip)"');
    // Text carries explicit fonts and fills so static rasterisers never depend on CSS variables.
    expect(svg).toMatch(
      /<text class="kg-text" font-family="[^"]+" font-size="24" font-weight="650"[^>]*fill="#15171a"/,
    );
    expect(svg).toContain(`fill="${theme.colors.success}"`);
    expect(svg).toContain('class="kg-canvas"');
    const again = renderSvg(resolved, { idPrefix: "kinds" });
    expect(again).toBe(svg);
  });
});
