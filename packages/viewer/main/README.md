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
`strings`, `chrome`, `disabledCategories`, `locale`, `theme`) — see
`@embedpdf/viewer-chrome`'s README for the ladder. The defaults and schema
sugar re-export from this module, so "own the toolbar" is one import line:

```js
import EmbedPDF, {
  defaultChrome,
  defineChrome,
  group,
} from 'https://cdn.embedpdf.com/v3/embedpdf.js';
```

Config is init-only: set `.config` (or the attributes) and the element builds
the viewer; changing them re-creates it from scratch.

## Build notes

- `vite build` produces `dist/embedpdf.js` + chunks + the engine worker/wasm
  assets. All asset URLs are RELATIVE (`renderBuiltUrl`) so the directory is
  relocatable to any CDN path.
- The react→preact aliasing happens HERE and only here (vite.config.ts) —
  aliases point at absolute file paths because the aliased imports live in
  other workspace packages whose node_modules have no preact.
- `process.env.NODE_ENV` compiles to `'production'`; the element therefore
  runs config validation UNCONDITIONALLY (element.ts) — a CDN user's typo'd
  command id warns with the exact id instead of failing silently.
- Light-DOM children with a `slot` attribute project into the chrome's
  matching `custom()` sockets (children-as-slots — see the viewer-chrome
  README). They stay in the page's world: page CSS and the host framework's
  state keep working, and the toolbar live-measures the projected box.
