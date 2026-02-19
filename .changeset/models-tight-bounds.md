---
'@embedpdf/models': patch
---

### Tight glyph bounds and font size on run/glyph models

- `PdfGlyphSlim` gains optional `tightX`, `tightY`, `tightWidth`, `tightHeight` fields for tight character bounds from `FPDFText_GetCharBox` (closely surrounding the actual glyph shape, as opposed to the existing loose bounds from `FPDFText_GetLooseCharBox`).
- `PdfGlyphObject` gains optional `tightOrigin` and `tightSize` fields for the same purpose at the intermediate object level.
- `PdfRun` gains an optional `fontSize` field populated from `FPDFText_GetFontSize`, used for font-size-aware rectangle merging during selection.
