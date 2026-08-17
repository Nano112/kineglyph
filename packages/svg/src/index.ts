import { mixColor, type ResolvedScene } from "@kineglyph/core";
import { motifShapes, type MotifShape } from "./motifs.js";

export { MOTIFS, MOTIF_NAMES, motifShapes, type MotifShape } from "./motifs.js";

type UnknownRecord = Record<string, unknown>;

export interface SvgRenderOptions {
  /** Stable prefix used for every generated DOM id. */
  idPrefix?: string;
  /** Overrides the scene's accessible name. */
  title?: string;
  /** Overrides the scene's accessible description. */
  description?: string;
  /** Extra class placed on the root element. */
  className?: string;
  /** Root role. Defaults to `img`, or `group` for interactive scenes. */
  role?: string;
  /** Include the SVG namespace. Defaults to true. */
  includeXmlns?: boolean;
  /** Decimal places retained for numeric attributes. Defaults to 3. */
  precision?: number;
  /** Paint the scene background as a rect. Defaults to `auto` (only when the scene declares one). */
  background?: "auto" | "none";
  /** Emit browser-only CSS motion for flow strokes. Defaults to true. */
  animateFlow?: boolean;
  /** Enable live-browser enhancements such as backdrop filtering. Portable filters stay enabled. */
  effects?: "portable" | "enhanced";
}

export type EdgeMarkerKind = "none" | "arrow" | "triangle" | "dot" | "diamond" | "bar";
export type EdgeDashKind = "solid" | "dashed" | "dotted" | "flow";

/** Render a resolved Kineglyph scene without DOM or browser dependencies. */
export function renderSvg(scene: ResolvedScene, options: SvgRenderOptions = {}): string {
  const source = scene as unknown as UnknownRecord;
  const precision = integerBetween(options.precision, 0, 12, 3);
  const width = positiveNumber(source.width, 640);
  const height = positiveNumber(source.height, 360);
  const nodes = records(source.nodes);
  const edges = records(source.edges);
  const theme = record(source.theme);
  const accent = firstString(theme.accent, record(record(theme.tokens).colors).accent) ?? "#2563eb";
  const sceneId = string(source.id) ?? "scene";
  const rootId = domId(options.idPrefix ?? `kineglyph-${sceneId}`);
  const structured = string(source.root) !== undefined;
  const title =
    options.title ?? firstString(source.label, source.title, record(source.accessibility).label);
  const description =
    options.description ??
    firstString(source.description, record(source.accessibility).description);
  const interactive = nodes.some(isInteractive);
  // Name and description are separate relationships. Folding the `<desc>` into `aria-labelledby`
  // made the accessible *name* the title and the description run together, and left the
  // description empty — so a screen reader read the whole paragraph as the figure's label and had
  // nothing left to offer on request.
  const labelledBy = title === undefined ? undefined : `${rootId}-title`;
  const describedBy = description === undefined ? undefined : `${rootId}-description`;
  const background = string(source.background);
  const palette = buildPalette(theme);
  const rootAttrs: Attrs = [
    ["xmlns", options.includeXmlns === false ? undefined : "http://www.w3.org/2000/svg"],
    ["id", rootId],
    ["class", classes("kg-scene", options.className)],
    ["viewBox", `0 0 ${number(width, precision)} ${number(height, precision)}`],
    ["preserveAspectRatio", "xMidYMid meet"],
    ["width", number(width, precision)],
    ["height", number(height, precision)],
    ["role", options.role ?? (interactive ? "group" : "img")],
    ["aria-labelledby", labelledBy],
    ["aria-describedby", describedBy],
    ["aria-label", labelledBy === undefined ? "Kineglyph scene" : undefined],
    ["data-kineglyph-scene", sceneId],
    ["data-layout", firstString(source.layoutName, source.layout)],
    ["style", palette.rootStyle],
  ];

  const context: RenderContext = {
    rootId,
    precision,
    accent,
    background: background ?? firstString(theme.background) ?? "transparent",
    markers: new Map(),
    animateFlow: options.animateFlow !== false,
    structured,
    nodesById: new Map(nodes.map((node, index) => [nodeId(node, index), node])),
    enhancedEffects: options.effects === "enhanced",
  };

  const belowEdges = edges.filter((edge) => finiteNumber(edge.z, 0) <= 0);
  const aboveEdges = edges.filter((edge) => finiteNumber(edge.z, 0) > 0);
  const edgeLayer = (list: UnknownRecord[], className: string): string =>
    list.length === 0
      ? ""
      : element(
          "g",
          [["class", className]],
          list.map((edge, index) => renderEdge(edge, index, context)).join(""),
        );
  const nodeLayer = structured
    ? element("g", [["class", "kg-nodes"]], renderStructuredNodes(nodes, context))
    : element(
        "g",
        [["class", "kg-nodes"]],
        nodes.map((node, index) => renderLegacyNode(node, index, rootId, precision)).join(""),
      );
  const below = edgeLayer(belowEdges, "kg-edges");
  const above = edgeLayer(aboveEdges, "kg-edges kg-edges--above");
  const canvas =
    options.background === "none" || background === undefined || background === "transparent"
      ? ""
      : element(
          "rect",
          [
            ["class", "kg-canvas"],
            ["x", "0"],
            ["y", "0"],
            ["width", number(width, precision)],
            ["height", number(height, precision)],
            ["fill", background],
            ["aria-hidden", "true"],
          ],
          "",
        );

  const body = [
    title && element("title", [["id", `${rootId}-title`]], escapeXml(title)),
    description && element("desc", [["id", `${rootId}-description`]], escapeXml(description)),
    renderDefinitions(context, edges),
    element("style", [], BASE_STYLES),
    canvas,
    below,
    nodeLayer,
    above,
  ]
    .filter(Boolean)
    .join("");

  return tokenise(element("svg", rootAttrs, body), palette);
}

/** Alias matching server-renderer naming conventions. */
export const renderToSvg = renderSvg;

interface RenderContext {
  readonly rootId: string;
  readonly precision: number;
  readonly accent: string;
  readonly background: string;
  readonly markers: Map<string, string>;
  readonly animateFlow: boolean;
  readonly structured: boolean;
  readonly nodesById: Map<string, UnknownRecord>;
  readonly enhancedEffects: boolean;
}

// ---------------------------------------------------------------------------------------------
// Markers and definitions
// ---------------------------------------------------------------------------------------------

/** Deterministic marker id for a root, marker kind, and colour. */
export function markerId(rootId: string, kind: EdgeMarkerKind, color: string): string {
  return `${rootId}-m-${kind}-${colorKey(color)}`;
}

function colorKey(color: string): string {
  const key = color
    .trim()
    .toLowerCase()
    .replace(/^#/, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return key || "default";
}

/** Marker definition markup; the same function serves the renderer and the live runtime. */
export function renderMarkerDefinition(
  rootId: string,
  kind: EdgeMarkerKind,
  color: string,
): string {
  if (kind === "none") return "";
  const id = markerId(rootId, kind, color);
  const common: Attrs = [
    ["id", id],
    ["class", `kg-marker kg-marker--${kind}`],
    ["viewBox", "0 0 10 10"],
    ["orient", "auto-start-reverse"],
    ["markerUnits", "strokeWidth"],
    ["data-marker-kind", kind],
  ];
  switch (kind) {
    case "arrow":
      return element(
        "marker",
        [...common, ["refX", "8.5"], ["refY", "5"], ["markerWidth", "7"], ["markerHeight", "7"]],
        element(
          "path",
          [
            ["d", "M 1.5 1.5 L 8.5 5 L 1.5 8.5"],
            ["fill", "none"],
            ["stroke", color],
            ["stroke-width", "1.7"],
            ["stroke-linecap", "round"],
            ["stroke-linejoin", "round"],
          ],
          "",
        ),
      );
    case "triangle":
      return element(
        "marker",
        [...common, ["refX", "9"], ["refY", "5"], ["markerWidth", "6"], ["markerHeight", "6"]],
        element(
          "path",
          [
            ["d", "M 0.5 0.5 L 9.5 5 L 0.5 9.5 z"],
            ["fill", color],
            ["stroke", "none"],
          ],
          "",
        ),
      );
    case "dot":
      return element(
        "marker",
        [...common, ["refX", "5"], ["refY", "5"], ["markerWidth", "5"], ["markerHeight", "5"]],
        element(
          "circle",
          [
            ["cx", "5"],
            ["cy", "5"],
            ["r", "3.4"],
            ["fill", color],
            ["stroke", "none"],
          ],
          "",
        ),
      );
    case "diamond":
      return element(
        "marker",
        [...common, ["refX", "9"], ["refY", "5"], ["markerWidth", "7"], ["markerHeight", "7"]],
        element(
          "path",
          [
            ["d", "M 5 0.8 L 9.2 5 L 5 9.2 L 0.8 5 z"],
            ["fill", color],
            ["stroke", "none"],
          ],
          "",
        ),
      );
    case "bar":
      return element(
        "marker",
        [...common, ["refX", "5"], ["refY", "5"], ["markerWidth", "5"], ["markerHeight", "5"]],
        element(
          "path",
          [
            ["d", "M 5 0.5 L 5 9.5"],
            ["fill", "none"],
            ["stroke", color],
            ["stroke-width", "1.8"],
            ["stroke-linecap", "butt"],
          ],
          "",
        ),
      );
  }
}

function renderDefinitions(context: RenderContext, edges: UnknownRecord[]): string {
  const parts: string[] = [];
  for (const edge of edges) {
    const paint = edgePaint(edge, context.accent);
    const head = markerKind(
      edge.head,
      edge.directed !== false && edge.markerEnd !== false && edge.arrow !== false
        ? "arrow"
        : "none",
    );
    const tail = markerKind(edge.tail, "none");
    for (const kind of [head, tail]) {
      if (kind === "none") continue;
      const id = markerId(context.rootId, kind, paint.stroke);
      if (!context.markers.has(id))
        context.markers.set(id, renderMarkerDefinition(context.rootId, kind, paint.stroke));
    }
  }
  parts.push(
    ...[...context.markers.entries()]
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([, markup]) => markup),
  );
  const gradients = [...context.nodesById.entries()]
    .map(([id, node]) => renderGradientDefinition(id, record(node.appearance).fill, context))
    .filter((value) => value.length > 0)
    .sort();
  parts.push(...gradients);
  const materials = [...context.nodesById.entries()]
    .map(([id, node]) => renderMaterialFilterDefinition(id, record(node.appearance), context))
    .filter((value) => value.length > 0)
    .sort();
  parts.push(...materials);
  return parts.length === 0 ? "" : element("defs", [], parts.join(""));
}

function gradientId(rootId: string, nodeId: string): string {
  return `${rootId}-paint-${domId(nodeId)}-fill`;
}

function gradientFill(value: unknown, nodeId: string, context: RenderContext): string {
  if (typeof value === "string") return value;
  const gradient = record(value);
  const type = string(gradient.type);
  return type === "linear-gradient" || type === "radial-gradient"
    ? `url(#${gradientId(context.rootId, nodeId)})`
    : "none";
}

