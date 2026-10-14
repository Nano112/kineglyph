# Bundled raster font

`GeistMono.ttf` is bundled with the server; PNG/GIF rendering sets `loadSystemFonts: false` and uses `Geist Mono` for every typography role. No runtime font download or arbitrary family is accepted. The SVG path uses the same fixed family name and does not import raster dependencies; SVG viewers supply their own font fallback.

Upstream project: https://github.com/vercel/geist-font
License: SIL Open Font License 1.1, reproduced in `OFL.txt`.

Pinned SHA-256 checksums:

```
d00e590b8eb3a59acc329b2d044fd143ae935090b7da33199ebee27cc7de8196  GeistMono.ttf
f12f59163d92084b0473315ae4566cde0c1233d940ae464f5225a69c347cc691  OFL.txt
```
