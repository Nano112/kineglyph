/**
 * Self-contained browser bundle: runtime + product themes + illustration catalogue.
 * Built by Vite into `dist/kineglyph-web.js` for `<script type="module">` and Blade views.
 */
export * from "./index.js";
export {
  catalogue,
  findCatalogueEntry,
  themes,
  themeNames,
  themeCopy,
  isThemeName,
  type CatalogueEntry,
  type ThemeName,
} from "@kineglyph/scenes";
export { createTheme, defaultTheme, defineScene, resolveFigure } from "@kineglyph/core";
import { catalogue as sceneCatalogue, themes as productThemes } from "@kineglyph/scenes";
import { registerScene, registerTheme } from "./index.js";

for (const entry of sceneCatalogue) registerScene(entry.slug, entry.scene);
for (const [name, theme] of Object.entries(productThemes)) registerTheme(name, theme);