function renderGradientDefinition(nodeId: string, value: unknown, context: RenderContext): string {
  const gradient = record(value);
  const type = string(gradient.type);
  if (type !== "linear-gradient" && type !== "radial-gradient") return "";
  const stops = records(gradient.stops)
    .map((stop) =>
      element(
        "stop",
        [
          ["offset", `${number(unit(firstNumber(stop.at), 0) * 100, context.precision)}%`],
          ["stop-color", string(stop.color) ?? context.accent],
          [
            "stop-opacity",
            unit(firstNumber(stop.opacity), 1) === 1
              ? undefined
              : number(unit(firstNumber(stop.opacity), 1), context.precision),
          ],
        ],
        "",
      ),
    )
    .join("");
  const common: Attrs = [
    ["id", gradientId(context.rootId, nodeId)],
    ["gradientUnits", "objectBoundingBox"],
    ["spreadMethod", string(gradient.spread) ?? "pad"],
    ["data-gradient-of", nodeId],
  ];
  if (type === "radial-gradient") {
    const center = Array.isArray(gradient.center) ? gradient.center : [];
    const focal = Array.isArray(gradient.focalPoint) ? gradient.focalPoint : [];
    return element(
      "radialGradient",
      [
        ...common,
        ["cx", number(unit(firstNumber(center[0]), 0.5), context.precision)],
        ["cy", number(unit(firstNumber(center[1]), 0.5), context.precision)],
        ["fx", number(unit(firstNumber(focal[0]), 0.5), context.precision)],
        ["fy", number(unit(firstNumber(focal[1]), 0.5), context.precision)],
        ["r", number(Math.max(0, finiteNumber(gradient.radius, 0.5)), context.precision)],
      ],
      stops,
    );
  }
  const radians = (finiteNumber(gradient.angle, 0) * Math.PI) / 180;
  const dx = Math.cos(radians);
  const dy = Math.sin(radians);
  const reach = 0.5 / Math.max(Math.abs(dx), Math.abs(dy), 1e-9);
  return element(
    "linearGradient",
    [
      ...common,
      ["x1", number(0.5 - dx * reach, context.precision)],
      ["y1", number(0.5 - dy * reach, context.precision)],
      ["x2", number(0.5 + dx * reach, context.precision)],
      ["y2", number(0.5 + dy * reach, context.precision)],
    ],
    stops,
  );
}

function materialFilterId(rootId: string, nodeId: string): string {
  return `${rootId}-material-${domId(nodeId)}`;
}

function expandedMaterialEffects(appearance: UnknownRecord): UnknownRecord[] {
  return records(appearance.effects).flatMap((effect) =>
    string(effect.type) === "shader" ? records(effect.fallback) : [effect],
  );
}

function renderMaterialFilterDefinition(
  nodeId: string,
  appearance: UnknownRecord,
  context: RenderContext,
): string {
  const effects = expandedMaterialEffects(appearance);
  const shaders = records(appearance.effects).filter((effect) => string(effect.type) === "shader");
  const portable = effects.filter((effect) => string(effect.type) !== "backdrop");
  if (portable.length === 0 && shaders.length === 0) return "";

  const parts: string[] = [];
  const shadows: string[] = [];
  let current = "SourceGraphic";
  let serial = 0;
  const next = (label: string): string => `${label}-${serial++}`;

  for (const effect of portable) {
    const type = string(effect.type);
    if (type === "shadow") {
      const result = next(string(effect.kind) === "inner" ? "inner-shadow" : "outer-shadow");
      const blur = Math.max(0, finiteNumber(effect.blur, 16)) / 2;
      const offset = Array.isArray(effect.offset) ? effect.offset : [];
      const dx = finiteNumber(offset[0], 0);
      const dy = finiteNumber(offset[1], 8);
      const color = string(effect.color) ?? "#000000";
      const opacity = unit(firstNumber(effect.opacity), 0.16);
      if (string(effect.kind) === "inner") {
        const blurred = next("inner-blur");
        const shifted = next("inner-offset");
        const cut = next("inner-cut");
        const flood = next("inner-color");
        parts.push(
          element(
            "feGaussianBlur",
            [
              ["in", "SourceAlpha"],
              ["stdDeviation", number(blur, context.precision)],
              ["result", blurred],
            ],
            "",
          ),
          element(
            "feOffset",
            [
              ["in", blurred],
              ["dx", number(dx, context.precision)],
              ["dy", number(dy, context.precision)],
              ["result", shifted],
            ],
            "",
          ),
          element(
            "feComposite",
            [
              ["in", "SourceAlpha"],
              ["in2", shifted],
              ["operator", "out"],
              ["result", cut],
            ],
            "",
          ),
          element(
            "feFlood",
            [
              ["flood-color", color],
              ["flood-opacity", number(opacity, context.precision)],
              ["result", flood],
            ],
            "",
          ),
          element(
            "feComposite",
            [
              ["in", flood],
              ["in2", cut],
              ["operator", "in"],
              ["result", result],
            ],
            "",
          ),
        );
        const combined = next("with-inner");
        parts.push(
          element(
            "feMerge",
            [["result", combined]],
            element("feMergeNode", [["in", current]], "") +
              element("feMergeNode", [["in", result]], ""),
          ),
        );
        current = combined;
      } else {
        const spread = finiteNumber(effect.spread, 0);
        const grown = next("shadow-spread");
        const blurred = next("shadow-blur");
        const shifted = next("shadow-offset");
        const flood = next("shadow-color");
        const shadowInput = Math.abs(spread) > 1e-6 ? grown : "SourceAlpha";
        if (Math.abs(spread) > 1e-6)
          parts.push(
            element(
              "feMorphology",
              [
                ["in", "SourceAlpha"],
                ["operator", spread > 0 ? "dilate" : "erode"],
                ["radius", number(Math.abs(spread), context.precision)],
                ["result", grown],
              ],
              "",
            ),
          );
        parts.push(
          element(
            "feGaussianBlur",
            [
              ["in", shadowInput],
              ["stdDeviation", number(blur, context.precision)],
              ["result", blurred],
            ],
            "",
          ),
          element(
            "feOffset",
            [
              ["in", blurred],
              ["dx", number(dx, context.precision)],
              ["dy", number(dy, context.precision)],
              ["result", shifted],
            ],
            "",
          ),
          element(
            "feFlood",
            [
              ["flood-color", color],
              ["flood-opacity", number(opacity, context.precision)],
              ["result", flood],
            ],
            "",
          ),
          element(
            "feComposite",
            [
              ["in", flood],
              ["in2", shifted],
              ["operator", "in"],
              ["result", result],
            ],
            "",
          ),
        );
        shadows.push(result);
      }
    } else if (type === "blur") {
      const result = next("blur");
      parts.push(
        element(
          "feGaussianBlur",
          [
            ["in", current],
            [
              "stdDeviation",
              number(Math.max(0, finiteNumber(effect.radius, 0)) / 2, context.precision),
            ],
            ["result", result],
          ],
          "",
        ),
      );
      current = result;
    } else if (type === "noise") {
      const turbulence = next("noise");
      const toned = next("noise-tone");
      const alpha = next("noise-alpha");
      const result = next("with-noise");
      const amount = unit(firstNumber(effect.amount), 0.03);
      const scale = Math.max(0.01, finiteNumber(effect.scale, 0.8));
      parts.push(
        element(
          "feTurbulence",
          [
            ["type", "fractalNoise"],
            ["baseFrequency", number(0.012 + scale * 0.018, context.precision)],
            ["numOctaves", "3"],
            ["seed", String(Math.round(finiteNumber(effect.seed, 1)))],
            ["result", turbulence],
          ],
          "",
        ),
      );
      const noiseInput = effect.monochrome === false ? turbulence : toned;
      if (effect.monochrome !== false)
        parts.push(
          element(
            "feColorMatrix",
            [
              ["in", turbulence],
              ["type", "saturate"],
              ["values", "0"],
              ["result", toned],
            ],
            "",
          ),
        );
      parts.push(
        element(
          "feComponentTransfer",
          [
            ["in", noiseInput],
            ["result", alpha],
          ],
          element(
            "feFuncA",
            [
              ["type", "linear"],
              ["slope", number(amount, context.precision)],
            ],
            "",
          ),
        ),
        element(
          "feBlend",
          [
            ["in", current],
            ["in2", alpha],
            ["mode", effect.monochrome === false ? "screen" : "soft-light"],
            ["result", result],
          ],
          "",
        ),
      );
      current = result;
    }
  }

  for (const shader of shaders) {
    if (string(shader.name) !== "liquid") continue;
    const turbulence = next("liquid-field");
    const result = next("liquid");
    const uniforms = record(shader.uniforms);
    parts.push(
      element(
        "feTurbulence",
        [
          ["type", "turbulence"],
          ["baseFrequency", number(finiteNumber(uniforms.frequency, 0.018), context.precision)],
          ["numOctaves", "2"],
          ["seed", String(Math.round(finiteNumber(uniforms.seed, 23)))],
          ["result", turbulence],
        ],
        "",
      ),
      element(
        "feDisplacementMap",
        [
          ["in", current],
          ["in2", turbulence],
          ["scale", number(finiteNumber(uniforms.strength, 5), context.precision)],
          ["xChannelSelector", "R"],
          ["yChannelSelector", "G"],
          ["result", result],
        ],
        "",
      ),
    );
    current = result;
  }

  if (shadows.length > 0) {
    const result = next("material-output");
    parts.push(
      element(
        "feMerge",
        [["result", result]],
        shadows.map((shadow) => element("feMergeNode", [["in", shadow]], "")).join("") +
          element("feMergeNode", [["in", current]], ""),
      ),
    );
  }
  return element(
    "filter",
    [
      ["id", materialFilterId(context.rootId, nodeId)],
      ["x", "-50%"],
      ["y", "-50%"],
      ["width", "200%"],
      ["height", "200%"],
      ["color-interpolation-filters", "sRGB"],
      ["data-material-filter-of", nodeId],
    ],
    parts.join(""),
  );
}

function materialPaintAttrs(
  appearance: UnknownRecord,
  ownerId: string,
  context: RenderContext,
): Attrs {
  const effects = records(appearance.effects);
  if (effects.length === 0 && string(appearance.blendMode) === undefined) return [];
  const expanded = expandedMaterialEffects(appearance);
  const portable = expanded.some((effect) => string(effect.type) !== "backdrop");
  const shaderNames = effects
    .filter((effect) => string(effect.type) === "shader")
    .map((effect) => string(effect.name))
    .filter((name): name is string => name !== undefined);
  const shaderEffect = effects.find((effect) => string(effect.type) === "shader");
  const backdropEffect = expanded.find((effect) => string(effect.type) === "backdrop");
  const styles: string[] = [];
  const blendMode = string(appearance.blendMode);
  if (blendMode !== undefined && blendMode !== "normal") styles.push(`mix-blend-mode:${blendMode}`);
  if (context.enhancedEffects && backdropEffect !== undefined) {
    const blur = Math.max(0, finiteNumber(backdropEffect.blur, 16));
    const saturation = Math.max(0, finiteNumber(backdropEffect.saturation, 1));
    const brightness = Math.max(0, finiteNumber(backdropEffect.brightness, 1));
    const filter = `blur(${number(blur, context.precision)}px) saturate(${number(saturation, context.precision)}) brightness(${number(brightness, context.precision)})`;
    styles.push(`backdrop-filter:${filter}`, `-webkit-backdrop-filter:${filter}`);
  }
  return [
    [
      "filter",
      portable || shaderNames.includes("liquid")
        ? `url(#${materialFilterId(context.rootId, ownerId)})`
        : undefined,
    ],
    ["style", styles.length === 0 ? undefined : styles.join(";")],
    [
      "data-material-effects",
      effects
        .map((effect) => string(effect.type))
        .filter(Boolean)
        .join(" "),
    ],
    ["data-shader", shaderNames.length === 0 ? undefined : shaderNames.join(" ")],
    [
      "data-shader-uniforms",
      shaderEffect === undefined ? undefined : JSON.stringify(record(shaderEffect.uniforms)),
    ],
  ];
}

