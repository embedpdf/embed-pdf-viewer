---
'@embedpdf/core-annotation': minor
---

Every style-panel property has a `labelKey` beside its English `label`, the key to translate it by: a panel shows `t(property.labelKey, { fallback: property.label })`, as a command's label reads. The key names the wording, not the field, since one field is called different things by different kinds: `color` is `annotation.style.stroke` on a shape, `annotation.style.outline` on a redaction mark and `annotation.style.borderColor` on a form field. A `choice` property's `options` are `AnnotationOption`s, `{ value, label, labelKey }`, in place of bare values, so line endings, blend modes, fonts, alignments, border styles and icons have English names and keys too (`annotation.lineEndings.openArrow`, `annotation.blendModes.multiply`).
