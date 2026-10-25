---
'@embedpdf/core-annotation': minor
---

A redaction's label previews as the engine writes it: laid out as a form field's text in each region (`redactLabelText`, with `@embedpdf/core-text`'s `layoutField`), top-aligned and placed across by its alignment, one line when shown once at size 0, wrapped otherwise, and a repeated label space-joined and doubled until it reaches the region's bottom, clipped to the region. Its runs are `textRun` nodes in the label's own fonts (`RenderItem.label.fonts`; without them, its standard font, or Helvetica), each with the program to mount. A measurement's caption draws in the engine's own Helvetica (a `text` node's `program`). `cssFontFamilyForFont`, `mountedFontFamily` and `STANDARD_FONT_STACKS` are gone: the fonts plugin, or `@embedpdf/core-fonts` without it, says how a font is drawn.
