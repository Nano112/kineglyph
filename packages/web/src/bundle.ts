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
export {
  alphaGradient,
  backdrop,
  blur,
  createTheme,
  defaultTheme,
  defineScene,
  figure,
  innerShadow,
  linearGradient,
  material,
  noise,
  radialGradient,
  resolveFigure,
  shader,
  shadow,
} from "@kineglyph/core";
export {
  area,
  bar,
  calloutAt,
  dot,
  groupedBar,
  heatmap,
  line,
  plot,
  pointLabel,
  range,
  rule,
  sparkline,
  stackedBar,
} from "@kineglyph/plot";
import { catalogue as sceneCatalogue, themes as productThemes } from "@kineglyph/scenes";
import { registerScene, registerTheme } from "./index.js";

for (const entry of sceneCatalogue) registerScene(entry.slug, entry.scene);
for (const [name, theme] of Object.entries(productThemes)) registerTheme(name, theme);
