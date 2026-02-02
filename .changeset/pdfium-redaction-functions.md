---
'@embedpdf/pdfium': minor
---

Added PDFium functions for redaction annotation support:

- Added `EPDFAnnot_ApplyRedaction` to apply a single redaction annotation
- Added `EPDFAnnot_Flatten` to flatten an annotation's appearance to page content
- Added `EPDFPage_ApplyRedactions` to apply all redactions on a page
- Added `EPDFAnnot_GetOverlayText` and `EPDFAnnot_SetOverlayText` for overlay text
- Added `EPDFAnnot_GetOverlayTextRepeat` and `EPDFAnnot_SetOverlayTextRepeat` for text repeat setting
