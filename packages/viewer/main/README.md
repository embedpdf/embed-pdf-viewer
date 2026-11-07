# @embedpdf/viewer

The full viewer, delivered: the `<embedpdf-viewer>` custom element and
`EmbedPDF.init()`. One artifact — `@embedpdf/viewer-chrome` compiled with
Preact, the local wasm engine and its worker wired in — served from the CDN
and wrapped by every framework package. No peer dependencies, no React
version matrix, no style collisions (shadow DOM; theming stays inside it).

## Use

```html
<div id="viewer" style="height: 100vh"></div>
<script type="module">
  import EmbedPDF from 'https://cdn.embedpdf.com/v3/embedpdf.js';
  EmbedPDF.init({ target: '#viewer', src: '/report.pdf' });
</script>
```

Or declaratively — it's a real custom element:

```html
<embedpdf-viewer
  src="/report.pdf"
  locale="auto"
  theme="system"
  style="height: 100vh"
></embedpdf-viewer>
```

`init` accepts the whole customization contract (`commands`, `icons`,
`strings`, `layout`, `disable`, `readOnly`, `scope`, `identity`, `notAllowed`,
`locale`, `theme`) — see
`@embedpdf/viewer-chrome`'s README for the ladder. `layout` takes a function
of the default layout and the viewer's env, so changing the toolbar needs no
import at all:

```js
EmbedPDF.init({
  target: '#viewer',
  src: '/report.pdf',
  layout: (layout, env) =>
    layout
      .remove('tool:pan', { from: 'main' })
      .place('main', env.size === 'compact' ? 'bottom' : 'top'),
});
```

The default layout (`defaultLayout`) and `createLayout` re-export from this
module for a layout written from scratch.

Set `.config` (or the attributes) and the element builds the viewer. Six keys
follow their value while it runs, from `.config`, their own properties
(`element.src = file`, `.theme`, `.locale`, `.disable`, `.readOnly`, `.fetch`)
or the `src`, `theme` and `locale` attributes: `src` opens the new document (a
URL, a `File` or bytes) in place of the old one, `fetch` downloads the next
document at a URL, and the others change the look, the language and the tools.
Changing any other key re-creates the viewer from scratch, documents and all.

## Build notes

- `vite build` produces `dist/embedpdf.js` + chunks + the engine worker/wasm
  assets. All asset URLs are RELATIVE (`renderBuiltUrl`) so the directory is
  relocatable to any CDN path.
- The react→preact aliasing happens HERE and only here (vite.config.ts) —
  aliases point at absolute file paths because the aliased imports live in
  other workspace packages whose node_modules have no preact.
- `process.env.NODE_ENV` compiles to `'production'`; the viewer therefore
  checks the layout UNCONDITIONALLY (the chrome's layout root) — a CDN user's
  typo'd id warns with the exact id and the closest one that exists instead of
  failing silently.
- Light-DOM children with a `slot` attribute project into the chrome's
  matching `custom()` sockets (children-as-slots — see the viewer-chrome
  README). They stay in the page's world: page CSS and the host framework's
  state keep working, and the toolbar live-measures the projected box.
