import { execFileSync, spawnSync } from "node:child_process";
import { figure, resolveScene } from "@kineglyph/core";
import { expect, it } from "vitest";
import { exportVideo } from "./video.js";

const hasEncoder =
  spawnSync("ffmpeg", ["-version"]).status === 0 && spawnSync("ffprobe", ["-version"]).status === 0;

it.runIf(hasEncoder)("exports odd-sized scenes to H.264 without cropping", async () => {
  const scene = resolveScene(
    figure("odd-video", { title: "Odd dimensions" }, (f) => {
      f.root(f.stack([f.rect({ height: 67, width: "fill", fill: "accent" })]));
    }),
    { width: 65 },
  );
  const bytes = await exportVideo(scene, { format: "mp4", fps: 1 });
  const metadata = JSON.parse(
    execFileSync(
      "ffprobe",
      ["-v", "error", "-show_entries", "stream=width,height", "-of", "json", "pipe:0"],
      { input: bytes, encoding: "utf8" },
    ),
  );
  expect(metadata.streams[0]).toMatchObject({
    width: Math.ceil(scene.width / 2) * 2,
    height: Math.ceil(scene.height / 2) * 2,
  });
});
