---
'@embedpdf/plugin-form': minor
---

`onValueChanged`, `onFieldCreated`, `onFieldUpdated` and `onFieldDeleted` carry the engine's `origin` as it is (`kind`, `sessionId`, `sub`, `ts`, `serverId`, `tx`), in place of `locality`, `sessionId` and `actorId`. A fill the session may not make rejects with `error.permission` set to `'doc.forms.fill'`.
