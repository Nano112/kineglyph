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
  autoMount();
</script>
```

The bundle is a plain ES module (no globals) that includes the runtime, the three product
themes, and the illustration catalogue, and it registers all of them for `data-kineglyph`
auto-mounting.
