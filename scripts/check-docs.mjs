#!/usr/bin/env node
import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(process.cwd(), "docs");
const files = (await readdir(root)).filter((file) => file.endsWith(".md")).sort();
const problems = [];
const liveIds = new Map();

for (const file of files) {
  const source = await readFile(resolve(root, file), "utf8");
  const lines = source.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const start = /^```kineglyph\s+live\b(.*)$/.exec(lines[index] ?? "");
    if (start === null) continue;
    const attributes = start[1] ?? "";
    const id = /(?:^|\s)id=([^\s]+)/.exec(attributes)?.[1];
    if (id === undefined) problems.push(`${file}:${index + 1}: live figure needs a stable id`);
    else if (liveIds.has(id))
      problems.push(
        `${file}:${index + 1}: duplicate live id ${id} (first used at ${liveIds.get(id)})`,
      );
    else liveIds.set(id, `${file}:${index + 1}`);
    let end = index + 1;
    while (end < lines.length && lines[end] !== "```") end += 1;
    if (end === lines.length) {
      problems.push(`${file}:${index + 1}: unclosed live figure fence`);
      break;
    }
    const body = lines.slice(index + 1, end).join("\n");
    if (!/\bexport\s+default\b/.test(body))
      problems.push(`${file}:${index + 1}: live figure must have a default export`);
    if (!/(?:^|\s)view=(?:preview|split|source)(?:\s|$)/.test(attributes))
      problems.push(`${file}:${index + 1}: live figure must declare its initial view`);
    index = end;
  }
}

const manifest = await readFile(resolve(root, "article.yaml"), "utf8");
const navPages = [...manifest.matchAll(/\bpage:\s*([^,}\s]+)/g)].map((match) => match[1]);
const navSet = new Set(navPages);
for (const page of navPages)
  if (!files.includes(page)) problems.push(`article.yaml: nav page ${page} does not exist`);
for (const file of files)
  if (!navSet.has(file)) problems.push(`article.yaml: ${file} is not reachable from navigation`);

if (problems.length > 0) {
  process.stderr.write(
    `Documentation check failed:\n${problems.map((item) => `- ${item}`).join("\n")}\n`,
  );
  process.exitCode = 1;
} else {
  process.stdout.write(
    `Documentation check passed: ${files.length} pages, ${liveIds.size} live figures.\n`,
  );
}
