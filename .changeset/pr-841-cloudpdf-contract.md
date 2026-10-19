---
'@cloudpdf/contract': minor
---

Update the CloudPDF API contract for the revised engine page, annotation, form,
and drawing shapes. Page and annotation references use object numbers, text
quadrilaterals name their corners, and form flags use the same flat shape as
other flags.

A popup update's `parent` is one nullable `AnnotationRef`, no longer a union that names it twice; generators that reject duplicate union members (PHP) accept it.
