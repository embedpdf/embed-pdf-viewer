---
'@embedpdf/core-fonts': minor
---

The one place a font is mapped to CSS without the fonts plugin: `standardFontOf(font)` (the standard font itself, Helvetica for any other), `standardFontForFace(face)` (its standard family's font in its weight and italic, Arial as Helvetica) and `standardFontOfProgramFamily(cssFamily)` (the standard font whose built-in program a family names). `standardFontCss(font)` also gives the program it names (`programs`), and the same object for the same font.
