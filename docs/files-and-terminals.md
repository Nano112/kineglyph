# Files and terminals

## Minecraft command input

`f.minecraftCommand()` draws a square chat input with optional history and completion hints.
It preserves `/` and `//` commands without adding a shell prompt. `f.typewrite()` types the
input; previous chat and hints stay visible. Long arguments wrap at narrow widths.

```ts
const chat = f.minecraftCommand("//paste", {
  context: "Multiplayer chat",
  history: [{ kind: "success", text: "Clipboard loaded." }],
  suggestions: ["//paste [-a]"],
});
f.root(chat);
f.sequence([f.typewrite(chat, { characterDuration: 90 })]);
```

The recipe uses the scene's code font and surface colours. Set them in your theme to match
the surrounding game illustration. It renders a demonstration; it does not send game commands.
Use `exportAnimatedSvg()` to keep typing as an SVG file, including in an ordinary `<img>`:

```ts
import { exportAnimatedSvg } from "@kineglyph/export";
const svg = exportAnimatedSvg(resolvedScene, { fps: 24, background: "transparent" });
```

It samples the timeline into vector frames with CSS keyframes. It needs no JavaScript, video,
or player. Playback runs once and holds the completed frame; `prefers-reduced-motion` shows
that frame immediately. Set `repeat: "indefinite"` only when the host provides a way to stop
motion. Fonts follow the SVG's normal font rules. More frames increase file size; unchanged
consecutive frames are coalesced. Use `surfaces(time)` when a live surface needs rendered images.
For game instructions, put each complete command in its own copyable block. Keep placeholder
arguments and commands that must wait for one another out of a shared copy button.

File structures and terminal sessions are first-class Kineglyph figures. They use the same layout,
theme, timeline, responsive, inspection, and export paths as every other mark—there is no embedded
terminal iframe and no screenshot hidden inside the SVG.

Use `f.fileTree()` for recursive directory structure, `f.terminal()` for authored terminal lines,
`f.codeBlock()` for syntax-highlighted source, and `asciicast()` when the timing already exists in
an asciinema recording. All four produce ordinary scene nodes and use the same SVG, PNG, and GIF
export path as any other figure.

## A file tree is structured data

Folders expand recursively. Files can carry a detail, status, semantic tone, inferred extension
mark, and current-row treatment. Guides disappear with `guides: false`; `density: "compact"` is
useful inside architecture diagrams while `"comfortable"` reads like a real project sidebar.

```kineglyph live id=file-tree-structure view=preview height=440
import { figure, studioTheme } from "kineglyph";

export const theme = studioTheme;

export default figure("file-tree-structure", {
  title: "A small TypeScript package",
  description: "A semantic file tree shows source, test, and package files with status labels.",
  background: "transparent",
}, (f) => {
  const tree = f.fileTree([
    {
      name: "src",
      children: [
        { name: "commands", children: [
          { name: "record.ts", detail: "capture a cast", selected: true, tone: "info" },
          { name: "play.ts", detail: "render a cast" },
        ] },
        { name: "index.ts", status: "public", tone: "success" },
        { name: "terminal.ts", status: "new", tone: "warning" },
      ],
    },
    { name: "fixtures", expanded: false, children: [
      { name: "install.cast", detail: "asciicast v3" },
    ]},
    { name: "package.json", detail: "0.2.0" },
    { name: "README.md", status: "edited", tone: "accent" },
  ], {
    root: "tiny-recorder",
    density: "comfortable",
    icons: "auto",
    disclosures: true,
    selectionTone: "surfaceMuted",
    padding: { wide: 18, compact: 16, narrow: 12 },
    frame: { fill: "surfaceRaised", stroke: "border", radius: 12 },
  });

  f.root(tree);
  f.sequence([f.reveal(tree, { duration: 440, offset: 8 })]);
});
```

Because every row is a normal scene node, the structure remains selectable, inspectable, and
exportable. Use the returned tree anywhere a group works, including `f.flow()` for a row that
becomes a readable stack in a narrow container. `icons: "auto"` derives short marks such as `TS`,
`JSON`, `MD`, and `CAST`; use `"generic"`, `"none"`, or an entry-level `icon` override when the file
type is less important. `selected`, `statusTone`, `expanded`, `interactive`, and `onActivate` keep
navigation state in authored data rather than post-processing generated SVG.

## Authored terminal lines can type themselves

Commands type by default. Output is present immediately unless `typing: true` is set. The timeline
is deterministic and seekable, so the same source drives live playback, GIF export, and a static
terminal frame.

