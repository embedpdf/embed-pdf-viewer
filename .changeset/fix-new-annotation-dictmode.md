---
'@embedpdf/plugin-annotation': patch
---

Fix newly created annotations showing their appearance stream instead of dict-based rendering. New annotations now consistently start with `dictMode: true` across all framework wrappers (React, Vue, Svelte).
