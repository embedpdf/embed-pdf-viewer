---
'@embedpdf/snippet': minor
---

Added redaction management features:

- Added `RedactionSidebar` component for viewing and managing pending redactions
- Added `annotation:apply-redaction` command to apply the selected redaction annotation
- Added `redaction:redact` command for unified redact mode (text + area)
- Added `panel:toggle-redaction` command for toggling the redaction sidebar
- Added redaction panel configuration to UI schema
- Added REDACT annotation type support in annotation sidebar
- Added `redactCombined` and `redactionSidebar` icons
- Added translations for redaction panel, overlay text, and redaction states
- Updated redaction toolbar to use unified redact mode
