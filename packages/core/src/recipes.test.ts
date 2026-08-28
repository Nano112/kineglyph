import { describe, expect, it } from "vitest";
import {
  body,
  caption,
  card,
  cardFan,
  code,
  codeBlock,
  container,
  eyebrow,
  fileTree,
  flowLayout,
  gate,
  grid,
  gridPlane,
  heading,
  highlightCodeLine,
  keyValue,
  junction,
  motif,
  overlay,
  panel,
  paneLayout,
  pill,
  port,
  row,
  rule,
  spacer,
  stack,
  terminal,
  terminalWindow,
  text,
  tileNode,
  title,
  windowFrame,
} from "./recipes.js";
import { resolveScene } from "./resolve.js";
import { validateScene, walkScene, type GroupNode, type SceneNode } from "./scene.js";

function ids(node: SceneNode): string[] {
  const out: string[] = [];
  if (node.type === "group") walkScene(node, (entry) => out.push(entry.id));
  else out.push(node.id);
  return out;
}

describe("text recipes", () => {
  it("map to semantic text styles and pass through options", () => {
    expect(eyebrow("e", "Scalar field").textStyle).toBe("label");
    expect(heading("h", "Field3").textStyle).toBe("bodyStrong");
    expect(title("t", "Section").textStyle).toBe("title");
    expect(body("b", "Copy").textStyle).toBe("body");
    expect(code("c", "f(p)").textStyle).toBe("code");
    expect(caption("cap", "Supporting")).toMatchObject({ textStyle: "caption", maxLines: 4 });
    expect(caption("cap", "Supporting", { maxLines: 2 }).maxLines).toBe(2);
    expect(text("plain", "Plain").textStyle).toBeUndefined();
    expect(text("styled", "Styled", { textStyle: "display" }).textStyle).toBe("display");
    expect(
      heading("h", "Bound", {
        tone: "info",
        align: "center",
        bind: { text: "headline" },
        hidden: { narrow: true },
        width: "fill",
        transform: "uppercase",
      }),
    ).toEqual({
      id: "h",
      type: "text",
      text: "Bound",
      textStyle: "bodyStrong",
      color: "info",
      align: "center",
      bind: { text: "headline" },
      hidden: { narrow: true },
      width: "fill",
      transform: "uppercase",
    });
  });
});

describe("pill, motif, rule, spacer, keyValue", () => {
  it("apply their defaults", () => {
    expect(pill("p", "Beta")).toEqual({
      id: "p",
      type: "badge",
      text: "Beta",
      tone: "accent",
      variant: "soft",
    });
    expect(pill("p", "Beta", { tone: "danger", variant: "outline" })).toMatchObject({
      tone: "danger",
      variant: "outline",
    });
    expect(motif("m", "cube")).toEqual({
      id: "m",
      type: "icon",
      icon: "cube",
      tone: "accent",
      size: 24,
    });
    expect(motif("m", "cube", { tone: "info", size: 32, background: "surface" })).toMatchObject({
      tone: "info",
      size: 32,
      background: "surface",
    });
    expect(rule("r")).toMatchObject({ type: "rect", height: 1, width: "fill", fill: "border" });
    expect(rule("r", "accent").fill).toBe("accent");
    expect(spacer("s", { wide: 24, compact: 12 })).toMatchObject({
      type: "rect",
      height: { wide: 24, compact: 12 },
      fill: "none",
    });
    const kv = keyValue("kv", "Cells", "512", { valueTone: "success" });
    expect(kv.layout).toBe("row");
    expect(kv.justify).toBe("between");
    expect(kv.children.map((child) => child.id)).toEqual(["kv-key", "kv-value"]);
    expect(kv.children[1]).toMatchObject({ type: "text", textStyle: "code", color: "success" });
  });
});

