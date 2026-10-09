---
'@embedpdf/engine-runtime': minor
---

Add `EPDFPage_MoveAnnotsRaw`, which reorders a page's annotations without loading the page.

Create objects at object numbers the caller chooses. `EPDFLayer_RaiseLastObjectNumber` hands out every number up to the one given, and `EPDFLayer_GetLastObjectNumber` reads the layer's last number. Inside a layer transaction, `EPDFPage_CreateAnnotRaw`, `EPDFForm_CreateField` and `EPDFForm_AttachWidget` (for the widget a merged field splits off) now take an object number, or 0 for the next free one, and refuse a number that isn't free.

Add `EPDFPage_InsertBlankRaw`, which inserts a blank page without loading it, at a chosen object number or the next free one. An index past the end is refused, not clamped.

Annotations made by `EPDFPage_CreateAnnotRaw` and `EPDFPage_CreateAnnot`, and the widget a merged field splits off, name their page with `/P`.

Remove the checkpoint API (`EPDFDoc_BeginCheckpoint`, `EPDFDoc_CheckpointPage`, `EPDFDoc_CheckpointObject`, `EPDFDoc_Rollback`, `EPDFDoc_EndCheckpoint`); layer transactions replace it.

Fix an aborted page insert leaving the document's `/Info` changed.