function markerKind(value: unknown, fallback: EdgeMarkerKind): EdgeMarkerKind {
  return value === "none" ||
    value === "arrow" ||
    value === "triangle" ||
    value === "dot" ||
    value === "diamond" ||
    value === "bar"
    ? value
    : fallback;
}

// ---------------------------------------------------------------------------------------------
// Edges
// ---------------------------------------------------------------------------------------------

interface EdgePaint {
  readonly stroke: string;
  readonly strokeWidth: number;
  readonly highlight: number;
}

/** Highlighted stroke colour and width for an edge or node outline. */
export function highlightStroke(
  base: string,
  accent: string,
  highlight: number,
  width: number,
): { stroke: string; strokeWidth: number } {
  const amount = Math.max(0, Math.min(1, highlight));
  if (amount <= 0) return { stroke: base, strokeWidth: width };
  return { stroke: mixColor(base, accent, amount * 0.85), strokeWidth: width + amount * 1.5 };
}

function edgePaint(edge: UnknownRecord, accent: string): EdgePaint {
  const appearance = mergeRecords(record(edge.style), record(edge.appearance));
  const state = record(edge.state);
  const baseStroke = firstString(appearance.stroke, edge.color) ?? "#64748b";
  const baseWidth = finiteNumber(appearance.strokeWidth, 2);
  const highlight = unit(firstNumber(state.highlight), 0);
  const highlighted = highlightStroke(baseStroke, accent, highlight, baseWidth);
  return { stroke: highlighted.stroke, strokeWidth: highlighted.strokeWidth, highlight };
}

export interface EdgeDashResult {
  readonly dasharray: string | undefined;
  readonly pathLength: string | undefined;
  readonly linecap: "round" | "butt" | undefined;
}

/**
 * Deterministic dash pattern for a stroke style, width, path length, and reveal progress.
 * Non-solid styles keep their pattern while revealing by normalising to `pathLength="1"`.
 */
export function edgeDashArray(
  dash: EdgeDashKind,
  width: number,
  length: number,
  progress: number,
  precision = 3,
): EdgeDashResult {
  const p = Math.max(0, Math.min(1, progress));
  const w = Math.max(0.5, width);
  if (dash === "solid") {
    return p < 1
      ? { dasharray: `${number(p, precision)} 1`, pathLength: "1", linecap: undefined }
      : { dasharray: undefined, pathLength: undefined, linecap: undefined };
  }
  const dashLength = dash === "dotted" ? 0.01 : Math.max(5, w * 3);
  const gapLength = dash === "dotted" ? Math.max(4, w * 2.4) : Math.max(4, w * 2.2);
  const linecap = dash === "dotted" ? "round" : undefined;
  if (p >= 1)
    return {
      dasharray: `${number(dashLength, precision)} ${number(gapLength, precision)}`,
      pathLength: undefined,
      linecap,
    };
  const total = Math.max(1, length);
  const d = dashLength / total;
  const g = gapLength / total;
  const pattern: number[] = [];
  let covered = 0;
  let guard = 0;
  while (covered < p && guard < 400) {
    guard += 1;
    const dashPart = Math.min(d, p - covered);
    pattern.push(dashPart);
    covered += dashPart;
    if (covered >= p) break;
    const gapPart = Math.min(g, p - covered);
    pattern.push(gapPart);
    covered += gapPart;
  }
  if (pattern.length % 2 === 1) pattern.push(1);
  else pattern.push(0, 1);
  return {
    dasharray: pattern.map((value) => number(value, precision)).join(" "),
    pathLength: "1",
    linecap,
  };
}

/**
 * Dash/reveal attributes for a node path (polylines, custom paths): solid strokes reveal with a
 * normalised dasharray, dashed/dotted strokes keep their pattern while revealing.
 */
export function pathDashAttrs(
  dash: EdgeDashKind,
  strokeWidth: number,
  length: number,
  progress: number,
  precision = 3,
): EdgeDashResult {
  return edgeDashArray(dash, Math.max(0.5, strokeWidth), length, progress, precision);
}

function renderEdge(edge: UnknownRecord, index: number, context: RenderContext): string {
  const { rootId, precision } = context;
  const id = string(edge.id) ?? `edge-${index + 1}`;
  const from = string(edge.from) ?? string(record(edge.source).id);
  const to = string(edge.to) ?? string(record(edge.target).id);
  const start = edgePoint(
    edge,
    "start",
    from === undefined ? undefined : context.nodesById.get(from),
  );
  const end = edgePoint(edge, "end", to === undefined ? undefined : context.nodesById.get(to));
  const d =
    firstString(edge.path, record(edge.path).d, edge.d) ??
    `M ${number(start.x, precision)} ${number(start.y, precision)} L ${number(end.x, precision)} ${number(end.y, precision)}`;
  const appearance = mergeRecords(record(edge.style), record(edge.appearance));
  const state = record(edge.state);
  const progress = unit(firstNumber(edge.progress, state.progress), 1);
  const opacity = unit(firstNumber(edge.opacity, state.opacity, appearance.opacity), 1);
  const hidden = edge.hidden === true;
  const paint = edgePaint(edge, context.accent);
  const head = markerKind(
    edge.head,
    edge.directed !== false && edge.markerEnd !== false && edge.arrow !== false ? "arrow" : "none",
  );
  const tail = markerKind(edge.tail, "none");
  const dashKind: EdgeDashKind =
    edge.dash === "dashed" || edge.dash === "dotted" || edge.dash === "flow" ? edge.dash : "solid";
  const length = finiteNumber(edge.length, Math.hypot(end.x - start.x, end.y - start.y));
  const dash = edgeDashArray(dashKind, paint.strokeWidth, length, progress, precision);
  const description = string(edge.description);
  const label = firstString(edge.label, edge.title);
  const labels = records(edge.labels);
  const packets = records(edge.packets);
  const flow = unit(firstNumber(state.flow), packets.length > 0 ? 1 : 0);
  const pathAttrs: Attrs = [
    ["id", `${rootId}-${domId(id)}`],
    [
      "class",
      classes(
        "kg-edge",
        `kg-edge--${dashKind}`,
        dashKind === "flow" && progress >= 1 && "kg-edge--flowing",
        string(edge.className),
      ),
    ],
    ["d", d],
    ["fill", "none"],
    ["stroke", paint.stroke],
    ["stroke-width", number(paint.strokeWidth, precision)],
    [
      "stroke-linecap",
      dash.linecap ?? firstString(appearance.strokeLinecap, appearance.linecap) ?? "round",
    ],
    ["stroke-linejoin", "round"],
    ["opacity", opacity === 1 ? undefined : number(opacity, precision)],
    ["pathLength", dash.pathLength],
    ["stroke-dasharray", dash.dasharray],
    [
      "marker-end",
      head !== "none" && progress >= 1
        ? `url(#${markerId(rootId, head, paint.stroke)})`
        : undefined,
    ],
    [
      "marker-start",
      tail !== "none" && progress > 0 ? `url(#${markerId(rootId, tail, paint.stroke)})` : undefined,
    ],
    ["data-edge-id", id],
    ["data-kineglyph-edge", id],
    ["data-from", from],
    ["data-to", to],
    ["data-progress", number(progress, precision)],
    ["data-length", number(length, precision)],
    ["data-dash", dashKind],
    ["data-head", head],
    ["data-tail", tail],
    ["data-base-stroke", firstString(appearance.stroke, edge.color)],
    ["data-base-width", numeric(appearance.strokeWidth, precision)],
    ["data-highlight", paint.highlight > 0 ? number(paint.highlight, precision) : undefined],
  ];
  const path = element("path", pathAttrs, "");
  const parts: string[] = [];
  if (description !== undefined || label !== undefined || labels.length > 0) {
    parts.push(
      element(
        "path",
        [
          ["class", "kg-edge-hit"],
          ["d", d],
          ["fill", "none"],
          ["stroke", "transparent"],
          ["stroke-width", number(Math.max(14, paint.strokeWidth + 10), precision)],
          ["pointer-events", "stroke"],
          ["data-edge-hit", id],
        ],
        "",
      ),
    );
  }
  parts.push(path);
  if (labels.length > 0) {
    for (const item of labels) {
      if (item.hidden === true) continue;
      const text = string(item.text) ?? "";
      const x = finiteNumber(item.x, (start.x + end.x) / 2);
      const y = finiteNumber(item.y, (start.y + end.y) / 2);
      const w = finiteNumber(item.width, 0);
      const h = finiteNumber(item.height, 0);
      const fontSize = finiteNumber(item.fontSize, 12);
      parts.push(
        element(
          "g",
          [
            ["class", "kg-edge-label"],
            ["data-edge-label", string(item.id)],
            ["opacity", opacity === 1 ? undefined : number(opacity, precision)],
          ],
          element(
            "rect",
            [
              ["class", "kg-edge-label-halo"],
              ["x", number(x - w / 2, precision)],
              ["y", number(y - h / 2, precision)],
              ["width", number(w, precision)],
              ["height", number(h, precision)],
              ["rx", number(Math.min(6, h / 2), precision)],
              ["fill", context.background === "transparent" ? "none" : context.background],
              ["fill-opacity", "0.9"],
            ],
            "",
          ) +
            element(
              "text",
              [
                ["class", "kg-edge-label-text"],
                ["x", number(x, precision)],
                ["y", number(y + fontSize * 0.35, precision)],
                ["text-anchor", "middle"],
                ["font-family", string(item.fontFamily)],
                ["font-size", number(fontSize, precision)],
                ["font-weight", numeric(item.fontWeight, precision)],
                ["fill", string(item.color)],
                ["textLength", number(Math.max(0.1, w - 10), precision)],
                ["lengthAdjust", "spacingAndGlyphs"],
              ],
              escapeXml(text),
            ),
        ),
      );
    }
  } else if (label !== undefined) {
    const midpoint = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
    parts.push(
      element(
        "text",
        [
          ["class", "kg-edge-label"],
          ["x", number(midpoint.x, precision)],
          ["y", number(midpoint.y, precision)],
          ["text-anchor", "middle"],
          ["dominant-baseline", "central"],
        ],
        escapeXml(label),
      ),
    );
  }
  if (packets.length > 0) {
    const size = finiteNumber(edge.packetSize, Math.max(3, paint.strokeWidth * 1.6));
    const color = string(edge.packetColor) ?? paint.stroke;
    packets.forEach((packet, packetIndex) => {
      parts.push(
        element(
          "circle",
          [
            ["class", "kg-edge-packet"],
            ["cx", number(finiteNumber(packet.x, start.x), precision)],
            ["cy", number(finiteNumber(packet.y, start.y), precision)],
            ["r", number(size, precision)],
            ["fill", color],
            ["stroke", context.background === "transparent" ? undefined : context.background],
            ["stroke-width", context.background === "transparent" ? undefined : "1"],
            ["opacity", number(flow * opacity, precision)],
            ["data-edge-packet", id],
            ["data-packet-index", String(packetIndex)],
          ],
          "",
        ),
      );
    });
  }
  const groupAttrs: Attrs = [
    ["class", classes("kg-edge-group", paint.highlight > 0 && "kg-edge-group--highlight")],
    ["data-edge-group", id],
    ["role", description !== undefined ? "img" : undefined],
    ["aria-label", description],
    ["aria-hidden", description === undefined ? "true" : undefined],
    ["display", hidden ? "none" : undefined],
    ["data-hidden", hidden ? "true" : undefined],
  ];
  return element("g", groupAttrs, parts.join(""));
}

