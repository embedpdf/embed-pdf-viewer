---
'@cloudpdf/sdk': minor
---

`doc.pages` no longer has `reorder`, `rotate`, `delete`, `insert` and `insertBlank`: page edits go through `doc.changes`, whose ops now include `pages.rotate`, `pages.reorder`, `pages.delete`, `pages.insertBlank` and `pages.insert`, and each can be undone by its `opId`.