describe("glyph style recipes", () => {
  it("authors tiles, ports, and a portable construction grid", () => {
    const tile = tileNode("verify", {
      icon: "check",
      eyebrow: "Gate",
      title: "Verify",
      active: true,
    });
    expect(tile).toMatchObject({
      type: "group",
      label: "Verify",
      width: "hug",
      minWidth: { wide: 118, compact: 106, narrow: 94 },
      maxWidth: { wide: 232, compact: 200, narrow: 172 },
      frame: { material: "floating" },
      metadata: { diagramRole: "tile-node", active: true },
    });
    expect(ids(tile)).toEqual(
      expect.arrayContaining(["verify-icon", "verify-eyebrow", "verify-title"]),
    );
    expect(port("input", { active: true, tone: "success" })).toMatchObject({
      type: "circle",
      fill: "success",
      stroke: "success",
      metadata: { diagramRole: "port", active: true },
    });
    const plane = gridPlane("plane", { columns: 3, rows: 2, height: 120 });
    expect(plane.children).toHaveLength(7);
    expect(plane.metadata).toMatchObject({ diagramRole: "grid-plane" });

    const compact = tileNode("compile", {
      icon: "code",
      eyebrow: "INPUT",
      title: "Compile source files",
      detail: "12 modules",
      detailStyle: "code",
      variant: "compact",
    });
    expect(compact).toMatchObject({
      layout: "row",
      width: "hug",
      minWidth: { wide: 116, compact: 104, narrow: 92 },
    });
    expect(ids(compact)).toEqual(
      expect.arrayContaining(["compile-copy", "compile-detail", "compile-title"]),
    );
    const resolved = resolveScene(
      { schemaVersion: 2, id: "compact", title: "Compact", root: compact },
      { width: 520 },
    );
    expect(resolved.diagnostics?.filter((entry) => entry.code === "text-truncated") ?? []).toEqual(
      [],
    );
  });

  it("fans cards with responsive positions and static centre rotation", () => {
    const fan = cardFan(
      "fan",
      [
        card("one", { title: "One" }),
        card("two", { title: "Two" }),
        card("three", { title: "Three" }),
      ],
      { angle: 12 },
    );
    expect(fan.children.map((child) => child.rotation)).toEqual([
      { wide: -12, compact: -8.64, narrow: -5.04 },
      { wide: 0, compact: 0, narrow: 0 },
      { wide: 12, compact: 8.64, narrow: 5.04 },
    ]);
    expect(fan.children.map((child) => child.width)).toEqual([
      { wide: 210, compact: 188, narrow: 152 },
      { wide: 210, compact: 188, narrow: 152 },
      { wide: 210, compact: 188, narrow: 152 },
    ]);
    const definition = {
      schemaVersion: 2 as const,
      id: "fan-scene",
      title: "Fan",
      root: fan,
    };
    expect(validateScene(definition).ok).toBe(true);
    expect(
      resolveScene(definition, { width: 960 }).nodes.find((node) => node.id === "one")?.state,
    ).toMatchObject({ rotation: -12 });
    expect(
      resolveScene(definition, { width: 360 }).nodes.find((node) => node.id === "one")?.state,
    ).toMatchObject({ rotation: -5.04 });
  });
});

