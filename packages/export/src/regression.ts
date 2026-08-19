import { createHash } from "node:crypto";
import {
  defaultTheme,
  resolveFigure,
  type FigureSource,
  type LayoutName,
  type MachineState,
  type ResolveFigureOptions,
  type ThemeTokens,
  type VariableValue,
} from "@kineglyph/core";
import { KineglyphExportError } from "./errors.js";
import { exportGif, type GifExportOptions } from "./gif.js";
import { exportPng, type PngExportOptions } from "./png.js";
import { exportSvg, resolveOutputSize, resolveTime, type SvgExportOptions } from "./svg.js";

/** A named container used by the deterministic regression matrix. */
export interface RegressionViewport {
  readonly name: string;
  readonly width: number;
  readonly layout: LayoutName;
}

/**
 * The standard responsive matrix. Layout is explicit so future breakpoint changes do not silently
 * turn a "compact" baseline into a wide one.
 */
export const DEFAULT_REGRESSION_VIEWPORTS: readonly RegressionViewport[] = [
  { name: "wide", width: 960, layout: "wide" },
  { name: "compact", width: 700, layout: "compact" },
  { name: "narrow", width: 390, layout: "narrow" },
];

export type RegressionFormat = "svg" | "png" | "gif";
export type RegressionMotion = "exact" | "reduced";

/** Options for resolving and rendering an application-owned visual regression matrix. */
export interface RegressionCaptureOptions {
  /** Defaults to the explicit wide/compact/narrow matrix above. */
  readonly viewports?: readonly RegressionViewport[];
  /** Exact timeline times in milliseconds. Values above the duration clamp to the final frame. */
  readonly times?: readonly number[];
  /** Include the terminal frame in addition to `times`. Defaults to true. */
  readonly includeFinal?: boolean;
  /** Add a terminal-frame snapshot labelled as reduced motion for animated scenes. */
  readonly includeReducedMotion?: boolean;
  /** Defaults to both SVG and PNG, in that stable order. */
  readonly formats?: readonly RegressionFormat[];
  readonly theme?: ThemeTokens;
  readonly machineState?: MachineState;
  readonly signals?: Readonly<Record<string, VariableValue>>;
  readonly precision?: number;
  readonly textMeasurer?: ResolveFigureOptions["textMeasurer"];
  /** Base for generated SVG DOM ids. Defaults to `reg`. */
  readonly idPrefix?: string;
  /** SVG file options; time and id prefix are owned by the matrix. */
  readonly svg?: Omit<SvgExportOptions, "time" | "idPrefix">;
  /** PNG options, including an explicit CI font set; time and id prefix are owned by the matrix. */
  readonly png?: Omit<PngExportOptions, "time" | "idPrefix">;
  /**
   * Full-timeline GIF options. GIF is captured once per viewport at the terminal exact variant,
   * rather than once for every requested still-frame time.
   */
  readonly gif?: Omit<GifExportOptions, "idPrefix">;
}

/** One rendered regression artifact and its portable SHA-256 identity. */
export interface RegressionSnapshot {
  readonly id: string;
  readonly sceneId: string;
  readonly viewport: string;
  readonly containerWidth: number;
  readonly layout: LayoutName;
  /** Final artifact dimensions after SVG sizing or PNG scale/rounding options. */
  readonly width: number;
  readonly height: number;
  readonly time: number;
  readonly motion: RegressionMotion;
  readonly format: RegressionFormat;
  readonly fingerprint: string;
  readonly byteLength: number;
  /** SVG source or PNG bytes. Manifests intentionally omit this field. */
  readonly content: string | Uint8Array;
}

/** A deterministic result: no timestamps, absolute paths, or host metadata are included. */
export interface RegressionSnapshotSet {
  readonly schemaVersion: 1;
  readonly sceneId: string;
  readonly snapshots: readonly RegressionSnapshot[];
}

/** Content-free baseline entry suitable for JSON storage in an application repository. */
export type RegressionManifestEntry = Omit<RegressionSnapshot, "content">;

