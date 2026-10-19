---
'@embedpdf/engine-services': minor
---

Read and write the document's outline in the worker: an outline reader with loop guards and read limits, the outline ops with undo (deleted items come back from a capture under the numbers they had), and the `outline.read` worker job. Link and outline targets share one writer, so an outline item's target is written as `/A`, as a link's is.
