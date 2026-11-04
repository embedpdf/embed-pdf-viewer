---
'@embedpdf/plugin-annotation': minor
---

The caret works as in a word processor. With a caret in a text box, `selection.getProperties()` reports the text typed next: the style of the text before the caret (at the start of a line, the text after it). `text.toggleFormat()` and a font, size or color from `selection.update()` at a caret style the text typed next, without writing anything, and moving the caret drops that style. A selected box reads all of its text, so bold shows only when every word is bold, and a change styles all of it, a word with its own style included. `text.toggleFormat()` turns a format on unless all of the text already has it, so words that disagree all take it. A box restyled while it is already drawn live now draws in its new font at once, not in the font answer for its old style.