/** Portable baseline manifest suitable for committing or uploading from CI. */
export interface RegressionManifest {
  readonly schemaVersion: 1;
  readonly sceneId: string;
  readonly snapshots: readonly RegressionManifestEntry[];
}

export interface RegressionChange {
  readonly id: string;
  readonly expected: RegressionManifestEntry;
  readonly actual: RegressionManifestEntry;
}

/** Structured comparison result for annotations, checks, or a custom CI reporter. */
export interface RegressionComparison {
  readonly matches: boolean;
  readonly expectedSceneId: string;
  readonly actualSceneId: string;
  readonly unchanged: readonly string[];
  readonly changed: readonly RegressionChange[];
  readonly added: readonly RegressionManifestEntry[];
  readonly removed: readonly RegressionManifestEntry[];
}

function bytes(content: string | Uint8Array): Uint8Array {
  return typeof content === "string" ? new TextEncoder().encode(content) : content;
}

/** Stable SHA-256 fingerprint used by manifests and comparison helpers. */
export function fingerprintRegressionContent(content: string | Uint8Array): string {
  return `sha256:${createHash("sha256").update(bytes(content)).digest("hex")}`;
}

function slug(value: string): string {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "snapshot"
  );
}

function timeSlug(value: number): string {
  return String(value).replace("-", "m").replace(".", "_");
}

function captureId(
  sceneId: string,
  viewport: RegressionViewport,
  motion: RegressionMotion,
  time: number,
  format: RegressionFormat,
): string {
  return `${slug(sceneId)}--${slug(viewport.name)}--${motion}-t${timeSlug(time)}.${format}`;
}

function validateViewports(viewports: readonly RegressionViewport[]): void {
  if (viewports.length === 0)
    throw new KineglyphExportError("invalid-output", "regression viewports must not be empty");
  const names = new Set<string>();
  const slugs = new Set<string>();
  viewports.forEach((viewport, index) => {
    const name = viewport.name.trim();
    if (name.length === 0)
      throw new KineglyphExportError(
        "invalid-output",
        `regression viewports[${index}].name must not be empty`,
      );
    if (!Number.isFinite(viewport.width) || viewport.width <= 0)
      throw new KineglyphExportError(
        "invalid-output",
        `regression viewport "${name}" width must be finite and greater than zero`,
      );
    const normalised = slug(name);
    if (names.has(name) || slugs.has(normalised))
      throw new KineglyphExportError(
        "invalid-output",
        `regression viewport name "${name}" is duplicated or produces a duplicate id`,
      );
    names.add(name);
    slugs.add(normalised);
  });
}

function formats(requested: readonly RegressionFormat[] | undefined): readonly RegressionFormat[] {
  const selected = new Set(requested ?? ["svg", "png"]);
  if (selected.size === 0)
    throw new KineglyphExportError("invalid-output", "regression formats must not be empty");
  for (const format of selected)
    if (format !== "svg" && format !== "png" && format !== "gif")
      throw new KineglyphExportError(
        "invalid-output",
        `unsupported regression format "${String(format)}"`,
      );
  return (["svg", "png", "gif"] as const).filter((format) => selected.has(format));
}

function exactTimes(
  duration: number,
  requested: readonly number[] | undefined,
  includeFinal: boolean,
): readonly number[] {
  const times = [...(requested ?? []), ...(includeFinal ? [duration] : [])];
  if (times.length === 0)
    throw new KineglyphExportError(
      "invalid-output",
      "regression capture needs at least one exact time or includeFinal=true",
    );
  for (const time of times)
    if (!Number.isFinite(time) || time < 0)
      throw new KineglyphExportError(
        "invalid-time",
        `regression time must be finite and non-negative (received ${String(time)})`,
      );
  return [...new Set(times.map((time) => Math.min(time, duration)))].sort((a, b) => a - b);
}

