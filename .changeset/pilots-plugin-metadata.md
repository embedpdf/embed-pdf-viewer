---
'@embedpdf/plugin-metadata': minor
---

Rewritten on the kernel's `create()` controller hook. `current()` → `getSnapshot()`, `reload()` → `refresh()`, new `getStatus()` and `onUpdated`; `update()` resolves with the engine result only after the snapshot reflects it. The confirmed `metadata.updated` event is the one path that updates the snapshot, so own, foreign, scripted and remote edits behave identically, and a slow initial read can no longer overwrite a newer value.
