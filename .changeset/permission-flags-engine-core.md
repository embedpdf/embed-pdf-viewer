---
'@embedpdf/engine-core': minor
---

A PDF's permissions are named flags, `PdfPermissionFlags`: `print`, `modifyContents`, `copy`, `modifyAnnotations`, `fillForms`, `copyForAccessibility`, `assemble` and `printHighQuality` (pdf.js's names), replacing `PdfBits` and its `bit3`…`bit12`. A document head's and security state's `permissions.flags` replaces the raw `bits` word, and `PdfPermissionInfo` carries `flags` with no `bits`. The `advisory` (`canPrint`, …) and `advisoryFromPdfBits()` are gone: `materializePdfPermissions(flags)` says what `pdf.permissions` grants. `permissionFlagsOf(word)` replaces `decodePdfBits()`, and the permission checks take `permissionFlags`.
