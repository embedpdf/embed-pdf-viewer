---
'@embedpdf/plugin-annotation': minor
---

A plugin that lends records can give each one an accent: `AnnotationLender.accentOf(record)` (optional) returns a color and how strong it shows, and the record's render item carries it as `accent`. The form plugin uses it to show each field in its group's color in design mode. Records of a lender without `accentOf` are unchanged.
