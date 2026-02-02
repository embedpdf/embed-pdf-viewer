---
'@embedpdf/plugin-redaction': minor
---

Added annotation-based redaction mode for integrated redaction workflow:

- Added `useAnnotationMode` config option to use REDACT annotations as pending redactions
- Added unified `RedactionMode.Redact` mode supporting both text selection and area marquee
- Added `redactTool` annotation tool for integration with annotation plugin
- Added `RedactHighlight` and `RedactArea` components for rendering redact annotations
- Added automatic renderer registration via framework-specific `RedactionPluginPackage`
- Added `source`, `markColor`, `redactionColor`, and `text` properties to `RedactionItem` type
- Pending redactions now sync with annotation plugin state in annotation mode
- Added `enableRedact()`, `toggleRedact()`, `isRedactActive()`, `endRedact()` methods
- Removed deprecated `startRedaction()` and `endRedaction()` methods from scope API
