---
'@embedpdf/engine-runtime': patch
---

An empty dash pattern (`/BS /D []`) is a solid line, as ISO 32000 says: a shape's, line's, ink's or form widget's border with one draws no dashes and reads solid. A dashed border without `/D` still draws the default dash.
