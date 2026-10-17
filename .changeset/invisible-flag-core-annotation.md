---
'@embedpdf/core-annotation': minor
---

`viewable(annotation, engaged)` takes the annotation instead of its flags, and follows ISO 32000-2 12.5.3 for `invisible`: the flag hides only an annotation of a type that isn't standard (an `unsupported` annotation PDFium doesn't know, other than Projection). On a standard annotation it means nothing. The engine's renderer and flatten follow the same rule, so the viewer no longer paints an unknown annotation that printing and flattening leave out.
