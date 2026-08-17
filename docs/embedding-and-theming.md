# Embedding a rendered figure, and letting the page theme it

`renderSvg` produces a self-contained illustration. This page is about what happens to it _after_
that — how it takes the colours of the page it lands on, and what it will not take.

## The split: geometry is rendered, colour is inherited

SVG cannot wrap or reflow text. A box is sized against the text it will hold, once, at render time,
and the result is fixed. So **geometry is decided when the figure is rendered** — box sizes, line
breaks, text advances, corner radii, the viewBox.

The reader's colour scheme is not knowable then. A figure rendered this morning may be read tonight
in a dark theme, on a site that was re-branded in between. So **colour is decided when the figure is
viewed**, by CSS, and the rendered SVG only says which role each paint plays.

Every paint an emitted SVG carries is therefore written as:

```
fill="var(--kg-color-accent, #5b5ce2)"
```

The fallback is the exact value the theme resolved to. A page that defines none of these tokens
paints precisely what it painted before tokens existed; a page that defines them re-tints the
figure with no re-render.

## The `--kg-color-*` contract

Set any of these on an ancestor of the figure — `:root` is the usual place — and the figure follows.
They are named for the role a colour plays in a diagram, not for the colour itself.

| Token                                     | What it paints                                                        |
| ----------------------------------------- | --------------------------------------------------------------------- |
| `--kg-color-canvas`                       | the figure's own background plane                                     |
| `--kg-color-surface`                      | node and card fills                                                   |
| `--kg-color-surface-raised`               | fills that sit above the surface (raised, floating, glass materials)  |
| `--kg-color-surface-muted`                | recessed fills (inset material)                                       |
| `--kg-color-border`                       | node and card outlines                                                |
| `--kg-color-text`                         | labels and body text                                                  |
| `--kg-color-text-muted`                   | captions, secondary body text, edge labels                            |
| `--kg-color-accent`                       | the emphasised element: icons, motifs, focus rings, highlighted edges |
| `--kg-color-accent-contrast`              | text and marks drawn _on_ the accent                                  |
| `--kg-color-connector`                    | edges, arrowheads, packets                                            |
| `--kg-color-info`                         | the informational tone                                                |
| `--kg-color-success`                      | the success tone                                                      |
| `--kg-color-warning`                      | the warning tone                                                      |
| `--kg-color-danger`                       | the danger tone                                                       |
| `--kg-color-chart1` … `--kg-color-chart6` | quantitative series, in order                                         |
| `--kg-color-chart-positive`               | a gain                                                                |
| `--kg-color-chart-negative`               | a loss                                                                |
| `--kg-color-chart-neutral`                | a baseline or an unremarkable value                                   |

```css
:root {
  --kg-color-canvas: #0b0b10;
  --kg-color-surface: #16161f;
  --kg-color-border: #2c2c3a;
  --kg-color-text: #f2f2f7;
  --kg-color-text-muted: #a0a0b0;
  --kg-color-accent: #e0218a;
  --kg-color-connector: #6b6b80;
}
```

### How a paint finds its role

The renderer is handed a _resolved_ scene: the token a colour came from is already gone, and only
the literal is left. The role is recovered by looking that literal back up in the theme's palette.

Two roles can share a value — `accent` and `chart1` do in the default theme — so ties are broken by
a fixed order: the general roles first (`canvas`, `surface`, `surfaceRaised`, `surfaceMuted`,
`border`, `text`, `textMuted`, `accent`, `accentContrast`, `connector`, `info`, `success`,
`warning`, `danger`), the chart series after them. That order is stable, so a theme always produces
the same mapping. A theme that wants its chart series re-tinted independently of its accent gives
them distinct values, and then there is no tie to break.

A colour the theme does not name — one mixed or derived during resolution — stays a literal. It
cannot be re-tinted, because there is no role to name it by.

## What is deliberately _not_ re-themable

**The font.** `--kg-font-family` is written as a literal, and text carries `textLength`. The reason
is the split above: text is measured at render time and the boxes are sized to the result, so a page
that re-fonted the figure afterwards would pull the text away from the geometry built for it.
`textLength` is what holds the two together — a run occupies exactly the width its box was sized
for, whatever font the reader ends up with.

