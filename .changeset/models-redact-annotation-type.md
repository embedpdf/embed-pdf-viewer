---
'@embedpdf/models': minor
---

Added support for REDACT annotation type with full read/write capabilities:

- Added `PdfRedactAnnoObject` interface for redact annotations with properties for overlay text, colors, and font settings
- Added `PdfAnnotationColorType.OverlayColor` enum value for redaction overlay color
- Added `PdfRedactAnnoObject` to `PdfSupportedAnnoObject` union type
- Added new engine interface methods: `applyRedaction`, `applyAllRedactions`, `flattenAnnotation`
- Added corresponding methods to `IPdfiumExecutor` interface
