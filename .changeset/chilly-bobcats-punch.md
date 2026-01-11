---
'@embedpdf/plugin-print': minor
---

Add permission checking for print operations:

- Check `PdfPermissionFlag.Print` before allowing document printing
- Return `PdfErrorCode.Security` error when print permission is denied
