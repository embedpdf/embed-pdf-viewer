---
'@embedpdf/plugin-annotation': patch
---

The measurement host seam stages a page's re-measure at once (`whenRemeasurable()`, `stageRemeasure()`), so a scale change takes it into its own change.
