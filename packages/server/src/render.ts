import { fileURLToPath } from "node:url";
import {
  figure,
  validateScene,
  resolveScene,
  createTheme,
  defaultTheme,
  linearGradient,
  professionalThemes,
  anatomyTheme,
  anatomyDarkTheme,
} from "@kineglyph/core";
import { plot } from "@kineglyph/plot";
import { exportSvg } from "@kineglyph/export/svg";
import { LIMITS, RequestError, parseRequest } from "./schema.js";

export async function render(input: unknown, format: string): Promise<Uint8Array> {
  if (!["svg", "png", "gif"].includes(format)) throw new RequestError("unsupported format");
  const r = parseRequest(input);
  let scene = r.scene;
  if (!scene) {
    const c = r.chart!;
    const unit = c.unit === "percent" ? "%" : c.unit;
    const band = c.series.some((s) => (s.mark ?? c.mark) === "bar") || typeof c.x?.[0] === "string";
    const result = plot(
      {
        title: c.title,
        titleStyle: "display",
        headingAlign: "center",
        height: { wide: 420, compact: 340, narrow: 260 },
        legend: (c.legend ?? c.series.length > 1) ? {} : false,
        x: band
          ? { type: "band", ...(c.xLabel ? { label: c.xLabel } : {}) }
          : {
              type: "linear",
              ...(c.xLabel ? { label: c.xLabel } : {}),
              ...(c.xDomain ? { domain: c.xDomain, nice: false } : {}),
            },
        y: {
          type: "linear",
          ...(c.yDomain ? { domain: c.yDomain, nice: false } : {}),
          format: { suffix: unit },
          ...(c.yLabel ? { label: c.yLabel } : {}),
        },
        valueLabels:
          c.series.length === 1 && (c.series[0]!.mark ?? c.mark) === "bar"
            ? { format: { suffix: unit }, show: "auto" }
            : false,
        series: c.series.map((s, i) => ({
          id: `s${i}`,
          label: s.name,
          mark: s.mark ?? c.mark,
          ...(s.tone ? { tone: s.tone } : {}),
          radius: 6,
          ...((s.mark ?? c.mark) === "bar" && c.series.length === 1 && !s.tone
            ? {
                fill: linearGradient(
                  [
                    { at: 0, color: "chart1" },
                    { at: 1, color: "chart2" },
                  ],
                  { angle: 90 },
                ),
              }
            : {}),
          data: s.data.map((y, j) => ({
            x: band ? String(c.x?.[j] ?? j + 1) : (c.x?.[j] ?? j + 1),
            y,
          })),
        })),
      },
      { motion: "auto", duration: 800 },
    );
    scene = figure("http-chart", { title: c.title }, (f) => f.add(result, { at: 0 }));
  }
  const validation = validateScene(scene);
  if (!validation.ok)
    throw new RequestError(
      validation.diagnostics
        .filter((d) => d.severity === "error")
        .map((d) => d.message)
        .join("; ")
        .slice(0, 1024),
    );
  const baseTheme =
    r.theme === "dark"
      ? createTheme({
          colors: {
            canvas: "#101827",
            surface: "#172235",
            text: "#f1f5ff",
            textMuted: "#a9b6ce",
            border: "#35435b",
            connector: "#91a2be",
          },
        })
      : r.theme === "anatomy"
        ? anatomyTheme
        : r.theme === "anatomy-dark"
          ? anatomyDarkTheme
          : r.theme === "light"
            ? defaultTheme
            : professionalThemes[r.theme === "field-manual" ? "fieldManual" : r.theme];
  // Fixed bundled family: never accept user-controlled CSS/font names.
  const theme = createTheme(
    {
      typography: Object.fromEntries(
        Object.entries(baseTheme.typography).map(([key, value]) => [
          key,
          { ...value, family: "Geist Mono" },
        ]),
      ),
    },
    baseTheme,
  );
  const resolved = resolveScene(scene, { width: r.width, theme });
  const pixels = Math.round(resolved.width * r.scale) * Math.round(resolved.height * r.scale);
  if (resolved.height > 2000 || pixels > LIMITS.pixels)
    throw new RequestError("output pixel budget exceeded", 413);
  if (format === "svg")
    return new TextEncoder().encode(
      exportSvg(resolved, { scale: r.scale, ...(r.time === undefined ? {} : { time: r.time }) }),
    );
  const { exportPng, exportGif, planGifFrames } = await import("@kineglyph/export");
  const fonts = {
    files: [fileURLToPath(new URL("../assets/GeistMono.ttf", import.meta.url))],
    defaultFamily: "Geist Mono",
    loadSystemFonts: false,
  };
  if (format === "png")
    return exportPng(resolved, {
      scale: r.scale,
      fonts,
      ...(r.time === undefined ? {} : { time: r.time }),
    });
  const duration = resolved.timeline?.duration ?? 0;
  // Match the exporter's inclusive final-frame sampling, before it allocates the plan.
  const requestedFrames = Math.floor((duration * r.fps) / 1000) + 1;
  if (requestedFrames > LIMITS.frames)
    throw new RequestError(
      `GIF requests ${requestedFrames} frames, exceeding the ${LIMITS.frames}-frame limit; lower fps or shorten the timeline`,
      413,
    );
  const frames = planGifFrames(duration, {
    fps: r.fps,
    maxFrames: LIMITS.frames,
  }).frameCount;
  if (pixels * frames > LIMITS.framePixels)
    throw new RequestError("GIF frame pixel budget exceeded", 413);
  return exportGif(resolved, { scale: r.scale, fonts, fps: r.fps, maxFrames: LIMITS.frames });
}
