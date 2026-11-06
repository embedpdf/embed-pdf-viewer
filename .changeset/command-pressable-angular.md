---
'@embedpdf/angular': patch
---

`[epdfCommand]` and `<epdf-toolbar>`'s default command button say `aria-pressed` only for a toggle, and say `false` while the toggle is off; an action button no longer says it at all. A button whose command opens a menu says `aria-expanded` while its menu is open.
