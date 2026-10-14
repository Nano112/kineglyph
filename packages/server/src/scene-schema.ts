import { z } from "zod";
/** Deliberately closed HTTP subset of SceneDefinition, not a replacement core scene model. */
const id = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9_.:-]+$/);
const text = z.string().max(2048);
const n = z.number().finite().min(-4096).max(4096);
const size = z.number().min(0).max(2000);
const opacity = z.number().min(0).max(1);
const paint = z.enum([
  "none",
  "neutral",
  "muted",
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
  "chart1",
  "chart2",
  "chart3",
  "chart4",
  "chart5",
  "chart6",
  "chartPositive",
  "chartNegative",
  "chartNeutral",
]);
const style = z.enum(["label", "caption", "body", "bodyStrong", "title", "display", "code"]);
const responsive = <T extends z.ZodType>(s: T) =>
  z.union([
    s,
    z
      .strictObject({ wide: s.optional(), compact: s.optional(), narrow: s.optional() })
      .refine((v) => Object.keys(v).length > 0),
  ]);
const length = z.union([
  size,
  z.enum(["fill", "hug"]),
  z.string().regex(/^(?:100|\d{1,2})(?:\.\d{1,3})?%$/),
]);
const insets = z.union([size, z.tuple([size, size]), z.tuple([size, size, size, size])]);
const stops = z
  .array(z.strictObject({ at: opacity, color: paint, opacity: opacity.optional() }))
  .min(2)
  .max(16);
const fill = z.union([
  paint,
  z.strictObject({
    type: z.literal("linear-gradient"),
    stops,
    angle: n.optional(),
    spread: z.enum(["pad", "reflect", "repeat"]).optional(),
  }),
  z.strictObject({
    type: z.literal("radial-gradient"),
    stops,
    center: z.tuple([opacity, opacity]).optional(),
    radius: opacity.optional(),
  }),
]);
const metadata = z
  .record(id, z.union([text, n, z.boolean(), z.null()]))
  .refine((v) => Object.keys(v).length <= 64);
