import { describe, expect, it } from "vitest";
import {
  alphaGradient,
  createTheme,
  linearGradient,
  material,
  noise,
  radialGradient,
  resolveScene,
  seekTimeline,
  shader,
  shadow,
  type SceneDefinition,
} from "@kineglyph/core";
import {
  edgeDashArray,
  markerId,
  nodeTransform,
  nodeTransformParts,
  renderSvg,
  revealClipRect,
} from "../src/index.js";

const theme = createTheme();

const gradientScene: SceneDefinition = {
  schemaVersion: 2,
  id: "gradients",
  title: "Gradient fills",
  root: {
    id: "root",
    type: "group",
    layout: "row",
    children: [
      {
        id: "area",
        type: "rect",
        width: 160,
        height: 80,
        fill: alphaGradient("chart1", { from: 0.7, angle: 90 }),
      },
      {
        id: "blend",
        type: "circle",
        radius: 40,
        fill: linearGradient([
          { at: 0, color: "chart1" },
          { at: 1, color: "chart2" },
        ]),
      },
      {
        id: "glow",
        type: "circle",
        radius: 40,
        fill: radialGradient(
          [
            { at: 0, color: "accent", opacity: 0.4 },
            { at: 1, color: "accent", opacity: 0 },
          ],
          { center: [0.35, 0.4], radius: 0.8 },
        ),
      },
    ],
  },
};

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

describe("gradient fills", () => {
  it("emits deterministic SVG definitions for semantic and alpha stops", () => {
    const svg = renderSvg(resolveScene(gradientScene, { width: 420, theme }));
    expect(svg).toContain('<linearGradient id="kineglyph-gradients-paint-area-fill"');
    expect(svg).toContain('data-gradient-of="area"');
    expect(svg).toContain('offset="0%" stop-color="#5b5ce2" stop-opacity="0.7"');
    expect(svg).toContain('offset="100%" stop-color="#5b5ce2" stop-opacity="0"');
    expect(svg).toContain('fill="url(#kineglyph-gradients-paint-area-fill)"');
    expect(svg).toContain('fill="url(#kineglyph-gradients-paint-blend-fill)"');
    expect(svg).toContain('<radialGradient id="kineglyph-gradients-paint-glow-fill"');
    expect(svg).toContain('fill="url(#kineglyph-gradients-paint-glow-fill)"');
  });
});