function assertResolvedScene(
  sceneId: string,
  viewport: RegressionViewport,
  errors: readonly { readonly code: string; readonly message: string }[],
): void {
  if (errors.length === 0) return;
  throw new KineglyphExportError(
    "invalid-scene",
    `${sceneId} (${viewport.name} at ${viewport.width}px):\n${errors.map((entry) => `- ${entry.code}: ${entry.message}`).join("\n")}`,
  );
}

/**
 * Resolve and render a deterministic responsive snapshot matrix.
 *
 * SVG artifacts are byte-stable for the same scene and options. PNG fingerprints additionally
 * depend on the supplied fonts; CI should pass `png.fonts` with repository-owned font files rather
 * than relying on system fonts. Reduced motion is represented by the terminal frame, matching the
 * web runtime. Static scenes do not emit a redundant reduced-motion variant.
 */
export async function captureRegressionSnapshots(
  source: FigureSource,
  options: RegressionCaptureOptions = {},
): Promise<RegressionSnapshotSet> {
  const viewports = options.viewports ?? DEFAULT_REGRESSION_VIEWPORTS;
  validateViewports(viewports);
  const selectedFormats = formats(options.formats);
  const snapshots: RegressionSnapshot[] = [];
  let sceneId: string | undefined;
  for (const viewport of viewports) {
    const scene = resolveFigure(source, {
      width: viewport.width,
      layout: viewport.layout,
      theme: options.theme ?? defaultTheme,
      ...(options.machineState === undefined ? {} : { machineState: options.machineState }),
      ...(options.signals === undefined ? {} : { signals: options.signals }),
      ...(options.precision === undefined ? {} : { precision: options.precision }),
      ...(options.textMeasurer === undefined ? {} : { textMeasurer: options.textMeasurer }),
    });
    sceneId ??= scene.id;
    const errors = (scene.diagnostics ?? []).filter((entry) => entry.severity === "error");
    assertResolvedScene(scene.id, viewport, errors);
    const duration = scene.timeline?.duration ?? 0;
    const variants: Array<{ readonly motion: RegressionMotion; readonly time: number }> =
      exactTimes(duration, options.times, options.includeFinal ?? true).map((time) => ({
        motion: "exact",
        time,
      }));
    if (options.includeReducedMotion === true && duration > 0)
      variants.push({ motion: "reduced", time: duration });
    for (const variant of variants) {
      const time = resolveTime(scene, variant.time);
      for (const format of selectedFormats) {
        // GIF represents the complete timeline, so one artifact per viewport is sufficient.
        // Keep its terminal time in the manifest so comparisons remain explicit and sortable.
        if (format === "gif" && (variant.motion !== "exact" || time !== duration)) continue;
        const id = captureId(scene.id, viewport, variant.motion, time, format);
        // The variant belongs in the artifact id, not generated DOM ids: terminal and reduced
        // snapshots should fingerprint identically when they are visually identical.
        const idPrefix = `${options.idPrefix ?? "reg"}-${slug(scene.id)}-${slug(viewport.name)}`;
        const content =
          format === "svg"
            ? exportSvg(scene, { ...options.svg, time, idPrefix })
            : format === "png"
              ? await exportPng(scene, { ...options.png, time, idPrefix })
              : await exportGif(scene, { ...options.gif, idPrefix });
        const outputSize = resolveOutputSize(
          { width: scene.width, height: scene.height },
          format === "svg"
            ? (options.svg ?? {})
            : format === "png"
              ? (options.png ?? {})
              : (options.gif ?? {}),
          format !== "svg",
        );
        snapshots.push({
          id,
          sceneId: scene.id,
          viewport: viewport.name,
          containerWidth: viewport.width,
          layout: scene.layoutName ?? viewport.layout,
          width: outputSize.width,
          height: outputSize.height,
          time,
          motion: variant.motion,
          format,
          fingerprint: fingerprintRegressionContent(content),
          byteLength: bytes(content).byteLength,
          content,
        });
      }
    }
  }
  return { schemaVersion: 1, sceneId: sceneId ?? "scene", snapshots };
}

