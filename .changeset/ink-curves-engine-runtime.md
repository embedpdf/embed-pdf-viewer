---
'@embedpdf/engine-runtime': patch
---

An ink annotation's appearance draws each stroke as Acrobat does: the cubic Béziers Acrobat fits to its points, never more than about 1.4 points from any of them, with round caps and no join, and a stroke of one point as a dot of radius 0.5. `/Rect` follows the curves.