describe("terminal and file tree recipes", () => {
  it("builds a semantic terminal whose command text is ready for character progress", () => {
    const node = terminal(
      "demo",
      [
        { kind: "command", text: "npm test" },
        { kind: "success", text: "48 passed" },
      ],
      { title: "Tests", cwd: "~/kineglyph" },
    );
    expect(node).toMatchObject({
      type: "group",
      label: "Tests",
      metadata: { terminalRole: "terminal" },
    });
    expect(ids(node)).toEqual(
      expect.arrayContaining([
        "demo-chrome",
        "demo-screen",
        "demo-line-1-prompt",
        "demo-line-1-text",
      ]),
    );
    expect(node.children.at(-1)).toMatchObject({ type: "group", layout: "stack" });
    expect(JSON.stringify(node)).toContain('"reveal":"characters"');
    expect(JSON.stringify(node)).toContain('"terminalRole":"prompt","typing":true');
  });

  it("customizes terminal chrome, prompts, cursor, and line surfaces without special nodes", () => {
    const node = terminal(
      "custom",
      [
        {
          kind: "command",
          text: "kineglyph render",
          prompt: "λ",
          promptTone: "warning",
          background: "surfaceMuted",
        },
        { text: "ready", tone: "success" },
      ],
      {
        title: "build",
        chrome: "minimal",
        titleTone: "info",
        cursor: { style: "bar", tone: "warning" },
        lineGap: 8,
      },
    );
    expect(ids(node)).not.toContain("custom-window-controls");
    expect(ids(node)).toContain("custom-line-2-cursor");
    expect(JSON.stringify(node)).toContain('"text":"▎"');
    expect(JSON.stringify(node)).toContain('"fill":"surfaceMuted"');
    expect(JSON.stringify(node)).toContain('"color":"warning"');
  });

  it("composes tab chrome from semantic labels, badges, icons, and dots", () => {
    const node = terminal("tabbed", [{ kind: "command", text: "bun test" }], {
      title: "tests",
      chrome: "tab",
      chromeStart: [{ kind: "dot", tone: "success" }],
      chromeEnd: [
        { kind: "label", text: "zsh" },
        { kind: "badge", text: "main", tone: "info" },
      ],
    });
    expect(ids(node)).toEqual(
      expect.arrayContaining([
        "tabbed-tab-icon",
        "tabbed-chrome-start-1",
        "tabbed-chrome-end-1",
        "tabbed-chrome-end-2",
      ]),
    );
    expect(ids(node)).not.toContain("tabbed-chrome-rule");
    expect(JSON.stringify(node)).toContain('"terminalChrome":"tab"');
  });

  it("builds a responsive tmux-style window from independent terminal panes", () => {
    const node = terminalWindow(
      "workspace",
      [
        { title: "dev", active: true, lines: [{ kind: "command", text: "bun dev" }] },
        { title: "tests", lines: [{ kind: "success", text: "42 passed" }] },
      ],
      {
        title: "kineglyph",
        paneOptions: { typing: "all" },
        statusBar: { left: "0:dev*", center: "main", right: "16:42" },
      },
    );
    expect(node).toMatchObject({
      metadata: { terminalRole: "window", paneCount: 2 },
    });
    expect(ids(node)).toEqual(
      expect.arrayContaining([
        "workspace-pane-1",
        "workspace-pane-2",
        "workspace-panes",
        "workspace-status-bar",
      ]),
    );
    expect(JSON.stringify(node)).toContain('"typingOrder":1000001');
    expect(JSON.stringify(node)).toContain('"reveal":"characters"');
    expect(validateScene({ schemaVersion: 2, id: "tmux", title: "tmux", root: node }).ok).toBe(
      true,
    );
  });

  it("composes reusable application chrome, tabs, and responsive panes", () => {
    const editor = codeBlock("editor", "const ready = true;", {
      chrome: "plain",
      lineNumbers: false,
    });
    const sidebar = fileTree("sidebar", [{ name: "index.ts", selected: true }], {
      frame: { fill: "none", stroke: "none" },
    });
    const panes = paneLayout(
      "workbench-panes",
      [
        { title: "Explorer", icon: "folder", content: sidebar, minWidth: 150 },
        { title: "Editor", icon: "code", content: editor, active: true, grow: 2 },
      ],
      { layout: { wide: "row", narrow: "stack" } },
    );
    const node = windowFrame("workbench", panes, {
      title: "tiny IDE",
      tabs: [
        { label: "index.ts", active: true, onActivate: "OPEN_INDEX" },
        { label: "README.md", onActivate: "OPEN_README" },
      ],
      chromeEnd: [{ kind: "badge", text: "main", tone: "success" }],
      statusBar: [
        { kind: "label", text: "TypeScript" },
        { kind: "label", text: "Ln 1" },
      ],
    });
    expect(ids(node)).toEqual(
      expect.arrayContaining([
        "workbench-chrome",
        "workbench-tab-1",
        "workbench-panes-pane-2-header",
        "workbench-status-bar",
      ]),
    );
    expect(JSON.stringify(node)).toContain('"onActivate":"OPEN_INDEX"');
    expect(node.metadata).toMatchObject({ workspaceRole: "window", chrome: "window" });
    expect(validateScene({ schemaVersion: 2, id: "ide", title: "IDE", root: node }).ok).toBe(true);
  });

  it("preserves styled spans and applies viewport, selection, status, and wrapping policies", () => {
    const node = terminal(
      "viewport",
      [
        { text: "old" },
        { text: "queued" },
        {
          spans: [
            { text: "green", tone: "success", bold: true, ansi: { foreground: 32, bold: true } },
            { text: " warning", tone: "warning", underline: true },
          ],
          selected: true,
          status: "running",
        },
        { text: "done", status: { label: "exit 0", tone: "success" } },
      ],
      {
        title: "viewport",
        visibleLines: 2,
        scroll: "end",
        wrap: "clip",
        status: "success",
      },
    );
    expect(ids(node)).not.toContain("viewport-line-1");
    expect(ids(node)).toEqual(
      expect.arrayContaining([
        "viewport-status",
        "viewport-line-3-span-1-text",
        "viewport-line-3-status",
        "viewport-line-4-status",
      ]),
    );
    expect(node.metadata).toMatchObject({
      totalLines: 4,
      visibleLines: 2,
      scrollStart: 2,
      wrap: "clip",
    });
    expect(JSON.stringify(node)).toContain('"ansiForeground":"32"');
    expect(JSON.stringify(node)).toContain('"selected":true');
  });

  it("adds a compact semantic gutter, inline cwd, and trailing line metadata", () => {
    const node = terminal(
      "polished",
      [
        { text: "npm test", kind: "command", meta: "1.4s" },
        { text: "42 passed", kind: "success", marker: "ok", markerTone: "warning" },
        { text: "cached", kind: "comment", marker: false },
      ],
      { title: "checks", cwd: "~/kineglyph", cwdPosition: "header", lineMarkers: true },
    );
    expect(ids(node)).toEqual(
      expect.arrayContaining([
        "polished-cwd",
        "polished-line-1-marker",
        "polished-line-1-meta",
        "polished-line-2-marker",
      ]),
    );
    expect(ids(node)).not.toContain("polished-line-3-marker");
    expect(JSON.stringify(node)).toContain('"text":"ok"');
    expect(JSON.stringify(node)).toContain('"text":"1.4s"');
  });

  it("rejects invalid terminal viewport policies at authoring time", () => {
    expect(() => terminal("bad", ["line"], { visibleLines: 0 })).toThrow(/visibleLines/);
    expect(() => terminal("bad", ["line"], { scroll: Number.NaN })).toThrow(/numeric scroll/);
  });

  it("tokenizes common syntax and accepts exact caller-supplied code tokens", () => {
    expect(highlightCodeLine("const answer = make(42); // done", "typescript")).toEqual(
      expect.arrayContaining([
        { text: "const", kind: "keyword" },
        { text: "make", kind: "function" },
        { text: "42", kind: "number" },
        { text: "// done", kind: "comment" },
      ]),
    );
    const node = codeBlock(
      "source",
      [
        "const answer = 42;",
        {
          number: 9,
          highlighted: true,
          tokens: [
            { text: "return", kind: "keyword" },
            { text: " answer", tone: "danger" },
          ],
        },
      ],
      { language: "typescript", title: "answer.ts", startLine: 8 },
    );
    expect(node).toMatchObject({
      metadata: { codeRole: "block", language: "typescript" },
      label: "answer.ts",
    });
    expect(ids(node)).toEqual(
      expect.arrayContaining(["source-header", "source-line-1-number", "source-line-2-token-1"]),
    );
    expect(JSON.stringify(node)).toContain('"lineNumber":9,"highlighted":true');
    expect(JSON.stringify(node)).toContain('"color":"danger"');

    const resolved = resolveScene(
      {
        schemaVersion: 2,
        id: "code-spacing",
        title: "Code spacing",
        root: codeBlock("spacing", "const answer = 42;", {
          language: "typescript",
          lineNumbers: false,
        }),
      },
      { width: 640 },
    );
    expect(
      resolved.nodes.find((entry) => entry.id === "spacing-line-1-token-2")?.width,
    ).toBeGreaterThan(0);
  });

  it("authors code diffs, ranged emphasis, annotations, and typewrite targets", () => {
    const node = codeBlock(
      "diff",
      [
        { text: "const oldName = 1;", diff: "remove" },
        {
          text: "const newName = 1;",
          diff: "add",
          annotation: { text: "preferred", tone: "success" },
        },
        "return newName;",
      ],
      { language: "typescript", highlightRanges: [[2, 3]], typing: true },
    );
    expect(ids(node)).toEqual(
      expect.arrayContaining(["diff-line-1-diff", "diff-line-2-annotation", "diff-line-3-token-1"]),
    );
    expect(JSON.stringify(node)).toContain('"diff":"remove"');
    expect(JSON.stringify(node)).toContain('"annotation":true');
    expect(JSON.stringify(node)).toContain('"reveal":"characters"');
    expect(JSON.stringify(node)).toContain('"highlighted":true');
  });

  it("supports deterministic code viewports, custom tokenizers, and a typed caret", () => {
    const node = codeBlock("viewport-code", ["one", "two", "three", "four"], {
      language: "text",
      visibleLines: 2,
      scroll: "follow",
      cursor: { line: 4, style: "bar" },
      typing: true,
      tokenize: (source) => [{ text: source, tone: "info" }],
    });
    expect(ids(node)).not.toContain("viewport-code-line-1");
    expect(ids(node)).toEqual(
      expect.arrayContaining([
        "viewport-code-line-3-token-1",
        "viewport-code-line-4-token-1",
        "viewport-code-line-4-cursor",
      ]),
    );
    expect(node.metadata).toMatchObject({ totalLines: 4, visibleLines: 2, scrollStart: 2 });
    expect(JSON.stringify(node)).toContain('"color":"info"');
    expect(JSON.stringify(node)).toContain('"typingOrder":39999');
  });

  it("binds a dynamic source line without splitting its runtime text across syntax tokens", () => {
    const node = codeBlock("dynamic-code", [
      { text: "const selected = true;", bind: { text: "selectedLine" } },
    ]);
    let token: SceneNode | undefined;
    walkScene(node, (entry) => {
      if (entry.id === "dynamic-code-line-1-token-1") token = entry;
    });
    expect(ids(node)).toContain("dynamic-code-line-1-token-1");
    expect(token).toMatchObject({
      id: "dynamic-code-line-1-token-1",
      bind: { text: "selectedLine" },
    });
    expect(JSON.stringify(node).match(/dynamic-code-line-1-token-/g)).toHaveLength(1);
  });

  it("renders nested file entries with branch guides, details, and status", () => {
    const node = fileTree(
      "repo",
      [
        {
          name: "src",
          kind: "folder",
          children: [
            { name: "index.ts", detail: "entry" },
            { name: "terminal.ts", status: "new", tone: "success" },
          ],
        },
        { name: "package.json" },
      ],
      { root: "kineglyph", density: "compact" },
    );
    expect(node).toMatchObject({ metadata: { fileTreeRole: "tree" } });
    expect(ids(node)).toEqual(
      expect.arrayContaining([
        "repo-root-icon",
        "repo-entry-1-guide",
        "repo-entry-1-1-name",
        "repo-entry-1-2-status",
      ]),
    );
    expect(JSON.stringify(node)).toContain('"icon":"folder"');
  });

  it("infers compact file types and supports selected interactive rows", () => {
    const node = fileTree(
      "typed-tree",
      [
        {
          name: "src",
          children: [
            {
              name: "app.tsx",
              selected: true,
              status: "open",
              statusTone: "success",
              onActivate: "OPEN_APP",
            },
          ],
        },
        { name: "README.md" },
      ],
      { disclosures: true, selectionTone: "surfaceRaised" },
    );
    expect(ids(node)).toEqual(
      expect.arrayContaining([
        "typed-tree-entry-1-disclosure",
        "typed-tree-entry-1-1-branch",
        "typed-tree-entry-1-1-type-label",
        "typed-tree-entry-2-type-label",
      ]),
    );
    const json = JSON.stringify(node);
    expect(json).toContain('"text":"TSX"');
    expect(json).toContain('"text":"MD"');
    expect(json).toContain('"onActivate":"OPEN_APP"');
    expect(json).toContain('"selected":true');
  });
});

