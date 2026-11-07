---
'@embedpdf/core-annotation': patch
---

The ink stroke under the pen draws as its points, joined round, and as the curves Acrobat fits
once the pen lifts. Fitted again on every pointer move, it shifted all along its length while it
was being drawn. A stroke the pen has left is fitted once, not on every move of the next one.
