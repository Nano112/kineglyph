import { z } from "zod";
import type { SceneDefinition } from "@kineglyph/core";
import { sceneSchema } from "./scene-schema.js";
export { sceneSchema } from "./scene-schema.js";

export const LIMITS = Object.freeze({
  bytes: 131072,
  depth: 24,
  values: 20000,
  points: 1000,
  nodes: 500,
  pixels: 4000000,
  framePixels: 24000000,
  frames: 25,
  outputBytes: 16000000,
});
export class RequestError extends Error {
  constructor(
    message: string,
    public readonly status = 400,
  ) {
    super(message);
  }
}
const number = z.number().finite().min(-1e9).max(1e9);
const text = z.string().min(1).max(256);
const data = z.array(number.nullable()).min(1).max(LIMITS.points);
const mark = z.enum(["bar", "line", "area", "dot"]);
const tone = z.enum([
  "chart1",
  "chart2",
  "chart3",
  "chart4",
  "chart5",
  "chart6",
  "accent",
  "info",
  "success",
  "warning",
  "danger",
  "muted",
  "neutral",
]);
const domain = z.tuple([number, number]).refine(([a, b]) => a < b, "domain must increase");
export const chartSchema = z
  .strictObject({
    series: z
      .array(z.strictObject({ name: text, data, mark: mark.optional(), tone: tone.optional() }))
      .min(1)
      .max(6),
    x: z
      .array(z.union([text, number]))
      .min(1)
      .max(LIMITS.points)
      .optional(),
    title: text.default("A closer look"),
    unit: z.string().max(32).default(""),
    mark: mark.default("line"),
    xLabel: text.optional(),
    yLabel: text.optional(),
    legend: z.boolean().optional(),
    yDomain: domain.optional(),
    xDomain: domain.optional(),
  })
  .superRefine((c, ctx) => {
    // Array size failures do not prevent Zod from running refinements.
    const first = c.series[0];
    if (!first) return;
    const count = first.data.length;
    if (c.series.some((s) => s.data.length !== count) || (c.x && c.x.length !== count))
      ctx.addIssue({ code: "custom", message: "series and x lengths must match" });
    if (count * c.series.length > LIMITS.points)
      ctx.addIssue({ code: "custom", message: "too many points" });
    if (c.x && (new Set(c.x).size !== c.x.length || !c.x.every((v) => typeof v === typeof c.x![0])))
      ctx.addIssue({ code: "custom", message: "x values must be unique and homogeneous" });
    if (
      c.xDomain &&
      ((c.x && typeof c.x[0] !== "number") || c.series.some((s) => (s.mark ?? c.mark) === "bar"))
    )
      ctx.addIssue({ code: "custom", message: "xDomain requires numeric x and a non-bar mark" });
  });
export type ChartSpec = z.input<typeof chartSchema>;
export const requestSchema = z
  .strictObject({
    data: data.optional(),
    chart: chartSchema.optional(),
    scene: sceneSchema.optional(),
    width: z.number().int().min(240).max(1600).default(960),
    scale: z.number().min(0.25).max(3).default(1),
    theme: z
      .enum([
        "light",
        "dark",
        "blueprint",
        "kineglyph",
        "swiss",
        "ledger",
        "field-manual",
        "studio",
        "civic",
        "anatomy",
        "anatomy-dark",
      ])
      .default("light"),
    time: z.number().finite().min(0).max(2000).optional(),
    fps: z.number().finite().min(1).max(24).default(8),
  })
  .superRefine((r, ctx) => {
    if ([r.data, r.chart, r.scene].filter((v) => v !== undefined).length !== 1)
      ctx.addIssue({ code: "custom", message: "provide exactly one of data, chart or scene" });
  });
export type RenderRequest = Omit<z.input<typeof requestSchema>, "scene"> & {
  scene?: SceneDefinition;
};
export function guardInput(value: unknown): void {
  let count = 0;
  const walk = (v: unknown, depth: number): void => {
    if (++count > LIMITS.values || depth > LIMITS.depth)
      throw new RequestError("input complexity exceeded", 413);
    if (v && typeof v === "object") {
      for (const [key, child] of Object.entries(v)) {
        if (["__proto__", "prototype", "constructor"].includes(key))
          throw new RequestError("forbidden key");
        walk(child, depth + 1);
      }
    }
  };
  walk(value, 0);
}
export interface NormalizedRequest {
  width: number;
  scale: number;
  theme: z.output<typeof requestSchema>["theme"];
  chart?: z.output<typeof chartSchema>;
  scene?: SceneDefinition;
  time?: number;
  fps: number;
}
export function parseRequest(value: unknown): NormalizedRequest {
  guardInput(value);
  const parsed = requestSchema.safeParse(value);
  if (!parsed.success)
    throw new RequestError(
      parsed.error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; ")
        .slice(0, 1024),
    );
  const r = parsed.data;
  return {
    width: r.width,
    scale: r.scale,
    theme: r.theme,
    fps: r.fps,
    ...(r.time === undefined ? {} : { time: r.time }),
    ...(r.scene
      ? { scene: r.scene as SceneDefinition }
      : { chart: r.chart ?? chartSchema.parse({ series: [{ name: "Value", data: r.data }] }) }),
  };
}
