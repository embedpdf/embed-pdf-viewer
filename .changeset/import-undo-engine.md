---
'@embedpdf/engine': patch
---

`doc.annotations.import` can be undone and redone with `doc.apply({ undoOf })`, and a retry under the same `opId` answers again without writing.
