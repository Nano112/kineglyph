# public/vendor/kineglyph

Copy `node_modules/@kineglyph/web/dist/kineglyph-web.js` and `kineglyph-web.js.map` here for the
no-build integration, for example with an npm script in the Laravel project:

```json
{
  "scripts": {
    "kineglyph:publish": "mkdir -p public/vendor/kineglyph && cp node_modules/@kineglyph/web/dist/kineglyph-web.js* public/vendor/kineglyph/"
  }
}
```

Then a Blade view can import it directly:

```blade
<script type="module">
  import { autoMount } from "{{ asset('vendor/kineglyph/kineglyph-web.js') }}";
  import { scenes, themes } from "{{ asset('js/figures.js') }}";
  autoMount({ scenes, themes });
</script>
```

The bundle is a plain ES module with no globals and no consumer catalogue. The host application
supplies scenes and themes when it calls `autoMount`.
