---
'@embedpdf/engine': minor
---

`page.annotations.update()` changes an annotation's kind to a sibling: a highlight, underline, squiggly line or strikeout into another of the four, a square into a circle and back. It stays the same annotation, with its ref, replies, popup, group and author, and undo turns it back. Any other subtype is refused with `InvalidArg`, and so is a value the new kind has no field for: clear it first, in the same change.
