---
'@embedpdf/engine-runtime': minor
---

Add `EPDFPage_MoveAnnotsRaw`, which reorders a page's annotations without loading the page.

Remove the checkpoint API (`EPDFDoc_BeginCheckpoint`, `EPDFDoc_CheckpointPage`, `EPDFDoc_CheckpointObject`, `EPDFDoc_Rollback`, `EPDFDoc_EndCheckpoint`); layer transactions replace it.

Fix an aborted page insert leaving the document's `/Info` changed.
