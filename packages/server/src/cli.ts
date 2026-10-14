#!/usr/bin/env node
import { startRenderServer, type ServerOptions } from "./index.js";
const help = `Usage: kineglyph-server [serve] [options]

Render bounded chart/scene requests over HTTP.
  --host HOST           Listen address (default 127.0.0.1)
  --port PORT           Listen port (default 3000; 0 selects a free port)
  --concurrency N       Maximum active requests (default 2; 1–8)
  --timeout-ms N        Worker deadline (default 10000; 1–30000)
  --body-timeout-ms N   Body deadline (default 5000; 1–30000)
  --cache-bytes N       Private LRU byte capacity (default 0; max 64000000)
  -h, --help            Show help
`;
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args[0] === "serve") args.shift();
  if (args.length === 1 && (args[0] === "--help" || args[0] === "-h")) {
    process.stdout.write(help);
    return;
  }
  const options: ServerOptions = {};
  const numeric = new Map<string, keyof ServerOptions>([
    ["--port", "port"],
    ["--concurrency", "concurrency"],
    ["--timeout-ms", "timeoutMs"],
    ["--body-timeout-ms", "bodyTimeoutMs"],
    ["--cache-bytes", "cacheBytes"],
  ]);
  const seen = new Set<string>();
  for (let i = 0; i < args.length; i += 2) {
    const flag = args[i]!,
      value = args[i + 1];
    if (
      seen.has(flag) ||
      (!numeric.has(flag) && flag !== "--host") ||
      !value ||
      value.startsWith("--")
    )
      throw new Error("invalid arguments");
    seen.add(flag);
    if (flag === "--host") options.host = value;
    else {
      if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)))
        throw new Error("invalid arguments");
      Object.assign(options, { [numeric.get(flag)!]: Number(value) });
    }
  }
  const server = await startRenderServer(options);
  const address = server.address();
  if (address && typeof address !== "string") {
    const host = address.address.includes(":") ? `[${address.address}]` : address.address;
    process.stdout.write(`Kineglyph rendering at http://${host}:${address.port}\n`);
  }
  const shutdown = () => {
    server.shutdown().then(
      () => {
        process.off("SIGINT", shutdown);
        process.off("SIGTERM", shutdown);
      },
      () => {
        process.exitCode = 1;
      },
    );
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}
main().catch(() => {
  process.stderr.write("kineglyph-server: invalid options or unable to listen; use --help\n");
  process.exitCode = 1;
});
