---
'@embedpdf/plugin-form': minor
---

With the fonts plugin installed, a widget's text is drawn in the fonts the engine writes it in: the painter and the editor lay it out with the fonts plugin's `getPaintFonts()`, so Hebrew, Arabic and any other script a field's font lacks draws in the engine's fallback, in its order and place, before the engine's picture arrives. Until a widget's fonts are found its look keeps the engine's picture (`getWidgetPainting()` is `null`), and `listShownWidgets()` lists the page again once they are. Until then, a text field in a font of its own is edited in that font's program, then the fallbacks and the last resort: `getTextEditorLayout()` names them in `fontFamily` and `programs`.
