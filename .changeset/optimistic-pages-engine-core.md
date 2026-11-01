---
'@embedpdf/engine-core': minor
---

`pagesAfter` works out the document's page list once a page op applies, before the engine runs it: a rotate, a reorder, a delete, or a blank insert or copy that names its pages (`objectNumbers`). It takes and returns a `PageList` (the pages and their label sections); an op the engine refuses leaves it as it is, and the same list comes back. `pagesAfterRestore` gives the list once a delete's undo brings pages back, and `pagesRelabelled` once an undo puts the label sections back. `restoredPagesOf`, `reorderBackOf` and `rotateBackOf` give what undoing a delete, a reorder or a rotate shows. `runPagePredictionConformance` checks both engines against them, for each op, its undo and its redo.

`doc.pages.copy(pages, position?, options?)` and the `pages.copy` op copy pages of the document: the copies bring the pages' annotations, and their form fields as fields of their own (a name the document uses gets the first free `name_2`). It needs only `doc.pages.assemble`, and an undo takes the copies and their fields away. `pages.insert` takes `objectNumbers` as `pages.insertBlank` does, and `PageInsertBlankOptions` is now `PageInsertOptions`, shared by the three. `runPageCopyConformance` checks both engines.

`pages.list()` answers with `labels`, the page label sections (`PageLabelSection`), and each page's `label` is read from them (`labelAt`). Page edits move the sections with the pages (`sectionsAfterDelete`, `sectionsAfterInsert`, `sectionsAfterMove`): a section stays with the page it starts at, a page takes the numbering of the section it lands in, and the first section starts at the first page. The layout token carries a `format`, so an answer cached before `labels` is never read as one with them.
