---
'@embedpdf/plugin-redaction': minor
---

`onApplied` carries the engine's `origin` as it is (`kind`, `sessionId`, `sub`, `ts`, `serverId`, `tx`), in place of `locality`, `sessionId` and `actorId`. Marking without permission to create annotations rejects with `error.permission` set to `'annotations:create'`, and `canMark` reads that same permission.
