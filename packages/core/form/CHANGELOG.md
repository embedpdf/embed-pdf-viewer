# @embedpdf/core-form

## 3.0.0-next.20

### Minor Changes

- [#941](https://github.com/embedpdf/embed-pdf-viewer/pull/941) by [@bobsingor](https://github.com/bobsingor) – `TextEditorLayout.programs` replaces `program`: the programs the engine draws a field's text in, the face's first.

  The painter lays a widget's text out with `@embedpdf/core-text`, as the engine's shared text engine does, and draws it as runs: `widgetDrawing(widget, field, shown, fonts)` and `textEditorLayout(widget, field, text, fonts)` take the widget's fonts (`PaintFonts` from `@embedpdf/core-text`: its font, the fallbacks in the order the engine tries them for its style, the last resort), so each character is drawn in the font the engine writes it in, in the Unicode bidirectional order, right-to-left text right to left. A `TextRun` carries its font (a `PaintFont`), its direction, whether its script is drawn with kerning and ligatures off, and its width; scenes draw it as one `textRun` node. Without fonts a widget draws in its standard font with the last resort behind it, and `approximate` is `'glyph'` when that drew a box. The editor's layout names the face's program, the fallbacks its text is drawn in and the last resort's, so a browser loads no other. `widgetText(widget, field, shown)` is every character the painter draws for a widget, what a viewer finds its fonts for. The CPVT port (`layoutVariableText`, `layoutFontOf`, `LayoutFont`) is removed.

  `TextEditorLayout.rtl` is the direction the field's text reads in, as the engine draws it, so an editor orders a line of mixed scripts the engine's way.

  A comb cell's `TextRun` says whether its letter joins the cell before or after it (`joinsPrevious`, `joinsNext`), so an Arabic letter drawn alone in its cell takes the joined form the engine draws.

### Patch Changes

- [#941](https://github.com/embedpdf/embed-pdf-viewer/pull/941) by [@bobsingor](https://github.com/bobsingor) – A text field's editor falls back, before its programs load, to the look-alikes of its face's standard font (Helvetica's for any other), not to `sans-serif`.

## 3.0.0-next.19

## 3.0.0-next.18

## 3.0.0-next.17

## 3.0.0-next.16

## 3.0.0-next.15

### Major Changes

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – Introduces the form widget painter: `widgetDrawing(widget, field, shown?)` draws what the engine's appearance generator writes for a text field, combo box, list box, push button, check box or radio button (its background, border in every style, plate and text laid out by a port of the engine's text layout: fitted sizes, wrapping, combs, alignment, passwords; the check symbols; the quarter turn), and `widgetScene(drawing, placement)` puts it on the page as scene nodes, each run of text with the standard face's program it draws in. A parity gate checks it against the engine within 0.01 pt. A font that isn't one of the 14 standard fonts, or a character its font can't write, draws approximately, and the drawing says so. `paints(field)` says whether the painter draws a field's widgets. `textEditorLayout(widget, field, text)` says where an HTML editor shows the text being typed: the face, the size the engine draws at, the text's box, the line height and a comb's spacing.
