---
'@embedpdf/plugin-document-manager': minor
---

Enabled rotation normalization by default for all documents opened through the document manager:

- Added `normalizeRotation: true` to `openDocumentFromUrl()` method
- Added `normalizeRotation: true` to `openDocumentFromBuffer()` method
- Added `normalizeRotation: true` to internal `doOpen()` method

This ensures all documents managed by the plugin have consistent coordinate handling regardless of individual page rotations.
