---
'@embedpdf/core-annotation': minor
---

Model carets anchored to rotated text as oriented box geometry.

- Add `caretGeomFromAnchor`, which places the caret at the trailing glyph edge and derives its authoring rotation from the text baseline while preserving the previous byte-identical upright geometry.
- Carry optional rotation on caret geometry, apply it to local-frame hit testing, and expose an oriented selection outline without enabling caret rotate or resize gestures.
