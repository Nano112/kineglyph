import { describe, expect, it } from "vitest";
import { figure } from "./figure.js";
import { minecraftCommand } from "./recipes.js";
import { resolveScene } from "./resolve.js";
import { walkScene, type TextMark } from "./scene.js";

describe("Minecraft command input", () => {
  it("keeps slash commands intact and types only the input, with static history and suggestions", () => {
    const scene = figure("minecraft", { title: "WorldEdit command" }, (f) => {
      const input = f.minecraftCommand("//paste", {
        id: "chat",
        history: [{ kind: "success", text: "Clipboard loaded.", typing: true }],
        suggestions: ["//paste [-a]"],
        context: "Multiplayer chat",
      });
      f.root(input);
      f.sequence([f.typewrite(input, { characterDuration: 40 })]);
    });
    const texts: TextMark[] = [];
    walkScene(scene.root, (node) => {
      if (node.type === "text") texts.push(node);
    });
    expect(texts.filter((node) => node.reveal === "characters").map((node) => node.text)).toEqual([
      "//paste",
    ]);
    expect(texts.some((node) => node.text === "$" || node.text === ">")).toBe(false);
    for (const width of [320, 390, 720, 960]) {
      expect(resolveScene(scene, { width }).diagnostics).toEqual([]);
    }
  });

  it("wraps long commands without hiding their arguments on a narrow screen", () => {
    const command = "/schematio download 12345678-1234-1234-1234-123456789012";
    const scene = figure("long-command", { title: "Download" }, (f) => {
      f.root(f.minecraftCommand(command, { cursor: false }));
    });
    const resolved = resolveScene(scene, { width: 320 });
    expect(resolved.diagnostics).toEqual([]);
    const texts: string[] = [];
    walkScene(scene.root, (node) => {
      if (node.type === "text") texts.push(node.text);
    });
    expect(texts.join("")).toContain(command);
  });

  it("rejects shell commands and multi-line input", () => {
    expect(() => minecraftCommand("chat", "npm test")).toThrow("slash-prefixed");
    expect(() => minecraftCommand("chat", "/schematio\n//paste")).toThrow("slash-prefixed");
  });
});
