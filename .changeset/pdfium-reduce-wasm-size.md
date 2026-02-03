---
'@embedpdf/pdfium': patch
---

Reduced WASM binary size from 7.4MB to 4.5MB by removing debug symbols (-g flag) from the build.

Thanks to @Mikescops for reporting this.
