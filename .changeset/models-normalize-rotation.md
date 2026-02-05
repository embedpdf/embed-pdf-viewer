---
'@embedpdf/models': minor
---

Added support for per-document rotation normalization:

- Added `normalizedRotation: boolean` property to `PdfDocumentObject` to track whether the document was opened with normalized rotation
- Added `normalizeRotation?: boolean` option to `PdfOpenDocumentBufferOptions` interface
- Added `normalizeRotation?: boolean` option to `PdfOpenDocumentUrlOptions` interface

When `normalizeRotation` is enabled, all page coordinates (annotations, text, rendering) are in 0° space regardless of the page's original rotation.
