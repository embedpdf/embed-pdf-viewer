---
'@embedpdf/engine-runtime': patch
---

A redaction label fitted to its region (font size 0) is burned in on apply, and fills the region. `EPDFAnnot_SetDefaultAppearance` and `EPDFAnnot_SetDefaultAppearanceRegisteredFont` now write `/Helv 0 Tf` for size 0 (auto-size) instead of dropping the font from `/DA`, which left the overlay's label without a font, so it drew nothing. A label shown once at size 0 is fitted on one line, up to 144pt; before, it was laid out multi-line, which auto-sizes only up to 12pt. A redaction whose `/DA` names no font draws its label in Helvetica.
