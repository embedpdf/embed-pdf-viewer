---
'@embedpdf/web': minor
---

Editors on a page no longer make iOS Safari zoom the page in when they take focus. A text field's editor (`textFieldEditorStyleOf()`) and a free text box's editor lay their text out at 16 px or more and draw it back at the page's size with a transform, so they look the same in every browser. New: `freeTextBoxOf()`, the layer's own text box (its place on the plate, its turn and its style, in place of `textPlateInPixels()`); `ownTextBoxOf()`, your own element as a text box's editor, filling its parent; `legibleScaleOf()`, `legibleShrinkOf()`, `LEGIBLE_FONT_PX` and `textFieldFontPxOf()`. `textFieldStyleOf()` takes the legible scale. `textPlateInPixels()`, `TextPlatePixels` and the `textBoxStyleOf()` export are removed.
