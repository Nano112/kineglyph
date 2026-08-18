import {
  createTheme,
  cubicBezier,
  figure,
  linearGradient,
  material,
  shadow,
  type Paint,
  type SceneDefinition,
  type ThemeTokens,
} from "@kineglyph/core";
import type { CatalogueEntry } from "../catalogue.js";

const arrive = cubicBezier(0.16, 1, 0.3, 1);

export const diplomatSurfacesTheme: ThemeTokens = createTheme({
  name: "diplomat-surfaces",
  colors: {
    canvas: "#07100d",
    surface: "#0c1713",
    surfaceRaised: "#10211b",
    surfaceMuted: "#0a1411",
    text: "#eef8f3",
    textMuted: "#85a097",
    accent: "#35d8a0",
    accentContrast: "#06100c",
    info: "#45b9e9",
    success: "#83dfb8",
    warning: "#e4c36e",
    danger: "#ed8d94",
    connector: "#35d8a0",
    border: "#214a3c",
    chart1: "#35d8a0",
    chart2: "#45b9e9",
    chart3: "#83dfb8",
    chart4: "#e4c36e",
    chart5: "#d996c8",
    chart6: "#8ca8f4",
    chartPositive: "#83dfb8",
    chartNegative: "#ed8d94",
    chartNeutral: "#85a097",
  },
  radii: { sm: 7, md: 13, lg: 20 },
  typography: {
    display: {
      family: '"Geist Mono", ui-monospace, monospace',
      size: 38,
      lineHeight: 44,
      weight: 700,
      letterSpacing: -1.8,
    },
    title: {
      family: '"Geist Mono", ui-monospace, monospace',
      size: 24,
      lineHeight: 30,
      weight: 680,
      letterSpacing: -0.7,
    },
    bodyStrong: {
      family: '"Geist Mono", ui-monospace, monospace',
      size: 17,
      lineHeight: 23,
      weight: 650,
    },
    body: {
      family: '"Geist Mono", ui-monospace, monospace',
      size: 14,
      lineHeight: 21,
      weight: 450,
    },
    caption: {
      family: '"Geist Mono", ui-monospace, monospace',
      size: 12,
      lineHeight: 18,
      weight: 450,
    },
    label: {
      family: '"Geist Mono", ui-monospace, monospace',
      size: 11,
      lineHeight: 15,
      weight: 650,
      letterSpacing: 1.2,
    },
    code: {
      family: '"Geist Mono", ui-monospace, monospace',
      size: 13,
      lineHeight: 18,
      weight: 550,
    },
  },
  motion: { fast: 150, normal: 320, slow: 680, easing: arrive },
  strokes: { hairline: 1, thin: 1.25, regular: 1.7, bold: 2.5 },
  ornament: { grid: "none", surface: "outlined", lineCap: "round", eyebrow: true },
  materials: {
    flat: {
      fill: linearGradient(
        [
          { at: 0, color: "surface" },
          { at: 1, color: "canvas" },
        ],
        { angle: 125 },
      ),
    },
    raised: {
      fill: linearGradient(
        [
          { at: 0, color: "surfaceRaised" },
          { at: 1, color: "surface" },
        ],
        { angle: 135 },
      ),
      stroke: "border",
      effects: [shadow({ color: "accent", opacity: 0.07, blur: 22, offset: [0, 9] })],
    },
    floating: {
      fill: "surfaceRaised",
      stroke: "accent",
      effects: [shadow({ color: "accent", opacity: 0.11, blur: 26, offset: [0, 10] })],
    },
    inset: { fill: "surfaceMuted", stroke: "border" },
  },
});

interface Surface {
  readonly eyebrow: string;
  readonly title: string;
  readonly motif: string;
  readonly tone: Paint;
  readonly contract: string;
}

