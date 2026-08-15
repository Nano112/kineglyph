import type { ResolvedScene } from "@kineglyph/core";

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
}

/** Render a resolved Kineglyph scene without DOM or browser dependencies. */
export function renderSvg(scene: ResolvedScene, options: SvgRenderOptions = {}): string {
  const source = scene as unknown as UnknownRecord;
  const precision = integerBetween(options.precision, 0, 12, 3);
  const width = positiveNumber(source.width, 640);
  const height = positiveNumber(source.height, 360);
  const nodes = records(source.nodes);
  const edges = records(source.edges);
  const theme = record(source.theme);
  const sceneId = string(source.id) ?? "scene";
  const rootId = domId(options.idPrefix ?? `kineglyph-${sceneId}`);
  const title =
    options.title ?? firstString(source.label, source.title, record(source.accessibility).label);
  const description =
    options.description ??
    firstString(source.description, record(source.accessibility).description);
  const interactive = nodes.some(isInteractive);
  const labelledBy = [title && `${rootId}-title`, description && `${rootId}-description`]
    .filter(Boolean)
    .join(" ");
  const rootAttrs: Attrs = [
    ["xmlns", options.includeXmlns === false ? undefined : "http://www.w3.org/2000/svg"],
    ["id", rootId],
    ["class", classes("kg-scene", options.className)],
    ["viewBox", `0 0 ${number(width, precision)} ${number(height, precision)}`],
    ["preserveAspectRatio", "xMidYMid meet"],
    ["width", number(width, precision)],
    ["height", number(height, precision)],
    ["role", options.role ?? (interactive ? "group" : "img")],
    ["aria-labelledby", labelledBy || undefined],
    ["aria-label", labelledBy ? undefined : "Kineglyph scene"],
    ["data-kineglyph-scene", sceneId],
    ["style", themeVariables(theme)],
  ];

  const nodeById = new Map(nodes.map((node, index) => [nodeId(node, index), node]));
  const body = [
    title && element("title", [["id", `${rootId}-title`]], escapeXml(title)),
    description && element("desc", [["id", `${rootId}-description`]], escapeXml(description)),
    renderDefinitions(rootId, edges),
    element("style", [], BASE_STYLES),
    edges.length > 0
      ? element(
          "g",
          [
            ["class", "kg-edges"],
            ["aria-hidden", "true"],
          ],
          edges.map((edge, index) => renderEdge(edge, index, nodeById, rootId, precision)).join(""),
        )
      : "",
    element(
      "g",
      [["class", "kg-nodes"]],
      nodes.map((node, index) => renderNode(node, index, rootId, precision)).join(""),
    ),
  ]
    .filter(Boolean)
    .join("");

  return element("svg", rootAttrs, body);
}

/** Alias matching server-renderer naming conventions. */
export const renderToSvg = renderSvg;

function renderDefinitions(rootId: string, edges: UnknownRecord[]): string {
  if (edges.length === 0) return "";
  const marker = element(
    "marker",
    [
      ["id", `${rootId}-arrow`],
      ["class", "kg-marker"],
      ["viewBox", "0 0 10 10"],
      ["refX", "9"],
      ["refY", "5"],
      ["markerWidth", "7"],
      ["markerHeight", "7"],
      ["orient", "auto-start-reverse"],
      ["markerUnits", "strokeWidth"],
    ],
    element("path", [["d", "M 0 0 L 10 5 L 0 10 z"]], ""),
  );
  return element("defs", [], marker);
}

