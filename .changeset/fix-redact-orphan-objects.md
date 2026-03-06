---
'@embedpdf/pdfium': patch
---

Fix redact annotations leaving orphan indirect objects in the PDF cross-reference table. `EPDFAnnot_ApplyRedaction` and `EPDFPage_ApplyRedactions` now call `DeleteIndirectObject` after removing each annotation from the `/Annots` array, ensuring the underlying PDF object is fully removed from the xref rather than left as an unreachable orphan.

Thanks to @JanSlabon for reporting this bug.
