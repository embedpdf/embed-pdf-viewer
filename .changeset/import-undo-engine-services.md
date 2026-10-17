---
'@embedpdf/engine-services': minor
---

An annotation import runs as a change (`ChangeApplier` op `annotations.import`): kept under its `opId` with the record that undoes it, a retry answers again, and `meta.undoable` is `true`. Its undo removes each imported thread whole, where nothing changed since; a restoring import's undo and redo take the import's rights (`doc.annotate.modify` and `doc.annotate.import`) instead of the per-annotation delete rules. A stamping import checks each annotation as its create would. `doc.apply` refuses an import op.
