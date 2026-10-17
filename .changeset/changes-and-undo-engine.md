---
'@embedpdf/engine': minor
---

Add `doc.apply(change, options)` to the local engine: one change as one worker job, its events published once the worker confirms, all sharing the change's `opId`. Every write request carries its `opId` to the worker.

`doc.apply({ undoOf: opId })` undoes a change, and the undo of an undo redoes it; every single verb's `opId` can be undone the same way. A retry under the same `opId` answers what the first call answered and publishes nothing again.

An undo's events carry `origin.undoOf`, the change it undid.
