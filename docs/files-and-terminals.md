# Files and terminals

File structures and terminal sessions are first-class Kineglyph figures. They use the same layout,
theme, timeline, responsive, inspection, and export paths as every other mark—there is no embedded
terminal iframe and no screenshot hidden inside the SVG.

Use `f.fileTree()` for recursive directory structure, `f.terminal()` for authored terminal lines,
`f.codeBlock()` for syntax-highlighted source, and `asciicast()` when the timing already exists in
an asciinema recording. All four produce ordinary scene nodes and use the same SVG, PNG, and GIF
export path as any other figure.

## A file tree is structured data

Folders expand recursively. Files can carry a detail, status, and semantic tone. Guides disappear
with `guides: false`, and `density: "compact"` is useful inside architecture diagrams.

```kineglyph live id=file-tree-structure view=preview height=500
import { fieldManualTheme, figure } from "kineglyph";

export const theme = fieldManualTheme;

export default figure("file-tree-structure", {
  title: "A small TypeScript package",
  description: "A semantic file tree shows source, test, and package files with status labels.",
}, (f) => {
  const tree = f.fileTree([
    {
      name: "src",
      children: [
        { name: "commands", children: [
          { name: "record.ts", detail: "capture a cast" },
          { name: "play.ts", detail: "render a cast" },
        ] },
        { name: "index.ts", status: "public", tone: "success" },
        { name: "terminal.ts", status: "new", tone: "warning" },
      ],
    },
    { name: "fixtures", children: [
      { name: "install.cast", detail: "asciicast v3", tone: "info" },
    ] },
    { name: "package.json", detail: "0.2.0" },
    { name: "README.md", status: "edited", tone: "accent" },
  ], { root: "tiny-recorder", density: "compact" });

  f.root(f.stack([
    f.eyebrow("PROJECT MAP"),
    tree,
  ], { gap: 10, width: "fill" }));
  f.sequence([f.reveal(tree, { duration: 520 })]);
});
```

Because every row is a normal scene node, the structure remains selectable, inspectable, and
exportable. Use the returned tree anywhere a group works, including `f.flow()` for a row that
becomes a readable stack in a narrow container.

## Authored terminal lines can type themselves

Commands type by default. Output is present immediately unless `typing: true` is set. The timeline
is deterministic and seekable, so the same source drives live playback, GIF export, and a static
terminal frame.

```kineglyph live id=typed-terminal view=preview height=390
import { counterTerminalTheme, figure } from "kineglyph";

export const theme = counterTerminalTheme;

export default figure("typed-terminal", {
  title: "A typed terminal session",
  description: "An animated shell session types a command and reports generated output.",
  hold: 700,
}, (f) => {
  const session = f.terminal([
    { text: "npm create kineglyph@latest", kind: "command" },
    { text: "create  src/figure.ts", kind: "success" },
    { text: "create  src/data.ts", kind: "success" },
    { text: "npm run dev", kind: "command", prompt: "›" },
    {
      spans: [
        { text: "ready", tone: "success", bold: true },
        { text: "   http://localhost:5173", tone: "info" },
      ],
      kind: "output",
      selected: true,
      status: { label: "serving", tone: "success" },
      typing: true,
    },
  ], {
    title: "quickstart — zsh",
    cwd: "~/work/first-figure",
    promptTone: "warning",
    chromeControls: ["textMuted", "textMuted", "success"],
    cursor: { style: "bar", tone: "accent" },
    lineGap: 7,
    wrap: "clip",
    visibleLines: 5,
    scroll: "end",
    status: "success",
  });

  f.root(session);
  f.sequence([
    f.reveal(session, { duration: 260 }),
    f.typewrite(session, { duration: 760, stagger: 170 }),
  ], { gap: 90 });
});
```

`f.typewrite()` targets every descendant text node marked for character reveal. It deliberately
does not use timers or mutate the scene definition: it writes ordinary `progress` tracks.

Terminal presentation is data too. Use `chrome: "minimal"` for a title without window controls or
`chrome: "plain"` for no header. `titleTone`, `cwdTone`, `promptTone`, and `chromeControls` tune the
surroundings. Individual lines accept `tone`, `promptTone`, `background`, and `cursor`; a terminal-
level cursor defaults to the final line and supports `block`, `bar`, and `underline` styles.

Lines can provide `spans` instead of `text`. Each span has its own tone, background, selection,
typing flag, and portable ANSI-style metadata. A line can be `selected` and carry a semantic
`status`; the session chrome can show a status too. `wrap: "wrap" | "clip" | "overflow"` makes
horizontal intent explicit. `visibleLines` plus `scroll: "start" | "end" | number` creates a
deterministic transcript viewport—the numeric form is a zero-based first row, so exports never
depend on browser scroll position.

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
  });

  f.root(source);
  f.sequence([
    f.reveal(source, { duration: 240 }),
    f.typewrite(source, { duration: 580, stagger: 24 }),
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

## The same motion model serves commands and source

This comparison is deliberately made from the two public recipes. It is a responsive row, a stack
in a narrow container, and a single seekable motion sequence.

```kineglyph live id=terminal-code-comparison view=preview height=470
import { counterTerminalTheme, figure } from "kineglyph";

export const theme = counterTerminalTheme;

export default figure("terminal-code-comparison", {
  title: "Terminal and code",
  description: "A terminal command and the source that performs it reveal on one shared timeline.",
}, (f) => {
  const command = f.terminal([
    { text: "npm run render", kind: "command", prompt: "λ" },
    { spans: [
      { text: "write ", tone: "textMuted" },
      { text: "dist/figure.svg", tone: "success", bold: true },
    ], status: "success", typing: true },
  ], { title: "render", chrome: "minimal", cursor: { style: "underline" } });

  const source = f.codeBlock([
    "const svg = await render(scene);",
    { text: "await writeFile(\"dist/figure.svg\", svg);", highlighted: true },
  ], { title: "render.ts", language: "typescript", lineNumbers: false, typing: true });

  f.root(f.flow([command, source], { gap: 14, width: "fill" }));
  f.sequence([
    f.reveal([command, source], { duration: 240, stagger: 80 }),
    f.typewrite([command, source], { duration: 620, stagger: 38 }),
  ]);
});
```

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
