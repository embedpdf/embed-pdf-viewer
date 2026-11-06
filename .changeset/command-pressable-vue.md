---
'@embedpdf/vue': patch
---

`<Toolbar>`'s default command button says `aria-pressed` only for a toggle, and says `false` while the toggle is off; an action button no longer says it at all. A button that opens a menu says `aria-expanded` while its menu is open.
