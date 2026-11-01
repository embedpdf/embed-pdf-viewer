---
'@embedpdf/engine-runtime': patch
---

Update the packaged runtime to the fork release with numbered page imports (`EPDFDoc_ImportPages` takes the copies' object numbers), page label sections (`EPDFDoc_GetPageLabelSectionCount`, `EPDFDoc_GetPageLabelSectionAt`, `EPDFDoc_SetPageLabelSections`), fallback font tiers, and `FPDF_GetPageLabel` reading a layer's own labels.