```kineglyph live id=typed-terminal view=preview height=360
import { figure, instrumentTheme, material } from "kineglyph";

export const theme = instrumentTheme;

export default figure("typed-terminal", {
  title: "A typed terminal session",
  description: "An animated shell session types a command and reports generated output.",
  hold: 700,
  background: "transparent",
}, (f) => {
  const session = f.terminal([
    { text: "npm create kineglyph@latest", kind: "command", meta: "1.2s" },
    { text: "src/figure.ts", kind: "success", meta: "created" },
    { text: "src/data.ts", kind: "success", meta: "created" },
    { text: "npm run dev", kind: "command", prompt: "$", meta: "184ms" },
    {
      spans: [
        { text: "ready", tone: "success", bold: true },
        { text: " · http://localhost:5173", tone: "info" },
      ],
      kind: "output",
      selected: true,
      status: { label: "serving", tone: "success" },
      meta: "local",
      typing: true,
    },
  ], {
    title: "quickstart",
    cwd: "~/work/first-figure",
    cwdPosition: "header",
    promptTone: "accent",
    chromeControls: ["textMuted", "textMuted", "textMuted"],
    cursor: { style: "bar", tone: "accent" },
    lineMarkers: true,
    lineGap: 3,
    wrap: "clip",
    visibleLines: 5,
    scroll: "end",
    status: "success",
    typing: "all",
    density: "compact",
    frame: material("inset"),
  });

  f.root(session);
  f.sequence([
    f.reveal(session, { duration: 260 }),
    f.typewrite(session, { characterDuration: 18, lineDelay: 90 }),
  ], { gap: 90 });
});
```

`f.typewrite()` targets every descendant text node marked for character reveal. By default it
writes one continuous source-ordered stream: the prompt appears first, then the command, then the
next authored line. Syntax spans keep their colours without typing in colour-grouped batches.
`characterDuration` sets the cadence directly; otherwise `duration` is divided across all visible
characters. `lineDelay` adds a natural pause between lines. Use `mode: "overlap"` only when a
deliberately layered token effect is wanted. The recipe writes ordinary `progress` tracks—there
are no timers, and the same result can be sought or exported.

Terminal presentation is data too. Use `chrome: "window"`, `"tab"`, `"minimal"`, or `"plain"`.
`chromeStart` and `chromeEnd` accept small labels, badges, icons, and dots, while `titleTone`,
`cwdTone`, `promptTone`, and `chromeControls` tune the surroundings. `density: "compact"` is the
default; `"comfortable"` adds application-like breathing room. Individual lines accept `tone`,
`promptTone`, `background`, and `cursor`; a terminal-level cursor defaults to the final line and
supports `block`, `bar`, and `underline` styles.

Set `lineMarkers: true` for a stable semantic gutter (`›`, `✓`, `!`, `×`, `#`), then override or
suppress one with `marker` and `markerTone`. `meta` places compact timing, port, or exit information
at the far edge of a line. `cwdPosition: "header"` folds the path into the chrome when vertical
space matters.

Lines can provide `spans` instead of `text`. Each span has its own tone, background, selection,
typing flag, and portable ANSI-style metadata. A line can be `selected` and carry a semantic
`status`; the session chrome can show a status too. `wrap: "wrap" | "clip" | "overflow"` makes
horizontal intent explicit. `visibleLines` plus `scroll: "start" | "end" | number` creates a
deterministic transcript viewport—the numeric form is a zero-based first row, so exports never
depend on browser scroll position.

Set terminal-level `typing: "all"` when the transcript should arrive line by line, keep the
default `"commands"` for shell-like input over already-present output, or use `false` for a static
surface. A line-level `typing` value always wins.

## Window chrome is composable

Chrome is not a renderer skin. It is ordinary scene composition, which means a documentation tab,
a native-looking shell, and a quiet embedded console can share terminal behavior without sharing
the same window treatment.

