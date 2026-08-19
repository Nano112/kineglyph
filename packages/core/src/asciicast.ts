import type { SceneFragment } from "./fragment.js";
import { terminal, type TerminalOptions } from "./recipes.js";
import type { TimelineKeyframe } from "./resolved.js";

export type AsciicastVersion = 2 | 3;
export type AsciicastEventCode = "o" | "i" | "m" | "r" | "x" | (string & {});

export interface AsciicastTheme {
  readonly fg: string;
  readonly bg: string;
  readonly palette: readonly string[];
}

export interface AsciicastEvent {
  /** Absolute playback time in milliseconds after idle limiting and speed adjustment. */
  readonly time: number;
  readonly code: AsciicastEventCode;
  readonly data: string;
}

export interface AsciicastRecording {
  readonly version: AsciicastVersion;
  readonly columns: number;
  readonly rows: number;
  readonly title?: string;
  readonly command?: string;
  readonly duration: number;
  readonly events: readonly AsciicastEvent[];
  readonly markers: readonly { readonly time: number; readonly label: string }[];
  readonly exitStatus?: number;
  readonly theme?: AsciicastTheme;
}

export interface ParseAsciicastOptions {
  /** Caps pauses between events, in seconds. Header `idle_time_limit` is used when omitted. */
  readonly idleTimeLimit?: number;
  /** Playback multiplier. `2` is twice as fast. */
  readonly speed?: number;
}

export interface AsciicastOptions extends ParseAsciicastOptions, TerminalOptions {
  readonly id?: string;
  /** Include captured input events. Off by default because normal terminal echo is already output. */
  readonly includeInput?: boolean;
  /** Override the number of visible transcript lines. */
  readonly visibleRows?: number;
}

export interface AsciicastResult {
  readonly fragment: SceneFragment;
  readonly recording: AsciicastRecording;
  readonly handles: {
    readonly root: string;
    readonly screen: string;
    readonly text: string;
  };
}

type UnknownObject = Record<string, unknown>;

function object(value: unknown): UnknownObject | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as UnknownObject)
    : undefined;
}

