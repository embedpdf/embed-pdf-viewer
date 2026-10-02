---
'@embedpdf/plugin-page-edit': patch
---

The token lists the methods that return a promise, so without a document they reject with `not-ready` in every framework instead of throwing.
