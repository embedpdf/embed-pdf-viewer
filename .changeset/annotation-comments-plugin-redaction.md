---
'@embedpdf/plugin-redaction': minor
---

Add `canMark()` for redaction annotation creation and make `canApply()` mirror
every capability required by destructive redaction. Unauthorized selection
queueing is now rejected before creating marks.
