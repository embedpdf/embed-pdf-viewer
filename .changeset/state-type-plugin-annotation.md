---
'@embedpdf/plugin-annotation': minor
---

A named type for the state: `AnnotationState`, what `annotationState` reads and `useAnnotationState()` returns, the State table of the selecting page with a comment on each field. Published types now name it instead of spelling out its fields. The plugin's model, from `/internal` and `/contract/host`, is now `AnnotationModel`, made by `initialAnnotationModel()`, so `AnnotationState` has one meaning.
