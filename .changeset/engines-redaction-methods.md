---
'@embedpdf/engines': minor
---

Added redaction annotation engine methods:

- Added `applyRedaction()` to apply a single REDACT annotation, removing content and flattening the overlay
- Added `applyAllRedactions()` to apply all REDACT annotations on a page
- Added `flattenAnnotation()` to flatten any annotation's appearance to page content
- Added `readPdfRedactAnno()` for reading REDACT annotations with all properties
- Added `addRedactContent()` for creating REDACT annotations with QuadPoints, colors, and overlay text
- Added overlay text getter/setter methods for REDACT annotations
