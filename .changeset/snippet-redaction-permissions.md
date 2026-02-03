---
'@embedpdf/snippet': patch
---

Added document permission checks to redaction sidebar buttons:

- "Clear All" button is now disabled when `canModifyAnnotations` is false
- "Redact All" button is now disabled when `canModifyContents` is false
- Added squiggly annotation tool to annotation toolbar
- Added ink tool to annotation overflow menu and responsive breakpoints
