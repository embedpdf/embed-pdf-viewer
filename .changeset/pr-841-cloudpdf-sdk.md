---
'@cloudpdf/sdk': minor
---

Regenerate the TypeScript client for the updated CloudPDF API. Requests and
responses now expose object-number page references, revised annotation and
form shapes, and custom metadata endpoints.

A popup update's `parent` is typed `AnnotationRef | null`; the `AnnotationPatchPopup.Parent` alias, which named `AnnotationRef` twice, is gone.
