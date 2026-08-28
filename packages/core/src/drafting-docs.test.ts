// Every live block on docs/drafting-sheets.md is evaluated against the source packages, resolved
// at the documented widths, and swept across its control ranges. The sheets are the reference
// consumers of `drafting`, `orbital`, and `deriveSignals`; a regression there should fail here,
// not on the docs site.
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { resolveScene } from "./resolve.js";
import type { SceneDefinition } from "./scene.js";
import type { ThemeTokens } from "./theme.js";

interface SheetModule {
  readonly default: SceneDefinition;
  readonly theme: ThemeTokens;
  readonly deriveSignals: (variables: Record<string, unknown>) => Record<string, unknown>;
}

const root = resolve(process.cwd(), "packages/core/src/zz-drafting-docs");
const source = readFileSync(resolve(process.cwd(), "docs/drafting-sheets.md"), "utf8");
const blocks = [...source.matchAll(/```kineglyph live id=([^\s]+)[^\n]*\n([\s\S]*?)```/g)].map(
  ([, id, body]) => ({ id: id as string, body: body as string }),
);

beforeAll(() => {
  rmSync(root, { recursive: true, force: true });
  mkdirSync(root, { recursive: true });
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

async function load(block: { id: string; body: string }): Promise<SheetModule> {
  const file = resolve(root, `${block.id}.mjs`);
  writeFileSync(
    resolve(root, "kineglyph.mjs"),
    'export * from "../index.js";\nexport { loadMath, mathMark } from "../../../web/src/math.js";\n',
  );
  writeFileSync(file, block.body.replace(/from "kineglyph"/g, 'from "./kineglyph.mjs"'));
  return (await import(/* @vite-ignore */ file)) as SheetModule;
}

describe("drafting-sheets docs", () => {
  it("documents five sheets", () => {
    expect(blocks.map((block) => block.id)).toEqual([
      "drafting-hohmann",
      "drafting-elements",
      "drafting-ground-track",
      "drafting-libration",
      "drafting-ascent",
    ]);
  });

  for (const block of blocks) {
    it(`${block.id} resolves cleanly at every docs width and across its controls`, async () => {
      const mod = await load(block);
      for (const width of [960, 640, 440, 320]) {
        const resolved = resolveScene(mod.default, { width, theme: mod.theme });
        const problems = resolved.diagnostics ?? [];
        expect(problems, `${block.id} @${width}`).toEqual([]);
        const sheet = resolved.nodes.find((node) => node.id === "sheet");
        expect(sheet?.height).toBeCloseTo(width * 0.625, 1);
      }
      const variables = { ...(mod.default.machine?.variables ?? {}) };
      for (const control of mod.default.controls ?? []) {
        if (control.kind !== "range" || control.bind === undefined) continue;
        for (const value of [
          control.min,
          ((control.min ?? 0) + (control.max ?? 1)) / 2,
          control.max,
        ]) {
          const signals = mod.deriveSignals({ ...variables, [control.bind]: value });
          for (const [key, signal] of Object.entries(signals))
            expect(String(signal), `${block.id} ${control.bind}=${value} ${key}`).not.toMatch(
              /NaN|undefined|Infinity/,
            );
          const resolved = resolveScene(mod.default, {
            width: 960,
            theme: mod.theme,
            signals: signals as Record<string, string | number | boolean>,
          });
          expect((resolved.diagnostics ?? []).filter((d) => d.severity === "error")).toEqual([]);
        }
      }
    });
  }
});
