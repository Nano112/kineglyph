#!/usr/bin/env node
import { resolve as resolvePath } from "node:path";
import { pathToFileURL } from "node:url";
import {
  createTheme,
  doctorResolvedScene,
  doctorScene,
  resolveFigure,
  type DoctorFinding,
  type DoctorReport,
  type FigureSource,
  type LayoutName,
  type ResolvedScene,
  type SceneDefinition,
} from "@kineglyph/core";

const USAGE = `Usage: kineglyph doctor --scene <module>#<export> [options]

Options:
  --scene <module>#<export>  Scene, pipeline, or scene factory to audit
  --json                     Emit the complete machine-readable report
  --fail-on <level>          error | warning | never (default: error)
  --wide <px>                Wide audit width (default: 1200)
  --compact <px>             Compact audit width (default: 720)
  --narrow <px>              Narrow audit width (default: 390)
  -h, --help                 Show this help
`;

type FailLevel = "error" | "warning" | "never";

interface DoctorArgs {
  readonly scene: string;
  readonly json: boolean;
  readonly failOn: FailLevel;
  readonly widths: Readonly<Record<LayoutName, number>>;
}

class UsageError extends Error {}

function positive(name: string, value: string | undefined): number {
  const parsed = Number(value);
  if (value === undefined || !Number.isFinite(parsed) || parsed <= 0)
    throw new UsageError(`--${name} expects a number greater than 0`);
  return parsed;
}

export function parseDoctorArgs(argv: readonly string[]): DoctorArgs | "help" {
  const args = argv[0] === "doctor" ? argv.slice(1) : [...argv];
  let scene: string | undefined;
  let json = false;
  let failOn: FailLevel = "error";
  const widths: Record<LayoutName, number> = { wide: 1200, compact: 720, narrow: 390 };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index] ?? "";
    if (arg === "-h" || arg === "--help") return "help";
    if (arg === "--json") {
      json = true;
      continue;
    }
    if (arg === "--scene") {
      scene = args[++index];
      if (scene === undefined) throw new UsageError("--scene requires a module specifier");
      continue;
    }
    if (arg === "--fail-on") {
      const value = args[++index];
      if (value !== "error" && value !== "warning" && value !== "never")
        throw new UsageError("--fail-on must be error, warning, or never");
      failOn = value;
      continue;
    }
    if (arg === "--wide" || arg === "--compact" || arg === "--narrow") {
      const layout = arg.slice(2) as LayoutName;
      widths[layout] = positive(layout, args[++index]);
      continue;
    }
    throw new UsageError(`unknown option ${arg}`);
  }
  if (scene === undefined) throw new UsageError("--scene is required");
  return { scene, json, failOn, widths };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isScene(value: unknown): value is SceneDefinition {
  return isRecord(value) && value.schemaVersion === 2 && isRecord(value.root);
}

function isFigure(value: unknown): value is FigureSource {
  return (
    isScene(value) || (isRecord(value) && Array.isArray(value.nodes) && Array.isArray(value.edges))
  );
}

function isResolved(value: unknown): value is ResolvedScene {
  return (
    isRecord(value) &&
    typeof value.width === "number" &&
    typeof value.height === "number" &&
    Array.isArray(value.nodes) &&
    isRecord(value.theme)
  );
}

async function loadExport(spec: string): Promise<unknown> {
  const hash = spec.lastIndexOf("#");
  const modulePath = hash < 0 ? spec : spec.slice(0, hash);
  const name = hash < 0 ? undefined : spec.slice(hash + 1);
  const module = (await import(
    pathToFileURL(resolvePath(process.cwd(), modulePath)).href
  )) as Record<string, unknown>;
  if (name !== undefined && name.length > 0) {
    if (!(name in module)) throw new UsageError(`${modulePath} has no export named ${name}`);
    return module[name];
  }
  for (const candidate of ["default", "scene", "pipeline"])
    if (module[candidate] !== undefined) return module[candidate];
  throw new UsageError(`${modulePath} has no default, scene, or pipeline export`);
}

function score(findings: readonly DoctorFinding[]): number {
  return Math.max(
    0,
    100 -
      findings.reduce(
        (sum, finding) =>
          sum + (finding.severity === "error" ? 20 : finding.severity === "warning" ? 5 : 1),
        0,
      ),
  );
}

/** Loads and audits a module export. Exported factories receive the audit width and layout. */
export async function auditModule(args: DoctorArgs): Promise<DoctorReport> {
  let value = await loadExport(args.scene);
  if (typeof value === "function")
    value = await (value as (input: { width: number; layout: LayoutName }) => unknown)({
      width: args.widths.wide,
      layout: "wide",
    });
  if (isScene(value)) return doctorScene(value, { widths: args.widths });
  if (isFigure(value)) {
    const theme = createTheme();
    const findings: DoctorFinding[] = [];
    const layouts = (["wide", "compact", "narrow"] as const).map((layout) => {
      const resolved = resolveFigure(value, { width: args.widths[layout], layout, theme });
      findings.push(...doctorResolvedScene(resolved));
      return {
        layout,
        width: args.widths[layout],
        height: resolved.height,
        nodes: resolved.nodes.length,
        edges: resolved.edges.length,
      };
    });
    return {
      ok: !findings.some((finding) => finding.severity === "error"),
      score: score(findings),
      findings,
      layouts,
    };
  }
  if (isResolved(value)) {
    const findings = doctorResolvedScene(value);
    return {
      ok: !findings.some((finding) => finding.severity === "error"),
      score: score(findings),
      findings,
      layouts: [
        {
          layout: value.layoutName ?? "wide",
          width: value.width,
          height: value.height,
          nodes: value.nodes.length,
          edges: value.edges.length,
        },
      ],
    };
  }
  throw new UsageError("the selected export is not a Kineglyph scene, pipeline, or resolved scene");
}

function shouldFail(report: DoctorReport, level: FailLevel): boolean {
  if (level === "never") return false;
  return report.findings.some(
    (finding) =>
      finding.severity === "error" || (level === "warning" && finding.severity === "warning"),
  );
}

function textReport(report: DoctorReport): string {
  const rows = report.findings.map((finding) => {
    const location = [finding.layout, finding.nodeId].filter(Boolean).join("/");
    return `${finding.severity.toUpperCase().padEnd(7)} ${finding.code}${location === "" ? "" : ` (${location})`}: ${finding.message}\n        ${finding.remedy}`;
  });
  const summary = `Kineglyph doctor: ${report.score}/100 · ${report.findings.length} finding${report.findings.length === 1 ? "" : "s"}`;
  return `${summary}${rows.length === 0 ? "\nNo issues found.\n" : `\n${rows.join("\n")}\n`}`;
}

export async function runDoctor(argv: readonly string[]): Promise<number> {
  const args = parseDoctorArgs(argv);
  if (args === "help") {
    process.stdout.write(USAGE);
    return 0;
  }
  const report = await auditModule(args);
  process.stdout.write(
    args.json ? `${JSON.stringify(report, undefined, 2)}\n` : textReport(report),
  );
  return shouldFail(report, args.failOn) ? 1 : 0;
}

const invokedPath = process.argv[1];
if (invokedPath !== undefined && import.meta.url === pathToFileURL(invokedPath).href)
  runDoctor(process.argv.slice(2)).then(
    (code) => {
      process.exitCode = code;
    },
    (error: unknown) => {
      process.stderr.write(
        `error: ${error instanceof Error ? error.message : String(error)}\n${USAGE}`,
      );
      process.exitCode = 1;
    },
  );
