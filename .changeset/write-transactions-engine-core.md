---
'@embedpdf/engine-core': minor
---

Add `AnnotationAuthority`, with `authorizeAnnotationUpdate` and `authorizeAnnotationDelete`: an annotation update or delete carries who it acts for and the caller's grants, and the engine checks them against the annotations the write finds, inside the write. The `annotations.update` and `annotations.delete` worker requests take `authority` in place of `actor` and `checked`.

Remove `SessionKind`: every document opens as an immutable base with an editable layer.
