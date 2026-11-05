---
'@embedpdf/core': minor
---

A settings declaration's `whole` names a setting inside a group by its path (`'snapshot.box'`), and a whole setting's change takes its defaults for what it leaves out, never the value before. `mergeSettings(settings, changes, declaration?)` takes the declaration (`defaults` and `whole`) instead of the `whole` list. `MirrorSpec.load()` answers `cursor?: number`, no `null`.