function positiveInteger(value: unknown, label: string): number {
  if (!Number.isInteger(value) || (value as number) <= 0)
    throw new Error(`asciicast: ${label} must be a positive integer`);
  return value as number;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function finiteNonNegative(value: number | undefined, label: string): number | undefined {
  if (value === undefined) return undefined;
  if (!Number.isFinite(value) || value < 0)
    throw new Error(`asciicast: ${label} must be a finite, non-negative number`);
  return value;
}

function parseTheme(value: unknown): AsciicastTheme | undefined {
  const theme = object(value);
  if (theme === undefined) return undefined;
  const fg = optionalString(theme.fg);
  const bg = optionalString(theme.bg);
  const palette = optionalString(theme.palette);
  if (fg === undefined || bg === undefined || palette === undefined) return undefined;
  return { fg, bg, palette: palette.split(":") };
}

/** Parses the newline-delimited asciicast v2 and v3 formats into one absolute millisecond stream. */
export function parseAsciicast(
  source: string,
  options: ParseAsciicastOptions = {},
): AsciicastRecording {
  const rawLines = source.split(/\r?\n/);
  const headerIndex = rawLines.findIndex((line) => line.trim().length > 0);
  if (headerIndex < 0) throw new Error("asciicast: recording is empty");
  if (rawLines[headerIndex]?.trimStart().startsWith("#") === true)
    throw new Error("asciicast: the first line must be the header, not a comment");
  let headerValue: unknown;
  try {
    headerValue = JSON.parse(rawLines[headerIndex] ?? "");
  } catch (error) {
    throw new Error(`asciicast: invalid header JSON on line ${headerIndex + 1}`, { cause: error });
  }
  const header = object(headerValue);
  if (header === undefined) throw new Error("asciicast: header must be a JSON object");
  const version = header.version;
  if (version !== 2 && version !== 3)
    throw new Error(`asciicast: unsupported version ${String(version)}; expected 2 or 3`);
  const term = version === 3 ? object(header.term) : undefined;
  if (version === 3 && term === undefined)
    throw new Error("asciicast: v3 header.term must be an object");
  const columns = positiveInteger(version === 3 ? term?.cols : header.width, "terminal columns");
  const rows = positiveInteger(version === 3 ? term?.rows : header.height, "terminal rows");
  const speed = options.speed ?? 1;
  if (!Number.isFinite(speed) || speed <= 0)
    throw new Error("asciicast: speed must be a finite number greater than zero");
  const idle = finiteNonNegative(
    options.idleTimeLimit ??
      (typeof header.idle_time_limit === "number" ? header.idle_time_limit : undefined),
    "idleTimeLimit",
  );

  const events: AsciicastEvent[] = [];
  let sourceTime = 0;
  let playbackTime = 0;
  for (let index = headerIndex + 1; index < rawLines.length; index += 1) {
    const raw = rawLines[index]?.trim() ?? "";
    if (raw.length === 0 || raw.startsWith("#")) continue;
    let value: unknown;
    try {
      value = JSON.parse(raw);
    } catch (error) {
      throw new Error(`asciicast: invalid event JSON on line ${index + 1}`, { cause: error });
    }
    if (
      !Array.isArray(value) ||
      value.length !== 3 ||
      typeof value[0] !== "number" ||
      !Number.isFinite(value[0]) ||
      value[0] < 0 ||
      typeof value[1] !== "string" ||
      typeof value[2] !== "string"
    )
      throw new Error(
        `asciicast: event on line ${index + 1} must be [non-negative time, code, data]`,
      );
    const rawTime = value[0];
    const delta = version === 3 ? rawTime : Math.max(0, rawTime - sourceTime);
    sourceTime = version === 3 ? sourceTime + rawTime : rawTime;
    playbackTime += Math.min(delta, idle ?? delta) / speed;
    events.push({ time: Math.round(playbackTime * 1000), code: value[1], data: value[2] });
  }

  const theme = parseTheme(version === 3 ? term?.theme : header.theme);
  const markers = events
    .filter((event) => event.code === "m")
    .map((event) => ({ time: event.time, label: event.data }));
  const exit = [...events].reverse().find((event) => event.code === "x");
  const exitStatus = exit === undefined ? undefined : Number.parseInt(exit.data, 10);
  const title = optionalString(header.title);
  const command = optionalString(header.command);
  return {
    version,
    columns,
    rows,
    ...(title === undefined ? {} : { title }),
    ...(command === undefined ? {} : { command }),
    duration: events.at(-1)?.time ?? 0,
    events,
    markers,
    ...(exitStatus !== undefined && Number.isFinite(exitStatus) ? { exitStatus } : {}),
    ...(theme === undefined ? {} : { theme }),
  };
}

interface TranscriptState {
  readonly lines: string[][];
  row: number;
  column: number;
}

function ensureRow(state: TranscriptState): string[] {
  while (state.lines.length <= state.row) state.lines.push([]);
  return state.lines[state.row] ?? [];
}

function writeText(state: TranscriptState, value: string): void {
  for (const character of Array.from(value)) {
    if (character === "\n") {
      state.row += 1;
      state.column = 0;
      ensureRow(state);
      continue;
    }
    if (character === "\r") {
      state.column = 0;
      continue;
    }
    if (character === "\b") {
      state.column = Math.max(0, state.column - 1);
      continue;
    }
    if (character === "\t") {
      const spaces = 8 - (state.column % 8);
      writeText(state, " ".repeat(spaces));
      continue;
    }
    if (character < " ") continue;
    const line = ensureRow(state);
    while (line.length < state.column) line.push(" ");
    line[state.column] = character;
    state.column += 1;
  }
}

/**
 * Applies common cursor/erase sequences and strips styling sequences while preserving the terminal
 * text they affect. This keeps carriage-return progress, prompts, and line rewrites readable in
 * SVG without shipping a browser terminal emulator.
 */
function applyOutput(state: TranscriptState, data: string): number {
  let printable = 0;
  let cursor = 0;
  const pattern = new RegExp(
    String.raw`\u001b\][^\u0007]*(?:\u0007|\u001b\\)|\u001b\[([0-?]*)([ -/]*)([@-~])|\u001b.`,
    "g",
  );
  for (;;) {
    const match = pattern.exec(data);
    const before = data.slice(cursor, match?.index ?? data.length);
    writeText(state, before);
    printable += Array.from(before).filter((char) => char >= " " || char === "\n").length;
    if (match === null) break;
    cursor = pattern.lastIndex;
    const final = match[3];
    if (final === undefined) continue;
    const params = (match[1] ?? "")
      .split(";")
      .map((part) => (part.length === 0 ? 0 : Number.parseInt(part, 10)));
    const amount = Math.max(1, params[0] ?? 1);
    if (final === "A") state.row = Math.max(0, state.row - amount);
    else if (final === "B") state.row += amount;
    else if (final === "C") state.column += amount;
    else if (final === "D") state.column = Math.max(0, state.column - amount);
    else if (final === "G") state.column = Math.max(0, amount - 1);
    else if (final === "H" || final === "f") {
      state.row = Math.max(0, (params[0] || 1) - 1);
      state.column = Math.max(0, (params[1] || 1) - 1);
    } else if (final === "K") {
      const line = ensureRow(state);
      const mode = params[0] ?? 0;
      if (mode === 2) line.splice(0);
      else if (mode === 1) for (let i = 0; i <= state.column; i += 1) line[i] = " ";
      else line.splice(state.column);
    } else if (final === "J" && (params[0] ?? 0) === 2) {
      state.lines.splice(0, state.lines.length, []);
      state.row = 0;
      state.column = 0;
    }
    ensureRow(state);
  }
  return printable;
}

function recordingTranscript(
  recording: AsciicastRecording,
  includeInput: boolean,
): { readonly text: string; readonly frames: readonly TimelineKeyframe[] } {
  const state: TranscriptState = { lines: [[]], row: 0, column: 0 };
  const events: { time: number; amount: number }[] = [];
  let total = 0;
  for (const event of recording.events) {
    if (event.code !== "o" && !(includeInput && event.code === "i")) continue;
    const amount = applyOutput(state, event.data);
    if (amount === 0) continue;
    total += amount;
    events.push({ time: event.time, amount });
  }
  const text = state.lines
    .map((line) => line.join("").replace(/\s+$/u, ""))
    .join("\n")
    .replace(/\n+$/u, "");
  if (total === 0) return { text, frames: [{ time: 0, value: 1 }] };
  const frames: TimelineKeyframe[] = [{ time: 0, value: 0 }];
  let seen = 0;
  for (const event of events) {
    seen += event.amount;
    const value = Math.min(1, seen / total);
    const previous = frames.at(-1);
    if (previous?.time === event.time) frames[frames.length - 1] = { time: event.time, value };
    else frames.push({ time: event.time, value, easing: "linear" });
  }
  const lastTime = Math.max(recording.duration, frames.at(-1)?.time ?? 0);
  if ((frames.at(-1)?.value ?? 0) < 1) frames.push({ time: lastTime, value: 1, easing: "linear" });
  return { text, frames };
}

/** Compiles an asciicast v2/v3 recording into an ordinary, seekable Kineglyph fragment. */
export function asciicast(
  source: string | AsciicastRecording,
  options: AsciicastOptions = {},
): AsciicastResult {
  const recording = typeof source === "string" ? parseAsciicast(source, options) : source;
  const id = options.id ?? "asciicast";
  const terminalId = `${id}:terminal`;
  const transcript = recordingTranscript(recording, options.includeInput ?? false);
  const visibleRows = options.visibleRows ?? Math.min(recording.rows, 18);
  const root = terminal(
    terminalId,
    [{ text: transcript.text.length === 0 ? " " : transcript.text, kind: "output", typing: true }],
    {
      ...options,
      title: options.title ?? recording.title ?? recording.command ?? "Terminal recording",
      rows: visibleRows,
      metadata: {
        ...options.metadata,
        asciicastVersion: recording.version,
        terminalColumns: recording.columns,
        terminalRows: recording.rows,
        ...(recording.exitStatus === undefined ? {} : { exitStatus: recording.exitStatus }),
      },
    },
  );
  const textId = `${terminalId}-line-1-text`;
  const tracks =
    recording.duration === 0
      ? []
      : [
          {
            id: `${textId}:progress`,
            target: textId,
            property: "progress" as const,
            keyframes: transcript.frames,
          },
        ];
  return {
    fragment: {
      nodes: [root],
      ...(tracks.length === 0 ? {} : { tracks }),
      summary: `${recording.title ?? "Terminal recording"}, ${recording.columns} by ${recording.rows}, asciicast v${recording.version}.`,
    },
    recording,
    handles: { root: terminalId, screen: `${terminalId}-screen`, text: textId },
  };
}
