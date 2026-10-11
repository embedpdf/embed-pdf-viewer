---
'@embedpdf/react': patch
---

Free text that overflows its box shows from its first line again once editing ends. The editor kept the scroll the browser applied to follow the caret, so the box stayed clipped at the last line typed.
