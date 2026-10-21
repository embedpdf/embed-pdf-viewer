---
'@embedpdf/engine-core': minor
---

A change crosses the worker in page space both ways (`DocumentApplyWorkerRequest`, `DocumentApplyChangesWorkerRequest`, `ServerChange`, `ServerChangeOutcome` lose their coordinates parameter): each op is measured on the document as the ops before it left it, so one change can annotate a page and then delete it, or make a page and annotate it. The single page routes' input schemas (`PageReorderInputSchema`, `PageRotateInputSchema`, `PageDeleteInputSchema`, `PageInsertInputSchema`, `PageInsertBlankInputSchema`) are gone with the routes. The change conformance covers the new cases on both engines.
