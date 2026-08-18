import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { gifInfo, pngInfo } from "../src/index.js";
import { fontFile } from "./helpers.js";

const packageRoot = fileURLToPath(new URL("..", import.meta.url));
const cliPath = join(packageRoot, "dist", "cli.js");
const fixture = join(packageRoot, "test", "fixtures", "pipeline.mjs");
const geist = fileURLToPath(
  new URL("../../../docs/assets/fonts/GeistMono[wght].ttf", import.meta.url),
);
const fontArgs = fontFile === undefined ? [] : ["--font", fontFile, "--no-system-fonts"];
let outDir = "";

interface CliResult {
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

function cli(...args: string[]): CliResult {
  const result = spawnSync(process.execPath, [cliPath, ...args], {
    cwd: packageRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

beforeAll(() => {
  if (!existsSync(cliPath)) {
    // The CLI runs from the compiled output; build it once when the workspace has not been built.
    const require = createRequire(import.meta.url);
    const tsc = require.resolve("typescript/bin/tsc");
    execFileSync(process.execPath, [tsc, "-p", join(packageRoot, "tsconfig.build.json")], {
      cwd: packageRoot,
      stdio: "ignore",
    });
  }
  outDir = mkdtempSync(join(tmpdir(), "kineglyph-export-"));
});

afterAll(() => {
  if (outDir !== "") rmSync(outDir, { recursive: true, force: true });
});

describe("kineglyph-export CLI", () => {
  it("exports a pipeline definition to PNG", () => {
    const out = join(outDir, "pipeline.png");
    const result = cli("png", "--scene", fixture, "--out", out, "--scale", "0.5", ...fontArgs);
    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/^wrote .*pipeline\.png \(png, \d+x\d+, \d+ bytes\)\n$/);
    const png = new Uint8Array(readFileSync(out));
    const info = pngInfo(png);
    expect(info.width).toBeGreaterThan(0);
    expect(result.stdout).toContain(`${info.width}x${info.height}`);
  });

  it("exports SVG from a named export with a transparent background", () => {
    const out = join(outDir, "nested", "pipeline.svg");
    const result = cli(
      "svg",
      "--scene",
      `${fixture}#pipeline`,
      "--out",
      out,
      "--background",
      "transparent",
      "--width",
      "320",
      "--layout",
      "stacked",
    );
    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
    const svg = readFileSync(out, "utf8");
    expect(svg.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(svg).not.toContain("kg-export-background");
    expect(svg).toContain('width="320"');
  });

  it("uses one explicit font for HarfBuzz layout and raster pixels", () => {
    const out = join(outDir, "shaped.png");
    const result = cli(
      "png",
      "--scene",
      `${fixture}#scene`,
      "--out",
      out,
      "--shape-font",
      `Inter=${geist}`,
      "--no-system-fonts",
      "--default-font",
      "Geist Mono",
    );
    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
    expect(pngInfo(new Uint8Array(readFileSync(out))).width).toBeGreaterThan(0);
  });

  it("exports GIF from a resolver function using a theme module", () => {
    const out = join(outDir, "pipeline.gif");
    const result = cli(
      "gif",
      "--scene",
      `${fixture}#resolveScene`,
      "--theme",
      `${fixture}#darkTheme`,
      "--out",
      out,
      "--fps",
      "5",
      "--scale",
      "0.25",
      "--hold-last",
      "0",
      "--no-loop",
      ...fontArgs,
    );
    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
    const info = gifInfo(new Uint8Array(readFileSync(out)));
    expect(info.frameCount).toBe(3);
    expect(info.delays).toEqual([200, 200, 200]);
    expect(info.loop).toBe(false);
    expect(result.stdout).toContain("3 frames");
  });

  it("loads reusable export presets and lets explicit flags override them", () => {
    const out = join(outDir, "preset.gif");
    const result = cli(
      "--preset",
      `${fixture}#gifPreset`,
      "--out",
      out,
      "--fps",
      "10",
      ...fontArgs,
    );
    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
    const info = gifInfo(new Uint8Array(readFileSync(out)));
    expect(info.width).toBe(240);
    expect(info.frameCount).toBe(5);
    expect(info.loop).toBe(false);
  });

  it("reports export errors with exit code 1", () => {
    const result = cli("gif", "--scene", fixture, "--out", join(outDir, "x.gif"), "--fps", "0");
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/^error: fps must be/);
    expect(existsSync(join(outDir, "x.gif"))).toBe(false);
  });

  it("reports usage errors and missing modules", () => {
    expect(cli("webp", "--scene", fixture, "--out", "x").status).toBe(1);
    expect(cli("png", "--scene", fixture).stderr).toMatch(/--out is required/);
    expect(
      cli("png", "--scene", fixture, "--out", "x.png", "--shape-font", "missing").stderr,
    ).toMatch(/--shape-font expects/);
    const missing = cli("png", "--scene", join(outDir, "missing.mjs"), "--out", "x.png");
    expect(missing.status).toBe(1);
    expect(missing.stderr).toMatch(/^error: /);
    const help = cli("--help");
    expect(help.status).toBe(0);
    expect(help.stdout).toContain("Usage: kineglyph-export");
  });
});
