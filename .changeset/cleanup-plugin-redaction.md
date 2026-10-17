---
'@embedpdf/plugin-redaction': patch
---

`markArea` and `markPage` reject (never throw synchronously) when marking is not allowed or the page is unknown.
