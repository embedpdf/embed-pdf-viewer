---
'@embedpdf/plugin-redaction': minor
---

Add permission checking for redaction operations:

- Check `PdfPermissionFlag.ModifyContents` before adding pending redaction items
- Check permission before enabling redact selection or marquee redact modes
- Check permission before starting redaction mode
- Check permission before committing pending redactions (single or all)
- Return `PdfErrorCode.Security` error when permission is denied for commit operations
