---
'@embedpdf/engines': minor
---

- Update PDFium engine to support saving and loading rotated annotations.
- Add support for `EPDFAnnot_SetRotate`, `EPDFAnnot_SetExtendedRotation`, and `EPDFAnnot_SetUnrotatedRect`.
- Implement unrotated rendering path for rotated annotations.
