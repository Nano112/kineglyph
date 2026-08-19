import type { ResolvedFillPaint, ResolvedNode, ResolvedScene } from "./resolved.js";
import { resolveScene } from "./resolve.js";
import { validateScene, type LayoutName, type SceneDefinition } from "./scene.js";
import { createTheme, type ThemeTokens } from "./theme.js";

export type DoctorSeverity = "error" | "warning" | "info";

export interface DoctorFinding {
  readonly severity: DoctorSeverity;
  readonly code: string;
  readonly message: string;
  readonly remedy: string;
  readonly nodeId?: string;
  readonly layout?: LayoutName;
}

export interface DoctorReport {
  readonly ok: boolean;
  readonly score: number;
  readonly findings: readonly DoctorFinding[];
  readonly layouts: readonly {
    readonly layout: LayoutName;
    readonly width: number;
    readonly height: number;
    readonly nodes: number;
    readonly edges: number;
  }[];
}

export interface DoctorOptions {
  readonly theme?: ThemeTokens;
  readonly widths?: Partial<Readonly<Record<LayoutName, number>>>;
  readonly minTouchTarget?: number;
  readonly minTextContrast?: number;
  readonly effectsBudget?: number;
  readonly paletteBudget?: number;
}

const DEFAULT_WIDTHS: Readonly<Record<LayoutName, number>> = {
  wide: 1200,
  compact: 720,
  narrow: 390,
};

function paintColor(paint: ResolvedFillPaint): string | undefined {
  if (typeof paint === "string") return paint;
  return paint.stops[Math.floor(paint.stops.length / 2)]?.color;
}

function literalColor(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const variable = /^var\([^,]+,\s*([^)]+)\)$/.exec(value);
  return variable?.[1]?.trim() ?? value;
}

