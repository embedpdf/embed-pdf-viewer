---
'@cloudpdf/contract': minor
---

Document `annotKey` as `obj:N` (an annotation's object number) or `base:N` (an annotation the uploaded file stores inline, by the position it was born at). Annotation reads and write results carry `PageRef`s and `AnnotationRef`s, manifest pages are `{ page, cache }`, and the page revision, weak annotation and `shouldRefetch` fields are gone.