```kineglyph live id=terminal-chrome-styles view=preview height=520
import { figure, studioTheme } from "kineglyph";

export const theme = studioTheme;

export default figure("terminal-chrome-styles", {
  title: "Terminal chrome styles",
  description: "Window and tab terminals use the same transcript with different chrome.",
  background: "transparent",
}, (f) => {
  const native = f.terminal([
    { text: "bun run build", kind: "command" },
    { text: "dist/index.js  18.4 kB", kind: "success", meta: "96ms" },
  ], {
    title: "release",
    chrome: "window",
    chromeControls: ["textMuted", "textMuted", "success"],
    chromeEnd: [{ kind: "badge", text: "zsh", tone: "info" }],
    cursor: { style: "bar" },
  });

  const tab = f.terminal([
    { text: "git status --short", kind: "command", prompt: "❯" },
    { text: "M docs/files-and-terminals.md", kind: "warning" },
  ], {
    title: "workspace",
    chrome: "tab",
    chromeStart: [{ kind: "dot", tone: "success" }],
    chromeEnd: [
      { kind: "label", text: "main" },
      { kind: "badge", text: "1 change", tone: "warning" },
    ],
  });

  const examples = f.stack([native, tab], { gap: 12, width: "fill" });
  f.root(examples);
  f.sequence([
    f.reveal([native, tab], { duration: 260, stagger: 80 }),
    f.typewrite([native, tab], { characterDuration: 16, lineDelay: 70 }),
  ]);
});
```

## Split panes without hand-built window geometry

`f.terminalWindow()` owns the shared frame, responsive pane layout, active-pane border, and optional
tmux-style status line. On narrow canvases its row becomes a stack, while each pane remains a normal
terminal surface with its own transcript and options.

```kineglyph live id=tmux-terminal-window view=preview height=540
import { counterTerminalTheme, figure } from "kineglyph";

export const theme = counterTerminalTheme;

export default figure("tmux-terminal-window", {
  title: "A responsive terminal workspace",
  description: "Two terminal panes share composable chrome and one sequential timeline.",
  background: "transparent",
  hold: 500,
}, (f) => {
  const workspace = f.terminalWindow([
    {
      title: "server",
      cwd: "~/kineglyph",
      active: true,
      lines: [
        { text: "bun run dev", kind: "command" },
        { text: "local: https://kineglyph.test", kind: "success", meta: "ready" },
      ],
    },
    {
      title: "tests",
      lines: [
        { text: "bun test --watch", kind: "command" },
        { text: "74 passed", kind: "success", status: "success" },
      ],
    },
  ], {
    title: "kineglyph · local",
    chrome: "tab",
    chromeEnd: [{ kind: "badge", text: "main", tone: "info" }],
    layout: { wide: "row", compact: "row", narrow: "stack" },
    paneOptions: { typing: "all" },
    statusBar: { left: "0:server*  1:tests", center: "dev", right: "16:42" },
  });

  f.root(workspace);
  f.sequence([
    f.reveal(workspace, { duration: 300, offset: 8 }),
    f.typewrite(workspace, { characterDuration: 14, lineDelay: 65 }),
  ]);
});
```

## Code blocks are highlighted scene nodes

`f.codeBlock()` performs lightweight, deterministic highlighting for TypeScript, JavaScript, TSX,
JSX, JSON, shell, CSS, and HTML. Line numbers, highlighted lines, token colours, chrome, and tabs
are author options—not renderer CSS—so the result stays portable and inspectable.

```kineglyph live id=highlighted-code-block view=preview height=430
import { counterTerminalTheme, figure } from "kineglyph";

export const theme = counterTerminalTheme;

export default figure("highlighted-code-block", {
  title: "Highlighted source",
  description: "A TypeScript diff combines syntax highlighting, line emphasis, and an annotation.",
}, (f) => {
  const source = f.codeBlock([
    "import { figure } from \"kineglyph\";",
    "",
    { text: "export const makeCounter = (initial: number) =>", diff: "remove" },
    {
      text: "export const makeCounter = (value: number) =>",
      diff: "add",
      annotation: { text: "name the state", tone: "success" },
    },
    "  figure(\"counter\", { title: \"Counter\" }, (f) => {",
    "    f.root(f.heading(String(value)));",
    "  });",
    {
      // Exact tokens can come from a language service or a project-specific parser.
      tokens: [
        { text: "// ", kind: "comment" },
        { text: "portable scene nodes", tone: "warning" },
      ],
    },
  ], {
    title: "counter.ts",
    language: "typescript",
    startLine: 18,
    highlightRanges: [[20, 22]],
    tokenTones: { function: "accent", property: "info" },
    typing: true,
    density: "compact",
  });

  f.root(source);
  f.sequence([
    f.reveal(source, { duration: 240 }),
    f.typewrite(source, { characterDuration: 8, lineDelay: 38 }),
  ]);
});
```

Pass one source string for automatic line splitting, or an array of strings and `{ text }` lines
for per-line control. A line can instead provide `tokens: [{ text, kind, tone }]`, which cleanly
adapts richer syntax engines without adding one to Kineglyph's runtime. `chrome: "plain"`,
`lineNumbers: false`, and semantic `tokenTones` cover compact embedded snippets.

