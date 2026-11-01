---
'@embedpdf/engine-core': minor
---

`pagesAfter` works out the document's pages once a page op applies, before the engine runs it: a rotate, a reorder, a delete, or a blank insert that names its pages (`objectNumbers`). An op the engine refuses leaves the pages as they are, and the same list comes back. `pagesAfterRestore` gives the pages once a delete's undo brings pages back. `restoredPagesOf`, `reorderBackOf` and `rotateBackOf` give what undoing a delete, a reorder or a rotate shows. `runPagePredictionConformance` checks both engines against them, for each op, its undo and its redo.
