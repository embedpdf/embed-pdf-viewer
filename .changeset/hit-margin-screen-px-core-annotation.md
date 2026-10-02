---
'@embedpdf/core-annotation': patch
---

`hitMargin` is in screen pixels: a pointer-down converts it by the page's view scale (`PointerInput.scale`), like `snap.alignmentThreshold`. It was in page points, so a click reached about 200px around an annotation at 25× zoom (much wider than a note's icon) and about 2px at 25%.
