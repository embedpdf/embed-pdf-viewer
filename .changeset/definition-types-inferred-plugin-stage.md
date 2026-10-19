---
'@embedpdf/plugin-stage': patch
---

The plugin's definition takes its types from its token and state instead of type arguments. The Stage keeps its settings per view, outside the definition, so its definition's settings type is `NoSettings`; `getSettings`, `updateSettings` and `resetSettings` work as before.
