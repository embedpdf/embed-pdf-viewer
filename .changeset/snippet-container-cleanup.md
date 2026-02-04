---
'@embedpdf/snippet': patch
---

Fixed memory leak in `EmbedPdfContainer` where Preact components were not unmounted on disconnect:

- Added `render(null, this.root)` in `disconnectedCallback()` to properly unmount Preact components
- This triggers the cleanup chain: plugin destroy, engine destroy, and worker termination

Previously, navigating between pages would leave workers running (1 PDFium + 2 encoder workers per viewer instance).
