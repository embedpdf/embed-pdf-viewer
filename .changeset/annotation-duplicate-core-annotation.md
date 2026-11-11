---
'@embedpdf/core-annotation': minor
---

New `isMovable(record)`: whether an annotation is one people move at all. Its kind moves, and it isn't bound to text, as a highlight or a redaction of words is. `canMove(model, id)` uses it, and adds the lock, the session's rights and its `editable` rule.
