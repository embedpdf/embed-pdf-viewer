---
'@embedpdf/plugin-redaction': minor
'@embedpdf/models': patch
'@embedpdf/engines': patch
---

Improve annotation-mode redaction application by removing intersecting non-REDACT annotations, clearing intersecting form widget values in-place, and deleting linked redaction comment threads. Also add shared `rectsIntersect` geometry utility usage and make checked form-field writes deterministic by only toggling when state differs.