// ---------------------------------------------------------------------------------------------
// Structured nodes (general scene schema)
// ---------------------------------------------------------------------------------------------

function renderStructuredNodes(nodes: UnknownRecord[], context: RenderContext): string {
  const children = new Map<string | undefined, Array<{ node: UnknownRecord; index: number }>>();
  nodes.forEach((node, index) => {
    const parent = string(node.parent);
    const list = children.get(parent) ?? [];
    list.push({ node, index });
    children.set(parent, list);
  });
  const ordered = (parent: string | undefined): UnknownRecord[] =>
    (children.get(parent) ?? [])
      .slice()
      .sort((a, b) => finiteNumber(a.node.z, 0) - finiteNumber(b.node.z, 0) || a.index - b.index)
      .map((entry) => entry.node);
  const known = new Set(nodes.map((node, index) => nodeId(node, index)));
  const roots = nodes.filter((node) => {
    const parent = string(node.parent);
    return parent === undefined || !known.has(parent);
  });
  const rootIds = new Set(roots.map((node, index) => nodeId(node, index)));
  const render = (node: UnknownRecord, insideFocusGroup: boolean): string => {
    const nested = insideFocusGroup || node.focusGroup === true;
    return renderStructuredNode(
      node,
      ordered(nodeId(node, 0))
        .map((child) => render(child, nested))
        .join(""),
      context,
      insideFocusGroup,
    );
  };
  return ordered(undefined)
    .filter((node) => rootIds.has(nodeId(node, 0)))
    .map((node) => render(node, false))
    .join("");
}

function renderStructuredNode(
  node: UnknownRecord,
  childrenMarkup: string,
  context: RenderContext,
  insideFocusGroup = false,
): string {
  const { rootId, precision } = context;
  const id = nodeId(node, 0);
  const groupId = `${rootId}-node-${domId(id)}`;
  const kind = nodeKind(node);
  const label = firstString(node.label);
  const description = firstString(node.description);
  const interactive = isInteractive(node);
  const focusGroup = node.focusGroup === true;
  const focusable = (boolean(node.focusable) ?? interactive) || focusGroup;
  const state = record(node.state);
  const appearance = record(node.appearance);
  const opacity = unit(firstNumber(state.opacity), 1);
  const progress = unit(firstNumber(state.progress), 1);
  const highlight = unit(firstNumber(state.highlight), 0);
  const translateX = finiteNumber(state.translateX, 0);
  const translateY = finiteNumber(state.translateY, 0);
  const scale = Math.max(0, finiteNumber(state.scale, 1));
  const geometry = nodeGeometry(node);
  const hidden = node.hidden === true;
  const transforms = nodeTransform(geometry, translateX, translateY, scale, precision);
  const revealX = unit(firstNumber(state.revealX), 1);
  const revealY = unit(firstNumber(state.revealY), 1);
  const revealAnchor = string(node.revealAnchor);
  const revealable =
    revealAnchor !== undefined || state.revealX !== undefined || state.revealY !== undefined;
  const meaningful =
    interactive ||
    (label !== undefined &&
      label.length > 0 &&
      kind !== "text" &&
      kind !== "badge" &&
      kind !== "callout");
  const labelledBy = meaningful
    ? [label && `${groupId}-title`, description && `${groupId}-description`]
        .filter(Boolean)
        .join(" ")
    : "";
  const metadata = record(node.metadata);
  const clipId = `${groupId}-clip`;
  const attrs: Attrs = [
    ["id", groupId],
    [
      "class",
      classes(
        "kg-node",
        `kg-node--${domId(kind)}`,
        interactive && "kg-node--interactive",
        highlight > 0 && "kg-node--highlight",
      ),
    ],
    [
      "role",
      interactive
        ? "button"
        : focusGroup
          ? "group"
          : meaningful && labelledBy
            ? kind === "image"
              ? "img"
              : "group"
            : undefined,
    ],
    // Inside a focus group only the group is a tab stop; descendants are reached with arrow keys.
    ["tabindex", focusable ? (insideFocusGroup && !focusGroup ? "-1" : "0") : undefined],
    ["data-focus-group", focusGroup ? "true" : undefined],
    ["focusable", focusable ? "true" : undefined],
    ["aria-labelledby", labelledBy || undefined],
    ["transform", transforms || undefined],
    ["opacity", opacity === 1 ? undefined : number(opacity, precision)],
    ["display", hidden ? "none" : undefined],
    ["data-node-id", id],
    ["data-kineglyph-node", id],
    ["data-kind", kind],
    ["data-interactive", interactive ? "true" : undefined],
    ["data-activate", string(node.onActivate)],
    ["data-hidden", hidden ? "true" : undefined],
    ["data-progress", number(progress, precision)],
    ["data-highlight", highlight > 0 ? number(highlight, precision) : undefined],
    [
      "style",
      `--kg-progress:${number(progress, precision)};--kg-highlight:${number(highlight, precision)}`,
    ],
    ...metadataAttrs(metadata),
  ];
  const accessible = meaningful
    ? [
        label && element("title", [["id", `${groupId}-title`]], escapeXml(label)),
        description && element("desc", [["id", `${groupId}-description`]], escapeXml(description)),
      ]
        .filter(Boolean)
        .join("")
    : "";
  const clip = node.clip === true;
  const clipMarkup = clip
    ? element(
        "clipPath",
        [["id", clipId]],
        element(
          "rect",
          [
            ["x", number(geometry.x, precision)],
            ["y", number(geometry.y, precision)],
            ["width", number(geometry.width, precision)],
            ["height", number(geometry.height, precision)],
            ["rx", numeric(appearance.radius, precision)],
          ],
          "",
        ),
      )
    : "";
  const shape = renderStructuredShape(
    node,
    kind,
    geometry,
    appearance,
    highlight,
    progress,
    context,
  );
  const content = clip
    ? element("g", [["clip-path", `url(#${clipId})`]], childrenMarkup)
    : childrenMarkup;
  if (!revealable) return element("g", attrs, accessible + clipMarkup + shape + content);
  // Anchored reveal: a clip rectangle that grows from the anchor side (renderer and runtime share it).
  const revealClipId = `${groupId}-reveal`;
  const revealRect = revealClipRect(geometry, revealX, revealY, revealAnchor);
  const revealMarkup = element(
    "clipPath",
    [["id", revealClipId]],
    element(
      "rect",
      [
        ["x", number(revealRect.x, precision)],
        ["y", number(revealRect.y, precision)],
        ["width", number(Math.max(0, revealRect.width), precision)],
        ["height", number(Math.max(0, revealRect.height), precision)],
        ["data-reveal-clip", id],
      ],
      "",
    ),
  );
  return element(
    "g",
    [
      ...attrs,
      ["data-reveal-x", number(revealX, precision)],
      ["data-reveal-y", number(revealY, precision)],
    ],
    accessible +
      clipMarkup +
      revealMarkup +
      element("g", [["clip-path", `url(#${revealClipId})`]], shape + content),
  );
}

/** Centre-origin transform components shared by the static renderer and the live runtime. */
export function nodeTransformParts(
  geometry: { x: number; y: number; width: number; height: number },
  translateX: number,
  translateY: number,
  scale: number,
): { tx: number; ty: number; scale: number } {
  const cx = geometry.x + geometry.width / 2;
  const cy = geometry.y + geometry.height / 2;
  return { tx: translateX + cx * (1 - scale), ty: translateY + cy * (1 - scale), scale };
}

/** SVG `transform` attribute: translate + scale about the node centre. */
export function nodeTransform(
  geometry: { x: number; y: number; width: number; height: number },
  translateX: number,
  translateY: number,
  scale: number,
  precision: number,
): string {
  const { tx, ty } = nodeTransformParts(geometry, translateX, translateY, scale);
  const parts = [
    tx !== 0 || ty !== 0 ? `translate(${number(tx, precision)} ${number(ty, precision)})` : "",
    scale !== 1 ? `scale(${number(scale, precision)})` : "",
  ].filter(Boolean);
  return parts.join(" ");
}

/** Clip rectangle for anchored reveals; both axes intersect. */
export function revealClipRect(
  geometry: { x: number; y: number; width: number; height: number },
  revealX: number,
  revealY: number,
  anchor: string | undefined,
): { x: number; y: number; width: number; height: number } {
  const rx = Math.max(0, Math.min(1, revealX));
  const ry = Math.max(0, Math.min(1, revealY));
  const width = geometry.width * rx;
  const height = geometry.height * ry;
  const x = anchor === "right" ? geometry.x + geometry.width - width : geometry.x;
  const y = anchor === "top" ? geometry.y : geometry.y + geometry.height - height;
  // Horizontal reveals anchor left unless "right"; vertical reveals anchor bottom unless "top".
  return {
    x: rx < 1 ? x : geometry.x,
    y: ry < 1 ? y : geometry.y,
    width: rx < 1 ? width : geometry.width,
    height: ry < 1 ? height : geometry.height,
  };
}

