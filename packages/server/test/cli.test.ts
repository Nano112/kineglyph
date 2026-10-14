import { expect, it } from "vitest";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const cli = fileURLToPath(new URL("../dist/cli.js", import.meta.url));
it("documents standalone serve and rejects invalid flags", () => {
  const help = spawnSync(process.execPath, [cli, "--help"], { encoding: "utf8" });
  expect(help.status).toBe(0);
  expect(help.stdout).toContain("kineglyph-server");
  expect(help.stdout).toContain("127.0.0.1");
  for (const args of [
    ["--port", "-1"],
    ["--port", "1.5"],
    ["--wat"],
    ["--host"],
    ["wrong"],
    ["--port", "0", "--port", "1"],
  ]) {
    const r = spawnSync(process.execPath, [cli, ...args], { encoding: "utf8" });
    expect(r.status).toBe(1);
    expect(r.stderr).not.toContain("/Users/");
  }
});
it.each([{ prefix: [] }, { prefix: ["serve"] }])(
  "serves real HTTP with prefix $prefix and shuts down on SIGTERM",
  async ({ prefix }) => {
    const child = spawn(process.execPath, [cli, ...prefix, "--port", "0"], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    try {
      const url = await new Promise<string>((resolve, reject) => {
        let output = "";
        child.stdout.on("data", (chunk) => {
          output += chunk;
          const m = output.match(/http:\/\/127\.0\.0\.1:\d+/);
          if (m) resolve(m[0]);
        });
        child.once("exit", () => reject(new Error("server exited before listen")));
        child.once("error", reject);
      });
      expect((await fetch(`${url}/chart.png?data=1,2`)).status).toBe(200);
      const exited = new Promise<number | null>((r) => child.once("exit", r));
      child.kill("SIGTERM");
      expect(await exited).toBe(0);
    } finally {
      child.kill("SIGKILL");
    }
  },
);
