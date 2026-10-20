---
'@embedpdf/core-form': minor
---

`TextEditorLayout.programs` replaces `program`: the programs the engine draws a field's text in, the face's first.

The painter lays a widget's text out with `@embedpdf/core-text`, as the engine's shared text engine does, and draws it as runs: `widgetDrawing(widget, field, shown, fonts)` and `textEditorLayout(widget, field, text, fonts)` take the widget's fonts (`WidgetFonts`: its font, the fallbacks in the order the engine tries them for its style, the last resort), so each character is drawn in the font the engine writes it in, in the Unicode bidirectional order, right-to-left text right to left. A `TextRun` carries its font (`PaintFont`), its direction, whether its script is drawn with kerning and ligatures off, and its width; scenes draw it as one `textRun` node. Without fonts a widget draws in its standard font with the last resort behind it, and `approximate` is `'glyph'` when that drew a box. `standardPaintFont`, `lastResortPaintFont` and `defaultWidgetFonts` give the built-in ones. The CPVT port (`layoutVariableText`, `layoutFontOf`, `LayoutFont`) is removed.
