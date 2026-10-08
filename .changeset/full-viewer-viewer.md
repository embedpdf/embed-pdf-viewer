---
'@embedpdf/viewer': minor
---

`<embedpdf-viewer>` looks the same on every page. Borders, shadows and rings draw on pages without Tailwind of their own; every size is in px, so the page's `html { font-size }` no longer resizes the viewer; the text styles a page's `body` passes down (font, size, letter spacing, italics, weight, alignment, color scheme) no longer reach inside. Dialogs and click-away backdrops cover the viewer, not the page around it. A `--epdf-*` variable set on the element or on any element around it now wins in light and in dark, over the viewer's defaults and over `theme.tokens`, which apply when the page sets none.

The viewer runs under the strict Content Security Policy on the Security page, with Trusted Types enforced: no `'unsafe-inline'`, no `'unsafe-eval'`, `worker-src 'self'`. The CDN folder now carries `embedpdf-worker.js` and `encoder-worker.js` beside `embedpdf.wasm`; served from your own origin they start as files, and loaded from a CDN the engine starts them from `blob:` URLs (`worker-src blob:`).

The npm build leaves `@embedpdf/core`, the plugins and `@embedpdf/web` to your bundler instead of carrying its own copies, and lists them as dependencies. Your app and the viewer load one copy of each, so the headless hooks of your own `@embedpdf/react` work in the components you put inside the viewer, and your bundle gets smaller.