describe("circuit recipes", () => {
  it("builds standard gate silhouettes from portable scene primitives", () => {
    const xor = gate("xor", "xor", { tone: "info" });
    expect(xor).toMatchObject({
      type: "group",
      layout: "coordinates",
      width: { wide: 108, compact: 96, narrow: 90 },
      height: { wide: 72, compact: 64, narrow: 60 },
      label: "XOR logic gate",
      metadata: { circuitRole: "gate", gateKind: "xor", gateVariant: "schematic" },
    });
    expect(xor.children.map((child) => child.id)).toEqual(["xor-graphic", "xor-text"]);
    const xorGraphic = xor.children[0] as GroupNode;
    expect(xorGraphic.children.map((child) => child.id)).toEqual([
      "xor-channel",
      "xor-shape",
      "xor-signal",
      "xor-xor-arc",
      "xor-xor-signal",
    ]);
    expect(xorGraphic.children[0]).toMatchObject({
      type: "path",
      fill: "none",
      stroke: "canvas",
      strokeWidth: 4.15,
    });
    expect(xorGraphic.children[1]).toMatchObject({
      type: "path",
      fill: "surface",
      stroke: "connector",
    });
    expect(xorGraphic.children[2]).toMatchObject({
      type: "path",
      fill: "none",
      stroke: "info",
    });
    expect(xorGraphic.children[3]).toMatchObject({ type: "path", fill: "none" });
    expect(xor.ports).toEqual([
      { id: "in-0", side: "left", offset: 27 / 80, gap: -12 },
      { id: "in-1", side: "left", offset: 53 / 80, gap: -12 },
      { id: "out", side: "right", offset: 0.5 },
    ]);

    const nand = gate("nand", "nand", { showText: false });
    expect(nand.children.map((child) => child.id)).toEqual(["nand-graphic"]);
    expect((nand.children[0] as GroupNode).children.map((child) => child.id)).toEqual([
      "nand-channel",
      "nand-shape",
      "nand-signal",
      "nand-bubble",
      "nand-bubble-signal",
    ]);
    expect((nand.children[0] as GroupNode).children[3]).toMatchObject({
      type: "circle",
      radius: 7,
    });

    const live = gate("live", "xor", { bind: { highlight: "signal" } });
    expect((live.children[0] as GroupNode).children[2]).toMatchObject({
      bind: { opacity: "signal" },
    });
    expect((live.children[0] as GroupNode).children[4]).toMatchObject({
      bind: { opacity: "signal" },
    });
    expect(live).not.toHaveProperty("bind");

    const solid = gate("solid", "xor", { variant: "solid", tone: "info" });
    expect((solid.children[0] as GroupNode).children.map((child) => child.id)).toEqual([
      "solid-shape",
      "solid-xor-arc",
    ]);
    expect((solid.children[0] as GroupNode).children[0]).toMatchObject({
      fill: "surfaceRaised",
      stroke: "info",
      strokeWidth: 1.8,
    });
  });

  it("rotates gate graphics and swaps their real connection bounds without rotating labels", () => {
    const down = gate("down", "and", { text: "AND", orientation: "down" });
    expect(down).toMatchObject({
      width: { wide: 72, compact: 64, narrow: 60 },
      height: { wide: 108, compact: 96, narrow: 90 },
      metadata: { gateOrientation: "down", gateAutoOrient: false },
    });
    expect(down.children[0]).toMatchObject({
      id: "down-graphic",
      width: { wide: 108, compact: 96, narrow: 90 },
      height: { wide: 72, compact: 64, narrow: 60 },
      position: { x: 0.5, y: 0.5, anchor: "center" },
      rotation: 90,
    });
    expect(down.children[1]).toMatchObject({ id: "down-text", type: "text" });
    expect(down.children[1]).not.toHaveProperty("rotation");
    expect(down.ports).toEqual([
      { id: "in-0", side: "top", offset: 53 / 80, gap: -12 },
      { id: "in-1", side: "top", offset: 27 / 80, gap: -12 },
      { id: "out", side: "bottom", offset: 0.5 },
    ]);
  });

  it("creates a compact, semantic fan-out junction", () => {
    expect(junction("branch", { tone: "success", size: 12 })).toMatchObject({
      id: "branch",
      type: "group",
      width: 12,
      height: 12,
      metadata: { circuitRole: "junction" },
      children: [
        { id: "branch-base", type: "circle", fill: "connector" },
        { id: "branch-signal", type: "circle", fill: "success" },
      ],
    });
    expect(
      junction("live-branch", {
        tone: "info",
        bind: { highlight: "branchOn" },
      }),
    ).toMatchObject({
      children: [{ id: "live-branch-base" }, { bind: { opacity: "branchOn" } }],
    });
  });
});

