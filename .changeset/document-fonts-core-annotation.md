---
'@embedpdf/core-annotation': minor
---

A `FontLookup` lists `NamedFont`s (a name, its family, weight and italic) instead of registered font handles, so a document's own fonts map to their faces and back like registered ones.

A `textRun` scene node replaces `glyphs`: a run of text in one font and one direction, at its left edge, which the browser shapes as one string (`rtl`, `plain` for kerning and ligatures off).

A `textRun` drawn alone that is joined to the letter before or after it in the text (a comb's cell) says so (`joinsPrevious`, `joinsNext`): it takes that joined form.
