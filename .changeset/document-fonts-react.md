---
'@embedpdf/react': minor
---

Add `@embedpdf/react/fonts`: `fontsPlugin`, `useFonts()`, `useFontsState()`, `useFontsEvent()` and `useFontMounts()`. Free text boxes and text fields mount the font programs their text is drawn in, so typed text shows in the program the engine writes with.

Scene shapes apply their whole `style`, not only a blend mode, so form text draws as runs.

The viewer's kernel measures text with the browser (`browserTextMeasurer()`), so a form field's text draws in the fonts the engine writes it in before the engine's picture arrives. A text field's editor draws again once its fonts are found.
