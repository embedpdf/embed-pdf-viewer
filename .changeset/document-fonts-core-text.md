---
'@embedpdf/core-text': minor
---

Add `@embedpdf/core-text`: text laid out as the engine lays it out, so a viewer can draw what the engine will write before it has. `layoutField(text, fonts, options)` gives a form field's lines as runs, each in one font and one direction, at the x and baseline the engine writes them: the font each character is drawn in (the field's font, then the first fallback that has it, then the last-resort font), the Unicode bidirectional order of each line, line breaks, fitted sizes, alignment, combs, password and length limits. Fonts are `TextFont`s: `standardTextFont(name)` for the 14 standard fonts, or any font program with its coverage, line metrics and a measurer; `TextFonts<F>` carries the caller's own font type through to the runs, and a run says whether it is `plain`, drawn with kerning and ligatures off. Also `matchGrapheme`, `paragraphLevels`, `lineLevels`, `visualOrder`, `firstStrongIsRtl` and `graphemesOf`.
