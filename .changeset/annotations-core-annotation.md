---
'@embedpdf/core-annotation': minor
---

A kind's style-panel schema is its `properties`: each `AnnotationProperty` (was `FieldSpec`) names its `control` (`'color'`, `'number'`, `'choice'` with `options`, `'flag'`, `'text'`, `'textFormat'` with `format`, `'link'`). `propertiesOf(kind)` adds the flags every kind has, and `sharedProperties(kinds)` (was `sharedFields`) gives a mixed selection's. A redaction's label is a `'text'` property.

Snapping is `{ alignment, alignmentThreshold, rotation, rotationAngles, rotationThreshold }` (was `guides`, `guideThreshold`); the alignment threshold is in screen pixels, converted by a pointer sample's new `scale`. Handle chrome nodes say what they reshape (`role`: `'corner'`, `'side'` or `'point'`) and whether they are `active`; `ChromeGeometry.rotationHandle: false` removes the rotation handle from hit-testing. `selectionAnchor()` is `null` while a gesture moves, resizes or turns the selection, `annotationAnchor(model, id)` is new, and render items carry their `annotation`.
