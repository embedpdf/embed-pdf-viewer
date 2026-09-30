---
'@embedpdf/engines': patch
---

Use the intersection of the MediaBox and CropBox as the page origin when converting between PDF user space and device space, matching the visible page box PDFium uses for page size and rendering. Fixes annotation (e.g. link) positions on PDFs whose CropBox is larger than and offset from the MediaBox.
