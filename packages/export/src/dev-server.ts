import { watch } from "node:fs";
import { readFile } from "node:fs/promises";
import { createServer, type Server, type ServerResponse } from "node:http";
import { extname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { stripTypeScriptTypes } from "node:module";

export interface DevServerOptions {
  readonly scene: string;
  readonly host?: string;
  readonly port?: number;
}

export interface DevServerHandle {
  readonly server: Server;
  readonly url: string;
  close(): Promise<void>;
}

function browserSource(source: string, filename: string): string {
  const transformed =
    extname(filename) === ".ts"
      ? stripTypeScriptTypes(source, { mode: "transform", sourceMap: false })
      : source;
  return transformed.replace(
    /(["'])(?:kineglyph|@kineglyph\/(?:core|plot|web(?:\/bundle)?))\1/g,
    '"/kineglyph.js"',
  );
}

const HTML = `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>Kineglyph dev</title><style>html{color-scheme:light dark}body{margin:0;font:14px system-ui;background:#111318;color:#f4f5f8}.bar{display:flex;justify-content:space-between;align-items:center;padding:10px 14px;border-bottom:1px solid #343944}.bar button{font:inherit;color:inherit;background:transparent;border:1px solid #59606d;border-radius:6px;padding:5px 8px}.host{max-width:1200px;margin:auto;padding:24px}pre{white-space:pre-wrap;color:#ff8d8d}</style></head>
<body><div class="bar"><span>Kineglyph live preview</span><button id="doctor">Inspect layout</button></div><main class="host" id="host"></main><pre id="error"></pre>
<script type="module">import { mountKineglyph, kineglyphTheme } from "/kineglyph.js";
let controller; async function load(){try{const module=await import("/figure.js?t="+Date.now());controller?.destroy();controller=mountKineglyph(document.querySelector("#host"),{scene:module.default,theme:module.theme??kineglyphTheme,controls:"auto",readout:"auto"});document.querySelector("#error").textContent=""}catch(error){document.querySelector("#error").textContent=error.stack??String(error)}}
document.querySelector("#doctor").onclick=()=>controller?.setDoctor(controller.stage.querySelector(".kg-doctor")===null);
new EventSource("/events").onmessage=()=>load();load();</script></body></html>`;

/** Starts the zero-config figure preview used by `kineglyph dev`. */
export async function startDevServer(options: DevServerOptions): Promise<DevServerHandle> {
  const filename = resolve(process.cwd(), options.scene);
  const bundleUrl = import.meta.resolve("@kineglyph/web/bundle");
  const bundleFile = fileURLToPath(bundleUrl);
  const clients = new Set<ServerResponse>();
  const server = createServer(async (request, response) => {
    const url = new URL(request.url ?? "/", "http://localhost");
    try {
      if (url.pathname === "/") {
        response.setHeader("content-type", "text/html; charset=utf-8");
        response.end(HTML);
      } else if (url.pathname === "/kineglyph.js") {
        response.setHeader("content-type", "text/javascript; charset=utf-8");
        response.end(await readFile(bundleFile));
      } else if (url.pathname === "/figure.js") {
        response.setHeader("content-type", "text/javascript; charset=utf-8");
        response.setHeader("cache-control", "no-store");
        response.end(browserSource(await readFile(filename, "utf8"), filename));
      } else if (url.pathname === "/events") {
        response.writeHead(200, {
          "content-type": "text/event-stream",
          "cache-control": "no-cache",
          connection: "keep-alive",
        });
        response.write("data: ready\n\n");
        clients.add(response);
        request.on("close", () => clients.delete(response));
      } else {
        response.statusCode = 404;
        response.end("Not found");
      }
    } catch (error) {
      response.statusCode = 500;
      response.end(error instanceof Error ? error.stack : String(error));
    }
  });
  const watcher = watch(filename, { persistent: false }, () => {
    for (const client of clients) client.write(`data: ${Date.now()}\n\n`);
  });
  const host = options.host ?? "127.0.0.1";
  await new Promise<void>((accept, reject) => {
    server.once("error", reject);
    server.listen(options.port ?? 4178, host, () => accept());
  });
  const address = server.address();
  const port =
    typeof address === "object" && address !== null ? address.port : (options.port ?? 4178);
  return {
    server,
    url: `http://${host}:${port}/`,
    close: () =>
      new Promise<void>((accept, reject) => {
        watcher.close();
        for (const client of clients) client.end();
        server.close((error) => (error === undefined ? accept() : reject(error)));
      }),
  };
}

export function sceneModuleUrl(scene: string): string {
  return pathToFileURL(resolve(process.cwd(), scene)).href;
}
