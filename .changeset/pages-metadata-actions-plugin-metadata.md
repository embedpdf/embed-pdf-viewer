---
'@embedpdf/plugin-metadata': minor
---

`canEdit()` is `canUpdate()`. `update()` resolves `{ metadata }` and `custom.update()` resolves `{ custom }`: the fields after the change. `refresh()` and `custom.refresh()` take a `signal`, and so do both updates: a signal that already fired rejects `operation-cancelled` before the engine is called.

`metadataState` declares the metadata's state for every framework: `metadata`, `custom` and `status`.
