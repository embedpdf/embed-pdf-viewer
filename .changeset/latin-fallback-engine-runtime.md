---
'@embedpdf/engine-runtime': minor
---

The runtime draws Latin a font lacks in the standard font that stands in for that font (its own standard family, else Helvetica, in its weight and italic), after the fallback fonts and before the last-resort box, in free text, form fields and redaction labels: text in a font without Latin, such as Noto Sans Hebrew, keeps its Latin letters. A registered font's `/BaseFont` is its PostScript name rather than the family it was registered under, so two weights of one family are two fonts in the PDF and in `EPDFFont_GetPostScriptName()`; a variable-font instance is named as the font names that instance, and each subset has its own tag.
