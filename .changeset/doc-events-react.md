---
'@embedpdf/react': patch
---

`useActionsUiAdapter` is now glue over `@embedpdf/web`'s `createDefaultActionsUiAdapter` — behavior-identical (the corpus alert matrix pins it); the default policy lives in ONE place for every binding.
