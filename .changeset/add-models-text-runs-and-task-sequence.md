---
'@embedpdf/models': patch
---

Add PdfFontInfo, PdfTextRun, and PdfPageTextRuns types for rich text extraction with font metadata and color info. Add renderPageRaw and renderPageRectRaw methods to PdfEngine for raw pixel output (ImageDataLike). Add getPageTextRuns to PdfEngine and IPdfiumExecutor. Add TaskSequence utility for composing sequential Task operations with abort propagation.