function rgb(value: string | undefined): readonly [number, number, number] | undefined {
  const color = literalColor(value)?.trim();
  if (color === undefined) return undefined;
  const hex = /^#([\da-f]{3}|[\da-f]{6})$/i.exec(color)?.[1];
  if (hex !== undefined) {
    const full = hex.length === 3 ? [...hex].map((part) => part + part).join("") : hex;
    return [0, 2, 4].map((index) =>
      Number.parseInt(full.slice(index, index + 2), 16),
    ) as unknown as readonly [number, number, number];
  }
  const match = /^rgba?\(\s*([\d.]+)[, ]+([\d.]+)[, ]+([\d.]+)/i.exec(color);
  return match === null ? undefined : [Number(match[1]), Number(match[2]), Number(match[3])];
}

function luminance(value: readonly [number, number, number]): number {
  const channel = (part: number): number => {
    const normalized = part / 255;
    return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
  };
  return channel(value[0]) * 0.2126 + channel(value[1]) * 0.7152 + channel(value[2]) * 0.0722;
}

function contrast(
  foreground: string | undefined,
  background: string | undefined,
): number | undefined {
  const fg = rgb(foreground);
  const bg = rgb(background);
  if (fg === undefined || bg === undefined) return undefined;
  const a = luminance(fg);
  const b = luminance(bg);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

function finding(
  severity: DoctorSeverity,
  code: string,
  message: string,
  remedy: string,
  node?: ResolvedNode,
  layout?: LayoutName,
): DoctorFinding {
  return {
    severity,
    code,
    message,
    remedy,
    ...(node === undefined ? {} : { nodeId: node.id }),
    ...(layout === undefined ? {} : { layout }),
  };
}

export function doctorResolvedScene(
  scene: ResolvedScene,
  options: DoctorOptions = {},
): readonly DoctorFinding[] {
  const layout = scene.layoutName;
  const out: DoctorFinding[] = [];
  for (const diagnostic of scene.diagnostics ?? [])
    out.push(
      finding(
        diagnostic.severity,
        diagnostic.code,
        diagnostic.message,
        "Inspect the highlighted bounds and adjust sizing, placement, or responsive layout.",
        diagnostic.path === undefined
          ? undefined
          : scene.nodes.find((node) => node.id === diagnostic.path),
        layout,
      ),
    );
  const ids = new Set<string>();
  for (const node of scene.nodes) {
    if (ids.has(node.id))
      out.push(
        finding(
          "error",
          "duplicate-id",
          `Duplicate resolved id ${node.id}.`,
          "Give every authored node a stable unique id.",
          node,
          layout,
        ),
      );
    ids.add(node.id);
    if (node.hidden) continue;
    if (
      node.interactive &&
      (node.width < (options.minTouchTarget ?? 44) || node.height < (options.minTouchTarget ?? 44))
    )
      out.push(
        finding(
          "warning",
          "touch-target",
          `${node.id} is ${Math.round(node.width)}×${Math.round(node.height)}px.`,
          `Make interactive targets at least ${options.minTouchTarget ?? 44}px in both dimensions.`,
          node,
          layout,
        ),
      );
    if (node.text !== undefined) {
      if (node.text.fontSize < 10)
        out.push(
          finding(
            "warning",
            "small-text",
            `${node.id} uses ${node.text.fontSize}px text.`,
            "Use at least 10px for dense labels and 12px for ordinary copy.",
            node,
            layout,
          ),
        );
      const ratio = contrast(node.text.color, scene.background ?? scene.theme.background);
      if (ratio !== undefined && ratio < (options.minTextContrast ?? 4.5))
        out.push(
          finding(
            "warning",
            "contrast",
            `${node.id} text contrast is ${ratio.toFixed(2)}:1.`,
            `Raise text contrast to at least ${options.minTextContrast ?? 4.5}:1.`,
            node,
            layout,
          ),
        );
    }
    for (const effect of node.appearance.effects ?? [])
      if (effect.type === "shadow" && (effect.blur > 24 || effect.spread > 8))
        out.push(
          finding(
            "warning",
            "unwanted-glow",
            `${node.id} uses a ${effect.blur}px shadow blur.`,
            "Prefer restrained elevation: reduce blur/spread and avoid luminous accent shadows.",
            node,
            layout,
          ),
        );
  }
  const paintable = scene.nodes.filter((node) => !node.hidden && node.kind !== "group");
  if (paintable.length > 0) {
    const top = Math.min(...paintable.map((node) => node.y));
    const bottom = Math.max(...paintable.map((node) => node.y + node.height));
    const unused = Math.max(0, top) + Math.max(0, scene.height - bottom);
    if (unused > Math.max(96, scene.height * 0.24))
      out.push(
        finding(
          "warning",
          "unused-gutter",
          `${Math.round(unused)}px of vertical canvas is outside visible marks.`,
          "Use intrinsic fitting or remove fixed heights/spacers that do not carry meaning.",
          undefined,
          layout,
        ),
      );
  }
  const characters = scene.nodes.reduce(
    (sum, node) =>
      sum + (node.text?.lines.reduce((lineSum, line) => lineSum + line.text.length, 0) ?? 0),
    0,
  );
  if (characters / Math.max(1, scene.width * scene.height) > 0.018)
    out.push(
      finding(
        "info",
        "text-density",
        "The scene is text-dense for its resolved area.",
        "Shorten labels, increase the canvas, or reveal detail through inspection.",
        undefined,
        layout,
      ),
    );
  const effects = scene.nodes.reduce(
    (sum, node) => sum + (node.appearance.effects?.length ?? 0),
    0,
  );
  if (effects > (options.effectsBudget ?? 12))
    out.push(
      finding(
        "warning",
        "effects-budget",
        `${effects} material effects exceed the scene budget.`,
        `Keep at most ${options.effectsBudget ?? 12} effects and use hierarchy before ornament.`,
        undefined,
        layout,
      ),
    );
  const palette = new Set<string>();
  for (const node of scene.nodes) {
    const fill = literalColor(paintColor(node.appearance.fill));
    const stroke = literalColor(node.appearance.stroke);
    if (fill !== undefined && fill !== "none" && fill !== "transparent") palette.add(fill);
    if (stroke !== undefined && stroke !== "none" && stroke !== "transparent") palette.add(stroke);
  }
  if (palette.size > (options.paletteBudget ?? 12))
    out.push(
      finding(
        "info",
        "palette-budget",
        `${palette.size} distinct resolved paints are in use.`,
        `Consolidate semantic tones to roughly ${options.paletteBudget ?? 12} or fewer.`,
        undefined,
        layout,
      ),
    );
  return out;
}

/** Resolves and audits all three local-responsive layouts for CI and the developer overlay. */
export function doctorScene(scene: SceneDefinition, options: DoctorOptions = {}): DoctorReport {
  const findings: DoctorFinding[] = [];
  for (const diagnostic of validateScene(scene).diagnostics)
    findings.push({
      severity: diagnostic.severity,
      code: diagnostic.code,
      message: diagnostic.message,
      remedy: "Fix schema validation before inspecting rendered layouts.",
    });
  const theme = options.theme ?? createTheme();
  const layouts = (["wide", "compact", "narrow"] as const).map((layout) => {
    const width = options.widths?.[layout] ?? DEFAULT_WIDTHS[layout];
    const resolved = resolveScene(scene, { width, layout, theme });
    findings.push(...doctorResolvedScene(resolved, options));
    return {
      layout,
      width,
      height: resolved.height,
      nodes: resolved.nodes.length,
      edges: resolved.edges.length,
    };
  });
  const unique = [
    ...new Map(
      findings.map((entry) => [
        `${entry.layout ?? "all"}:${entry.nodeId ?? "scene"}:${entry.code}:${entry.message}`,
        entry,
      ]),
    ).values(),
  ];
  const penalty = unique.reduce(
    (sum, entry) => sum + (entry.severity === "error" ? 20 : entry.severity === "warning" ? 5 : 1),
    0,
  );
  return {
    ok: !unique.some((entry) => entry.severity === "error"),
    score: Math.max(0, 100 - penalty),
    findings: unique,
    layouts,
  };
}
