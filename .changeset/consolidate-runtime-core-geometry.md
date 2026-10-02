---
'@embedpdf/core-geometry': patch
---

Add `samePagePlacement(left, right)`: whether two page transforms place things on the page the same (scale, zoom, turn and content box), so a layer redraws only when what it draws moved, not on a plain scroll.