Set `diff: "add" | "remove" | "context"` on a line to add a semantic gutter. `annotation` accepts
short text or `{ text, tone }`; `highlightRanges` complements exact `highlightLines`. With
`typing: true`, generated tokens become character-reveal targets and work with the same
deterministic `f.typewrite()` timeline as terminals. A line-level `typing` flag overrides the block.

## Compose a complete developer workbench

`f.window()` owns reusable application chrome and `f.panes()` owns pane headers and the responsive
split. The content remains ordinary groups: this workbench combines a project sidebar, source
editor, and terminal in one scene graph and one seekable timeline. Tabs and panes can emit machine
events, so an embedded editor can synchronize selection without DOM post-processing.

```kineglyph live id=terminal-code-comparison view=preview height=650
import { figure, instrumentTheme } from "kineglyph";

export const theme = instrumentTheme;

export default figure("developer-workbench", {
  title: "Project workbench",
  description: "A file tree, source editor, and terminal share one responsive exportable surface.",
  background: "transparent",
}, (f) => {
  const files = f.fileTree([
    { name: "src", children: [
      { name: "figure.ts", selected: true, tone: "info", status: "open" },
      { name: "data.ts" },
    ]},
    { name: "dist", expanded: false, children: [{ name: "figure.svg" }] },
    { name: "package.json" },
  ], {
    root: "status-card",
    density: "compact",
    frame: { fill: "none", stroke: "none" },
    clip: true,
    bind: { opacity: "figureActive" },
  });

  const source = f.codeBlock([
    { text: "import { figure } from \"kineglyph\";", bind: { text: "editorLine1" } },
    { text: "", bind: { text: "editorLine2" } },
    { text: "export default figure(\"status\", {}, (f) => {", bind: { text: "editorLine3" } },
    { text: "  f.root(f.heading(\"Ready\"));", highlighted: true, bind: { text: "editorLine4" } },
    { text: "});", bind: { text: "editorLine5" } },
  ], {
    title: "figure.ts",
    language: "typescript",
    lineNumbers: true,
    typing: true,
    cursor: { line: 5, style: "bar" },
    visibleLines: 5,
    scroll: "follow",
    chrome: "plain",
    frame: { fill: "none", stroke: "none" },
    clip: true,
  });

  const command = f.terminal([
    { text: "kineglyph render src/figure.ts", kind: "command", meta: "212ms" },
    { text: "dist/figure.svg", kind: "success", status: "success", meta: "14.8 kB", typing: true },
  ], {
    title: "render",
    cwd: "~/status-card",
    cwdPosition: "header",
    chrome: "plain",
    lineMarkers: true,
    cursor: { style: "underline" },
    frame: { fill: "none", stroke: "none" },
    clip: true,
  });

  const editor = f.stack([source, command], { gap: 8, width: "fill", grow: 1 });
  const workspace = f.panes([
    { title: "Explorer", icon: "folder", content: files, minWidth: 190 },
    { title: "Editor", icon: "code", content: editor, active: true, grow: 3 },
  ], {
    layout: { wide: "row", compact: "row", narrow: "stack" },
    paneGap: 6,
  });
  const workbench = f.window(workspace, {
    title: "status-card",
    icon: "code",
    tabs: [
      { label: "figure.ts", icon: "code", onActivate: "OPEN_FIGURE", bind: { highlight: "figureActive" } },
      { label: "data.ts", icon: "file", onActivate: "OPEN_DATA", bind: { highlight: "dataActive" } },
    ],
    chromeEnd: [{ kind: "badge", text: "main", tone: "success" }],
    statusBar: [
      { kind: "label", text: "TypeScript" },
      { kind: "label", text: "Ln 5, Col 1" },
    ],
  });

  f.root(workbench);
  f.machine({
    initial: "figure",
    states: {
      figure: { on: { OPEN_DATA: "data" } },
      data: { on: { OPEN_FIGURE: "figure" } },
    },
    signals: {
      figureActive: { when: { state: "figure" }, then: 1, else: 0 },
      dataActive: { when: { state: "data" }, then: 1, else: 0 },
      editorLine1: { when: { state: "figure" }, then: "import { figure } from \"kineglyph\";", else: "export const status = {" },
      editorLine2: { when: { state: "figure" }, then: "", else: "  label: \"Ready\"," },
      editorLine3: { when: { state: "figure" }, then: "export default figure(\"status\", {}, (f) => {", else: "  tone: \"success\"," },
      editorLine4: { when: { state: "figure" }, then: "  f.root(f.heading(\"Ready\"));", else: "};" },
      editorLine5: { when: { state: "figure" }, then: "});", else: "" },
    },
  });
  f.sequence([
    f.reveal(workbench, { duration: 300, offset: 10 }),
    f.typewrite([source, command], { characterDuration: 8, lineDelay: 45 }),
  ]);
});
```

