import { defineConfig } from "vite";

/**
 * Bundles three.js into one ESM file so a docs page (or any consumer) pays for the renderer only
 * when it loads this package. `@kineglyph/core` and `@kineglyph/web` stay external; declarations
 * come from `tsc --emitDeclarationOnly` in the build script.
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
      external: [/^@kineglyph\/(?:core|web)(?:\/|$)/],
    },
  },
});