The metrics behind it (`measureText`) are per-glyph class estimates, biased slightly wide and
independent of the family, so `textLength` stretches letter spacing rather than squashing glyphs for
any face narrower than the estimate. That is why the freeze is safe rather than brittle.

If you want a figure drawn in your own font, say so **before** rendering:

```ts
import { withFontFamily, resolveFigure } from "@kineglyph/core";
import { documentFontFamily } from "@kineglyph/web";

const family = documentFontFamily(document.body) ?? "Inter, sans-serif";
const scene = resolveFigure(figure, { width: 960, theme: withFontFamily(theme, family) });
```

`documentFontFamily` reads the font the page is _actually_ rendered in, which is the right answer
whenever the renderer is running inside the page that will show the result — an in-browser publisher
most of all.

**Radii.** `--kg-radius-*` are pinned on the root element for the same reason: they are geometry.

## Inlining a figure into a page

An SVG delivered through `<img>` or `<picture>` is a separate document. It inherits nothing — not
`--kg-color-*`, not fonts, not `prefers-reduced-motion` from the host's own settings. If you want
the page's CSS to reach a figure, **inline the SVG into the page**.

The root element carries `role="img"` with a `<title>` and, when the scene has a description, a
`<desc>`; inlined, those reach assistive technology directly. Delivered as an `<img>`, they do not,
and the `alt` text has to carry the whole burden.

The aliases the embedded stylesheet reads (`--kg-node-fill`, `--kg-text`, `--kg-edge-stroke` and so
on) are defined on the root element itself, as references — `--kg-node-fill: var(--kg-color-surface,
#ffffff)`. That keeps one inlined figure's values out of the next one's, while leaving the token it
reads free to be inherited from the page.

### Replacing the frame when the figure goes live

`mountAll` hides the pre-rendered frame once the live stage is up. It recognises a direct-child
`<img>` or `<picture>`, and — for embedders that inline the SVG — any direct child marked
`data-kg-static`:

```html
<figure class="kg" data-scene="/scenes/pipeline.mjs">
  <div data-kg-static><svg class="kg-scene" role="img">…</svg></div>
</figure>
```

### Not replacing it at all

For a great many diagrams the live mount draws the frame that is already on the page. A still
picture with no timeline, no inspectable part and no machine gains nothing from hydration — it only
trades a server-rendered, screen-reader-reachable SVG for an identical one built in JavaScript.

`sceneNeedsRuntime(resolved)` is the fact that decision needs, and only the fact: `true` when the
runtime could show a reader something the frame cannot — a timeline with a duration, an inspectable
node, a machine, declared controls, or a live image surface. `prerender` reports it per result as
`needsRuntime`, so an embedder can settle it at build time and carry the answer into the markup.

The decision itself stays with the embedder, because it is one: a playground may legitimately want
a live mount around an inert scene so it can `setScene` later. `mountAll`'s `mountOptions` may
return `null` to decline an element:

```js
mountAll({ mountOptions: (el) => (el.dataset.kgInert === "true" ? null : { readout: "auto" }) });
```

A decline is checked **before** the scene module is fetched, so it costs no request and no resolve,
and the pre-rendered frame is left visible. A `kineglyph:update` event overrides it — asking for a
fresh scene is asking for a live figure.

## A live figure follows the same tokens

Everything above is about a rendered SVG, but a mounted figure honours `--kg-color-*` too, in both
halves of what it draws:

- the **drawing**, because the animator writes paint through the same role lookup the renderer uses
  (`paintTokeniser`), so the first frame cannot replace a re-tintable `var()` with a literal;
- the **chrome** — the frame, readout and transport — because `--kg-shell-*` are set as references
  (`--kg-shell-background: var(--kg-color-canvas, #f7f8fa)`) rather than as values.

So a re-tinted page does not end up with a themed diagram sitting in an unthemed white box, and a
theme swapped at runtime through `setTheme` still wins where the page has said nothing.

A colour that has no role — one mixed during a highlight, for instance — stays literal in both.
