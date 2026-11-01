---
'@embedpdf/plugin-page-edit': minor
---

A rotate, a move, a delete, a blank insert and a duplicate show in the page list at once, and so does undoing one: every verb stages what undoing it looks like, page labels included. A blank insert and a duplicate name their pages from the session's object number pool, so they show before the engine answers and later edits can name them. A turn starts from the rotation the page shows.

`duplicate()` is one change the engine copies without the pages leaving the document, so it needs only `doc.pages.assemble` and no longer waits for the edits before it; the copies bring the pages' annotations and their form fields as fields of their own. An insert whose page count is known (`insertFromDocument()`, `insertFromBytes()` with `pageIndexes`) names its pages too, so undoing it shows at once.