describe("containers", () => {
  it("expose every layout with the same option shape", () => {
    const child = text("c", "child");
    expect(stack("s", [child]).layout).toBe("stack");
    expect(row("r", [child]).layout).toBe("row");
    expect(grid("g", [child], { columns: 3 })).toMatchObject({ layout: "grid", columns: 3 });
    expect(overlay("o", [child]).layout).toBe("overlay");
    expect(flowLayout("f", [child]).layout).toEqual({ wide: "row", compact: "stack" });
    expect(container("c2", "coordinates", [child], { height: 120 })).toMatchObject({
      layout: "coordinates",
      height: 120,
    });
    const options = {
      gap: 8,
      padding: [4, 8] as const,
      align: "center" as const,
      justify: "between" as const,
      width: "fill" as const,
      height: 40,
      minWidth: 10,
      maxWidth: 400,
      grow: 1,
      frame: { fill: "surface" as const },
      hidden: { compact: true },
      z: 2,
      label: "Row",
      description: "A row",
      interactive: true,
      onActivate: "GO",
      bind: { highlight: "lit" },
      metadata: { stage: 1 },
      alignSelf: "end" as const,
      clip: true,
    };
    expect(row("full", [child], options)).toEqual({
      id: "full",
      type: "group",
      layout: "row",
      children: [child],
      ...options,
    });
    // Undefined options never leak into the node.
    expect(Object.keys(stack("bare", [child]))).toEqual(["id", "type", "layout", "children"]);
  });
});

