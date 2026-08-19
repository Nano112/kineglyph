import { spawn } from "node:child_process";
import type { ResolvedScene } from "@kineglyph/core";
import { KineglyphExportError } from "./errors.js";
import { exportImageSequence, type FrameSequenceOptions } from "./sequence.js";

export interface VideoExportOptions extends FrameSequenceOptions {
  readonly format: "webm" | "mp4";
  readonly ffmpeg?: string;
  readonly codec?: string;
  readonly quality?: number;
}

/** Optional ffmpeg adapter for compact WebM/MP4 output; image sequences remain the portable base. */
export async function exportVideo(
  scene: ResolvedScene,
  options: VideoExportOptions,
): Promise<Uint8Array> {
  const fps = options.fps ?? 30;
  const frames = await exportImageSequence(scene, { ...options, fps });
  const format = options.format;
  const codec = options.codec ?? (format === "webm" ? "libvpx-vp9" : "libx264");
  const quality = options.quality ?? (format === "webm" ? 32 : 20);
  const args = [
    "-hide_banner",
    "-loglevel",
    "error",
    "-f",
    "image2pipe",
    "-framerate",
    String(fps),
    "-i",
    "pipe:0",
    "-an",
    "-c:v",
    codec,
    ...(format === "webm"
      ? ["-crf", String(quality), "-b:v", "0", "-pix_fmt", "yuva420p", "-f", "webm"]
      : [
          "-crf",
          String(quality),
          "-pix_fmt",
          "yuv420p",
          "-movflags",
          "frag_keyframe+empty_moov",
          "-f",
          "mp4",
        ]),
    "pipe:1",
  ];
  return new Promise<Uint8Array>((resolve, reject) => {
    const child = spawn(options.ffmpeg ?? "ffmpeg", args, { stdio: ["pipe", "pipe", "pipe"] });
    const output: Uint8Array[] = [];
    const errors: Uint8Array[] = [];
    child.stdout.on("data", (chunk: Uint8Array) => output.push(chunk));
    child.stderr.on("data", (chunk: Uint8Array) => errors.push(chunk));
    child.on("error", (error) =>
      reject(
        new KineglyphExportError(
          "encoder",
          `ffmpeg could not start: ${error.message}; install ffmpeg or export an image sequence`,
          { cause: error },
        ),
      ),
    );
    child.on("close", (code) => {
      if (code === 0) resolve(concat(output));
      else
        reject(
          new KineglyphExportError(
            "encoder",
            `ffmpeg exited with ${String(code)}: ${new TextDecoder().decode(concat(errors))}`,
          ),
        );
    });
    for (const frame of frames) child.stdin.write(frame.png);
    child.stdin.end();
  });
}

function concat(parts: readonly Uint8Array[]): Uint8Array {
  const output = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
}
