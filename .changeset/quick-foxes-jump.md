---
'@embedpdf/plugin-document-manager': minor
---

Add per-document permission overrides when opening documents:

- Add `permissions` option to `LoadDocumentUrlOptions` for URL-based document loading
- Add `permissions` option to `LoadDocumentBufferOptions` for buffer-based document loading
- Add `permissions` option to `OpenFileDialogOptions` for file dialog document loading
- Pass permission configuration to core store when documents are opened
