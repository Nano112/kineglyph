/**
 * Vite entry for a Laravel app: registers the scenes and themes this site uses and mounts every
 * `[data-kineglyph]` element. Loaded once from the layout via @vite(['resources/js/kineglyph.js']).
 */
import { autoMount, registerScene, registerTheme } from "@kineglyph/web";
import { scenes, themes } from "./figures.js";

for (const [name, scene] of Object.entries(scenes)) registerScene(name, scene);
for (const [name, theme] of Object.entries(themes)) registerTheme(name, theme);

// Keep controllers reachable for Livewire / Turbo navigations and for debugging in DevTools.
window.kineglyph = { controllers: [] };

function mountAll() {
  window.kineglyph.controllers.push(...autoMount());
}

function destroyAll() {
  for (const controller of window.kineglyph.controllers.splice(0)) controller.destroy();
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mountAll);
else mountAll();

document.addEventListener("livewire:navigating", destroyAll);
document.addEventListener("livewire:navigated", mountAll);
document.addEventListener("turbo:before-render", destroyAll);
document.addEventListener("turbo:load", mountAll);
