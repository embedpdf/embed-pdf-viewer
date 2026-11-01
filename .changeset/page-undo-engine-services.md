---
'@embedpdf/engine-services': minor
---

Page ops apply inside changes, with their reverses: a delete keeps each page so its undo puts it back where it was, and undoing an insert, a move or a turn leaves the pages someone changed since.
