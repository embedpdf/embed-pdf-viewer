---
'@embedpdf/engine-core': minor
---

`pdf.permissions` grants what Acrobat allows on the file. A file that allows changing the document (bit 4) now also allows filling in, signing and assembling pages. Fill and sign come with bit 4, 6 or 9, and assembly with bit 4 or 11. Form design still needs both bit 4 and bit 6. The scope resolver and the permission advisory (`advisoryFromPdfBits`) both read the bits through `materializePdfPermissions`, so the three can no longer disagree.
