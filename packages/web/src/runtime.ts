/**
 * Focused browser runtime entry point.
 *
 * This deliberately omits the editor, plot compilers, authoring DSL, and export encoders. Use the
 * more specific `@kineglyph/web/*` entry points when a page also needs those capabilities.
 */
export {
  INHERIT_THEME,
  autoMount,
  autoplayAttr,
  chromeAttr,
  documentFontFamily,
  getRegisteredScene,
  getRegisteredTheme,
  mountKineglyph,
  registerScene,
  registerTheme,
  startWhenVisible,
  themeByName,
  type AutoMountOptions,
  type AutoplaySetting,
  type ChromeSetting,
  type FigureLayoutRequest,
  type InspectField,
  type InspectTarget,
  type KineglyphController,
  type KineglyphEventMap,
  type KineglyphState,
  type MountOptions,
  type StartWhenVisibleOptions,
} from "./index.js";