function renderEdge(
  edge: UnknownRecord,
  index: number,
  nodes: Map<string, UnknownRecord>,
  rootId: string,
  precision: number,
): string {
  const id = string(edge.id) ?? `edge-${index + 1}`;
  const from = string(edge.from) ?? string(record(edge.source).id);
  const to = string(edge.to) ?? string(record(edge.target).id);
  const start = edgePoint(edge, "start", from === undefined ? undefined : nodes.get(from));
  const end = edgePoint(edge, "end", to === undefined ? undefined : nodes.get(to));
  const d =
    firstString(edge.path, record(edge.path).d, edge.d) ??
    `M ${number(start.x, precision)} ${number(start.y, precision)} L ${number(end.x, precision)} ${number(end.y, precision)}`;
  const appearance = mergeRecords(record(edge.style), record(edge.appearance));
  const progress = unit(firstNumber(edge.progress, record(edge.state).progress), 1);
  const opacity = unit(
    firstNumber(edge.opacity, record(edge.state).opacity, appearance.opacity),
    1,
  );
  const directed = edge.directed !== false && edge.markerEnd !== false && edge.arrow !== false;
  const label = firstString(edge.label, edge.title);
  const attrs: Attrs = [
    ["id", `${rootId}-${domId(id)}`],
    ["class", classes("kg-edge", string(edge.className))],
    ["d", d],
    ["fill", "none"],
    ["stroke", firstString(appearance.stroke, edge.color)],
    ["stroke-width", numeric(appearance.strokeWidth, precision)],
    ["stroke-linecap", firstString(appearance.strokeLinecap, appearance.linecap)],
    ["opacity", opacity === 1 ? undefined : number(opacity, precision)],
    ["pathLength", progress < 1 ? "1" : undefined],
    ["stroke-dasharray", progress < 1 ? `${number(progress, precision)} 1` : undefined],
    ["marker-end", directed ? `url(#${rootId}-arrow)` : undefined],
    ["data-edge-id", id],
    ["data-kineglyph-edge", id],
    ["data-from", from],
    ["data-to", to],
    ["data-progress", number(progress, precision)],
  ];
  const path = element("path", attrs, "");
  if (!label) return path;
  const midpoint = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
  return (
    path +
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
    )
  );
}

function renderNode(node: UnknownRecord, index: number, rootId: string, precision: number): string {
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
  const translateX = finiteNumber(state.translateX, 0);
  const translateY = finiteNumber(state.translateY, 0);
  const scale = Math.max(0, finiteNumber(state.scale, 1));
  const transforms = [
    translateX !== 0 || translateY !== 0
      ? `translate(${number(translateX, precision)} ${number(translateY, precision)})`
      : "",
    scale !== 1 ? `scale(${number(scale, precision)})` : "",
  ]
    .filter(Boolean)
    .join(" ");
  const labelledBy = [label && `${groupId}-title`, description && `${groupId}-description`]
    .filter(Boolean)
    .join(" ");
  const metadata = mergeRecords(record(node.metadata), record(node.data));
  const geometry = nodeGeometry(node);
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
      renderShape(node, appearance, progress, rootId, precision) +
      renderNodeContent(node, label, contentClipId, precision),
  );
}