const surfaces: readonly Surface[] = [
  {
    eyebrow: "WASM",
    title: "JavaScript / TypeScript",
    motif: "world",
    tone: "accent",
    contract: "WebAssembly module and typed package surface",
  },
  {
    eyebrow: "NANOBIND NATIVE MODULE",
    title: "Python",
    motif: "terminal",
    tone: "success",
    contract: "Native module with shared naming and conversions",
  },
  {
    eyebrow: "JNA",
    title: "Kotlin / JVM",
    motif: "cube",
    tone: "accent",
    contract: "JVM surface over the stable generated ABI",
  },
  {
    eyebrow: "FFI",
    title: "PHP",
    motif: "plug",
    tone: "success",
    contract: "FFI package generated from the same annotations",
  },
  {
    eyebrow: "STABLE ABI HEADERS",
    title: "C",
    motif: "file",
    tone: "accent",
    contract: "Portable headers and stable ABI naming",
  },
  {
    eyebrow: "TYPED C ABI WRAPPERS",
    title: "C++",
    motif: "layers",
    tone: "success",
    contract: "Typed wrappers over the generated C contracts",
  },
];

/** One annotated native core fans out into six generated surfaces plus a direct Rust API. */
export const diplomatSurfacesScene: SceneDefinition = figure(
  "diplomat-surfaces",
  {
    title: "One core, seven language surfaces",
    description:
      "Diplomat turns annotations on one Rust core into six generated language surfaces while Rust remains a direct native call.",
    background: "canvas",
    breakpoints: { wide: 1_400, compact: 660 },
    metadata: {
      family: "architecture",
      subject: "Diplomat generated language surfaces",
      source: "one annotated Rust core",
    },
    hold: 700,
  },
  (f) => {
    const heading = f.stack(
      [
        f.eyebrow("DIPLOMAT BINDING ARCHITECTURE", { tone: "accent" }),
        f.title("One definition. Seven native-feeling surfaces."),
        f.caption(
          "Annotate the core once; generated naming, bytes, and JSON contracts stay aligned everywhere.",
          { width: { wide: 820, compact: "fill" } },
        ),
      ],
      { id: "diagram-heading", gap: 5, width: "fill" },
    );

    const rustCore = f.card({
      id: "rust-core",
      eyebrow: "NATIVE SURFACE",
      title: "Rust core",
      body: "Schematics, fields, and simulation live here once.",
      motif: "rust",
      tone: "accent",
      width: { wide: 268, compact: "fill" },
      minHeight: { wide: 146, compact: 128 },
      frame: material("raised"),
      interactive: true,
      inspect: {
        role: "Source",
        title: "Rust core",
        summary: "The canonical implementation and native Rust API.",
        fields: [
          { label: "Ownership", value: "one definition" },
          { label: "Native path", value: "direct" },
        ],
      },
    });
    const annotations = f.card({
      id: "bridge-annotations",
      eyebrow: "SRC / BRIDGE",
      title: "Annotations",
      body: "Attributes mark what may cross the language boundary.",
      motif: "code",
      tone: "accent",
      width: { wide: 280, compact: "fill" },
      minHeight: { wide: 146, compact: 128 },
      frame: material("raised"),
      interactive: true,
      inspect: {
        role: "Boundary",
        title: "Bridge annotations",
        summary: "The compact source of truth for generated language contracts.",
      },
    });
    const diplomat = f.card({
      id: "diplomat-generator",
      eyebrow: "GENERATOR",
      title: "Diplomat",
      body: "Contracts become stable names, byte layouts, and JSON shapes.",
      motif: "bridge",
      tone: "info",
      width: { wide: 286, compact: "fill" },
      minHeight: { wide: 146, compact: 128 },
      frame: material("floating", { stroke: "info" }),
      interactive: true,
      inspect: {
        role: "Generator",
        title: "Diplomat",
        summary: "Generates the language-specific bindings from the annotated Rust boundary.",
        fields: [
          { label: "Naming", value: "generated" },
          { label: "Contracts", value: "bytes + JSON" },
        ],
      },
    });

    const pipeline = f.flow([rustCore, annotations, diplomat], {
      id: "definition-pipeline",
      width: { wide: 890, compact: "fill" },
      gap: { wide: 26, compact: 22, narrow: 18 },
      align: "stretch",
      padding: { wide: 0, compact: [0, 0, 0, 24] },
    });

    const surfaceCards = surfaces.map((surface, index) =>
      f.card({
        id: `surface-${index + 1}`,
        eyebrow: surface.eyebrow,
        title: surface.title,
        motif: surface.motif,
        tone: surface.tone,
        compact: true,
        minHeight: 74,
        frame: material("raised"),
        interactive: true,
        inspect: {
          role: "Generated surface",
          title: surface.title,
          summary: surface.contract,
          fields: [
            { label: "Transport", value: surface.eyebrow },
            { label: "Source", value: "src/bridge/*.rs" },
          ],
        },
      }),
    );
    const surfaceList = f.stack(surfaceCards, {
      id: "generated-surface-list",
      width: "fill",
      gap: 10,
    });
    const generated = f.stack(
      [
        f.row(
          [
            f.eyebrow("SIX GENERATED SURFACES", { tone: "success" }),
            f.pill("ONE CONTRACT", { tone: "accent" }),
          ],
          { id: "generated-label", justify: "between", align: "center", width: "fill" },
        ),
        surfaceList,
      ],
      {
        id: "generated-surfaces",
        width: { wide: 438, compact: "fill" },
        gap: 10,
        padding: { wide: 0, compact: [0, 0, 0, 24] },
      },
    );

    const main = f.flow([pipeline, generated], {
      id: "main-architecture",
      width: "fill",
      gap: { wide: 54, compact: 30, narrow: 24 },
      align: { wide: "center", compact: "stretch" },
    });

    const directRust = f.card({
      id: "direct-rust",
      eyebrow: "NATIVE CRATE · DIRECT",
      title: "Rust",
      motif: "rust",
      tone: "accent",
      compact: true,
      width: { wide: 438, compact: "fill" },
      frame: { ...material("inset", { stroke: "border" }), dash: "dashed" },
      interactive: true,
      inspect: {
        role: "Direct surface",
        title: "Rust",
        summary: "The native crate calls the core directly; no generated bridge is needed.",
        fields: [{ label: "Bridge", value: "none" }],
      },
    });
    const direct = f.stack([f.eyebrow("DIRECT, NO BRIDGE", { tone: "textMuted" }), directRust], {
      id: "direct-route",
      gap: 8,
      width: "fill",
      align: { wide: "end", compact: "stretch" },
      padding: { wide: 0, compact: [0, 0, 0, 24] },
    });

    const legend = f.legend(
      [
        { id: "one-definition", label: "one definition", swatch: "accent" },
        { id: "generated-naming", label: "generated naming", swatch: "info" },
        { id: "shared-contracts", label: "shared byte + JSON contracts", swatch: "success" },
      ],
      {
        id: "contract-legend",
        direction: { wide: "row", compact: "column" },
        gap: { wide: 22, compact: 7 },
      },
    );
    const summary = f.panel(
      [
        legend,
        f.row(
          [
            f.stack(
              [
                f.eyebrow("ONE DEFINITION, SEVEN SURFACES", { tone: "textMuted" }),
                f.caption(
                  "Diplomat preserves the contract; each generated package makes it idiomatic.",
                ),
              ],
              { gap: 3, grow: 1 },
            ),
            f.code("src/bridge/*.rs", { tone: "accent", hidden: { narrow: true } }),
          ],
          {
            id: "summary-copy",
            width: "fill",
            align: "end",
            justify: "between",
            gap: 18,
          },
        ),
      ],
      {
        id: "architecture-summary",
        width: "fill",
        gap: 10,
        frame: { ...material("inset"), dash: "dashed" },
      },
    );

    const root = f.stack([heading, main, direct, summary], {
      id: "diplomat-canvas",
      width: "fill",
      gap: { wide: 24, compact: 22, narrow: 18 },
      padding: { wide: [34, 40], compact: [28, 26], narrow: [24, 20] },
      frame: material("flat"),
    });
    f.root(root);

    const sourceToAnnotations = f.connect(
      { node: rustCore, side: { wide: "right", compact: "left" } },
      { node: annotations, side: { wide: "left", compact: "left" } },
      {
        id: "core-to-annotations",
        route: "orthogonal",
        head: "arrow",
        width: 2.2,
        tone: "accent",
        description: "The Rust core exposes an annotated language boundary.",
      },
    );
    const annotationsToDiplomat = f.connect(
      { node: annotations, side: { wide: "right", compact: "left" } },
      { node: diplomat, side: { wide: "left", compact: "left" } },
      {
        id: "annotations-to-diplomat",
        route: "orthogonal",
        head: "arrow",
        width: 2.2,
        tone: "info",
        description: "Diplomat reads the bridge annotations and generates contracts.",
      },
    );
    const fanout = surfaceCards.map((surface, index) =>
      f.connect(
        {
          node: diplomat,
          side: { wide: "right", compact: "bottom" },
          offset: { compact: 0.5 },
        },
        {
          node: surface,
          side: { wide: "left", compact: "top" },
          offset: { compact: 0.5 },
        },
        {
          id: `diplomat-to-surface-${index + 1}`,
          route: "curve",
          head: "arrow",
          width: 1.8,
          tone: index % 2 === 0 ? "accent" : "success",
          curvature: 0.32,
          packets: { count: 1, size: 3.5, period: 2100 + index * 110, tone: "accent" },
          hidden: { compact: true },
          description: `Diplomat generates the ${surfaces[index]?.title ?? "language"} surface.`,
        },
      ),
    );
    const compactFanout = f.connect(
      { node: diplomat, side: "bottom", offset: 0.5 },
      { node: surfaceList, side: "top", offset: 0.5 },
      {
        id: "diplomat-to-generated-surfaces",
        route: "straight",
        head: "arrow",
        width: 2.2,
        tone: "accent",
        hidden: { wide: true, compact: false },
        packets: { count: 2, size: 3.5, period: 2_100, tone: "accent" },
        description: "Diplomat generates the six language surfaces shown below.",
      },
    );
    const directEdge = f.connect(
      { node: rustCore, side: { wide: "bottom", compact: "left" } },
      { node: directRust, side: { wide: "left", compact: "left" } },
      {
        id: "core-to-direct-rust",
        route: "orthogonal",
        head: "arrow",
        stroke: "dashed",
        width: 1.8,
        tone: "accent",
        labels: [
          {
            text: "direct call · no bridge",
            placement: "middle",
            tone: "textMuted",
            hidden: { compact: true },
          },
        ],
        description: "Rust callers use the native crate directly without a generated bridge.",
      },
    );

    f.sequence(
      [
        f.reveal(heading, { duration: 420, offset: 8, easing: arrive }),
        f.reveal(rustCore, { duration: 430, scale: 0.98, easing: arrive }),
        f.draw(sourceToAnnotations, { duration: 260 }),
        f.reveal(annotations, { duration: 380, scale: 0.98, easing: arrive }),
        f.draw(annotationsToDiplomat, { duration: 260 }),
        f.reveal(diplomat, { duration: 400, scale: 0.98, easing: arrive }),
        [
          f.draw(fanout, { duration: 460, stagger: 55 }),
          f.draw(compactFanout, { duration: 460 }),
          f.reveal(surfaceCards, { duration: 390, stagger: 85, scale: 0.98, easing: arrive }),
        ],
        [f.draw(directEdge, { duration: 520 }), f.reveal(direct, { duration: 420 })],
        f.reveal(summary, { duration: 430, offset: 8, easing: arrive }),
      ],
      { gap: 50 },
    );
    f.at(2_900, f.flow([...fanout, compactFanout], { duration: 1_300 }));
  },
);

export const diplomatSurfacesEntry: CatalogueEntry = {
  slug: "diplomat-surfaces",
  order: 2,
  title: "Generated language surfaces",
  summary: "One annotated Rust core fans out into six generated bindings and one direct API.",
  concept: "A responsive architecture figure with a dense, routed one-to-many relationship.",
  interaction: "Inspect any stage or surface to read its role and generated contract.",
  animation:
    "The definition flows through annotations and Diplomat before the six surfaces fan out.",
  source: "Rebuilt from a prior Kineglyph architecture illustration.",
  scene: diplomatSurfacesScene,
};