function renderStructuredShape(
  node: UnknownRecord,
  kind: string,
  geometry: { x: number; y: number; width: number; height: number },
  appearance: UnknownRecord,
  highlight: number,
  progress: number,
  context: RenderContext,
): string {
  const { precision, accent } = context;
  const { x, y, width, height } = geometry;
  const ownerId = nodeId(node, 0);
  const baseFill = gradientFill(appearance.fill, ownerId, context);
  const baseStroke = string(appearance.stroke) ?? "none";
  const baseWidth = finiteNumber(appearance.strokeWidth, 1);
  const outline = highlightStroke(
    baseStroke === "none" ? accent : baseStroke,
    accent,
    highlight,
    baseStroke === "none" ? 0 : baseWidth,
  );
  const stroke = baseStroke === "none" && highlight <= 0 ? "none" : outline.stroke;
  const strokeWidth = baseStroke === "none" && highlight <= 0 ? 0 : outline.strokeWidth;
  const fill =
    highlight > 0 && baseFill !== "none" && !baseFill.startsWith("url(")
      ? mixColor(baseFill, accent, highlight * 0.12)
      : baseFill;
  const dash = string(appearance.dash);
  const dashAttr =
    dash === "dashed"
      ? `${number(Math.max(4, strokeWidth * 3), precision)} ${number(Math.max(3, strokeWidth * 2), precision)}`
      : dash === "dotted"
        ? `0.01 ${number(Math.max(3, strokeWidth * 2.4), precision)}`
        : undefined;
  const paint: Attrs = [
    ["class", "kg-node-shape"],
    ["data-shape-of", ownerId],
    ["fill", fill],
    ["stroke", stroke],
    ["stroke-width", strokeWidth > 0 ? number(strokeWidth, precision) : undefined],
    ["stroke-dasharray", dashAttr],
    ["stroke-linecap", dash === "dotted" ? "round" : undefined],
    ["fill-opacity", numeric(appearance.opacity, precision)],
    ["stroke-opacity", numeric(appearance.opacity, precision)],
    ...materialPaintAttrs(appearance, ownerId, context),
  ];
  switch (kind) {
    case "group":
    case "rect": {
      if (fill === "none" && stroke === "none") return "";
      return element(
        "rect",
        [
          ...paint,
          ["x", number(x, precision)],
          ["y", number(y, precision)],
          ["width", number(width, precision)],
          ["height", number(height, precision)],
          [
            "rx",
            numeric(Math.min(finiteNumber(appearance.radius, 0), width / 2, height / 2), precision),
          ],
        ],
        "",
      );
    }
    case "circle": {
      const cx = x + width / 2;
      const cy = y + height / 2;
      if (Math.abs(width - height) < 1e-6)
        return element(
          "circle",
          [
            ...paint,
            ["cx", number(cx, precision)],
            ["cy", number(cy, precision)],
            ["r", number(width / 2, precision)],
          ],
          "",
        );
      return element(
        "ellipse",
        [
          ...paint,
          ["cx", number(cx, precision)],
          ["cy", number(cy, precision)],
          ["rx", number(width / 2, precision)],
          ["ry", number(height / 2, precision)],
        ],
        "",
      );
    }
    case "text":
      return renderTextBlock(record(node.text), "kg-text", precision, progress, ownerId);
    case "badge":
      return (
        element(
          "rect",
          [
            ...paint,
            ["x", number(x, precision)],
            ["y", number(y, precision)],
            ["width", number(width, precision)],
            ["height", number(height, precision)],
            [
              "rx",
              number(Math.min(height / 2, finiteNumber(appearance.radius, height / 2)), precision),
            ],
          ],
          "",
        ) + renderTextBlock(record(node.text), "kg-text kg-badge-text", precision, 1)
      );
    case "icon": {
      const icon = record(node.icon);
      const name = string(icon.name) ?? "diamond";
      const size = finiteNumber(icon.size, Math.min(width, height));
      const color =
        highlight > 0
          ? mixColor(string(icon.color) ?? accent, accent, highlight * 0.6)
          : (string(icon.color) ?? accent);
      const background = string(icon.background) ?? "none";
      return renderMotifAt(
        name,
        x + width / 2,
        y + height / 2,
        size,
        color,
        background,
        context.background,
        precision,
      );
    }
    case "path": {
      const path = record(node.path);
      const viewBox = record(path.viewBox);
      const vw = positiveNumber(viewBox.width, 24);
      const vh = positiveNumber(viewBox.height, 24);
      const scale = Math.max(1e-6, Math.min(width / vw, height / vh));
      const offsetX = x + (width - vw * scale) / 2;
      const offsetY = y + (height - vh * scale) / 2;
      const scaledStroke = strokeWidth > 0 ? strokeWidth / scale : 0;
      const pathLength = finiteNumber(path.length, Math.hypot(vw, vh));
      const dashKind: EdgeDashKind = dash === "dashed" || dash === "dotted" ? dash : "solid";
      const reveal = pathDashAttrs(dashKind, scaledStroke, pathLength, progress, precision);
      // Explicit authored caps win; dotted patterns default to round caps so 0.01-length dashes
      // still render as dots.
      const lineCap = string(appearance.lineCap) ?? reveal.linecap ?? "round";
      return element(
        "path",
        [
          ["class", "kg-node-shape kg-path"],
          ["data-shape-of", ownerId],
          ["d", string(path.d) ?? ""],
          ["fill", fill],
          ["stroke", stroke],
          ["stroke-width", scaledStroke > 0 ? number(scaledStroke, precision) : undefined],
          ["fill-opacity", numeric(appearance.opacity, precision)],
          ["stroke-opacity", numeric(appearance.opacity, precision)],
          ["stroke-linecap", lineCap],
          ["stroke-linejoin", "round"],
          ["pathLength", reveal.pathLength],
          ["stroke-dasharray", reveal.dasharray],
          ["data-path-length", number(pathLength, precision)],
          ["data-dash", dashKind],
          ...materialPaintAttrs(appearance, ownerId, context),
          [
            "transform",
            `translate(${number(offsetX, precision)} ${number(offsetY, precision)}) scale(${number(scale, precision)})`,
          ],
        ],
        "",
      );
    }
    case "image": {
      const image = record(node.image);
      const fit = string(image.fit) ?? "contain";
      const par = fit === "cover" ? "xMidYMid slice" : fit === "fill" ? "none" : "xMidYMid meet";
      const radius = finiteNumber(appearance.radius, 0);
      const clipId = `${context.rootId}-node-${domId(nodeId(node, 0))}-image-clip`;
      const img = element(
        "image",
        [
          ["class", "kg-image"],
          ["href", string(image.href)],
          ["x", number(x, precision)],
          ["y", number(y, precision)],
          ["width", number(width, precision)],
          ["height", number(height, precision)],
          ["preserveAspectRatio", par],
          ["clip-path", radius > 0 ? `url(#${clipId})` : undefined],
          ["data-live", image.live === true ? "true" : undefined],
          ...materialPaintAttrs(appearance, ownerId, context),
        ],
        "",
      );
      const clip =
        radius > 0
          ? element(
              "clipPath",
              [["id", clipId]],
              element(
                "rect",
                [
                  ["x", number(x, precision)],
                  ["y", number(y, precision)],
                  ["width", number(width, precision)],
                  ["height", number(height, precision)],
                  ["rx", number(radius, precision)],
                ],
                "",
              ),
            )
          : "";
      const alt = string(image.alt);
      return (
        clip +
        (alt === undefined
          ? img
          : element(
              "g",
              [
                ["role", "img"],
                ["aria-label", alt],
              ],
              img,
            ))
      );
    }
    case "legend": {
      const legend = record(node.legend);
      const items = records(legend.items);
      const font = record(legend.text);
      return items
        .map((item) => {
          const box = record(item.box);
          const bx = finiteNumber(box.x, x);
          const by = finiteNumber(box.y, y);
          const bh = finiteNumber(box.height, 16);
          const shape = string(item.shape) ?? "square";
          const swatch = string(item.swatch) ?? accent;
          const cy = by + bh / 2;
          const swatchMarkup =
            shape === "circle"
              ? element(
                  "circle",
                  [
                    ["cx", number(bx + 6, precision)],
                    ["cy", number(cy, precision)],
                    ["r", "5"],
                    ["fill", swatch],
                  ],
                  "",
                )
              : shape === "line" || shape === "dashed"
                ? element(
                    "path",
                    [
                      [
                        "d",
                        `M ${number(bx, precision)} ${number(cy, precision)} L ${number(bx + 12, precision)} ${number(cy, precision)}`,
                      ],
                      ["stroke", swatch],
                      ["stroke-width", "2"],
                      ["stroke-linecap", "round"],
                      ["stroke-dasharray", shape === "dashed" ? "3 3" : undefined],
                      ["fill", "none"],
                    ],
                    "",
                  )
                : element(
                    "rect",
                    [
                      ["x", number(bx, precision)],
                      ["y", number(cy - 5, precision)],
                      ["width", "10"],
                      ["height", "10"],
                      ["rx", "2"],
                      ["fill", swatch],
                    ],
                    "",
                  );
          const fontSize = finiteNumber(font.fontSize, 12);
          const text = element(
            "text",
            [
              ["class", "kg-text kg-legend-text"],
              ["x", number(bx + 19, precision)],
              ["y", number(cy + fontSize * 0.35, precision)],
              ["font-family", string(font.fontFamily)],
              ["font-size", number(fontSize, precision)],
              ["font-weight", numeric(font.fontWeight, precision)],
              ["fill", string(font.color)],
            ],
            escapeXml(string(item.label) ?? ""),
          );
          return element(
            "g",
            [
              ["class", "kg-legend-item"],
              ["data-legend-item", string(item.id)],
            ],
            swatchMarkup + text,
          );
        })
        .join("");
    }
    case "callout": {
      const callout = record(node.callout);
      const body = record(callout.body);
      const tip = record(callout.tip);
      const pointer = string(callout.pointer) ?? "none";
      const bx = finiteNumber(body.x, x);
      const by = finiteNumber(body.y, y);
      const bw = finiteNumber(body.width, width);
      const bh = finiteNumber(body.height, height);
      const radius = Math.min(finiteNumber(appearance.radius, 8), bw / 2, bh / 2);
      const tx = finiteNumber(tip.x, bx);
      const ty = finiteNumber(tip.y, by);
      const d = calloutPath(bx, by, bw, bh, radius, pointer, tx, ty, precision);
      return (
        element("path", [["class", "kg-node-shape kg-callout"], ...paint, ["d", d]], "") +
        renderTextBlock(record(node.text), "kg-text kg-callout-text", precision, 1)
      );
    }
    default:
      return "";
  }
}

function calloutPath(
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  pointer: string,
  tx: number,
  ty: number,
  precision: number,
): string {
  const n = (value: number): string => number(value, precision);
  const size = 8;
  const half = 7;
  const parts: string[] = [];
  parts.push(`M ${n(x + r)} ${n(y)}`);
  if (pointer === "up") {
    const px = Math.min(Math.max(tx, x + r + half), x + w - r - half);
    parts.push(`L ${n(px - half)} ${n(y)} L ${n(px)} ${n(y - size)} L ${n(px + half)} ${n(y)}`);
  }
  parts.push(`L ${n(x + w - r)} ${n(y)} Q ${n(x + w)} ${n(y)} ${n(x + w)} ${n(y + r)}`);
  if (pointer === "right") {
    const py = Math.min(Math.max(ty, y + r + half), y + h - r - half);
    parts.push(
      `L ${n(x + w)} ${n(py - half)} L ${n(x + w + size)} ${n(py)} L ${n(x + w)} ${n(py + half)}`,
    );
  }
  parts.push(`L ${n(x + w)} ${n(y + h - r)} Q ${n(x + w)} ${n(y + h)} ${n(x + w - r)} ${n(y + h)}`);
  if (pointer === "down") {
    const px = Math.min(Math.max(tx, x + r + half), x + w - r - half);
    parts.push(
      `L ${n(px + half)} ${n(y + h)} L ${n(px)} ${n(y + h + size)} L ${n(px - half)} ${n(y + h)}`,
    );
  }
  parts.push(`L ${n(x + r)} ${n(y + h)} Q ${n(x)} ${n(y + h)} ${n(x)} ${n(y + h - r)}`);
  if (pointer === "left") {
    const py = Math.min(Math.max(ty, y + r + half), y + h - r - half);
    parts.push(`L ${n(x)} ${n(py + half)} L ${n(x - size)} ${n(py)} L ${n(x)} ${n(py - half)}`);
  }
  parts.push(`L ${n(x)} ${n(y + r)} Q ${n(x)} ${n(y)} ${n(x + r)} ${n(y)} Z`);
  return parts.join(" ");
}

