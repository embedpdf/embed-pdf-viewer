---
'@embedpdf/engine-core': minor
---

An annotation import is a change: `AnnotationImportOp`, the op `doc.annotations.import` runs, and `RecordedOp` / `RecordedChange`, what the engine runs and records (a change's ops, or an import). `doc.apply` takes no import, so writing restored attribution stays the import's. A change's items can be `annotations.import`, an import's own answer, and `changeEvents` publishes it as one `annotations.created` per annotation. New `itemWrote()`: whether an item wrote (an import that left every item out didn't). The import conformance suite covers undo and redo, a changed annotation left alone, a retry, a final write ending undo, and the import's rights.
