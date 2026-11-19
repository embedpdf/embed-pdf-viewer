---
'@embedpdf/engine-runtime': patch
---

A mark fitted into a form widget follows the widget's turn. `EPDFAnnot_UpdateAppearanceToRect()` on a widget reads the turn from `/MK /R` and fits the drawing into the frame that turn gives, so a mark in a turned signature field reads the way the field does. It was fitted into `/Rect` with no turn. A widget that isn't turned is drawn as before, and a widget's `/Rect` is never written.

A field whose `/MK /R` is negative is drawn as that turn, -90 as 270, the way Acrobat shows it. It drew nothing.

A stamp turned exactly 90, 180 or 270 degrees gets whole numbers in its appearance's `/Matrix` and `/Rect`.
