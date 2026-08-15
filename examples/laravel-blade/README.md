# Kineglyph in a Laravel Blade view

This example shows how a normal Laravel application embeds Kineglyph figures in Blade
templates with the framework-neutral `@kineglyph/web` runtime. Nothing here requires React,
a custom build system, or global ids: each `<x-kineglyph-figure>` mounts its own controller,
figures on the same page never collide, and the same semantic scene that renders in the
gallery renders here.

Two integration styles are shown. Pick one per application.

## 1. Vite (Laravel's default asset pipeline)

Install the packages in the Laravel project:

```sh
npm install @kineglyph/web @kineglyph/scenes
```

`resources/js/kineglyph.js` registers the scenes and themes you want to expose and mounts
every `[data-kineglyph]` element after the DOM is ready (see the file in this directory).
Reference it from your layout:

```blade
{{-- resources/views/layouts/app.blade.php --}}
@vite(['resources/css/app.css', 'resources/js/kineglyph.js'])
```

Then place figures anywhere with the Blade component in
`resources/views/components/kineglyph-figure.blade.php`:

```blade
<x-kineglyph-figure scene="fast-generation" theme="nucleation" />

<x-kineglyph-figure scene="smart-simulation" theme="pock" :autoplay="false"
    caption="Choose an intent to see which engine Nucleation recommends." />
```

Because the runtime observes each host element, the same figure resolves the wide layout in a
full-width article column and the compact or narrow layout inside a sidebar or a phone
viewport — nothing is scaled non-uniformly.

## 2. No build step: the self-contained ESM bundle

Copy `node_modules/@kineglyph/web/dist/kineglyph-web.js` (and its `.map`) to
`public/vendor/kineglyph/` (for example with a `postinstall` script or `php artisan
vendor:publish`-style copy step) and load it as a module. The bundle already contains the
runtime, the three product themes, and the eight-scene catalogue, and it registers them for
auto-mounting:

```blade
<script type="module">
  import { autoMount } from "{{ asset('vendor/kineglyph/kineglyph-web.js') }}";
  autoMount();
</script>

<div data-kineglyph="formats-and-io" data-theme="schematio"></div>
<div data-kineglyph="palettes-and-color" data-theme="nucleation" data-autoplay="false"></div>
```

Supported attributes: `data-kineglyph` (scene slug), `data-theme` (`nucleation`, `pock`,
`schematio`, or a name you registered), `data-layout` (`auto`, `wide`, `compact`, `narrow`),
`data-autoplay="false"`, `data-controls="false"`, `data-readout="false"`,
`data-reduced-motion="true"`, `data-width` (fixed width), and `data-id-prefix`.

## Driving a figure from your own scripts

`autoMount()` returns the controllers in document order, and `mountKineglyph(element, options)`
gives you one directly:

```js
import { mountKineglyph, findCatalogueEntry, themes } from "@kineglyph/web/bundle";

const controller = mountKineglyph(document.querySelector("#engine-lab"), {
  scene: findCatalogueEntry("smart-simulation").scene,
  theme: themes.pock,
  autoplay: false,
});

controller.send("INTENT_CIRCUIT"); // deterministic state-machine event
controller.on("state", ({ step }) => console.log(step.transition));
controller.setTheme(themes.nucleation);
controller.seek(1200);
controller.destroy(); // removes DOM, listeners, observers, and animations
```

## Livewire / Turbo / Inertia pages

Mount inside the framework's "page loaded" hook and destroy on navigation to avoid leaks:

```js
document.addEventListener("livewire:navigated", () => {
  window.__kineglyph?.forEach((controller) => controller.destroy());
  window.__kineglyph = autoMount();
});
```

## Files in this directory

- `resources/views/components/kineglyph-figure.blade.php` — the Blade component (props:
  `scene`, `theme`, `layout`, `autoplay`, `controls`, `readout`, `caption`, `width`, `static`,
  `alt`). The host carries `aria-busy="true"` until the runtime mounts (the runtime sets it to
  `false` and removes it on destroy); `static` points at an SVG/PNG produced by
  `kineglyph-export` and is shown inside `<noscript>` when JavaScript is off.
- `resources/views/docs/show.blade.php` — an article page mounting three figures.
- `resources/js/kineglyph.js` — the Vite entry that registers scenes and auto-mounts.
- `public/vendor/kineglyph/README.md` — where the no-build bundle lives.

The example is documentation for a host Laravel app; it is not a runnable Laravel project on
its own, but every file is a drop-in for the standard `laravel new` skeleton.
