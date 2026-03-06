---
'@embedpdf/plugin-annotation': patch
---

Fix markup annotations (highlight, underline, strikethrough) not being created on PDFs that lack `CopyContents` permission. Annotations are now created without extracted text metadata when text extraction is denied.
