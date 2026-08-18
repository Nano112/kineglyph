#!/usr/bin/env node
/**
 * Renders every catalogue scene at desktop / 820 / 390 widths in all three themes into a single
 * static HTML page for visual review. Usage: node scripts/preview.mjs [out.html] [slug]
 * Requires built dist for core, svg, and scenes.
 */
import { writeFileSync } from "node:fs";
import { resolveScene, seekTimeline, resolveMachineState } from "@kineglyph/core";
import { renderSvg } from "@kineglyph/svg";
import { catalogue, themes } from "@kineglyph/scenes";

const out = process.argv[2] ?? "preview.html";
const only = process.argv[3];
const widths = [1200, 820, 390];
const parts = [];
const nav = [];
for (const entry of catalogue) {
  if (only !== undefined && entry.slug !== only) continue;
  parts.push(
    `<h2 style="font:600 20px system-ui;color:#ddd;margin:40px 0 0">${entry.order}. ${entry.title}</h2>`,
  );
  for (const width of widths) {
    for (const [name, theme] of Object.entries(themes)) {
      const resolved = resolveScene(entry.scene, { width, theme });
      const problems = (resolved.diagnostics ?? []).filter((d) =>
        ["overlap", "overflow", "text-truncated", "label-collision"].includes(d.code),
      );
      const svg = renderSvg(seekTimeline(resolved, Number.MAX_SAFE_INTEGER), {
        idPrefix: `${entry.slug}-${width}-${name}`,
      });
      const problemHtml = problems.length
        ? `<pre style="color:#f88;font:12px monospace">${problems.map((p) => `${p.code}: ${p.message}`).join("\n")}</pre>`
        : "";
      parts.push(
        `<h3 id="${entry.slug}-${width}-${name}" style="font:14px system-ui;color:#888;margin:16px 0 4px">${entry.slug} · ${width}px · ${name} · ${resolved.layoutName} · ${resolved.height}px</h3>${problemHtml}<div style="width:${width}px;border:1px dashed #666">${svg}</div>`,
      );
      if (entry.scene.machine !== undefined && width === 1200 && name === "midnight") {
        for (const state of Object.keys(entry.scene.machine.states).slice(0, 6)) {
          const machineState = resolveMachineState(entry.scene.machine, state);
          const stateResolved = resolveScene(entry.scene, { width, theme, machineState });
          parts.push(
            `<h3 id="${entry.slug}-state-${state}" style="font:14px system-ui;color:#888;margin:16px 0 4px">${entry.slug} · state=${state}</h3><div style="width:${width}px;border:1px dashed #666">${renderSvg(seekTimeline(stateResolved, Number.MAX_SAFE_INTEGER), { idPrefix: `${entry.slug}-state-${state}` })}</div>`,
          );
        }
      }
    }
  }
}
writeFileSync(
  out,
  `<!doctype html><meta charset="utf-8"><title>Kineglyph catalogue preview</title><body style="background:#333;padding:20px;display:flex;flex-direction:column;gap:8px"><nav style="font:13px system-ui">${nav.join("")}</nav>${parts.join("")}</body>`,
);
console.log(`wrote ${out}`);
