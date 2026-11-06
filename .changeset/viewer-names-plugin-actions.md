---
'@embedpdf/plugin-actions': minor
---

`readActionTree()` replaces `getActionTree()`: a read from the engine is `read*`. `ActionTrigger` and `ActionTriggerEvent` are tagged `type` (was `scope`); a trigger's annotation is `annotation` (was `ref`) and an event's name is `event` (was `name`), as `ActionTreeSource` says. The host contract's realm ends with `destroy()`.
