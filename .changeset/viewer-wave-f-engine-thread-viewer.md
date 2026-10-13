---
'@embedpdf/viewer': patch
---

The snippet's first download no longer carries the engine host and PDFium's runtime, which run in the engine's worker: its main-thread JavaScript is a third smaller (a fifth gzipped). They load only where the browser has no `Worker` and the engine runs in the page.
