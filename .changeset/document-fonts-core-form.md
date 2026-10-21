---
'@embedpdf/core-form': minor
---

`TextEditorLayout.programs` replaces `program`: the programs the engine draws a field's text in, the face's first.

The painter lays a widget's text out with `@embedpdf/core-text`, as the engine's shared text engine does, and draws it as runs: `widgetDrawing(widget, field, shown, fonts)` and `textEditorLayout(widget, field, text, fonts)` take the widget's fonts (`PaintFonts` from `@embedpdf/core-text`: its font, the fallbacks in the order the engine tries them for its style, the last resort), so each character is drawn in the font the engine writes it in, in the Unicode bidirectional order, right-to-left text right to left. A `TextRun` carries its font (a `PaintFont`), its direction, whether its script is drawn with kerning and ligatures off, and its width; scenes draw it as one `textRun` node. Without fonts a widget draws in its standard font with the last resort behind it, and `approximate` is `'glyph'` when that drew a box. The editor's layout names the face's program, the fallbacks its text is drawn in and the last resort's, so a browser loads no other. `widgetText(widget, field, shown)` is every character the painter draws for a widget, what a viewer finds its fonts for. The CPVT port (`layoutVariableText`, `layoutFontOf`, `LayoutFont`) is removed.

`TextEditorLayout.rtl` is the direction the field's text reads in, as the engine draws it, so an editor orders a line of mixed scripts the engine's way.

A comb cell's `TextRun` says whether its letter joins the cell before or after it (`joinsPrevious`, `joinsNext`), so an Arabic letter drawn alone in its cell takes the joined form the engine draws.
