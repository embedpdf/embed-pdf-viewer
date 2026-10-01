---
'@embedpdf/plugin-annotation': minor
---

An `AnnotationAnchor` for an annotation that keeps its size on screen, such as a note, carries `boundsIn(view)`: its box in any view, so UI attached to it follows the zoom without the anchor changing. The anchor stays the same object until the annotation itself moves.
