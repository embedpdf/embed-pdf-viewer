---
'@cloudpdf/server': minor
---

`POST …/changes` takes the new op `annotations.copy`: copies of annotations in the same document, with a stamp's drawing and an attachment's file copied on the server. It needs `doc.annotate.read` and the right to create each kind, not `doc.download`. A ref the document doesn't have refuses the change with `NotFound`. On the event stream, a client that says a version before 3.2 gets `full-refresh` in place of a change with this op.
