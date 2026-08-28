import { defineConfig } from "vite";

/**
 * Bundles MathJax into one ESM file so consumers (Vite dev servers included) never have to
 * pre-bundle its CommonJS sources. `@kineglyph/core` stays external. Type declarations come from
 * `tsc --emitDeclarationOnly` in the build script.
 */
export default defineConfig({
  build: {
    outDir: "dist",
    emptyOutDir: false,
    sourcemap: true,
    minify: true,
    lib: {
      entry: "src/index.ts",
      formats: ["es"],
      fileName: () => "index.js",
    },
    rollupOptions: {
      external: ["@kineglyph/core"],
    },
  },
});
