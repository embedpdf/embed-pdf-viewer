---
'@embedpdf/engines': patch
---

Move a rendered page's pixels from the PDFium worker to the main thread without
copying them. The worker now transfers the raw image buffer instead of
structured-cloning it, and `PdfEngine` and the hybrid image converter pass that
buffer on to the encoder worker without two more copies. When the encoder worker
fails, it transfers the pixels back, so the main-thread canvas fallback still
works.

Closes [#897](https://github.com/embedpdf/embed-pdf-viewer/issues/897).
