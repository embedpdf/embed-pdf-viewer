---
'@embedpdf/plugin-form': minor
---

`import()` is now one step to undo: an undo takes away the fields the import added, and a redo brings them back. An app that adds fields by itself passes `history: false` to keep the import out of undo and redo: `form.import(bundle, { history: false })`.
