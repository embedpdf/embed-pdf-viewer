---
'@embedpdf/pdfium': minor
---

Added new PDFium functions to support normalized page rotation:

- `EPDF_GetPageSizeByIndexNormalized`: Returns page dimensions as if the page had 0° rotation (swaps width/height for 90°/270° rotated pages)
- `EPDF_LoadPageNormalized`: Loads a page with normalized rotation, treating all coordinates in 0° space

These functions enable the engine to work with page coordinates consistently regardless of original page rotation.
