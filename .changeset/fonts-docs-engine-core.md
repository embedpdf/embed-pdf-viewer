---
'@embedpdf/engine-core': minor
---

`FontWireComponents` names the fonts wire models once for an OpenAPI projection, and `wireTemplates` gains the layer font routes (`layerFonts`, `layerFontsResolve`, `layerFontProgram`, `layerFontProgramFile`). A document font without a PostScript name is named by its family and its exact style (`'Inter,Medium'`, `'Inter,ExtraBold'`), so two weights of one family no longer share a name.
