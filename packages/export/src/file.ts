import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

/** Writes exported bytes or SVG text to disk, creating parent directories as needed. */
export async function exportFile(path: string, data: Uint8Array | string): Promise<void> {
  const target = resolve(path);
  await mkdir(dirname(target), { recursive: true });
  if (typeof data === "string") await writeFile(target, data, "utf8");
  else await writeFile(target, data);
}
