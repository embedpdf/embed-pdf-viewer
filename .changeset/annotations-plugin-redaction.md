---
'@embedpdf/plugin-redaction': patch
---

Marking the selected text goes through the annotation plugin's `createFromSelection('redact')`, and the marks are read with `list({ pages })`.