describe("card()", () => {
  it("builds the header, body, badge, and extras with derived ids", () => {
    const extra = keyValue("extra", "k", "v");
    const node = card("plan", {
      eyebrow: "Stage 1",
      title: "Plan",
      body: "Bound the region.",
      motif: "graph",
      tone: "info",
      badge: "pure",
      extras: [extra],
      interactive: true,
      onActivate: "FOCUS_PLAN",
      bind: { highlight: "planFocus" },
      metadata: { stage: 1 },
      compact: true,
    });
    expect(node.type).toBe("group");
    expect(node.layout).toBe("stack");
    expect(node.children.map((child) => child.id)).toEqual([
      "plan-header",
      "plan-body",
      "plan-badge",
      "extra",
    ]);
    expect(ids(node)).toEqual([
      "plan",
      "plan-header",
      "plan-motif",
      "plan-heading",
      "plan-eyebrow",
      "plan-title",
      "plan-body",
      "plan-badge",
      "extra",
      "extra-key",
      "extra-value",
    ]);
    expect(node).toMatchObject({
      gap: 6,
      padding: [12, 14],
      frame: { fill: "surface", stroke: "border" },
      width: "fill",
      label: "Plan",
      description: "Bound the region.",
      interactive: true,
      onActivate: "FOCUS_PLAN",
      bind: { highlight: "planFocus" },
      metadata: { stage: 1 },
    });
    const header = node.children[0] as GroupNode;
    expect(header.layout).toBe("row");
    expect(header.children[0]).toMatchObject({ type: "icon", icon: "graph", tone: "info" });
    expect(node.children[2]).toMatchObject({ type: "badge", text: "pure", tone: "info" });
    // `compact` is a recipe switch, not a container option: it must not leak into the node.
    expect("compact" in node).toBe(false);
  });

  it("keeps the title block flat without a motif and honours explicit labels and binds", () => {
    const node = card("c", {
      title: "Only title",
      label: "Custom name",
      titleBind: { text: "titleSignal" },
      bodyBind: { text: "bodySignal" },
      body: "Body",
      badge: "b",
      badgeBind: { hidden: "hideBadge" },
      badgeTone: "warning",
    });
    expect(node.children.map((child) => child.id)).toEqual(["c-title", "c-body", "c-badge"]);
    expect(node.label).toBe("Custom name");
    expect(node.gap).toBe(8);
    expect(node.padding).toEqual([16, 18]);
    expect(node.children[0]).toMatchObject({ bind: { text: "titleSignal" } });
    expect(node.children[1]).toMatchObject({ bind: { text: "bodySignal" } });
    expect(node.children[2]).toMatchObject({ bind: { hidden: "hideBadge" }, tone: "warning" });
  });
});

