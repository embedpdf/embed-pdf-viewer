---
'@embedpdf/plugin-form': minor
---

Add `canRead()`, `canFill()`, and `canDesign()` permission helpers, replacing
`canModify()`. Form hydration and mutations now refuse unauthorized work
locally, and realtime desync events trigger a full form snapshot refresh.
