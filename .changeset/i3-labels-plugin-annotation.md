---
'@embedpdf/plugin-annotation': minor
---

The properties `getProperties()` and `tools.getProperties()` give carry a `labelKey` beside each English `label`, and a choice's `options` are `{ value, label, labelKey }` (`AnnotationOption`, exported): show `t(property.labelKey, { fallback: property.label })` to translate a style panel.
