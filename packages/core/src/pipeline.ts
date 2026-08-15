import {
  resolvePipelineLayout,
  type PipelineLayoutItem,
  type PipelineLayoutMode,
} from "./layout.js";
import type {
  AnimationTimeline,
  ResolvedEdge,
  ResolvedNode,
  ResolvedScene,
  ResolvedTheme,
} from "./resolved.js";
import type { KineglyphScene } from "./schema.js";
import { defaultTheme, type ThemeTokens } from "./theme.js";

export interface PipelineNodeDefinition extends PipelineLayoutItem {
  readonly label: string;
  readonly description?: string;
  readonly tone?: "neutral" | "accent" | "success" | "warning" | "danger";
  readonly interactive?: boolean;
  readonly metadata?: Readonly<Record<string, string | number | boolean | null>>;
}

export interface PipelineEdgeDefinition {
  readonly id: string;
  readonly from: string;
  readonly to: string;
  readonly label?: string;
  readonly directed?: boolean;
}

export interface PipelineDefinition {
  readonly id: string;
  readonly title: string;
  readonly description?: string;
  readonly nodes: readonly PipelineNodeDefinition[];
  readonly edges: readonly PipelineEdgeDefinition[];
  readonly timeline?: AnimationTimeline;
}

export interface ResolvePipelineOptions {
  readonly width: number;
  readonly layout?: PipelineLayoutMode;
  readonly theme?: ThemeTokens;
  readonly padding?: number;
  readonly gap?: number;
  readonly stackedGap?: number;
}

function requireId(id: string, label: string): void {
  if (id.length === 0) throw new Error(`${label} id must not be empty`);
}

/** Validates and defensively copies a semantic pipeline definition. */
export function definePipeline(definition: PipelineDefinition): PipelineDefinition {
  requireId(definition.id, "pipeline");
  if (definition.title.length === 0) throw new Error("pipeline title must not be empty");
  const nodeIds = new Set<string>();
  for (const node of definition.nodes) {
    requireId(node.id, "node");
    if (nodeIds.has(node.id)) throw new Error(`duplicate node id: ${node.id}`);
    nodeIds.add(node.id);
  }
  const edgeIds = new Set<string>();
  for (const edge of definition.edges) {
    requireId(edge.id, "edge");
    if (edgeIds.has(edge.id) || nodeIds.has(edge.id))
      throw new Error(`duplicate scene id: ${edge.id}`);
    edgeIds.add(edge.id);
    if (!nodeIds.has(edge.from))
      throw new Error(`edge ${edge.id} refers to missing source node ${edge.from}`);
    if (!nodeIds.has(edge.to))
      throw new Error(`edge ${edge.id} refers to missing target node ${edge.to}`);
  }
  return { ...definition, nodes: [...definition.nodes], edges: [...definition.edges] };
}

function resolvedTheme(tokens: ThemeTokens): ResolvedTheme {
  return {
    background: tokens.colors.canvas,
    foreground: tokens.colors.text,
    accent: tokens.colors.accent,
    fontFamily: tokens.typography.body.family,
    semantic: {
      background: tokens.colors.canvas,
      surface: tokens.colors.surface,
      foreground: tokens.colors.text,
      muted: tokens.colors.connector,
      accent: tokens.colors.accent,
    },
    node: {
      fill: tokens.colors.surface,
      stroke: tokens.colors.border,
      strokeWidth: 1,
      radius: tokens.radii.lg,
    },
    edge: { stroke: tokens.colors.connector, strokeWidth: 2 },
    text: {
      color: tokens.colors.text,
      fontFamily: tokens.typography.body.family,
      fontSize: tokens.typography.body.size,
    },
    tokens,
  };
}

function toneColor(node: PipelineNodeDefinition, theme: ThemeTokens): string {
  switch (node.tone ?? "neutral") {
    case "accent":
      return theme.colors.accent;
    case "success":
      return theme.colors.success;
    case "warning":
      return theme.colors.warning;
    case "danger":
      return theme.colors.danger;
    case "neutral":
      return theme.colors.border;
  }
}

