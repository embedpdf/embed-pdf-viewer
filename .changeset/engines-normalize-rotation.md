---
'@embedpdf/engines': minor
---

Implemented per-document rotation normalization in the PDFium engine:

- Updated `PdfCache.setDocument()` to accept per-document `normalizeRotation` flag
- Added `normalizeRotation` property to `DocumentContext` for tracking document-level setting
- Updated `PageCache` to use `EPDF_LoadPageNormalized` when normalization is enabled
- Modified page size retrieval to use `EPDF_GetPageSizeByIndexNormalized` for normalized documents
- Propagated `doc: PdfDocumentObject` parameter through 30+ coordinate transformation methods to access the normalization flag
- Updated `convertDevicePointToPagePoint` and `convertPagePointToDevicePoint` to use 0° rotation when normalization is enabled

This change allows annotations, text selection, and rendering to work correctly across pages with different rotations by treating all coordinates in a consistent 0° space.
