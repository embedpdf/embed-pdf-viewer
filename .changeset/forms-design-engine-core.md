---
'@embedpdf/engine-core': patch
---

- `widgetAfterPatch` works out where a widget stands after a move, a resize or a turn (`rect`: its box, with the sides swapped under a quarter turn), as the engine reads it back.
