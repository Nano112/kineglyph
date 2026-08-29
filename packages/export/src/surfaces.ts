/**
 * Pre-rendered frames of live surfaces for the exporter: `--surface <nodeId>=<file|pattern>`.
 *
 * A pattern holds `{frame}` or a printf-style `%04d` where the frame number sits (any zero
 * padding is accepted; files are ordered by that number); the frame index for a time is `round(time · fps)`
 * clamped to the last file that exists, so a surface whose own timeline ended earlier holds its
 * final frame. Files are embedded as data URIs so the rasteriser needs no file access.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { basename, dirname, extname, resolve } from "node:path";
import { bytesToDataUri } from "./sequence.js";

export interface SurfaceSpec {
  readonly nodeId: string;
  readonly path: string;
}

const MIME: Readonly<Record<string, string>> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
};

/** Parse `nodeId=path` (the first `=` splits). */
export function parseSurfaceSpec(flag: string): SurfaceSpec {
  const equals = flag.indexOf("=");
  if (equals <= 0 || equals === flag.length - 1)
    throw new Error(`--surface expects <nodeId>=<file|pattern>, got "${flag}"`);
  return { nodeId: flag.slice(0, equals), path: flag.slice(equals + 1) };
}

interface FrameFiles {
  readonly files: readonly string[];
}

const PLACEHOLDER = /\{frame(?::(\d+))?\}|%0?(\d*)d/;

/** Every file a pattern matches, in frame order; a plain path is a single frame. */
function frameFiles(pattern: string, cwd: string): FrameFiles {
  const absolute = resolve(cwd, pattern);
  if (!PLACEHOLDER.test(absolute)) {
    if (!existsSync(absolute)) throw new Error(`--surface file not found: ${absolute}`);
    return { files: [absolute] };
  }
  const dir = dirname(absolute);
  const name = basename(absolute);
  const at = PLACEHOLDER.exec(name);
  const head = at === null ? name : name.slice(0, at.index);
  const tail = at === null ? "" : name.slice(at.index + at[0].length);
  const escape = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const matcher = new RegExp(`^${escape(head)}(\\d+)${escape(tail)}$`);
  const found = existsSync(dir)
    ? readdirSync(dir)
        .map((entry) => ({ entry, match: matcher.exec(entry) }))
        .filter((item): item is { entry: string; match: RegExpExecArray } => item.match !== null)
        .map((item) => ({ path: resolve(dir, item.entry), index: Number(item.match[1]) }))
        .sort((a, b) => a.index - b.index)
    : [];
  if (found.length === 0) throw new Error(`--surface pattern matched no files: ${absolute}`);
  return { files: found.map((item) => item.path) };
}

function dataUri(path: string): string {
  const mime = MIME[extname(path).toLowerCase()];
  if (mime === undefined) throw new Error(`--surface: unsupported image type ${path}`);
  return bytesToDataUri(new Uint8Array(readFileSync(path)), mime);
}

/**
 * Build the exporter's `surfaces(time)` from `--surface` specs. Frames are read lazily and
 * cached; `fps` maps time to a frame index.
 */
export function surfaceSubstitutes(
  specs: readonly SurfaceSpec[],
  fps: number,
  cwd = process.cwd(),
): (time: number) => Readonly<Record<string, string>> {
  const sources = specs.map((spec) => ({ nodeId: spec.nodeId, ...frameFiles(spec.path, cwd) }));
  const cache = new Map<string, string>();
  return (time) => {
    const index = Math.max(0, Math.round((time / 1000) * fps));
    const out: Record<string, string> = {};
    for (const source of sources) {
      const file = source.files[Math.min(index, source.files.length - 1)];
      if (file === undefined) continue;
      let uri = cache.get(file);
      if (uri === undefined) {
        uri = dataUri(file);
        cache.set(file, uri);
      }
      out[source.nodeId] = uri;
    }
    return out;
  };
}