function renderTextBlock(
  text: UnknownRecord,
  className: string,
  precision: number,
  progress: number,
  owner?: string,
): string {
  const lines = records(text.lines);
  const box = record(text.box);
  if (lines.length === 0) return "";
  const x = finiteNumber(box.x, 0);
  const y = finiteNumber(box.y, 0);
  const width = finiteNumber(box.width, 0);
  const fontSize = finiteNumber(text.fontSize, 14);
  const lineHeight = finiteNumber(text.lineHeight, fontSize * 1.4);
  const align = string(text.align) ?? "start";
  const anchorX = align === "center" ? x + width / 2 : align === "end" ? x + width : x;
  const letterSpacing = finiteNumber(text.letterSpacing, 0);
  const visibleLines =
    progress >= 1 ? lines.length : Math.max(0, Math.round(lines.length * progress));
  return element(
    "text",
    [
      ["class", className],
      ["data-text-of", owner],
      ["font-family", string(text.fontFamily)],
      ["font-size", number(fontSize, precision)],
      ["font-weight", numeric(text.fontWeight, precision)],
      ["letter-spacing", letterSpacing !== 0 ? number(letterSpacing, precision) : undefined],
      ["fill", string(text.color)],
      ["text-anchor", align === "center" ? "middle" : align === "end" ? "end" : undefined],
      ["data-wrap-lines", String(lines.length)],
      ["data-max-width", number(width, precision)],
    ],
    lines
      .map((line, index) => {
        const lineWidth = finiteNumber(line.width, 0);
        const baseline = y + index * lineHeight + lineHeight / 2 + fontSize * 0.35;
        return element(
          "tspan",
          [
            ["x", number(anchorX, precision)],
            ["y", number(baseline, precision)],
            ["textLength", lineWidth > 0.5 ? number(lineWidth, precision) : undefined],
            ["lengthAdjust", lineWidth > 0.5 ? "spacingAndGlyphs" : undefined],
            ["data-line-width", number(lineWidth, precision)],
            ["opacity", index < visibleLines ? undefined : "0"],
          ],
          escapeXml(string(line.text) ?? ""),
        );
      })
      .join(""),
  );
}

function renderMotifAt(
  name: string,
  cx: number,
  cy: number,
  size: number,
  color: string,
  background: string,
  canvas: string,
  precision: number,
): string {
  const scale = size / 24;
  const shapes = motifShapes(name);
  const fillFor = (shape: MotifShape): string => {
    switch (shape.fill) {
      case "stroke":
        return color;
      case "background":
        return background !== "none" ? background : canvas === "transparent" ? "none" : canvas;
      default:
        return "none";
    }
  };
  const content = shapes
    .map((shape) =>
      element(
        shape.tag,
        [
          ...Object.entries(shape.attrs),
          ["fill", fillFor(shape)],
          ["stroke", color],
          ["stroke-width", number(1.6 / Math.max(0.35, Math.min(scale, 1.4)), precision)],
          ["stroke-linecap", "round"],
          ["stroke-linejoin", "round"],
        ],
        "",
      ),
    )
    .join("");
  const backdrop =
    background !== "none"
      ? element(
          "circle",
          [
            ["cx", "0"],
            ["cy", "0"],
            ["r", number(15, precision)],
            ["fill", background],
            ["stroke", "none"],
          ],
          "",
        )
      : "";
  return element(
    "g",
    [
      ["class", `kg-icon kg-icon--${domId(name)}`],
      [
        "transform",
        `translate(${number(cx, precision)} ${number(cy, precision)}) scale(${number(scale, precision)})`,
      ],
      ["aria-hidden", "true"],
      ["data-icon", name],
    ],
    backdrop + content,
  );
}

// ---------------------------------------------------------------------------------------------
// Legacy nodes (pipeline resolver and loosely-typed input)
// ---------------------------------------------------------------------------------------------

function renderLegacyNode(
  node: UnknownRecord,
  index: number,
  rootId: string,
  precision: number,
): string {
  const id = nodeId(node, index);
  const groupId = `${rootId}-node-${domId(id)}`;
  const label = firstString(node.label, node.title, node.name, record(node.accessibility).label);
  const description = firstString(
    node.description,
    node.body,
    record(node.accessibility).description,
  );
  const interactive = isInteractive(node);
  const focusable =
    boolean(node.focusable) ?? boolean(record(node.interaction).focusable) ?? interactive;
  const appearance = mergeRecords(record(node.style), record(node.appearance));
  const state = record(node.state);
  const opacity = unit(firstNumber(node.opacity, state.opacity, appearance.opacity), 1);
  const progress = unit(firstNumber(node.progress, state.progress), 1);
  const highlight = unit(firstNumber(state.highlight), 0);
  const translateX = finiteNumber(state.translateX, 0);
  const translateY = finiteNumber(state.translateY, 0);
  const scale = Math.max(0, finiteNumber(state.scale, 1));
  const geometry = nodeGeometry(node);
  const transforms = nodeTransform(geometry, translateX, translateY, scale, precision);
  const labelledBy = [label && `${groupId}-title`, description && `${groupId}-description`]
    .filter(Boolean)
    .join(" ");
  const metadata = mergeRecords(record(node.metadata), record(node.data));
  const contentClipId = `${groupId}-content-clip`;
  const attrs: Attrs = [
    ["id", groupId],
    [
      "class",
      classes(
        "kg-node",
        `kg-node--${domId(nodeKind(node))}`,
        string(node.className),
        interactive && "kg-node--interactive",
        highlight > 0 && "kg-node--highlight",
      ),
    ],
    [
      "role",
      firstString(node.role, record(node.accessibility).role) ??
        (interactive ? "button" : labelledBy ? "group" : undefined),
    ],
    ["tabindex", focusable ? String(integerBetween(node.tabIndex, -1, 32767, 0)) : undefined],
    ["focusable", focusable ? "true" : undefined],
    ["aria-labelledby", labelledBy || undefined],
    ["aria-label", labelledBy ? undefined : interactive ? (label ?? id) : undefined],
    [
      "aria-disabled",
      boolean(node.disabled) === true || boolean(state.disabled) === true ? "true" : undefined,
    ],
    ["transform", transforms || undefined],
    ["opacity", opacity === 1 ? undefined : number(opacity, precision)],
    ["data-node-id", id],
    ["data-kineglyph-node", id],
    ["data-interactive", interactive ? "true" : undefined],
    ["data-progress", number(progress, precision)],
    ["data-highlight", highlight > 0 ? number(highlight, precision) : undefined],
    ["style", `--kg-progress:${number(progress, precision)}`],
    ...metadataAttrs(metadata),
  ];
  const accessible = [
    label && element("title", [["id", `${groupId}-title`]], escapeXml(label)),
    description && element("desc", [["id", `${groupId}-description`]], escapeXml(description)),
  ]
    .filter(Boolean)
    .join("");
  const contentClip = element(
    "clipPath",
    [["id", contentClipId]],
    element(
      "rect",
      [
        ["x", number(geometry.x + 7, precision)],
        ["y", number(geometry.y + 7, precision)],
        ["width", number(Math.max(0, geometry.width - 14), precision)],
        ["height", number(Math.max(0, geometry.height - 14), precision)],
      ],
      "",
    ),
  );
  return element(
    "g",
    attrs,
    accessible +
      contentClip +
      renderLegacyShape(node, appearance, progress, rootId, precision) +
      renderLegacyContent(node, label, contentClipId, precision),
  );
}

function renderLegacyShape(
  node: UnknownRecord,
  appearance: UnknownRecord,
  progress: number,
  rootId: string,
  precision: number,
): string {
  const kind = nodeKind(node);
  const geometry = nodeGeometry(node);
  const { x, y, width, height } = geometry;
  const paint: Attrs = [
    ["class", "kg-node-shape"],
    ["fill", colorValue(firstString(appearance.fill, node.fill))],
    ["stroke", colorValue(firstString(appearance.stroke, node.stroke))],
    ["stroke-width", numeric(appearance.strokeWidth, precision)],
    ["stroke-linecap", firstString(appearance.strokeLinecap, appearance.linecap)],
    ["stroke-linejoin", firstString(appearance.strokeLinejoin, appearance.linejoin)],
    ["pathLength", progress < 1 ? "1" : undefined],
    ["stroke-dasharray", progress < 1 ? `${number(progress, precision)} 1` : undefined],
  ];
  if (kind === "circle") {
    return element(
      "circle",
      [
        ...paint,
        ["cx", number(finiteNumber(node.cx, x + width / 2), precision)],
        ["cy", number(finiteNumber(node.cy, y + height / 2), precision)],
        ["r", number(Math.max(0, finiteNumber(node.r, Math.min(width, height) / 2)), precision)],
      ],
      "",
    );
  }
  if (kind === "ellipse") {
    return element(
      "ellipse",
      [
        ...paint,
        ["cx", number(finiteNumber(node.cx, x + width / 2), precision)],
        ["cy", number(finiteNumber(node.cy, y + height / 2), precision)],
        ["rx", number(Math.max(0, finiteNumber(node.rx, width / 2)), precision)],
        ["ry", number(Math.max(0, finiteNumber(node.ry, height / 2)), precision)],
      ],
      "",
    );
  }
  if (kind === "line") {
    return element(
      "line",
      [
        ...paint,
        ["x1", number(finiteNumber(node.x1, x), precision)],
        ["y1", number(finiteNumber(node.y1, y), precision)],
        ["x2", number(finiteNumber(node.x2, x + width), precision)],
        ["y2", number(finiteNumber(node.y2, y + height), precision)],
      ],
      "",
    );
  }
  if (kind === "path")
    return element("path", [...paint, ["d", firstString(node.d, record(node.path).d) ?? ""]], "");
  if (kind === "polygon" || kind === "polyline")
    return element(kind, [...paint, ["points", points(node.points, precision)]], "");
  if (kind === "text") {
    const text = firstString(node.text, node.value, node.label) ?? "";
    return element(
      "text",
      [
        ...paint,
        ["x", number(x, precision)],
        ["y", number(y, precision)],
        ["font-size", numeric(appearance.fontSize, precision)],
        ["font-family", firstString(appearance.fontFamily)],
        ["text-anchor", firstString(appearance.textAnchor)],
        ["dominant-baseline", firstString(appearance.dominantBaseline)],
      ],
      escapeXml(text),
    );
  }
  if (kind === "group") {
    return records(node.children)
      .map((child, childIndex) => renderLegacyNode(child, childIndex, `${rootId}-group`, precision))
      .join("");
  }
  return element(
    "rect",
    [
      ...paint,
      ["x", number(x, precision)],
      ["y", number(y, precision)],
      ["width", number(width, precision)],
      ["height", number(height, precision)],
      ["rx", lengthValue(node.rx ?? appearance.radius, precision, "radius")],
      ["ry", lengthValue(node.ry ?? appearance.radius, precision, "radius")],
    ],
    "",
  );
}

