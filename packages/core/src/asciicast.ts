import type { SceneFragment } from "./fragment.js";
import {
  terminal,
  type TerminalAnsiStyle,
  type TerminalLine,
  type TerminalOptions,
  type TerminalSpan,
} from "./recipes.js";
import type { TimelineKeyframe } from "./resolved.js";

type NumericTimelineKeyframe = Omit<TimelineKeyframe, "value"> & { readonly value: number };

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
  /** Adds accessible play/pause, step, and restart controls for this recording's real timeline. */
  readonly playbackControls?:
    | boolean
    | {
        readonly label?: string;
        readonly group?: string;
        readonly step?: number;
      };
}

export interface AsciicastResult {
  readonly fragment: SceneFragment;
  readonly recording: AsciicastRecording;
  readonly handles: {
    readonly root: string;
    readonly screen: string;
    readonly text: string;
    readonly texts: readonly string[];
  };
  /** Controller-neutral transport facts used by web controls, exporters, and custom players. */
  readonly playback: {
    readonly duration: number;
    readonly markers: AsciicastRecording["markers"];
    readonly exitStatus?: number;
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

interface TranscriptStyle extends TerminalAnsiStyle {
  foreground?: number | string;
  background?: number | string;
  tone?: TerminalSpan["tone"];
  backgroundTone?: TerminalSpan["background"];
  bold?: boolean;
  dim?: boolean;
  italic?: boolean;
  underline?: boolean;
  inverse?: boolean;
}

interface TranscriptCell {
  readonly character: string;
  readonly style: TranscriptStyle;
}

interface TranscriptState {
  readonly lines: TranscriptCell[][];
  row: number;
  column: number;
  style: TranscriptStyle;
}

function ensureRow(state: TranscriptState): TranscriptCell[] {
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
    while (line.length < state.column) line.push({ character: " ", style: {} });
    line[state.column] = { character, style: { ...state.style } };
    state.column += 1;
  }
}

const ANSI_TONES = [
  "textMuted",
  "danger",
  "success",
  "warning",
  "info",
  "accent",
  "info",
  "text",
] as const;

function indexedAnsiTone(index: number): TerminalSpan["tone"] {
  return ANSI_TONES[Math.abs(index) % ANSI_TONES.length] ?? "text";
}

function rgbAnsiTone(red: number, green: number, blue: number): TerminalSpan["tone"] {
  if (Math.max(red, green, blue) - Math.min(red, green, blue) < 28) return "textMuted";
  if (red > green * 1.25 && red > blue * 1.25) return "danger";
  if (green > red * 1.2 && green > blue * 1.1) return "success";
  if (red > blue * 1.25 && green > blue * 1.25) return "warning";
  if (blue > red * 1.15) return "info";
  return "accent";
}

function applySgr(style: TranscriptStyle, params: readonly number[]): void {
  const codes = params.length === 0 ? [0] : params;
  for (let index = 0; index < codes.length; index += 1) {
    const code = codes[index] ?? 0;
    if (code === 0) {
      for (const key of Object.keys(style)) delete style[key as keyof TranscriptStyle];
    } else if (code === 1) style.bold = true;
    else if (code === 2) style.dim = true;
    else if (code === 3) style.italic = true;
    else if (code === 4) style.underline = true;
    else if (code === 7) style.inverse = true;
    else if (code === 22) {
      style.bold = false;
      style.dim = false;
    } else if (code === 23) style.italic = false;
    else if (code === 24) style.underline = false;
    else if (code === 27) style.inverse = false;
    else if ((code >= 30 && code <= 37) || (code >= 90 && code <= 97)) {
      const color = code >= 90 ? code - 90 : code - 30;
      style.foreground = code;
      style.tone = indexedAnsiTone(color);
    } else if (code === 39) {
      delete style.foreground;
      delete style.tone;
    } else if ((code >= 40 && code <= 47) || (code >= 100 && code <= 107)) {
      const color = code >= 100 ? code - 100 : code - 40;
      style.background = code;
      style.backgroundTone = indexedAnsiTone(color);
    } else if (code === 49) {
      delete style.background;
      delete style.backgroundTone;
    } else if ((code === 38 || code === 48) && codes[index + 1] === 5) {
      const color = codes[index + 2];
      if (color === undefined) continue;
      const foreground = code === 38;
      if (foreground) {
        style.foreground = color;
        style.tone = indexedAnsiTone(color);
      } else {
        style.background = color;
        style.backgroundTone = indexedAnsiTone(color);
      }
      index += 2;
    } else if ((code === 38 || code === 48) && codes[index + 1] === 2) {
      const red = codes[index + 2];
      const green = codes[index + 3];
      const blue = codes[index + 4];
      if (red === undefined || green === undefined || blue === undefined) continue;
      const serialized = `rgb(${red},${green},${blue})`;
      const tone = rgbAnsiTone(red, green, blue);
      if (code === 38) {
        style.foreground = serialized;
        style.tone = tone;
      } else {
        style.background = serialized;
        style.backgroundTone = tone;
      }
      index += 4;
    }
  }
}

/**
 * Applies common cursor/erase sequences and SGR styling while preserving the terminal cells they
 * affect. This keeps carriage-return progress, prompts, and line rewrites readable in SVG without
 * shipping a browser terminal emulator.
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
    if (final === "m") applySgr(state.style, params);
    else if (final === "A") state.row = Math.max(0, state.row - amount);
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
      else if (mode === 1)
        for (let i = 0; i <= state.column; i += 1)
          line[i] = { character: " ", style: { ...state.style } };
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
): {
  readonly lines: readonly TerminalLine[];
  readonly frames: readonly NumericTimelineKeyframe[];
  readonly characters: number;
} {
  const state: TranscriptState = { lines: [[]], row: 0, column: 0, style: {} };
  const events: { time: number; amount: number }[] = [];
  let total = 0;
  for (const event of recording.events) {
    if (event.code !== "o" && !(includeInput && event.code === "i")) continue;
    const amount = applyOutput(state, event.data);
    if (amount === 0) continue;
    total += amount;
    events.push({ time: event.time, amount });
  }
  const styledLines = state.lines.map((line): TerminalLine => {
    let end = line.length;
    while (end > 0 && line[end - 1]?.character.trim().length === 0) end -= 1;
    const cells = line.slice(0, end);
    const spans: TerminalSpan[] = [];
    let currentStyle = "";
    for (const cell of cells) {
      const key = JSON.stringify(cell.style);
      const previous = spans.at(-1);
      if (previous !== undefined && key === currentStyle) {
        spans[spans.length - 1] = { ...previous, text: previous.text + cell.character };
        continue;
      }
      currentStyle = key;
      const ansi: TerminalAnsiStyle = {
        ...(cell.style.foreground === undefined ? {} : { foreground: cell.style.foreground }),
        ...(cell.style.background === undefined ? {} : { background: cell.style.background }),
        ...(cell.style.bold === undefined ? {} : { bold: cell.style.bold }),
        ...(cell.style.dim === undefined ? {} : { dim: cell.style.dim }),
        ...(cell.style.italic === undefined ? {} : { italic: cell.style.italic }),
        ...(cell.style.underline === undefined ? {} : { underline: cell.style.underline }),
        ...(cell.style.inverse === undefined ? {} : { inverse: cell.style.inverse }),
      };
      spans.push({
        text: cell.character,
        ...(cell.style.tone === undefined ? {} : { tone: cell.style.tone }),
        ...(cell.style.backgroundTone === undefined
          ? {}
          : { background: cell.style.backgroundTone }),
        ...(cell.style.bold === undefined ? {} : { bold: cell.style.bold }),
        ...(cell.style.dim === undefined ? {} : { dim: cell.style.dim }),
        ...(cell.style.italic === undefined ? {} : { italic: cell.style.italic }),
        ...(cell.style.underline === undefined ? {} : { underline: cell.style.underline }),
        ...(cell.style.inverse === undefined ? {} : { inverse: cell.style.inverse }),
        ...(Object.keys(ansi).length === 0 ? {} : { ansi }),
        typing: true,
      });
    }
    return spans.length === 0 ? { text: " " } : { spans, typing: true };
  });
  while (
    styledLines.length > 1 &&
    styledLines.at(-1)?.text === " " &&
    styledLines.at(-1)?.spans === undefined
  )
    styledLines.pop();
  const characters = styledLines.reduce(
    (sum, line) =>
      sum +
      (line.spans?.reduce((lineTotal, span) => lineTotal + Array.from(span.text).length, 0) ??
        Array.from(line.text ?? "").length),
    0,
  );
  if (total === 0) return { lines: styledLines, characters, frames: [{ time: 0, value: 1 }] };
  const frames: NumericTimelineKeyframe[] = [{ time: 0, value: 0 }];
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
  return { lines: styledLines, characters, frames };
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
  if (!Number.isInteger(visibleRows) || visibleRows <= 0)
    throw new Error("asciicast: visibleRows must be a positive integer");
  const maximumStart = Math.max(0, transcript.lines.length - visibleRows);
  const scrollStart =
    options.scroll === "start"
      ? 0
      : typeof options.scroll === "number"
        ? Math.max(0, Math.min(maximumStart, Math.floor(options.scroll)))
        : maximumStart;
  const terminalStatus =
    options.status ??
    (recording.exitStatus === undefined
      ? undefined
      : recording.exitStatus === 0
        ? "success"
        : "error");
  const root = terminal(terminalId, transcript.lines, {
    ...options,
    title: options.title ?? recording.title ?? recording.command ?? "Terminal recording",
    visibleLines: visibleRows,
    scroll: options.scroll ?? "end",
    ...(terminalStatus === undefined ? {} : { status: terminalStatus }),
    metadata: {
      ...options.metadata,
      asciicastVersion: recording.version,
      terminalColumns: recording.columns,
      terminalRows: recording.rows,
      ...(recording.theme === undefined
        ? {}
        : {
            ansiForeground: recording.theme.fg,
            ansiBackground: recording.theme.bg,
            ansiPalette: recording.theme.palette.join(":"),
          }),
      ...(recording.exitStatus === undefined ? {} : { exitStatus: recording.exitStatus }),
    },
  });
  const targets: { readonly id: string; readonly characters: number; readonly start: number }[] =
    [];
  let transcriptOffset = 0;
  for (let lineIndex = 0; lineIndex < transcript.lines.length; lineIndex += 1) {
    const line = transcript.lines[lineIndex];
    if (line?.spans !== undefined) {
      line.spans.forEach((span, spanIndex) => {
        const characters = Array.from(span.text).length;
        if (lineIndex >= scrollStart && lineIndex < scrollStart + visibleRows)
          targets.push({
            id: `${terminalId}-line-${lineIndex + 1}-span-${spanIndex + 1}-text`,
            characters,
            start: transcriptOffset,
          });
        transcriptOffset += characters;
      });
    } else {
      const characters = Array.from(line?.text ?? " ").length;
      if (lineIndex >= scrollStart && lineIndex < scrollStart + visibleRows)
        targets.push({
          id: `${terminalId}-line-${lineIndex + 1}-text`,
          characters,
          start: transcriptOffset,
        });
      transcriptOffset += characters;
    }
  }
  const transcriptCharacters = Math.max(1, transcript.characters);
  const tracks =
    recording.duration === 0
      ? []
      : targets.map((target) => {
          const frames = transcript.frames.map((frame) => ({
            ...frame,
            value: Math.max(
              0,
              Math.min(1, (frame.value * transcriptCharacters - target.start) / target.characters),
            ),
          }));
          return {
            id: `${target.id}:progress`,
            target: target.id,
            property: "progress" as const,
            keyframes: frames,
          };
        });
  const textId = targets[0]?.id ?? `${terminalId}-line-1-text`;
  const playbackControls =
    options.playbackControls === true
      ? {}
      : options.playbackControls === false || options.playbackControls === undefined
        ? undefined
        : options.playbackControls;
  if (
    playbackControls?.step !== undefined &&
    (!Number.isFinite(playbackControls.step) || playbackControls.step <= 0)
  )
    throw new Error("asciicast: playbackControls.step must be a finite number greater than zero");
  return {
    fragment: {
      nodes: [root],
      ...(tracks.length === 0 ? {} : { tracks }),
      ...(playbackControls === undefined
        ? {}
        : {
            controls: [
              {
                id: `${id}:playback`,
                kind: "transport" as const,
                label: playbackControls.label ?? "Terminal playback",
                group: playbackControls.group ?? "Recording",
                transportStep: playbackControls.step ?? 250,
              },
            ],
          }),
      summary: `${recording.title ?? "Terminal recording"}, ${recording.columns} by ${recording.rows}, asciicast v${recording.version}.`,
    },
    recording,
    handles: {
      root: terminalId,
      screen: `${terminalId}-screen`,
      text: textId,
      texts: targets.map((target) => target.id),
    },
    playback: {
      duration: recording.duration,
      markers: recording.markers,
      ...(recording.exitStatus === undefined ? {} : { exitStatus: recording.exitStatus }),
    },
  };
}
