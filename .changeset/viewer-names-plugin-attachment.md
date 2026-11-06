---
'@embedpdf/plugin-attachment': minor
---

Attachments are created and deleted, as the engine's `attachments.create`/`delete` say: `create()`, `delete()`, `canCreate()`, `canDelete()` and the state's `canCreate` (were `add`, `remove`, `canAdd`, `canRemove`). `onChanged` says `'created'` and `'deleted'`.
