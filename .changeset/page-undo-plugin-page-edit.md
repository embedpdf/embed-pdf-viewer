---
'@embedpdf/plugin-page-edit': minor
---

Page edits are steps of the history, and the plugin keeps the page selection.

- Every edit is one change on the document's queue (`ctx.changes`), so undo puts the pages back as they were: a moved page goes back to its place, a deleted page comes back under its ref with its annotations, inserted pages go. `rotateBy` turns from the rotation the edits on their way give a page, so two quick quarter turns are a half turn. `duplicate()` and `extract()` copy the pages as they show, after the edits made before them.
- `getSelected()` and `select(pages)` hold the selected pages, and `pageEditState` declares `selected`, `canEdit` and `canExtract` for the framework hooks. A page that's deleted leaves the selection.
- `placement` is now `position`, and a position is the engine's `PagePosition`: `{ after: pageRef }`, `{ before: pageRef }`, `'start'` or `'end'`. `PagePlacement` and `PagePlacementOptions` are gone (`PagePositionOptions`).
