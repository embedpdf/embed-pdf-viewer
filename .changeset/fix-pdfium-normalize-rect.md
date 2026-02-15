---
'@embedpdf/pdfium': patch
---

Add EPDFAnnot_GetRect that wraps FPDFAnnot_GetRect with rect normalization. Upstream FPDFAnnot_GetRect does not normalize the rect read from the PDF dictionary, so when a PDF stores its Rect array with y1 > y2 the top/bottom values are inverted. This caused link annotations to be positioned incorrectly.
