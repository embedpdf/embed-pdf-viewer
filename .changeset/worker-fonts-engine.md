---
'@embedpdf/engine': patch
---

The engine worker is less than half the download it was: `embedpdf-worker.js` takes 243 KB gzipped instead of 523 KB. It held the files of the 14 standard fonts, which it never reads: PDFium draws with its own copies. The inline worker and the build that runs without a worker shrink by as much. No API change.
