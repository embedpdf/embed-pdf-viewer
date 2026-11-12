---
'@embedpdf/core': patch
'@embedpdf/engine': patch
'@embedpdf/engine-runtime': patch
'@embedpdf/engine-services': patch
---

Range-read URL PDFs in the wasm worker when the server honors HTTP Range, and download the file when it does not.
