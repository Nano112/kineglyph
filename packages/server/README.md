# @kineglyph/server

A lightweight, bounded HTTP renderer for Kineglyph charts and portable scene definitions.
Short URLs have good defaults; structured requests add per-series display control and composition.
SVG, PNG, and animated GIF all reuse the existing plot → scene → export pipeline.

## Run from this repository

```sh
npm ci
npm run bootstrap
node packages/server/dist/cli.js serve --host 127.0.0.1 --port 4179
```

The package also supplies the `kineglyph-server` executable. Node.js 22.12+ is required.
No browser or database is needed. This is not the trusted-module `kineglyph dev` preview server.

```sh
curl 'http://127.0.0.1:4179/chart.svg?data=12,18,45,32,21' -o chart.svg
curl 'http://127.0.0.1:4179/chart.png?data=12,18,45&title=CPU&unit=percent&theme=blueprint' -o cpu.png
```

## Client-only URL builder

```ts
import { chartUrl } from "@kineglyph/server/client";

const imageUrl = chartUrl("https://glyph.example", {
  data: [12, 18, 45, 32, 21],
  theme: "blueprint",
  width: 800,
});
```

The client entry does not load HTTP, fonts, or native raster code. Simple inputs become short query
parameters; advanced inputs use encoded JSON. A raw JSON POST to `/render.png` returns image bytes
using the same schema. It does not create a persisted URL.

## Documentation

The [HTTP rendering guide](../../docs/http-rendering.md) covers:

- Minimal URLs, named series, missing points, explicit domains, axes, themes, layout width and scale.
- Structured chart requests and existing scene definitions.
- Client URL generation and GET/POST equivalence.
- Discord snapshot updates and CDN caching caveats.
- Security, bounded rendering, deployment, and reproducibility.

`src/schema.ts`, `src/scene-schema.ts`, and the exported request types define the precise supported
input surface. HTTP accepts a closed portable subset of core scenes. Arbitrary code, images/URLs,
font paths, shader programs, and unsupported fields are rejected, not evaluated or fetched.

For public deployment, use TLS and access/rate limits at a reverse proxy, plus OS resource limits.
A process timeout is not an operating-system sandbox. Query data is visible to logs and clients.

## Fonts

Raster output ships Geist Mono under the SIL Open Font License. The exact font and license are
included in `assets/`. Host font discovery is disabled for deterministic rasterization. SVG text
remains dependent on the viewer's fonts; PNG is the pixel-stable embedding choice.