describe("material effects", () => {
  it("emits portable filters and opts into enhanced browser backdrop treatment", () => {
    const scene: SceneDefinition = {
      schemaVersion: 2,
      id: "material-filter",
      title: "Material filter",
      root: {
        id: "glass",
        type: "group",
        layout: "stack",
        padding: 20,
        frame: material("glass", {
          effects: [
            { type: "backdrop", blur: 20, saturation: 1.2 },
            shadow({ color: "text", opacity: 0.2, blur: 24, spread: 2, offset: [0, 10] }),
            noise({ amount: 0.025, scale: 0.7, seed: 13 }),
            shader("liquid", { uniforms: { strength: 4, frequency: 0.02 } }),
          ],
        }),
        children: [{ id: "copy", type: "text", text: "Glass" }],
      },
    };
    const resolved = resolveScene(scene, { width: 320, theme });
    const portable = renderSvg(resolved, { idPrefix: "m" });
    expect(portable).toContain('<filter id="m-material-glass"');
    expect(portable).toContain('data-material-filter-of="glass"');
    expect(portable).toContain("<feMorphology");
    expect(portable).toContain("<feTurbulence");
    expect(portable).toContain("<feDisplacementMap");
    expect(portable).toContain('filter="url(#m-material-glass)"');
    expect(portable).toContain('data-shader="liquid"');
    expect(portable).toContain('data-shader-uniforms="{&quot;strength&quot;:4');
    expect(portable).not.toContain("backdrop-filter:");

    const enhanced = renderSvg(resolved, { idPrefix: "m", effects: "enhanced" });
    expect(enhanced).toContain("backdrop-filter:blur(20px) saturate(1.2) brightness(1)");
    expect(enhanced).toContain("-webkit-backdrop-filter:");
  });
});

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
    expect(svg).toContain('class="kg-edge kg-edge--flow kg-edge--flowing"');
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
      /<text class="kg-text"[^>]*font-family="[^"]+" font-size="24" font-weight="650"[^>]*fill="#15171a"/,
    );
    expect(svg).toContain(`fill="${theme.colors.success}"`);
    expect(svg).toContain('class="kg-canvas"');
    const again = renderSvg(resolved, { idPrefix: "kinds" });
    expect(again).toBe(svg);
  });

  it("emits anchored reveal clips, roving focus groups, and centre-origin transforms", () => {
    const scene: SceneDefinition = {
      schemaVersion: 2,
      id: "reveal",
      title: "Reveal and focus",
      root: {
        id: "root",
        type: "group",
        layout: "coordinates",
        height: 100,
        focusGroup: true,
        label: "Bars",
        children: [
          {
            id: "bar",
            type: "rect",
            position: { x: 0.1, y: 1, anchor: "bottom-left" },
            width: "20%",
            height: "80%",
            revealAnchor: "bottom",
            interactive: true,
            label: "Bar",
          },
          {
            id: "bar2",
            type: "rect",
            position: { x: 0.5, y: 1, anchor: "bottom-left" },
            width: "20%",
            height: "40%",
            revealAnchor: "bottom",
            interactive: true,
            label: "Bar 2",
          },
        ],
      },
      timeline: {
        duration: 100,
        tracks: [
          {
            id: "grow",
            target: "bar",
            property: "revealY",
            keyframes: [
              { time: 0, value: 0 },
              { time: 100, value: 1 },
            ],
          },
          {
            id: "pop",
            target: "bar2",
            property: "scale",
            keyframes: [
              { time: 0, value: 0.5 },
              { time: 100, value: 1 },
            ],
          },
        ],
      },
    };
    const resolved = resolveScene(scene, { width: 400, theme });
    const half = renderSvg(seekTimeline(resolved, 50), { idPrefix: "r" });
    // Half revealed from the bottom: the clip rect covers the lower half of the bar box.
    const bar = resolved.nodes.find((node) => node.id === "bar");
    expect(bar).toBeDefined();
    if (bar === undefined) return;
    const clip = revealClipRect(bar, 1, 0.5, "bottom");
    expect(clip.height).toBeCloseTo(bar.height / 2, 3);
    expect(clip.y).toBeCloseTo(bar.y + bar.height / 2, 3);
    expect(half).toContain(`<clipPath id="r-node-bar-reveal"><rect x="${clip.x}" y="${clip.y}"`);
    expect(half).toContain('data-reveal-clip="bar"');
    expect(half).toMatch(/data-node-id="bar"[^>]*data-reveal-y="0.5"/);
    // Focus group: the group is the tab stop; interactive members are reachable by arrow keys.
    expect(half).toMatch(/<g[^>]*data-focus-group="true"[^>]*data-node-id="root"/);
    expect(half).toMatch(/role="group" tabindex="0"[^>]*data-node-id="root"/);
    expect(half).toMatch(/tabindex="-1"[^>]*data-node-id="bar"/);
    // Static scale is applied about the node centre so exported frames match the runtime.
    const bar2 = resolved.nodes.find((node) => node.id === "bar2");
    if (bar2 === undefined) return;
    const parts = nodeTransformParts(bar2, 0, 0, 0.75);
    expect(parts.tx).toBeCloseTo((bar2.x + bar2.width / 2) * 0.25, 5);
    expect(nodeTransform(bar2, 0, 0, 0.75, 3)).toBe(
      `translate(${Number(parts.tx.toFixed(3))} ${Number(parts.ty.toFixed(3))}) scale(0.75)`,
    );
    expect(half).toContain(`transform="${nodeTransform(bar2, 0, 0, 0.75, 3)}"`);
  });
  it("marks path shapes with their owner, keeps authored line caps, and names inspect-only marks", () => {
    const scene: SceneDefinition = {
      schemaVersion: 2,
      id: "paths",
      title: "Paths",
      root: {
        id: "root",
        type: "group",
        layout: "stack",
        gap: 8,
        children: [
          {
            id: "line",
            type: "polyline",
            width: 200,
            height: 60,
            points: [
              [0, 1],
              [0.5, 0],
              [1, 1],
            ],
            lineCap: "butt",
            dash: "dotted",
            stroke: "chart1",
            strokeWidth: 3,
            interactive: true,
            inspect: {
              role: "Series",
              title: "Latency p95",
              summary: "Milliseconds per request",
              fields: [{ label: "Points", value: "3" }],
            },
          },
          {
            id: "cell",
            type: "rect",
            width: 40,
            height: 40,
            fill: "chart2",
            interactive: true,
            inspect: {
              role: "Cell",
              title: "Row 1 · Col 2",
              fields: [{ label: "Value", value: "7" }],
            },
          },
        ],
      },
      timeline: {
        duration: 100,
        tracks: [
          {
            id: "draw",
            target: "line",
            property: "progress",
            keyframes: [
              { time: 0, value: 0 },
              { time: 100, value: 1 },
            ],
          },
        ],
      },
    };
    const resolved = resolveScene(scene, { width: 400, theme });
    const half = renderSvg(seekTimeline(resolved, 50), { idPrefix: "p" });
    // The path shape is attributable to its node (the runtime updates it by owner, not position).
    expect(half).toMatch(/<path class="kg-node-shape kg-path" data-shape-of="line"/);
    // Authored line cap survives while revealing; the dotted pattern is preserved mid-progress.
    expect(half).toMatch(/data-shape-of="line"[^>]*stroke-linecap="butt"/);
    expect(half).toMatch(/data-shape-of="line"[^>]*data-dash="dotted"/);
    expect(half).toMatch(/data-shape-of="line"[^>]*pathLength="/);
    const dash = /data-shape-of="line"[^>]*stroke-dasharray="([^"]+)"/.exec(half)?.[1] ?? "";
    expect(dash.split(" ").length).toBeGreaterThan(2);
    // Inspect-only marks get an accessible name and description from inspect.
    expect(half).toMatch(/data-node-id="cell"[\s\S]*?<title[^>]*>Row 1 · Col 2<\/title>/);
    expect(half).toMatch(/<title[^>]*>Latency p95<\/title>/);
    expect(half).toMatch(/<desc[^>]*>Milliseconds per request<\/desc>/);
    // Full progress: plain dotted pattern, no reveal remainder.
    const done = renderSvg(seekTimeline(resolved, 100), { idPrefix: "p" });
    const doneDash = /data-shape-of="line"[^>]*stroke-dasharray="([^"]+)"/.exec(done)?.[1] ?? "";
    expect(doneDash.split(" ")).toHaveLength(2);
  });
});
