import { describe, expect, it } from "vitest";
import { defaultTheme } from "@kineglyph/core";
import {
  assertRegressionMatch,
  captureRegressionSnapshots,
  compareRegressionManifests,
  createRegressionManifest,
  fingerprintRegressionContent,
  formatRegressionReport,
  type RegressionManifest,
} from "../src/index.js";
import { gifInfo, pngInfo } from "../src/formats.js";
import { pipeline } from "./fixtures/pipeline.mjs";
import { testFonts } from "./helpers.js";

describe("visual regression snapshots", () => {
  it("uses a portable, stable SHA-256 fingerprint", () => {
    expect(fingerprintRegressionContent("hello")).toBe(
      "sha256:2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
    );
    expect(fingerprintRegressionContent(new TextEncoder().encode("hello"))).toBe(
      fingerprintRegressionContent("hello"),
    );
  });

  it("renders deterministic wide, compact, narrow, exact-time, and reduced-motion SVGs", async () => {
    const options = {
      formats: ["svg"] as const,
      times: [200, 0, 200, 900],
      includeFinal: true,
      includeReducedMotion: true,
      theme: defaultTheme,
    };
    const first = await captureRegressionSnapshots(pipeline, options);
    const second = await captureRegressionSnapshots(pipeline, options);
    expect(first.sceneId).toBe("export-fixture");
    expect(first.snapshots).toHaveLength(12);
    expect(first.snapshots.map(({ viewport }) => viewport)).toEqual([
      "wide",
      "wide",
      "wide",
      "wide",
      "compact",
      "compact",
      "compact",
      "compact",
      "narrow",
      "narrow",
      "narrow",
      "narrow",
    ]);
    expect(first.snapshots.map(({ layout }) => layout)).toEqual([
      "wide",
      "wide",
      "wide",
      "wide",
      "compact",
      "compact",
      "compact",
      "compact",
      "narrow",
      "narrow",
      "narrow",
      "narrow",
    ]);
    expect(
      first.snapshots.filter(({ motion }) => motion === "exact").map(({ time }) => time),
    ).toEqual([0, 200, 400, 0, 200, 400, 0, 200, 400]);
    expect(
      first.snapshots.filter(({ motion }) => motion === "reduced").map(({ time }) => time),
    ).toEqual([400, 400, 400]);
    for (const viewport of ["wide", "compact", "narrow"]) {
      const terminal = first.snapshots.find(
        (snapshot) =>
          snapshot.viewport === viewport && snapshot.motion === "exact" && snapshot.time === 400,
      );
      const reduced = first.snapshots.find(
        (snapshot) => snapshot.viewport === viewport && snapshot.motion === "reduced",
      );
      expect(reduced?.fingerprint).toBe(terminal?.fingerprint);
    }
    expect(first.snapshots.every(({ content }) => typeof content === "string")).toBe(true);
    expect(first.snapshots.map(({ id }) => id)).toEqual(second.snapshots.map(({ id }) => id));
    expect(first.snapshots.map(({ fingerprint }) => fingerprint)).toEqual(
      second.snapshots.map(({ fingerprint }) => fingerprint),
    );
  });

  it("does not emit a meaningless reduced-motion duplicate for a static scene", async () => {
    const { timeline: _timeline, ...still } = pipeline;
    void _timeline;
    const result = await captureRegressionSnapshots(still, {
      viewports: [{ name: "wide", width: 640, layout: "wide" }],
      formats: ["svg"],
      includeReducedMotion: true,
    });
    expect(result.snapshots).toHaveLength(1);
    expect(result.snapshots[0]).toMatchObject({ motion: "exact", time: 0 });
  });

  it("renders SVG and PNG with stable dimensions and an application-owned font set", async () => {
    const result = await captureRegressionSnapshots(pipeline, {
      viewports: [{ name: "component", width: 480, layout: "compact" }],
      formats: ["png", "svg"],
      times: [100],
      includeFinal: false,
      png: { fonts: testFonts, scale: 0.5 },
      svg: { background: "transparent" },
    });
    expect(result.snapshots.map(({ format }) => format)).toEqual(["svg", "png"]);
    const svg = result.snapshots[0];
    const png = result.snapshots[1];
    expect(svg?.time).toBe(100);
    expect(svg?.content).toEqual(expect.stringContaining("<svg"));
    expect(png?.content).toBeInstanceOf(Uint8Array);
    const info = pngInfo(png?.content as Uint8Array);
    expect(info.width).toBe(png?.width);
    expect(info.height).toBe(png?.height);
    expect(svg?.fingerprint).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(png?.fingerprint).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it("captures one complete deterministic GIF timeline per viewport", async () => {
    const result = await captureRegressionSnapshots(pipeline, {
      viewports: [{ name: "component", width: 480, layout: "compact" }],
      formats: ["gif"],
      times: [0, 100],
      includeFinal: true,
      includeReducedMotion: true,
      gif: { fonts: testFonts, fps: 4, holdLast: 0 },
    });
    expect(result.snapshots).toHaveLength(1);
    const snapshot = result.snapshots[0];
    expect(snapshot).toMatchObject({
      format: "gif",
      motion: "exact",
      time: 400,
      viewport: "component",
    });
    expect(snapshot?.content).toBeInstanceOf(Uint8Array);
    const info = gifInfo(snapshot?.content as Uint8Array);
    expect(info.width).toBe(snapshot?.width);
    expect(info.height).toBe(snapshot?.height);
    expect(info.frameCount).toBeGreaterThan(1);
  });

  it("creates portable manifests and reports changed, added, and removed artifacts", async () => {
    const set = await captureRegressionSnapshots(pipeline, {
      viewports: [{ name: "wide", width: 640, layout: "wide" }],
      formats: ["svg"],
      times: [0, 200],
      includeFinal: false,
    });
    const baseline = createRegressionManifest(set);
    expect(baseline.snapshots).toHaveLength(2);
    expect(baseline.snapshots.every((entry) => !("content" in entry))).toBe(true);
    const same = compareRegressionManifests(baseline, baseline);
    expect(same.matches).toBe(true);
    expect(assertRegressionMatch(same)).toBe(same);
    expect(formatRegressionReport(same)).toContain("PASS");

    const [changed, removed] = baseline.snapshots;
    if (changed === undefined || removed === undefined)
      throw new Error("fixture needs two snapshots");
    const actual: RegressionManifest = {
      ...baseline,
      snapshots: [
        { ...changed, fingerprint: fingerprintRegressionContent("changed") },
        {
          ...removed,
          id: "export-fixture--wide--exact-t300.svg",
          time: 300,
          fingerprint: fingerprintRegressionContent("added"),
        },
      ],
    };
    const comparison = compareRegressionManifests(baseline, actual);
    expect(comparison.matches).toBe(false);
    expect(comparison.changed.map(({ id }) => id)).toEqual([changed.id]);
    expect(comparison.removed.map(({ id }) => id)).toEqual([removed.id]);
    expect(comparison.added.map(({ id }) => id)).toEqual(["export-fixture--wide--exact-t300.svg"]);
    const report = formatRegressionReport(comparison);
    expect(report).toContain("Kineglyph visual regression: FAIL");
    expect(report).toContain(`~ ${changed.id}`);
    expect(report).toContain(`- ${removed.id}`);
    expect(report).toContain("+ export-fixture--wide--exact-t300.svg");
    expect(() => assertRegressionMatch(comparison)).toThrowError(
      expect.objectContaining({ name: "KineglyphRegressionError" }),
    );
  });

  it("rejects ambiguous matrices and invalid times before rendering", async () => {
    await expect(
      captureRegressionSnapshots(pipeline, {
        viewports: [
          { name: "phone", width: 390, layout: "narrow" },
          { name: "Phone!", width: 320, layout: "narrow" },
        ],
        formats: ["svg"],
      }),
    ).rejects.toMatchObject({ code: "invalid-output" });
    await expect(
      captureRegressionSnapshots(pipeline, { formats: ["svg"], times: [-1] }),
    ).rejects.toMatchObject({ code: "invalid-time" });
    await expect(
      captureRegressionSnapshots(pipeline, { formats: [], includeFinal: true }),
    ).rejects.toMatchObject({ code: "invalid-output" });
    await expect(
      captureRegressionSnapshots(pipeline, {
        formats: ["svg"],
        times: [],
        includeFinal: false,
      }),
    ).rejects.toMatchObject({ code: "invalid-output" });
  });
});
