---
'@embedpdf/snippet': patch
---

Fix markup annotation commands (highlight, underline, strikeout, squiggly) not creating annotations on PDFs that lack `CopyContents` permission. Annotations are now created without extracted text metadata when text extraction is denied.
