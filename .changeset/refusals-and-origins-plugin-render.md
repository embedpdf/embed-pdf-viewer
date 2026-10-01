---
'@embedpdf/plugin-render': minor
---

`onInvalidated` carries the engine's `origin` as it is (`kind`, `sessionId`, `sub`, `ts`, `serverId`, `tx`), in place of `locality`, `sessionId` and `actorId`, and null for the `invalidate` verb as before. A render refused without `doc.render` has `error.permission` set to `'doc.render'`.
