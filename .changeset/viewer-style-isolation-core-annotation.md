---
'@embedpdf/core-annotation': minor
---

Add `cssFontFamilyForFont(font)`, `mountedFontFamily(key)` and `STANDARD_FONT_STACKS`: the CSS font family the browser draws an annotation's font with, a standard font's web stack or a registered key's `"epdf-<key>"` face. A redaction's label preview now draws in that family, so a registered font shows in its own face.
