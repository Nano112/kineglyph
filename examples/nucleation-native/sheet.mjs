// The beacon sheet for the export CLI: the same drafting layout as the docs' live block, with
// the build view standing in for native frames and the leaders driven by the GLB's anchors.
//
//   kineglyph-export gif --scene sheet.mjs#default --theme sheet.mjs#theme \
//     --frame-signals sheet.mjs#frameSignals --surface build-view=out/frames/beacon-{frame}.png \
//     --fps 30 --out out/beacon-sheet.gif
import { readFileSync } from "node:fs";
import { drafting as D, figure, paperDraftingTheme } from "@kineglyph/core";
import {
  anchorFrameSignals,
  anchorSignalDefaults,
  fromAnimatedGlb,
  headlessView,
  parseBuildGlb,
} from "@kineglyph/nucleation";

export const theme = paperDraftingTheme;

const GLB = process.env.BEACON_GLB ?? new URL("./out/beacon.glb", import.meta.url).pathname;
const PLATE = { x: 330, y: 330, width: 1440, height: 1240 };
const VIEW = { x: PLATE.x + 36, y: PLATE.y + 36, width: PLATE.width - 72, height: PLATE.height - 72 };
const NOTES = [
  { anchor: "beacon", x: 2000, y: 420, side: "top-left" },
  { anchor: "first-gold", x: 2000, y: 1180, side: "top-left" },
];

// Anchors are projected through the camera the native renderer used (see build.py).
const source = fromAnimatedGlb(parseBuildGlb(new Uint8Array(readFileSync(GLB))));
const view = headlessView({
  source,
  camera: { yaw: 28, pitch: 24, zoom: 0.8 },
  viewport: { width: VIEW.width, height: VIEW.height },
});
const anchors = anchorFrameSignals({ view, frame: VIEW, notes: NOTES });
export const frameSignals = (time) => {
  const s = anchors(time);
  return { ...s, placedLabel: `${s.placed} / ${s.groups} groups placed` };
};
const signals = { ...anchorSignalDefaults(NOTES), placedLabel: `0 / ${source.groups} groups placed` };

// The static fallback is replaced per frame by `--surface build-view=…`.
const FALLBACK = new URL("../../docs/assets/nucleation/field-observatory.png", import.meta.url).pathname;

export default figure("nucleation-beacon-native", {
  title: "Beacon build",
  description: "A Nucleation build rendered natively; the callouts follow the blocks.",
  background: "canvas",
  padding: 0,
  hold: 900,
  signals,
}, (f) => {
  const { layer: L } = D.bound(f, signals);
  const plate = D.plate(f, PLATE.x, PLATE.y, PLATE.width, PLATE.height, { id: "build-plate", seed: 9 });
  const view = f.image(FALLBACK, "Beacon build, textured", {
    id: "build-view",
    live: true,
    fit: "cover",
    position: D.at(VIEW.x, VIEW.y),
    width: `${(VIEW.width / 2880) * 100}%`,
    height: `${(VIEW.height / 1800) * 100}%`,
  });
  const leaders = NOTES.map((n) =>
    L(`leader.${n.anchor}`, { fill: "none", stroke: n.anchor === "beacon" ? "accent" : "info", strokeWidth: 0.8, opacity: 0.75 }),
  );
  const notes = [
    D.callout(f, 2000, 420, ["BEACON", "spin-in · 680 ms", "anchor (0, 1.5, 0)"], { id: "beacon-note", tone: "accent" }).node,
    D.callout(f, 2000, 1180, ["FIRST GOLD BLOCK", "group 0 · drop & pop", "anchor (−1, 0.5, −1)"], { id: "first-note", tone: "info" }).node,
  ];
  const rows = [["00–08", "gold_block", "drop & pop"], ["09", "beacon", "spin-in 680"], ["cam", "yaw −4° → 4°", "2.4 s"]];
  const table = [
    ...D.plate(f, 2000, 660, 790, 76 + rows.length * 54, { id: "steps", seed: 9 }),
    D.layer(f, D.line(2000, 716, 2790, 716), { id: "steps-rule", strokeWidth: 0.7, opacity: 0.3 }),
    D.text(f, "STEPS", 2024, 688, "left", { style: "label", tone: "textMuted" }),
    ...rows.flatMap(([g, block, effect], i) => [
      D.text(f, g, 2024, 750 + i * 54, "left", { style: "code", tone: "textMuted" }),
      D.text(f, block, 2200, 750 + i * 54, "left", { style: "code", tone: "text" }),
      D.text(f, effect, 2766, 750 + i * 54, "right", { style: "code", tone: "textMuted" }),
    ]),
  ];
  const readout = D.text(f, signals.placedLabel, 2000, 1560, "top-left", { id: "placed", style: "code", tone: "success", bind: { text: "placedLabel" } });

  f.root(D.sheet(f, {
    id: "sheet",
    title: "Beacon",
    subtitle: "Nucleation build animation  /  native render  ·  2 anchors",
    ident: "Sheet B-02",
    seed: 9,
    titleBlock: { title: "B-02 — Beacon", rows: [["Engine", "Nucleation native"], ["Frames", "render_frames · 30 fps"], ["Drawn", "Kineglyph"]] },
    layers: [...plate, view, ...leaders, ...notes, ...table, readout],
  }));

  f.sequence([
    f.reveal([...plate, view], { duration: 320 }),
    f.reveal([...notes, ...table, readout], { duration: 2_600, stagger: 120 }),
  ], { gap: 0 });
});
