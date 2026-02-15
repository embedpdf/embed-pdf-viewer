---
'@embedpdf/engines': patch
---

Update readPageAnnoRect to call EPDFAnnot_GetRect instead of FPDFAnnot_GetRect, ensuring annotation rectangles are always normalized. Fixes link annotations appearing below their expected position when the PDF Rect array has inverted y-coordinates.