const inspect = z.strictObject({
  role: text.optional(),
  title: text.optional(),
  summary: text.optional(),
  fields: z
    .array(z.strictObject({ label: text, value: text }))
    .max(32)
    .optional(),
});
const materialRole = z.enum(["flat", "raised", "floating", "inset", "glass"]);
const material = z.union([
  materialRole,
  z.strictObject({
    material: materialRole.optional(),
    fill: fill.optional(),
    stroke: paint.optional(),
    strokeWidth: z.number().min(0).max(32).optional(),
    radius: size.optional(),
    opacity: opacity.optional(),
  }),
]);
const side = z.enum(["left", "right", "top", "bottom", "center"]);
const endpoint = z.union([
  id,
  z.strictObject({
    node: id,
    port: id.optional(),
    side: responsive(z.enum(["auto", "left", "right", "top", "bottom", "center"])).optional(),
    offset: responsive(opacity).optional(),
    gap: n.optional(),
  }),
]);
const common = {
  metadata: metadata.optional(),
  inspect: inspect.optional(),
  interactive: z.boolean().optional(),
  interactionGroup: id.optional(),
  material: material.optional(),
  ports: z
    .array(
      z.strictObject({
        id,
        side: responsive(side),
        offset: responsive(opacity).optional(),
        gap: n.optional(),
      }),
    )
    .max(32)
    .optional(),
  id,
  label: text.optional(),
  description: text.optional(),
  hidden: responsive(z.boolean()).optional(),
  opacity: opacity.optional(),
  rotation: responsive(n).optional(),
  z: n.optional(),
  width: responsive(length).optional(),
  height: responsive(length).optional(),
  minWidth: responsive(size).optional(),
  maxWidth: responsive(size).optional(),
  minHeight: responsive(size).optional(),
  grow: responsive(z.number().min(0).max(100)).optional(),
  position: responsive(
    z.strictObject({
      x: n,
      y: n,
      anchor: z
        .enum([
          "top-left",
          "top",
          "top-right",
          "left",
          "center",
          "right",
          "bottom-left",
          "bottom",
          "bottom-right",
        ])
        .optional(),
    }),
  ).optional(),
  alignSelf: responsive(z.enum(["start", "center", "end", "stretch"])).optional(),
  justifySelf: responsive(z.enum(["start", "center", "end", "stretch"])).optional(),
  revealAnchor: z.enum(["left", "right", "top", "bottom"]).optional(),
};
const shape = {
  material: material.optional(),
  fill: fill.optional(),
  stroke: paint.optional(),
  strokeWidth: z.number().min(0).max(32).optional(),
  dash: z.enum(["solid", "dashed", "dotted"]).optional(),
};
const typography = { text, textStyle: responsive(style).optional() };
const breakpoints = z.strictObject({ wide: size.optional(), compact: size.optional() });
export const sceneNodeSchema: z.ZodType = z.lazy(() =>
  z.discriminatedUnion("type", [
    z.strictObject({
      ...common,
      type: z.literal("group"),
      children: z.array(sceneNodeSchema).max(500),
      layout: responsive(
        z.enum(["stack", "row", "grid", "overlay", "absolute", "coordinates"]),
      ).optional(),
      gap: responsive(size).optional(),
      padding: responsive(insets).optional(),
      align: responsive(z.enum(["start", "center", "end", "stretch"])).optional(),
      justify: responsive(
        z.enum(["start", "center", "end", "between", "around", "evenly"]),
      ).optional(),
      columns: responsive(z.union([z.number().int().min(1).max(32), z.literal("auto")])).optional(),
      frame: z
        .strictObject({
          ...shape,
          material: materialRole.optional(),
          radius: size.optional(),
          opacity: opacity.optional(),
        })
        .optional(),
      clip: z.boolean().optional(),
      allowOverflow: z.boolean().optional(),
      breakpoints: breakpoints.optional(),
      fit: responsive(z.enum(["content", "none"])).optional(),
      aspect: z.number().min(0.1).max(10).optional(),
    }),
    z.strictObject({
      ...common,
      type: z.literal("icon"),
      icon: id,
      size: responsive(size).optional(),
      tone: paint.optional(),
      background: paint.optional(),
    }),
    z.strictObject({ ...common, ...shape, type: z.literal("rect"), radius: size.optional() }),
    z.strictObject({
      ...common,
      ...shape,
      type: z.literal("circle"),
      radius: responsive(size).optional(),
    }),
    z.strictObject({
      ...common,
      ...typography,
      type: z.literal("text"),
      color: paint.optional(),
      align: responsive(z.enum(["start", "center", "end"])).optional(),
      maxLines: responsive(z.number().int().min(1).max(50)).optional(),
      transform: z.enum(["none", "uppercase"]).optional(),
      wrap: z.boolean().optional(),
      reveal: z.enum(["lines", "characters"]).optional(),
    }),
    z.strictObject({
      ...common,
      ...shape,
      type: z.literal("path"),
      d: z
        .string()
        .min(1)
        .max(4096)
        .regex(/^[MmLlHhVvCcSsQqTtAaZz0-9eE.,+\-\s]+$/),
      viewBox: z.strictObject({ width: size.positive(), height: size.positive() }),
      lineCap: z.enum(["round", "square", "butt"]).optional(),
    }),
    z.strictObject({
      ...common,
      ...shape,
      type: z.literal("polyline"),
      points: z
        .array(z.tuple([n, n]))
        .min(2)
        .max(1000),
      space: z.enum(["fraction", "px"]).optional(),
      curve: z.enum(["linear", "monotone", "step"]).optional(),
      closed: z.boolean().optional(),
      baseline: n.optional(),
      lineCap: z.enum(["round", "square", "butt"]).optional(),
    }),
    z.strictObject({
      ...common,
      ...typography,
      type: z.literal("badge"),
      tone: paint.optional(),
      variant: z.enum(["solid", "outline", "soft"]).optional(),
    }),
    z.strictObject({
      ...common,
      ...typography,
      type: z.literal("callout"),
      tone: paint.optional(),
      pointer: responsive(z.enum(["none", "up", "down", "left", "right"])).optional(),
      maxLines: responsive(z.number().int().min(1).max(50)).optional(),
      padding: responsive(insets).optional(),
    }),
    z.strictObject({
      ...common,
      type: z.literal("legend"),
      items: z
        .array(
          z.strictObject({
            id,
            label: text,
            swatch: paint,
            shape: z.enum(["square", "circle", "line", "dashed"]).optional(),
          }),
        )
        .max(32),
      direction: responsive(z.enum(["row", "column"])).optional(),
      gap: responsive(size).optional(),
      textStyle: responsive(style).optional(),
    }),
  ]),
);
export const sceneSchema = z
  .strictObject({
    schemaVersion: z.literal(2),
    id,
    title: z.string().min(1).max(256),
    description: text.optional(),
    metadata: metadata.optional(),
    root: sceneNodeSchema,
    padding: responsive(insets).optional(),
    breakpoints: breakpoints.optional(),
    background: z
      .enum(["canvas", "surface", "surfaceRaised", "surfaceMuted", "transparent"])
      .optional(),
    edges: z
      .array(
        z.strictObject({
          id,
          metadata: metadata.optional(),
          interactionGroup: id.optional(),
          from: endpoint,
          to: endpoint,
          stroke: z.enum(["solid", "dashed", "dotted", "flow"]).optional(),
          cornerRadius: size.optional(),
          clearance: size.optional(),
          laneGap: size.optional(),
          crossingCost: size.optional(),
          avoid: responsive(z.enum(["none", "nodes", "nodes-and-edges"])).optional(),
          spline: z.enum(["rounded", "fluid"]).optional(),
          route: responsive(
            z.enum(["straight", "curve", "arc", "orthogonal", "spline"]),
          ).optional(),
          head: z.enum(["none", "arrow", "triangle", "dot", "diamond", "bar"]).optional(),
          tail: z.enum(["none", "arrow", "triangle", "dot", "diamond", "bar"]).optional(),
          width: z.number().positive().max(32).optional(),
          tone: paint.optional(),
          opacity: opacity.optional(),
          label: text.optional(),
          description: text.optional(),
          curvature: opacity.optional(),
          bend: n.optional(),
          hidden: responsive(z.boolean()).optional(),
        }),
      )
      .max(100)
      .optional(),
    timeline: z
      .strictObject({
        duration: z.number().min(0).max(2000),
        tracks: z
          .array(
            z.strictObject({
              id,
              target: id,
              property: z.enum([
                "opacity",
                "translateX",
                "translateY",
                "scale",
                "rotation",
                "progress",
                "edgeReveal",
                "revealX",
                "revealY",
              ]),
              keyframes: z
                .array(
                  z.strictObject({
                    time: z.number().min(0).max(2000),
                    value: n,
                    easing: z.enum(["linear", "easeIn", "easeOut", "easeInOut"]).optional(),
                  }),
                )
                .min(1)
                .max(32),
            }),
          )
          .max(100),
      })
      .optional(),
  })
  .superRefine((scene, ctx) => {
    if ((scene.root as { type?: unknown }).type !== "group")
      ctx.addIssue({ code: "custom", message: "root must be group" });
    let nodes = 0,
      points = 0;
    const walk = (v: unknown): void => {
      const node = v as { children?: unknown[]; points?: unknown[] };
      nodes++;
      points += node.points?.length ?? 0;
      node.children?.forEach(walk);
    };
    walk(scene.root);
    if (nodes > 500 || points > 1000)
      ctx.addIssue({ code: "custom", message: "scene node/point budget exceeded" });
    for (const track of scene.timeline?.tracks ?? []) {
      let previous = -1;
      for (const frame of track.keyframes) {
        if (frame.time < previous || frame.time > scene.timeline!.duration)
          ctx.addIssue({ code: "custom", message: "keyframes must be ordered within timeline" });
        previous = frame.time;
      }
    }
  });
