# Files and terminals

File structures and terminal sessions are first-class Kineglyph figures. They use the same layout,
theme, timeline, responsive, inspection, and export paths as every other mark—there is no embedded
terminal iframe and no screenshot hidden inside the SVG.

Use `f.fileTree()` for recursive directory structure, `f.terminal()` for authored terminal lines,
and `asciicast()` when the timing already exists in an asciinema recording.

## A file tree is structured data

Folders expand recursively. Files can carry a detail, status, and semantic tone. Guides disappear
with `guides: false`, and `density: "compact"` is useful inside architecture diagrams.

```kineglyph live id=file-tree-structure view=preview height=500
import { fieldManualTheme, figure } from "kineglyph";

export const theme = fieldManualTheme;

export default figure("file-tree-structure", { title: "A small TypeScript package" }, (f) => {
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

export default figure("typed-terminal", { title: "A typed terminal session", hold: 700 }, (f) => {
  const session = f.terminal([
    { text: "npm create kineglyph@latest", kind: "command" },
    { text: "create  src/figure.ts", kind: "success" },
    { text: "create  src/data.ts", kind: "success" },
    { text: "npm run dev", kind: "command", prompt: "›" },
    { text: "ready   http://localhost:5173", kind: "output", typing: true },
  ], {
    title: "quickstart — zsh",
    cwd: "~/work/first-figure",
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
  '[0.48,"o","> kineglyph@0.2.0 build\\r\\n"]',
  '[0.34,"o","✓ core      42 modules\\r\\n"]',
  '[0.28,"o","✓ svg       18 modules\\r\\n"]',
  '[0.30,"o","✓ web       ready\\r\\n"]',
  '[0.16,"m","build complete"]',
  '[0.10,"x","0"]',
].join("\n");

const recording = asciicast(cast, {
  id: "build-recording",
  speed: 1.15,
  idleTimeLimit: 1.2,
  visibleRows: 8,
});

export default figure("asciicast-install", { title: "Asciicast playback", hold: 650 }, (f) => {
  const player = f.add(recording);
  f.root(f.stack([
    f.eyebrow("ASCIICAST V3 · SEEKABLE"),
    player,
  ], { gap: 12, width: "fill" }));
  f.sequence([f.reveal(player)]);
});
```

The parser keeps output, optional input, markers, resize metadata, theme metadata, and exit status.
The lightweight SVG renderer handles common cursor movement, carriage returns, backspace, tabs,
line erasure, and clear-screen sequences. It intentionally renders a portable transcript rather
than shipping a full terminal emulator: programs that depend on complex alternate-screen behavior
should be reduced to a short illustrative cast or rendered with a dedicated terminal player.

See the official [asciicast v3 format](https://docs.asciinema.org/manual/asciicast/v3/) and
[asciicast v2 format](https://docs.asciinema.org/manual/asciicast/v2/) references for the source
format.
