---
'@embedpdf/web': patch
---

The rich text editor reads a hard line break, however the browser spells it, as `\n`, and its offsets count paragraphs joined by `\n`, matching the rich text the engine returns.
