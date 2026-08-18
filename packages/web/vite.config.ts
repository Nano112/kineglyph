import { defineConfig } from "vite";

/**
 * Builds the self-contained ESM bundle (`dist/kineglyph-web.js`) that plain
 * `<script type="module">` pages and Blade views can import without any build step.
 * Consumer scenes and themes stay outside the bundle and are supplied at mount time.
 */
export default defineConfig({
  build: {
    outDir: "dist",
    emptyOutDir: false,
    sourcemap: true,
    minify: true,
    lib: {
      entry: "src/bundle.ts",
      formats: ["es"],
      fileName: () => "kineglyph-web.js",
    },
    rollupOptions: {
      external: [],
    },
  },
});
