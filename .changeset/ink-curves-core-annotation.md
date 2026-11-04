---
'@embedpdf/core-annotation': patch
---

Ink is drawn as Acrobat draws it: each stroke as the smooth curves Acrobat fits to its points (cubic Béziers, never more than about 1.4 points from any point), with round caps and no join, and a stroke of one point as a filled dot. Its box and hit testing follow those curves, so a live drawing looks the same as the appearance the engine writes.