describe("panel()", () => {
  it("wraps content in a muted dashed frame with an optional head", () => {
    const a = card("a", { title: "A" });
    const b = card("b", { title: "B" });
    const node = panel("group", [a, b], {
      eyebrow: "Inputs",
      title: "Two cards",
      layout: { wide: "row", compact: "stack" },
      columns: 2,
      gap: 20,
      tone: "info",
      hidden: { narrow: true },
    });
    expect(node.children.map((child) => child.id)).toEqual(["group-head", "group-content"]);
    const head = node.children[0] as GroupNode;
    expect(head.children.map((child) => child.id)).toEqual(["group-eyebrow", "group-title"]);
    expect(head.children[0]).toMatchObject({ color: "info" });
    const content = node.children[1] as GroupNode;
    expect(content).toMatchObject({
      layout: { wide: "row", compact: "stack" },
      gap: 20,
      columns: 2,
      width: "fill",
    });
    expect(content.children).toEqual([a, b]);
    expect(node).toMatchObject({
      gap: 12,
      padding: 16,
      frame: { fill: "surfaceMuted", stroke: "border", dash: "dashed" },
      width: "fill",
      hidden: { narrow: true },
    });
    expect("columns" in node).toBe(false);
    const bare = panel("bare", [a]);
    expect(bare.children.map((child) => child.id)).toEqual(["bare-content"]);
    expect((bare.children[0] as GroupNode).gap).toBe(12);
  });
});

