---
'@embedpdf/plugin-metadata': minor
---

`onUpdated` and `custom.onUpdated` carry the engine's `origin` as it is (`kind`, `sessionId`, `sub`, `ts`, `serverId`, `tx`), in place of `locality`, `sessionId` and `actorId`. An update refused without `doc.metadata.modify` has `error.permission` set to it.
