---
'@embedpdf/engine-services': minor
---

Every write stamps its `meta` with the request's `opId` and whether it can be undone: `DocumentSession.beginTransaction(opId)` opens the write's transaction with its id, and `writeStamp()` and `markUndoable()` read and set what the meta reports. The page-space boundary converts `document.apply` requests and results.

Add `ChangeApplier`, which runs a change's ops in one transaction, each checked against the change's `ChangeAuthority` as its single verb checks it, and records the steps that reverse them, from what it found and wrote: dictionaries captured before a write and put back exactly when nothing changed them since, with a fallback by value for annotation updates, field properties and form values; deletes captured and restored at the same numbers and positions; creates removed only when nobody changed or built on them. Add `ChangeLedger` (`changeLedgerOf(session)`), which keeps each change's answer under its `opId`, refusals included, and its record until a final change (redaction apply, flatten, signing, form repair) ends undo or the 64 MB capture budget runs out. The worker answers `document.apply`, and runs every undoable single verb as a one-op change, so its `opId` undoes it.

The worker answers `document.applyChanges`: a server request's changes in one job, each in its own transaction, answered with its result and the record that undoes it, or its refusal; an undo of a change outside the request runs the record the server sends. Add `packChangeRecord` / `unpackChangeRecord`, a record as JSON beside one blob of its captures.

Add `SessionEventPublisher.publishChange(opId, events, undoOf?)`, which publishes a change's events and, for an undo, the change it undid.
