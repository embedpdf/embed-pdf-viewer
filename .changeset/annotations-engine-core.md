---
'@embedpdf/engine-core': minor
---

The annotation type is called `Annotation` (was `AnnotationDTO`), and each kind's read is `<Kind>Annotation` (`FreeTextAnnotation`, `StampAnnotation`, …); its schema is `AnnotationSchema`. A file attachment's read goes back into a create or an update: its `file` (with the size, checksum and dates a read adds) is taken as it is, and `null` is too, as on a create without it.