function geometry(value: number): number {
  return Math.round((value + Number.EPSILON) * 1000) / 1000;
}

/** Resolves semantic pipeline data to finite, renderer-ready geometry. */
export function resolvePipeline(
  input: PipelineDefinition,
  options: ResolvePipelineOptions,
): ResolvedScene {
  const definition = definePipeline(input);
  const theme = options.theme ?? defaultTheme;
  const layout = resolvePipelineLayout(options.width, definition.nodes, {
    ...(options.layout === undefined ? {} : { mode: options.layout }),
    ...(options.padding === undefined ? {} : { padding: options.padding }),
    ...(options.gap === undefined ? {} : { gap: options.gap }),
    ...(options.stackedGap === undefined ? {} : { stackedGap: options.stackedGap }),
    minItemWidth: 168,
    preferredItemWidth: 224,
    maxItemWidth: 320,
    itemHeight: 128,
  });
  const resolvedById = new Map(layout.items.map((item) => [item.id, item]));
  const nodes: ResolvedNode[] = definition.nodes.map((node) => {
    const resolved = resolvedById.get(node.id);
    if (resolved === undefined) throw new Error(`layout omitted node ${node.id}`);
    return {
      id: node.id,
      kind: "rect",
      ...resolved.bounds,
      label: node.label,
      ...(node.description === undefined ? {} : { description: node.description }),
      appearance: {
        fill: theme.colors.surface,
        stroke: toneColor(node, theme),
        strokeWidth: 1,
        radius: theme.radii.lg,
      },
      state: { opacity: 1, translateX: 0, translateY: 0, scale: 1, progress: 1 },
      interactive: node.interactive ?? false,
      focusable: node.interactive ?? false,
      metadata: node.metadata ?? {},
    };
  });
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const edges: ResolvedEdge[] = definition.edges.map((edge) => {
    const from = nodeById.get(edge.from);
    const to = nodeById.get(edge.to);
    if (from === undefined || to === undefined)
      throw new Error(`edge ${edge.id} has unresolved endpoints`);
    const horizontal = layout.mode === "wide";
    const start = horizontal
      ? { x: geometry(from.x + from.width), y: geometry(from.y + from.height / 2) }
      : { x: geometry(from.x + from.width / 2), y: geometry(from.y + from.height) };
    const end = horizontal
      ? { x: geometry(to.x), y: geometry(to.y + to.height / 2) }
      : { x: geometry(to.x + to.width / 2), y: geometry(to.y) };
    return {
      id: edge.id,
      from: edge.from,
      to: edge.to,
      start,
      end,
      path: `M ${start.x} ${start.y} L ${end.x} ${end.y}`,
      directed: edge.directed ?? true,
      ...(edge.label === undefined ? {} : { label: edge.label }),
      appearance: { stroke: theme.colors.connector, strokeWidth: 2 },
      state: { opacity: 1, progress: 1 },
    };
  });

  return {
    id: definition.id,
    width: layout.size.width,
    height: layout.size.height,
    label: definition.title,
    title: definition.title,
    ...(definition.description === undefined ? {} : { description: definition.description }),
    layout: layout.mode,
    theme: resolvedTheme(theme),
    nodes,
    edges,
    ...(definition.timeline === undefined ? {} : { timeline: definition.timeline }),
  };
}

/** Converts the pipeline subset into the general serializable authoring schema. */
export function pipelineToScene(
  definition: PipelineDefinition,
  viewport: { width: number; height: number },
): KineglyphScene {
  return {
    schemaVersion: 1,
    id: definition.id,
    title: definition.title,
    viewport,
    children: [
      {
        id: `${definition.id}-pipeline`,
        type: "pipeline",
        stages: definition.nodes.map((node) => ({
          id: node.id,
          title: node.label,
          ...(node.description === undefined ? {} : { body: node.description }),
          ...(node.tone === undefined ? {} : { tone: node.tone }),
        })),
      },
    ],
  };
}