`f.window()` is not terminal-specific: use it for a browser, model inspector, profiler, or data
workbench. Its tabs and compact chrome items share the same semantic vocabulary as terminal chrome.
`f.panes()` accepts `onActivate`, `bind`, `hidden`, `grow`, and `minWidth` per pane, so a selected
file row, active tab, visible editor, and inspector can listen to the same state-machine event.

For long files, `visibleLines` plus `scroll: "start" | "end" | "follow" | number` creates a
deterministic editor viewport. `cursor` is a normal character-reveal node and follows sequential
typing. Pass `tokenize(source, { language, line, index })` to adapt Shiki or a language service at
authoring time; exact `tokens` on an individual line still win.

## Play an asciinema recording

`asciicast()` accepts asciicast v2 or v3 newline-delimited JSON. It preserves the recording timing,
normalizes v2 absolute timestamps and v3 relative intervals to one millisecond timeline, and lets
you adjust `speed` or cap long pauses with `idleTimeLimit`.

```kineglyph live id=asciicast-install view=preview height=400
import { asciicast, counterTerminalTheme, figure } from "kineglyph";

export const theme = counterTerminalTheme;

const cast = [
  '{"version":3,"term":{"cols":76,"rows":12},"title":"Build a figure"}',
  '[0.25,"o","$ npm run build\\r\\n"]',
  '[0.48,"o","\\u001b[36m> kineglyph@0.2.0 build\\u001b[0m\\r\\n"]',
  '[0.34,"o","\\u001b[32;1m✓ core      42 modules\\u001b[0m\\r\\n"]',
  '[0.28,"o","\\u001b[32m✓ svg       18 modules\\u001b[0m\\r\\n"]',
  '[0.30,"o","\\u001b[38;2;70;190;150m✓ web       ready\\u001b[0m\\r\\n"]',
  '[0.16,"m","build complete"]',
  '[0.10,"x","0"]',
].join("\n");

const recording = asciicast(cast, {
  id: "build-recording",
  speed: 1.15,
  idleTimeLimit: 1.2,
  visibleRows: 8,
  chromeControls: ["textMuted", "textMuted", "success"],
  wrap: "clip",
  playbackControls: { label: "Build playback", step: 250 },
});

export default figure("asciicast-install", {
  title: "Asciicast playback",
  description: "An asciicast build transcript preserves timing, ANSI colour, markers, and exit status.",
  hold: 650,
}, (f) => {
  const player = f.add(recording);
  f.root(f.stack([
    f.eyebrow("ASCIICAST V3 · SEEKABLE"),
    player,
  ], { gap: 12, width: "fill" }));
  f.sequence([f.reveal(player)]);
});
```

The parser keeps output, optional input, markers, resize metadata, theme metadata, and exit status.
SGR runs become normal terminal spans: standard, indexed, and true-colour values remain in `ansi`
metadata while colours map to the active semantic theme. Bold, dim, italic, underline, inverse,
foreground, and background state survive parsing. The portable SVG renderer currently expresses
semantic colour, backgrounds, dim, and inverse directly; it retains bold/italic/underline metadata
for inspection and richer renderers rather than substituting platform fonts.

The fragment timeline is the playback contract. `recording.playback` exposes duration, markers, and
exit status; `recording.handles.texts` exposes every independently animated styled run.
`playbackControls: true` (or `{ label, group, step }`) contributes a semantic transport with
play/pause, step, and restart. A normal web mount can additionally show its scrubber with
`controls: true`, while the controller API supports `play()`, `pause()`, and `seek(milliseconds)`.
GIF and frame exporters consume the same tracks, so a controlled preview and an exported recording
cannot drift apart.

The lightweight transcript handles SGR styling, common cursor movement, carriage returns,
backspace, tabs, line erasure, and clear-screen sequences. It intentionally does not emulate the
alternate screen, terminal queries, sixel/kitty graphics, or arbitrary OSC integrations. Programs
that depend on those features should be reduced to a short illustrative cast or rendered with a
dedicated terminal player.

See the official [asciicast v3 format](https://docs.asciinema.org/manual/asciicast/v3/) and
[asciicast v2 format](https://docs.asciinema.org/manual/asciicast/v2/) references for the source
format.
