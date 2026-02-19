---
'@embedpdf/engines': patch
---

### Extract tight glyph bounds and font size from PDFium

- `readGlyphInfo` now calls `FPDFText_GetCharBox` alongside `FPDFText_GetLooseCharBox` to extract tight character bounds (closely surrounding the actual glyph shape) and maps them to device-space coordinates.
- `buildRunsFromGlyphs` passes tight bounds through to each `PdfGlyphSlim` record (`tightX`, `tightY`, `tightWidth`, `tightHeight`) and stores per-run `fontSize` from `FPDFText_GetFontSize`.
