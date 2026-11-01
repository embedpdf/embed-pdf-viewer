---
'@cloudpdf/server': minor
---

Page edits are changes: `POST …/changes` takes `pages.rotate`, `pages.reorder`, `pages.delete`, `pages.insertBlank` and `pages.insert` (its PDF as a `resource:<key>` part) under `doc.pages.assemble`, and undoes them by `opId`. An undo of a delete brings the same pages back with fresh page pins, so no picture cached before they went is served for them. The routes `POST …/pages/reorder`, `/pages/rotate`, `/pages/delete`, `/pages/insert` and `/pages/insert-blank` are removed.
