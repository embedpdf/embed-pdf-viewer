---
'@embedpdf/svelte': patch
---

`<RenderLayer>` no longer shows Chrome's broken-image icon in the page's corner while the first
picture renders: the page's base image stays hidden until it has a source.
