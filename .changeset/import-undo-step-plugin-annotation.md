---
'@embedpdf/plugin-annotation': minor
---

`import()` is now one step to undo: an undo takes away every annotation the import added, and a redo brings them back under the same refs. It is sent after the changes staged before it, typed text included. An app that imports by itself, such as loading stored annotations when a document opens, passes `history: false` to keep the import out of undo and redo: `annotation.import(bundle, { history: false })`.
