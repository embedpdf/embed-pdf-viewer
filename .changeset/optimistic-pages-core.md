---
'@embedpdf/core': minor
---

The page list shows this session's page edits before the engine answers: `DocumentMeta.pages` (and `ctx.getPage`, `ctx.pageOf`, `documents.listPages`) are the engine's pages with the pending changes' page ops replayed on top: a rotate, a move, a delete, a blank insert or a copy that names its pages, and `pages.restore`, a new predicted op for an undo that brings deleted pages back. An index a verb takes names a page of this list. `revision` and `onPagesChanged` move when the list does; an answer the prediction got right leaves the same list and the same page objects. `DocumentMeta.pendingPages` names the pages the engine doesn't have yet, with where each one's look comes from (`PendingPage`: `blank`, `own`, or `copy` of another page), and a page mirror reads such a page once the engine has it. `reorderBackOf`, `restoredPagesOf` and `rotateBackOf` are re-exported for a change's `undo`.

`DocumentMeta.pageLabels` holds the page label sections, moved with the pending page edits as the engine moves them, so each page's `label` is the one the engine will give it. `pages.relabel`, a new predicted op, puts sections back in an undo.
