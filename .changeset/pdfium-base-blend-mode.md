---
'@embedpdf/engines': patch
---

Expose PDF annotation blend mode in base PDFium annotation properties.

`PdfiumNative` now reads `EPDFAnnot_GetBlendMode` and includes `blendMode` in the shared base annotation payload, so all annotation types parsed through the PDFium engine consistently receive their blend mode metadata.
