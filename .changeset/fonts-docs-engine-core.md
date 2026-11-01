---
'@embedpdf/engine-core': minor
---

`FontWireComponents` names the fonts wire models once for an OpenAPI projection, and `wireTemplates` gains the layer font routes (`layerFonts`, `layerFontsResolve`, `layerFontProgram`, `layerFontProgramFile`). A document font is now everything the PDF draws under one name (`documentFontsOf`): copies of one font that editors described differently are one entry, and two fonts described alike keep their own names, so no two fonts in a list share one. A font without a PostScript name is named by its family and exact style (`'Inter,Medium'`, `'Inter,ExtraBold'`). `documentFontNameOf(face, postScriptName)` names one program. One program stream two font dictionaries read differently (other widths or encodings) is two programs of the font, one per display hash. The fonts conformance suite takes `fontProgram` and `sharedProgram` fixtures and checks names on documents written by different editors.
