---
'@embedpdf/models': minor
---

Add PDF permission and security types:

- Add `isEncrypted`, `isOwnerUnlocked`, and `permissions` properties to `PdfDocumentObject`
- Add `PdfPermissionFlag` enum with all PDF permission flags (Print, ModifyContents, CopyContents, ModifyAnnotations, FillForms, ExtractForAccessibility, AssembleDocument, PrintHighQuality) and `AllowAll` combination
- Add `buildPermissions` helper function for combining permission flags
- Add `PermissionDeniedError` class for permission check failures
- Add security methods to `PdfEngine` interface: `setDocumentEncryption`, `removeEncryption`, `unlockOwnerPermissions`, `isEncrypted`, `isOwnerUnlocked`
- Add security methods to `IPdfiumExecutor` interface
