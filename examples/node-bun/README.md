# Generate a glyph with Node.js or Bun

Install the two small packages used by the example:

```sh
npm install @kineglyph/core @kineglyph/svg
```

Then run the same ESM file with either runtime:

```sh
node glyph.mjs
bun glyph.mjs
```

Pass a path as the first argument to choose the output location:

```sh
node glyph.mjs ./out/build-step.svg
```

See `docs/node-and-bun.md` for PNG/GIF export, watch mode, and separating reusable scene modules
from build scripts.