describe("recipes resolve", () => {
  it("compose into a valid scene that lays out at every width", () => {
    const scene = {
      schemaVersion: 2 as const,
      id: "recipes",
      title: "Recipes",
      root: stack(
        "root",
        [
          title("t", "Recipes"),
          flowLayout(
            "flow",
            [
              card("a", { eyebrow: "One", title: "Alpha", body: "First card.", motif: "graph" }),
              panel(
                "p",
                [card("b", { title: "Beta", badge: "new", extras: [keyValue("kv", "k", "v")] })],
                {
                  eyebrow: "Panel",
                  title: "Grouped",
                },
              ),
            ],
            { gap: 24 },
          ),
          rule("r"),
          row(
            "meta",
            [pill("pill", "ready"), motif("m", "cube"), spacer("sp", 8), code("c", "x")],
            {
              gap: 8,
              align: "center",
            },
          ),
        ],
        { gap: 16, width: "fill" },
      ),
    };
    expect(validateScene(scene).ok).toBe(true);
    for (const width of [1200, 820, 390]) {
      const resolved = resolveScene(scene, { width });
      const problems = (resolved.diagnostics ?? []).filter((entry) =>
        ["overlap", "overflow", "text-truncated"].includes(entry.code),
      );
      expect(problems).toEqual([]);
    }
  });
});