function renderShape(
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
  if (kind === "path") {
    return element("path", [...paint, ["d", firstString(node.d, record(node.path).d) ?? ""]], "");
  }
  if (kind === "polygon" || kind === "polyline") {
    return element(kind, [...paint, ["points", points(node.points, precision)]], "");
  }
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
      .map((child, childIndex) => renderNode(child, childIndex, `${rootId}-group`, precision))
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

function renderNodeContent(
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
    content.push(renderMotif(motif, x + padding + 9, y + height / 2, precision));
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
  if (labelLines.length > 0) {
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
  }
  if (bodyLines.length > 0) {
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
  }
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
    for (let offset = 0; offset < word.length; offset += capacity) {
      chunks.push(word.slice(offset, offset + capacity));
    }
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

function renderMotif(motif: string, cx: number, cy: number, precision: number): string {
  const motifAttrs: Attrs = [
    ["class", `kg-node-motif kg-node-motif--${domId(motif)}`],
    ["aria-hidden", "true"],
    ["data-motif", motif],
  ];
  const x = (offset: number): string => number(cx + offset, precision);
  const y = (offset: number): string => number(cy + offset, precision);
  let content: string;
  switch (motif) {
    case "field":
      content =
        element(
          "circle",
          [
            ["cx", x(0)],
            ["cy", y(0)],
            ["r", "9"],
          ],
          "",
        ) +
        element(
          "circle",
          [
            ["cx", x(0)],
            ["cy", y(0)],
            ["r", "5"],
          ],
          "",
        ) +
        element(
          "circle",
          [
            ["cx", x(0)],
            ["cy", y(0)],
            ["r", "1.5"],
          ],
          "",
        );
      break;
    case "graph":
      content =
        element(
          "path",
          [["d", `M ${x(-7)} ${y(6)} L ${x(0)} ${y(-7)} L ${x(7)} ${y(5)} L ${x(-7)} ${y(6)}`]],
          "",
        ) +
        [
          [-7, 6],
          [0, -7],
          [7, 5],
        ]
          .map(([dx, dy]) =>
            element(
              "circle",
              [
                ["cx", x(dx ?? 0)],
                ["cy", y(dy ?? 0)],
                ["r", "2.5"],
              ],
              "",
            ),
          )
          .join("");
      break;
    case "boundary":
      content =
        element(
          "circle",
          [
            ["cx", x(0)],
            ["cy", y(0)],
            ["r", "9"],
          ],
          "",
        ) +
        element(
          "path",
          [["d", `M ${x(-9)} ${y(0)} C ${x(-4)} ${y(-5)} ${x(4)} ${y(5)} ${x(9)} ${y(0)}`]],
          "",
        );
      break;
    case "blocks":
      content = [
        [-7, -7],
        [1, -7],
        [-7, 1],
        [1, 1],
      ]
        .map(([dx, dy]) =>
          element(
            "rect",
            [
              ["x", x(dx ?? 0)],
              ["y", y(dy ?? 0)],
              ["width", "6"],
              ["height", "6"],
              ["rx", "1"],
            ],
            "",
          ),
        )
        .join("");
      break;
    default:
      content = element(
        "path",
        [["d", `M ${x(0)} ${y(-9)} L ${x(9)} ${y(0)} L ${x(0)} ${y(9)} L ${x(-9)} ${y(0)} z`]],
        "",
      );
  }
  return element("g", motifAttrs, content);
}

function edgePoint(
  edge: UnknownRecord,
  side: "start" | "end",
  node?: UnknownRecord,
): { x: number; y: number } {
  const point = record(edge[side]);
  const endpoint = record(edge[side === "start" ? "source" : "target"]);
  if (point.x !== undefined || point.y !== undefined) {
    return { x: finiteNumber(point.x, 0), y: finiteNumber(point.y, 0) };
  }
  if (endpoint.x !== undefined || endpoint.y !== undefined) {
    return { x: finiteNumber(endpoint.x, 0), y: finiteNumber(endpoint.y, 0) };
  }
  if (node) {
    const geometry = nodeGeometry(node, 0, 0);
    return { x: geometry.x + geometry.width / 2, y: geometry.y + geometry.height / 2 };
  }
  const prefix = side === "start" ? "1" : "2";
  return { x: finiteNumber(edge[`x${prefix}`], 0), y: finiteNumber(edge[`y${prefix}`], 0) };
}

function themeVariables(theme: UnknownRecord): string {
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
  const vars: Array<[string, string | undefined]> = [
    [
      "--kg-background",
      firstString(colors.canvas, theme.background, canvas.background, semantic.background) ??
        "transparent",
    ],
    [
      "--kg-node-fill",
      firstString(colors.surface, node.fill, theme.nodeFill, semantic.surface) ?? "#ffffff",
    ],
    [
      "--kg-node-stroke",
      firstString(colors.border, node.stroke, theme.nodeStroke, semantic.foreground) ?? "#1f2937",
    ],
    [
      "--kg-edge-stroke",
      firstString(colors.connector, edge.stroke, theme.edgeStroke, semantic.muted) ?? "#64748b",
    ],
    [
      "--kg-text",
      firstString(colors.text, text.color, theme.foreground, semantic.foreground) ?? "#111827",
    ],
    ["--kg-text-muted", firstString(colors.textMuted) ?? "#64748b"],
    ["--kg-accent", firstString(colors.accent, theme.accent, semantic.accent) ?? "#2563eb"],
    [
      "--kg-font-family",
      firstString(bodyFont.family, theme.fontFamily, text.fontFamily) ?? "system-ui, sans-serif",
    ],
  ];
  for (const key of Object.keys(colors).sort()) {
    const value = string(colors[key]);
    if (value) vars.push([`--kg-color-${cssName(key)}`, value]);
  }
  for (const key of Object.keys(radii).sort()) {
    const value = radii[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      vars.push([`--kg-radius-${cssName(key)}`, `${value}px`]);
    }
  }
  return vars.map(([name, value]) => `${name}:${value}`).join(";");
}

const BASE_STYLES = escapeXml(
  ".kg-scene{background:var(--kg-background);color:var(--kg-text)}" +
    ".kg-node-shape{fill:var(--kg-node-fill);stroke:var(--kg-node-stroke);vector-effect:non-scaling-stroke}" +
    ".kg-node text{fill:var(--kg-text);stroke:none;font-family:var(--kg-font-family)}" +
    ".kg-node-label{font-size:13px;font-weight:600}" +
    ".kg-node-body{fill:var(--kg-text-muted);font-size:11px;font-weight:400}" +
    ".kg-node-icon-bg{fill:var(--kg-accent);stroke:none}" +
    ".kg-node-icon{fill:white;font-size:10px;font-weight:700}" +
    ".kg-node-motif{fill:none;stroke:var(--kg-accent);stroke-width:1.5;stroke-linecap:round;stroke-linejoin:round}" +
    ".kg-node-motif circle,.kg-node-motif rect{fill:var(--kg-background)}" +
    ".kg-edge{stroke:var(--kg-edge-stroke);vector-effect:non-scaling-stroke}" +
    ".kg-edge-label{fill:var(--kg-text);font-family:var(--kg-font-family)}" +
    ".kg-marker{fill:var(--kg-edge-stroke)}" +
    ".kg-node--interactive{cursor:pointer;outline:none}" +
    ".kg-node--interactive:focus .kg-node-shape{stroke:var(--kg-accent)}",
);

type Attrs = Array<[string, string | undefined | false]>;

function element(name: string, attrs: Attrs, content: string): string {
  const rendered = attrs
    .filter((entry): entry is [string, string] => typeof entry[1] === "string")
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
  for (const value of values) {
    for (const [key, item] of Object.entries(value)) merged[key] = item;
  }
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

function colorValue(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const semanticColors = new Set([
    "canvas",
    "surface",
    "surfaceRaised",
    "text",
    "textMuted",
    "accent",
    "accentContrast",
    "success",
    "warning",
    "danger",
    "connector",
    "border",
  ]);
  return semanticColors.has(value) ? `var(--kg-color-${cssName(value)})` : value;
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
      if (Array.isArray(point) && point.length >= 2) {
        return [
          `${number(finiteNumber(point[0], 0), precision)},${number(finiteNumber(point[1], 0), precision)}`,
        ];
      }
      if (isRecord(point)) {
        return [
          `${number(finiteNumber(point.x, 0), precision)},${number(finiteNumber(point.y, 0), precision)}`,
        ];
      }
      return [];
    })
    .join(" ");
}

function classes(...values: Array<string | undefined | false>): string {
  return values
    .filter((value): value is string => typeof value === "string" && value.length > 0)
    .join(" ");
}

function domId(value: string): string {
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
