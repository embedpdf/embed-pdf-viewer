---
'@embedpdf/plugin-annotation': patch
---

`annotation.selection.set([])` selects nothing, as its name says; before, an empty list left the selection as it was.