function renderLegacyContent(
  node: UnknownRecord,
  label: string | undefined,
  clipId: string,
  precision: number,
): string {
  if (nodeKind(node) === "text") return "";
  const body = firstString(node.body, node.subtitle, node.description);
  const icon = firstString(node.icon, record(node.metadata).icon, record(node.appearance).icon);
  const motif = firstString(record(node.metadata).motif);
  if (!label && !body && !icon && !motif) return "";
  const { x, y, width, height } = nodeGeometry(node);
  const padding = 12;
  const iconOffset = icon || motif ? 28 : 0;
  const textX = x + padding + iconOffset;
  const availableTextWidth = Math.max(8, width - (textX - x) - padding);
  const labelLines = label
    ? wrapSvgText(label, availableTextWidth, { averageCharacterWidth: 7.1, maxLines: body ? 2 : 3 })
    : [];
  const bodyLines = body
    ? wrapSvgText(body, availableTextWidth, { averageCharacterWidth: 6.15, maxLines: 3 })
    : [];
  const labelLineHeight = 15;
  const bodyLineHeight = 14;
  const textGap = labelLines.length > 0 && bodyLines.length > 0 ? 4 : 0;
  const textHeight =
    labelLines.length * labelLineHeight + textGap + bodyLines.length * bodyLineHeight;
  const textTop = Math.max(y + padding, y + (height - textHeight) / 2);
  const content: string[] = [];
  if (motif) {
    content.push(renderLegacyMotif(motif, x + padding + 9, y + height / 2, precision));
  } else if (icon) {
    const cx = x + padding + 7;
    const cy = y + height / 2;
    content.push(
      element(
        "circle",
        [
          ["class", "kg-node-icon-bg"],
          ["cx", number(cx, precision)],
          ["cy", number(cy, precision)],
          ["r", "8"],
          ["aria-hidden", "true"],
          ["data-icon", icon],
        ],
        "",
      ),
    );
    content.push(
      element(
        "text",
        [
          ["class", "kg-node-icon"],
          ["x", number(cx, precision)],
          ["y", number(cy, precision)],
          ["text-anchor", "middle"],
          ["dominant-baseline", "central"],
          ["aria-hidden", "true"],
        ],
        escapeXml(icon.slice(0, 1).toUpperCase()),
      ),
    );
  }
  if (labelLines.length > 0)
    content.push(
      renderTextLines(
        "kg-node-label",
        labelLines,
        textX,
        textTop,
        labelLineHeight,
        availableTextWidth,
        precision,
      ),
    );
  if (bodyLines.length > 0)
    content.push(
      renderTextLines(
        "kg-node-body",
        bodyLines,
        textX,
        textTop + labelLines.length * labelLineHeight + textGap,
        bodyLineHeight,
        availableTextWidth,
        precision,
      ),
    );
  return element(
    "g",
    [
      ["class", "kg-node-content"],
      ["pointer-events", "none"],
      ["clip-path", `url(#${clipId})`],
    ],
    content.join(""),
  );
}

export interface SvgTextWrapOptions {
  readonly averageCharacterWidth: number;
  readonly maxLines: number;
}

export interface SvgTextLine {
  readonly text: string;
  readonly measuredWidth: number;
}

/** Deterministic explicit-metric wrapping used before exact font shaping is available. */
export function wrapSvgText(
  value: string,
  maxWidth: number,
  options: SvgTextWrapOptions,
): readonly SvgTextLine[] {
  const characterWidth = Math.max(0.1, options.averageCharacterWidth);
  const capacity = Math.max(1, Math.floor(Math.max(0, maxWidth) / characterWidth));
  const maxLines = Math.max(1, Math.floor(options.maxLines));
  const words = value.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  let truncated = false;

  const commit = (): void => {
    if (current.length > 0) lines.push(current);
    current = "";
  };

  for (const word of words) {
    const chunks: string[] = [];
    for (let offset = 0; offset < word.length; offset += capacity)
      chunks.push(word.slice(offset, offset + capacity));
    for (const chunk of chunks) {
      const candidate = current.length === 0 ? chunk : `${current} ${chunk}`;
      if (candidate.length <= capacity) current = candidate;
      else {
        commit();
        if (lines.length >= maxLines) {
          truncated = true;
          break;
        }
        current = chunk;
      }
    }
    if (truncated) break;
  }
  if (!truncated && current.length > 0) commit();
  if (lines.length > maxLines) {
    lines.length = maxLines;
    truncated = true;
  }
  if (truncated && lines.length > 0) {
    const lastIndex = lines.length - 1;
    const last = lines[lastIndex] ?? "";
    lines[lastIndex] = `${last.slice(0, Math.max(0, capacity - 1)).trimEnd()}…`;
  }
  return lines.map((text) => ({
    text,
    measuredWidth: Math.min(maxWidth, text.length * characterWidth),
  }));
}

function renderTextLines(
  className: string,
  lines: readonly SvgTextLine[],
  x: number,
  y: number,
  lineHeight: number,
  maxWidth: number,
  precision: number,
): string {
  return element(
    "text",
    [
      ["class", className],
      ["x", number(x, precision)],
      ["y", number(y, precision)],
      ["dominant-baseline", "hanging"],
      ["data-wrap-lines", String(lines.length)],
      ["data-max-width", number(maxWidth, precision)],
    ],
    lines
      .map((line, index) =>
        element(
          "tspan",
          [
            ["x", number(x, precision)],
            ["y", number(y + index * lineHeight, precision)],
            ["textLength", number(Math.max(0.1, line.measuredWidth), precision)],
            ["lengthAdjust", "spacingAndGlyphs"],
            ["data-line-width", number(line.measuredWidth, precision)],
          ],
          escapeXml(line.text),
        ),
      )
      .join(""),
  );
}

function renderLegacyMotif(motif: string, cx: number, cy: number, precision: number): string {
  const shapes = motifShapes(motif);
  const scale = 20 / 24;
  const content = shapes
    .map((shape) =>
      element(
        shape.tag,
        [
          ...Object.entries(shape.attrs),
          [
            "class",
            shape.fill === "background"
              ? "kg-motif-backed"
              : shape.fill === "stroke"
                ? "kg-motif-solid"
                : undefined,
          ],
        ],
        "",
      ),
    )
    .join("");
  return element(
    "g",
    [
      ["class", `kg-node-motif kg-node-motif--${domId(motif)}`],
      [
        "transform",
        `translate(${number(cx, precision)} ${number(cy, precision)}) scale(${number(scale, precision)})`,
      ],
      ["aria-hidden", "true"],
      ["data-motif", motif],
    ],
    content,
  );
}

function edgePoint(
  edge: UnknownRecord,
  side: "start" | "end",
  node?: UnknownRecord,
): { x: number; y: number } {
  const point = record(edge[side]);
  const endpoint = record(edge[side === "start" ? "source" : "target"]);
  if (point.x !== undefined || point.y !== undefined)
    return { x: finiteNumber(point.x, 0), y: finiteNumber(point.y, 0) };
  if (endpoint.x !== undefined || endpoint.y !== undefined)
    return { x: finiteNumber(endpoint.x, 0), y: finiteNumber(endpoint.y, 0) };
  if (node) {
    const geometry = nodeGeometry(node, 0, 0);
    return { x: geometry.x + geometry.width / 2, y: geometry.y + geometry.height / 2 };
  }
  const prefix = side === "start" ? "1" : "2";
  return { x: finiteNumber(edge[`x${prefix}`], 0), y: finiteNumber(edge[`y${prefix}`], 0) };
}

/**
 * Diagram roles a viewer may retint, in the order that decides a tie.
 *
 * The renderer receives a *resolved* scene: by the time paint reaches this file the token a colour
 * came from is gone and only the literal is left. `tokenise` recovers the role by looking the
 * literal back up in the theme's palette, so two roles that share a colour (`accent` and `chart1`
 * do, in the default theme) have to be separated by a rule. This list is that rule — the general
 * roles first, the chart series after them — and it is stable, so a given theme always produces the
 * same mapping. A theme that wants its chart series retinted separately gives them distinct values,
 * and then there is no tie to break.
 */
const COLOR_ROLES: readonly string[] = [
  "canvas",
  "surface",
  "surfaceRaised",
  "surfaceMuted",
  "border",
  "text",
  "textMuted",
  "accent",
  "accentContrast",
  "connector",
  "info",
  "success",
  "warning",
  "danger",
  "chart1",
  "chart2",
  "chart3",
  "chart4",
  "chart5",
  "chart6",
  "chartPositive",
  "chartNegative",
  "chartNeutral",
];

/** Attributes whose value is a paint. `data-base-stroke` and friends are deliberately not here:
 *  the live runtime reads them back to restore a colour, and it wants the literal. */
