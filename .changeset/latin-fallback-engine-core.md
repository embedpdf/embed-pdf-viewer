---
'@embedpdf/engine-core': minor
---

Latin a font lacks is never a box. After the fallback fonts, the engine draws a character the run's font doesn't have in the standard font that stands in for that font, in its weight and italic (Times for Times New Roman, Courier for Courier New, Helvetica for any other), and only then in the last resort. `doc.fonts.resolve()` says so: each run's `fallbacks` ends with that standard font's program, unless the run is drawn in it. `standardFontForFace(face)`, the rule that picks it, is exported from `@embedpdf/engine-core/runtime`.
