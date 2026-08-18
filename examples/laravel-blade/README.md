# Kineglyph in a Laravel Blade view

The Laravel application owns `resources/js/figures.js`: its scenes, catalogue, and theme. The
Kineglyph web package supplies the framework-neutral runtime.

```sh
npm install @kineglyph/core @kineglyph/web
```

Load `resources/js/kineglyph.js` from the layout with Vite, then mount a registered scene:

```blade
@vite(['resources/js/kineglyph.js'])

<x-kineglyph-figure
    scene="request-path"
    theme="docs"
    static="{{ asset('img/figures/request-path.svg') }}" />
```

For an application without a JavaScript build, copy `kineglyph-web.js` into `public/vendor/`,
import the application-owned scene module, and pass both registries explicitly:

```blade
<script type="module">
  import { autoMount } from "{{ asset('vendor/kineglyph/kineglyph-web.js') }}";
  import { scenes, themes } from "{{ asset('js/figures.js') }}";
  autoMount({ scenes, themes });
</script>
```

The bundle contains no product catalogue or theme. This keeps Kineglyph reusable and makes scene
ownership visible in the host repository.

Mount inside Livewire, Turbo, or Inertia page hooks and destroy the returned controllers before
navigation. Each controller owns its DOM ids, observers, and animation lifecycle.