const PAINT_ATTRS = /(\s(?:fill|stroke|stop-color|flood-color|lighting-color|color)=")([^"]*)(")/g;
/** A semantic-colour reference the renderer emitted without a fallback (see `colorValue`). */
const BARE_COLOR_VAR = /var\(--kg-color-([a-z0-9-]+)\)/g;

interface Palette {
  /** Literal (lowercased) → `--kg-color-*` name, for every colour the theme actually names. */
  readonly roleOf: ReadonlyMap<string, string>;
  /** `--kg-color-*` name → the theme's literal, used as the `var()` fallback. */
  readonly literalOf: ReadonlyMap<string, string>;
  /** The root element's `style`: aliases that read the contract, plus baked geometry. */
  readonly rootStyle: string;
}

function buildPalette(theme: UnknownRecord): Palette {
  const canvas = record(theme.canvas);
  const node = record(theme.node);
  const edge = record(theme.edge);
  const text = record(theme.text);
  const semantic = record(theme.semantic);
  const tokens = record(theme.tokens);
  const colors = mergeRecords(record(tokens.colors), record(theme.colors));
  const radii = mergeRecords(record(tokens.radii), record(theme.radii));
  const typography = mergeRecords(record(tokens.typography), record(theme.typography));
  const bodyFont = record(typography.body);

  const roleOf = new Map<string, string>();
  const literalOf = new Map<string, string>();
  const ordered = [
    ...COLOR_ROLES.filter((key) => key in colors),
    ...Object.keys(colors)
      .filter((key) => !COLOR_ROLES.includes(key))
      .sort(),
  ];
  for (const key of ordered) {
    const value = string(colors[key]);
    if (value === undefined) continue;
    const name = `--kg-color-${cssName(key)}`;
    literalOf.set(name, value);
    // First role wins, so the order above is what decides a shared colour.
    if (!roleOf.has(value.toLowerCase())) roleOf.set(value.toLowerCase(), name);
  }

  /**
   * A shorthand the embedded stylesheet reads, defined *as a reference* to the contract token it
   * stands for. Defining it on the element rather than in the stylesheet keeps one figure's
   * fallbacks out of the next figure's — an inlined SVG's `<style>` is document-wide — and defining
   * it as `var(...)` rather than a literal is what keeps inheritance working: the alias is pinned,
   * the colour it resolves to is not.
   */
  const alias = (name: string, role: string, value: string): [string, string] => [
    name,
    `var(--kg-color-${role}, ${value})`,
  ];
  const vars: Array<[string, string]> = [
    alias(
      "--kg-background",
      "canvas",
      firstString(colors.canvas, theme.background, canvas.background, semantic.background) ??
        "transparent",
    ),
    alias(
      "--kg-node-fill",
      "surface",
      firstString(colors.surface, node.fill, theme.nodeFill, semantic.surface) ?? "#ffffff",
    ),
    alias(
      "--kg-node-stroke",
      "border",
      firstString(colors.border, node.stroke, theme.nodeStroke, semantic.foreground) ?? "#1f2937",
    ),
    alias(
      "--kg-edge-stroke",
      "connector",
      firstString(colors.connector, edge.stroke, theme.edgeStroke, semantic.muted) ?? "#64748b",
    ),
    alias(
      "--kg-text",
      "text",
      firstString(colors.text, text.color, theme.foreground, semantic.foreground) ?? "#111827",
    ),
    alias("--kg-text-muted", "text-muted", firstString(colors.textMuted) ?? "#64748b"),
    alias(
      "--kg-accent",
      "accent",
      firstString(colors.accent, theme.accent, semantic.accent) ?? "#2563eb",
    ),
    // Geometry, not colour. Text in an exported SVG is measured and frozen at render time, so the
    // family that measured it has to be the family that draws it; a viewer swapping the font would
    // squeeze real glyphs into another font's metrics. Deliberately not a re-themable token.
    [
      "--kg-font-family",
      firstString(bodyFont.family, theme.fontFamily, text.fontFamily) ?? "system-ui, sans-serif",
    ],
  ];
  for (const key of Object.keys(radii).sort()) {
    const value = radii[key];
    // Also geometry: baked, for the same reason.
    if (typeof value === "number" && Number.isFinite(value))
      vars.push([`--kg-radius-${cssName(key)}`, `${value}px`]);
  }
  return {
    roleOf,
    literalOf,
    rootStyle: vars.map(([name, value]) => `${name}:${value}`).join(";"),
  };
}

/**
 * Turns every paint the markup carries into `var(--kg-color-<role>, <the literal it has today>)`.
 *
 * Two passes, both on the finished string rather than on each call site: a paint is a paint
 * wherever it was written, and doing it here cannot miss one or disturb the marker ids, which are
 * keyed on the literal and computed before this runs.
 *
 * The fallback is exactly the value the renderer already chose, so an SVG dropped on a page that
 * defines none of these tokens is byte-for-byte the picture it was before.
 */
/**
 * A function that turns one literal paint into `var(--kg-color-<role>, <the literal>)`.
 *
 * The renderer does this to its own output; anything that writes paint onto a *live* figure
 * afterwards — the animator, most of all — has to do the same, or a re-tintable diagram loses its
 * colour to the first frame that touches it. A colour the theme does not name (one mixed during a
 * highlight, say) has no role and comes back unchanged.
 */
export function paintTokeniser(theme: unknown): (literal: string) => string {
  const { roleOf } = buildPalette(record(theme));
  return (literal) => {
    const role = roleOf.get(literal.trim().toLowerCase());
    return role === undefined ? literal : `var(${role}, ${literal})`;
  };
}

function tokenise(svg: string, palette: Palette): string {
  return svg
    .replace(PAINT_ATTRS, (whole, head: string, value: string, tail: string) => {
      const role = palette.roleOf.get(value.trim().toLowerCase());
      return role === undefined ? whole : `${head}var(${role}, ${value})${tail}`;
    })
    .replace(BARE_COLOR_VAR, (whole, name: string) => {
      const literal = palette.literalOf.get(`--kg-color-${name}`);
      return literal === undefined ? whole : `var(--kg-color-${name}, ${literal})`;
    });
}

const BASE_STYLES = escapeXml(
  ".kg-scene{color:var(--kg-text)}" +
    ".kg-node-shape{vector-effect:non-scaling-stroke}" +
    ".kg-nodes>.kg-node .kg-node-shape:not([fill]){fill:var(--kg-node-fill)}" +
    ".kg-node text{stroke:none}" +
    ".kg-node-label,.kg-node-body,.kg-node-icon,.kg-edge-label{font-family:var(--kg-font-family)}" +
    ".kg-node-label{fill:var(--kg-text);font-size:13px;font-weight:600}" +
    ".kg-node-body{fill:var(--kg-text-muted);font-size:11px;font-weight:400}" +
    ".kg-node-icon-bg{fill:var(--kg-accent);stroke:none}" +
    ".kg-node-icon{fill:white;font-size:10px;font-weight:700}" +
    ".kg-node-motif{fill:none;stroke:var(--kg-accent);stroke-width:1.5;stroke-linecap:round;stroke-linejoin:round}" +
    ".kg-node-motif .kg-motif-backed{fill:var(--kg-background)}" +
    ".kg-node-motif .kg-motif-solid{fill:var(--kg-accent)}" +
    ".kg-edge{vector-effect:non-scaling-stroke}" +
    ".kg-edge-label{fill:var(--kg-text)}" +
    ".kg-node--interactive{cursor:pointer;outline:none}" +
    ".kg-node--interactive:focus-visible>.kg-node-shape,.kg-node--interactive[data-inspected=true]>.kg-node-shape{stroke:var(--kg-accent);stroke-width:2}" +
    ".kg-node--interactive:hover>.kg-node-shape{filter:brightness(1.06)}" +
    "@keyframes kg-flow{to{stroke-dashoffset:-1000}}" +
    ".kg-edge--flowing{animation:kg-flow 40s linear infinite}" +
    ".kg-scene[data-paused] .kg-edge--flowing,.kg-scene[data-reduced-motion] .kg-edge--flowing{animation-play-state:paused}" +
    "@media(prefers-reduced-motion:reduce){.kg-edge--flowing{animation:none}}",
);

type Attrs = Array<[string, string | undefined | false]>;

function element(name: string, attrs: Attrs, content: string): string {
  const seen = new Set<string>();
  const rendered = attrs
    .filter((entry): entry is [string, string] => typeof entry[1] === "string")
    .filter(([key]) => {
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map(([key, value]) => ` ${key}="${escapeAttribute(value)}"`)
    .join("");
  return content ? `<${name}${rendered}>${content}</${name}>` : `<${name}${rendered}/>`;
}

function metadataAttrs(metadata: UnknownRecord): Attrs {
  return Object.keys(metadata)
    .sort()
    .flatMap((key): Attrs => {
      const value = metadata[key];
      if (typeof value !== "string" && typeof value !== "number" && typeof value !== "boolean")
        return [];
      const safeKey = key
        .toLowerCase()
        .replace(/[^a-z0-9_.:-]+/g, "-")
        .replace(/^-+|-+$/g, "");
      return safeKey ? [[`data-${safeKey}`, String(value)]] : [];
    });
}

function nodeId(node: UnknownRecord, index: number): string {
  return string(node.id) ?? `node-${index + 1}`;
}

function nodeKind(node: UnknownRecord): string {
  const type = firstString(node.kind, node.type, record(node.shape).type) ?? "rect";
  if (type === "shape") return (firstString(node.shape) ?? "rectangle").toLowerCase();
  return type.toLowerCase();
}

function nodeGeometry(
  node: UnknownRecord,
  defaultWidth = 80,
  defaultHeight = 40,
): { x: number; y: number; width: number; height: number } {
  const bounds = record(node.bounds);
  const size = record(node.size);
  return {
    x: finiteNumber(node.x, finiteNumber(bounds.x, 0)),
    y: finiteNumber(node.y, finiteNumber(bounds.y, 0)),
    width: Math.max(
      0,
      finiteNumber(node.width, finiteNumber(bounds.width, finiteNumber(size.width, defaultWidth))),
    ),
    height: Math.max(
      0,
      finiteNumber(
        node.height,
        finiteNumber(bounds.height, finiteNumber(size.height, defaultHeight)),
      ),
    ),
  };
}

function isInteractive(node: UnknownRecord): boolean {
  return (
    boolean(node.interactive) === true ||
    boolean(record(node.interaction).enabled) === true ||
    node.action !== undefined ||
    node.onActivate !== undefined ||
    node.href !== undefined
  );
}

function records(value: unknown): UnknownRecord[] {
  return Array.isArray(value) ? value.filter((item): item is UnknownRecord => isRecord(item)) : [];
}

function record(value: unknown): UnknownRecord {
  return isRecord(value) ? value : {};
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function mergeRecords(...values: UnknownRecord[]): UnknownRecord {
  const merged: UnknownRecord = {};
  for (const value of values) for (const [key, item] of Object.entries(value)) merged[key] = item;
  return merged;
}

function firstString(...values: unknown[]): string | undefined {
  for (const value of values) if (typeof value === "string" && value.length > 0) return value;
  return undefined;
}

function string(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function boolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function firstNumber(...values: unknown[]): number | undefined {
  for (const value of values) if (typeof value === "number" && Number.isFinite(value)) return value;
  return undefined;
}

function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function positiveNumber(value: unknown, fallback: number): number {
  const parsed = finiteNumber(value, fallback);
  return parsed > 0 ? parsed : fallback;
}

function unit(value: number | undefined, fallback: number): number {
  return Math.max(0, Math.min(1, value ?? fallback));
}

function integerBetween(value: unknown, min: number, max: number, fallback: number): number {
  const numeric = finiteNumber(value, fallback);
  return Math.max(min, Math.min(max, Math.trunc(numeric)));
}

function number(value: number, precision: number): string {
  const rounded = Number(value.toFixed(precision));
  return Object.is(rounded, -0) ? "0" : String(rounded);
}

function numeric(value: unknown, precision: number): string | undefined {
  return typeof value === "number" && Number.isFinite(value) ? number(value, precision) : undefined;
}

const SEMANTIC_COLORS = new Set([
  "canvas",
  "surface",
  "surfaceRaised",
  "surfaceMuted",
  "text",
  "textMuted",
  "accent",
  "accentContrast",
  "info",
  "success",
  "warning",
  "danger",
  "connector",
  "border",
]);

function colorValue(value: string | undefined): string | undefined {
  if (!value) return undefined;
  return SEMANTIC_COLORS.has(value) ? `var(--kg-color-${cssName(value)})` : value;
}

function lengthValue(value: unknown, precision: number, token: string): string | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return number(value, precision);
  return typeof value === "string" && value.length > 0
    ? `var(--kg-${token}-${cssName(value)})`
    : undefined;
}

function cssName(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-");
}

function points(value: unknown, precision: number): string {
  if (typeof value === "string") return value;
  if (!Array.isArray(value)) return "";
  return value
    .flatMap((point) => {
      if (Array.isArray(point) && point.length >= 2)
        return [
          `${number(finiteNumber(point[0], 0), precision)},${number(finiteNumber(point[1], 0), precision)}`,
        ];
      if (isRecord(point))
        return [
          `${number(finiteNumber(point.x, 0), precision)},${number(finiteNumber(point.y, 0), precision)}`,
        ];
      return [];
    })
    .join(" ");
}

function classes(...values: Array<string | undefined | false>): string {
  return values
    .filter((value): value is string => typeof value === "string" && value.length > 0)
    .join(" ");
}

export function domId(value: string): string {
  const safe = value
    .trim()
    .replace(/[^A-Za-z0-9_.:-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const prefixed = /^[A-Za-z_]/.test(safe) ? safe : `id-${safe || "scene"}`;
  return prefixed || "kineglyph-scene";
}

function escapeXml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeAttribute(value: string): string {
  return escapeXml(value).replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}
