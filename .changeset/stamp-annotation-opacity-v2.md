---
'@embedpdf/models': minor
'@embedpdf/engines': minor
'@embedpdf/plugin-annotation': minor
---

Stamp annotations now support `/CA` opacity like every other annotation type: `PdfStampAnnoObject` declares an `opacity` field, the pdfium engine reads and writes `/CA` for stamps, and the stamp tool's `commitStamp` now falls back to `tool.defaults.opacity ?? 1` like every other tool.
