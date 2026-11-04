---
'@embedpdf/engine-runtime': minor
---

A square, circle, polygon, polyline, line or ink whose `/C` is empty or left out draws no stroke, as Acrobat does: the fill alone, still inset half the border width, and only the filled line endings. A line, polyline or ink at border width 0 draws a hairline. Adds the `EPDFAnnot_SetNoColor` binding, which writes a color entry as an empty array.
