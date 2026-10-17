---
'@embedpdf/plugin-measurement': patch
---

A refused call names what was missing: `error.permission` is `'doc.annotate.modify'` for a scale change and `'annotations:create'` for `createMeasurement`. `canMeasure` reads the same permission `createMeasurement` checks.
