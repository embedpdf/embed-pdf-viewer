---
'@embedpdf/engine-services': minor
---

Implement blank-page insertion with PDFium and dispatch the new
`pages.insertBlank` worker request. The implementation validates page size,
count, and destination index, creates persistent blank pages, and returns
their new page object numbers and layout.
