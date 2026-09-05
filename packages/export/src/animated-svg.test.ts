import { figure, resolveScene } from "@kineglyph/core";
import { expect, it } from "vitest";
import { exportAnimatedSvg } from "./animated-svg.js";

const command = resolveScene(figure("command", { title: "Paste", hold: 300 }, f => {
  const chat = f.minecraftCommand("//paste");
  f.root(chat);
  f.sequence([f.typewrite(chat, { characterDuration: 100 })], { start: 200 });
}), { width: 320 });

it("exports a portable vector animation with a completed reduced-motion frame and unique IDs", () => {
  const svg = exportAnimatedSvg(command, { fps: 20 });
  for (const part of ["@keyframes", "steps(1,end) 1 both", "prefers-reduced-motion:reduce", "//paste"]) expect(svg).toContain(part);
  expect(svg).not.toMatch(/<script|<video|data:image\/png/);
  const ids = [...svg.matchAll(/\sid="([^"]+)"/g)].map(m => m[1]);
  expect(new Set(ids).size).toBe(ids.length);
  expect(svg).toBe(exportAnimatedSvg(command, { fps: 20 }));
});

it("validates repeat and sampling limits", () => {
  expect(() => exportAnimatedSvg(command, { repeat: 0 })).toThrow("positive integer");
  expect(() => exportAnimatedSvg(command, { fps: -1 })).toThrow();
  expect(() => exportAnimatedSvg(command, { maxFrames: 2 })).toThrow();
});

it("emits a simple still when there is no animation", () => {
  const still = resolveScene(figure("still", { title: "Still" }, f => f.root(f.stack([f.text("Ready")]))), { width: 320 });
  expect(exportAnimatedSvg(still)).not.toContain("-animated-motion");
});
