---
'@embedpdf/engine-runtime': patch
---

Adds `EPDF_RenderPageBitmapWithMatrix_Start` and `EPDF_RenderPage_Continue`: a page render with a matrix and clip, as `FPDF_RenderPageBitmapWithMatrix` does it, that pauses once a time budget has passed, so the caller can receive other work, or cancel, between slices. `FPDF_RenderPage_Close` ends or cancels it. However finely a render is sliced, its bytes are those of `FPDF_RenderPageBitmapWithMatrix`.
