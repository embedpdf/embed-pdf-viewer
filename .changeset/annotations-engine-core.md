---
'@embedpdf/engine-core': minor
---

The annotation type is called `Annotation` (was `AnnotationDTO`), and each kind's read is `<Kind>Annotation` (`FreeTextAnnotation`, `StampAnnotation`, …); its schema is `AnnotationSchema`. A file attachment's read goes back into a create or an update: its `file` (with the size, checksum and dates a read adds) is taken as it is, and `null` is too, as on a create without it.

A field an update takes back as read, with one schema for both (such as a popup's `parent`), accepts that schema once, nullable when the read is: its JSON Schema no longer lists the same type twice.

The annotation export conformance suite pins the file today's runtime writes, whose appearance numbers take their shortest exact form.
