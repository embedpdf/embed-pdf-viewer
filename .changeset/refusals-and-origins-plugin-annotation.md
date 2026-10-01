---
'@embedpdf/plugin-annotation': minor
---

`onCreated`, `onUpdated` and `onDeleted` carry the engine's `origin` as it is (`kind`, `sessionId`, `sub`, `ts`, `serverId`, `tx`), in place of `locality`, `sessionId` and `actorId`. A create the session may not make rejects with `error.permission` set to `'annotations:create'`, the name the engine refuses with; the message used to name a `doc.annotate.create` permission that doesn't exist.
