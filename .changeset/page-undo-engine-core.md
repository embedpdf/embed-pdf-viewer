---
'@embedpdf/engine-core': minor
---

Page structure edits are change ops: `pages.rotate`, `pages.reorder`, `pages.delete`, `pages.insertBlank` and `pages.insert`, each recorded with its reverse, so `doc.apply({ undoOf })` undoes and redoes them. An undo of a delete brings the same pages back under the same refs, with their annotations and names, and publishes `pages.restored`. `pageVerbs()` makes the structure verbs of `doc.pages` one-op changes, so each verb's `opId` undoes it. `wirePaths` and `wireTemplates` no longer list the single page write routes.
