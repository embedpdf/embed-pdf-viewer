---
'@embedpdf/engine': minor
---

The local engine's `pages.extract(pages, options)` makes flattened copies: `{ flatten: { usage: 'print' } }` returns the pages as they print, painted in, with nothing interactive left. It needs `doc.download` or `doc.download.flattened`, and paints only what the caller may read.