/** Strip artifact bytes while retaining every field needed for deterministic CI comparison. */
export function createRegressionManifest(snapshots: RegressionSnapshotSet): RegressionManifest {
  return {
    schemaVersion: 1,
    sceneId: snapshots.sceneId,
    snapshots: snapshots.snapshots.map(({ content: _content, ...entry }) => {
      void _content;
      return entry;
    }),
  };
}

function sortedEntries(manifest: RegressionManifest): readonly RegressionManifestEntry[] {
  return [...manifest.snapshots].sort((a, b) => a.id.localeCompare(b.id));
}

function sameEntry(a: RegressionManifestEntry, b: RegressionManifestEntry): boolean {
  return (
    a.fingerprint === b.fingerprint &&
    a.sceneId === b.sceneId &&
    a.viewport === b.viewport &&
    a.containerWidth === b.containerWidth &&
    a.layout === b.layout &&
    a.width === b.width &&
    a.height === b.height &&
    a.time === b.time &&
    a.motion === b.motion &&
    a.format === b.format &&
    a.byteLength === b.byteLength
  );
}

/** Compare two manifests without reading files or assuming a particular test runner. */
export function compareRegressionManifests(
  expected: RegressionManifest,
  actual: RegressionManifest,
): RegressionComparison {
  const expectedById = new Map(sortedEntries(expected).map((entry) => [entry.id, entry]));
  const actualById = new Map(sortedEntries(actual).map((entry) => [entry.id, entry]));
  const unchanged: string[] = [];
  const changed: RegressionChange[] = [];
  const added: RegressionManifestEntry[] = [];
  const removed: RegressionManifestEntry[] = [];
  for (const [id, baseline] of expectedById) {
    const candidate = actualById.get(id);
    if (candidate === undefined) removed.push(baseline);
    else if (sameEntry(candidate, baseline)) unchanged.push(id);
    else changed.push({ id, expected: baseline, actual: candidate });
  }
  for (const [id, candidate] of actualById) if (!expectedById.has(id)) added.push(candidate);
  return {
    matches:
      expected.sceneId === actual.sceneId &&
      changed.length === 0 &&
      added.length === 0 &&
      removed.length === 0,
    expectedSceneId: expected.sceneId,
    actualSceneId: actual.sceneId,
    unchanged,
    changed,
    added,
    removed,
  };
}

/** Stable plain-text summary suitable for a test failure, build log, or check annotation. */
export function formatRegressionReport(comparison: RegressionComparison): string {
  const status = comparison.matches ? "PASS" : "FAIL";
  const lines = [
    `Kineglyph visual regression: ${status}`,
    `scene: ${comparison.expectedSceneId}${comparison.expectedSceneId === comparison.actualSceneId ? "" : ` -> ${comparison.actualSceneId}`}`,
    `unchanged: ${comparison.unchanged.length}; changed: ${comparison.changed.length}; added: ${comparison.added.length}; removed: ${comparison.removed.length}`,
  ];
  comparison.changed.forEach((entry) =>
    lines.push(
      `~ ${entry.id} ${entry.expected.fingerprint} (${entry.expected.width}x${entry.expected.height}, ${entry.expected.layout}, t=${entry.expected.time}) -> ${entry.actual.fingerprint} (${entry.actual.width}x${entry.actual.height}, ${entry.actual.layout}, t=${entry.actual.time})`,
    ),
  );
  comparison.added.forEach((entry) => lines.push(`+ ${entry.id} ${entry.fingerprint}`));
  comparison.removed.forEach((entry) => lines.push(`- ${entry.id} ${entry.fingerprint}`));
  return lines.join("\n");
}

/** Throw a runner-agnostic error when a comparison differs; otherwise return the comparison. */
export function assertRegressionMatch(comparison: RegressionComparison): RegressionComparison {
  if (!comparison.matches) {
    const error = new Error(formatRegressionReport(comparison));
    error.name = "KineglyphRegressionError";
    throw error;
  }
  return comparison;
}
