---
'@embedpdf/plugin-fonts': major
---

Introduces the fonts plugin: a document's fonts, and how a browser draws text in them so typed text shows in the font program the engine writes with. `fontsPlugin()` is document-scoped. `getFontList()` mirrors `doc.fonts.list()`, read the first time something asks (`ensureLoaded()`, `fontsState`) and read again on `fonts.changed`. `resolve(request)` and `getProgram(displayHash)` wrap the engine's. `getFontCss(font)`, `getFaceCss(face)` and `getRunCss(run)` give a `FontCss`: a CSS `font-family` list naming the program, the fallbacks and the last resort, the weight and style, and the `programs` to mount where the text is drawn. The standard fonts and the last resort come from `@embedpdf/core-fonts` and need no list. `getFaceOfCssFamily(cssFamily)` reads a program's family back as its face. `onFontListChanged` fires when the list loads or changes.
